"""Usage: python make_garments.py [style ...]   ->  writes ../models/<style>.glb  (all styles when none given)
Pipeline: flat pattern -> cloth drape on a hanger -> smooth -> solidify -> hood/cords -> bones + weights -> glTF."""
import sys, os, math, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, kdtree
import pattern, drape, styles

OUT = os.path.join(HERE, "..", "models")
smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))

def seg_param(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return t, (a + ab * t - p).length

def make_material(name, color, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = color; b.inputs["Roughness"].default_value = rough
    return m

def laplace(bm, iters=3, k=0.4):
    for _ in range(iters):
        new = {}
        for v in bm.verts:
            nb = [e.other_vert(v).co for e in v.link_edges]
            if nb: new[v] = v.co.lerp(sum(nb, Vector()) / len(nb), k)
        for v, c in new.items(): v.co = c

def build_hood(p, neck_back_pt, tree_front=None):
    r = p.get("hood_scale", 1.0)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)
    rx, ry, rz = 0.112 * r * (p["neck_w"] / 0.115), 0.082 * r, 0.168 * r
    c = Vector((0, neck_back_pt.y + ry * 0.92, 0.015))
    for v in bm.verts:
        v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        # lean the pouch backwards a little and pinch the bottom
        v.co.y += max(0.0, v.co.z) * 0.12
        if v.co.z < 0: v.co.x *= 0.82 + 0.18 * smooth(-rz, 0, v.co.z)
        v.co += c
    # face opening on the front-top (the hole you put your face through)
    kill = [f for f in bm.faces if (f.calc_center_median().y - c.y) < -0.35 * ry and f.calc_center_median().z > -0.02 and abs(f.calc_center_median().x) < 0.78 * rx]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    laplace(bm, 1, 0.25)
    me = bpy.data.meshes.new("hood"); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("hood", me); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.007; m.offset = 1; m.use_rim = True
    bpy.ops.object.modifier_apply(modifier="solid")
    for pl in me.polygons: pl.use_smooth = True
    return ob

def build_cords(p, front_tree, fin_me):
    """Two drawstrings hanging from the front neckline, resting on the chest."""
    objs = []
    for side in (-1, 1):
        pts = []
        n = 14
        for i in range(n + 1):
            t = i / n
            x = side * (p["neck_w"] * 0.62 + 0.012 * math.sin(t * 3.1) + 0.012 * t)
            z = -p["neck_front"] * 0.75 - t * (0.20 + p.get("cord_len", 0.03))
            co, idx, d = front_tree.find(Vector((x, -0.3, z)))   # nearest front-surface vertex
            pts.append(Vector((x, co.y - 0.012, z)))
        bm = bmesh.new(); rings = []
        for i, c in enumerate(pts):
            tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = Vector((0, 1, 0)) if abs(tan.y) < 0.9 else Vector((1, 0, 0))
            u = tan.cross(ref).normalized(); w = tan.cross(u).normalized()
            rings.append([bm.verts.new(c + (u * math.cos(a) + w * math.sin(a)) * 0.0045) for a in [k * math.tau / 6 for k in range(6)]])
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(6):
                bm.faces.new((r0[k], r0[(k + 1) % 6], r1[(k + 1) % 6], r1[k]))
        me = bpy.data.meshes.new("cord"); bm.to_mesh(me); bm.free()
        for pl in me.polygons: pl.use_smooth = True
        ob = bpy.data.objects.new("cord", me); bpy.context.collection.objects.link(ob)
        objs.append(ob)
        # aglet
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.0058, radius2=0.0058, depth=0.022)
        a = bpy.data.meshes.new("aglet"); bm.to_mesh(a); bm.free()
        ag = bpy.data.objects.new("aglet", a); bpy.context.collection.objects.link(ag); ag.location = pts[-1] + Vector((0, 0, -0.008)); objs.append(ag)
    return objs

def make(name, frames=110):
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    p = styles.STYLES[name]
    ob, info = pattern.build(p, name)
    rest = [v.co.copy() for v in ob.data.vertices]
    sim, npin = drape.drape(ob, p, frames)
    # drop the simulation helpers
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    fin = bpy.data.objects.new(name, sim); bpy.context.collection.objects.link(fin)
    bpy.context.view_layer.objects.active = fin; fin.select_set(True)
    simpos = [v.co.copy() for v in sim.vertices]

    # soften the sim jitter
    bm = bmesh.new(); bm.from_mesh(sim); laplace(bm, 3, 0.35); bm.to_mesh(sim); bm.free()
    simpos = [v.co.copy() for v in sim.vertices]

    # kd-trees
    kd_front = kdtree.KDTree(len(simpos)); n = 0
    for i, c in enumerate(simpos):
        if c.y < 0: kd_front.insert(c, i)
    kd_front.balance()
    class FT:   # nearest front-surface vertex in x/z
        def find(self, q):
            best = None
            for i, c in enumerate(simpos):
                if c.y < 0:
                    d = (c.x - q.x) ** 2 + (c.z - q.z) ** 2
                    if best is None or d < best[0]: best = (d, c)
            return best[1], 0, best[0]
    ft = FT()

    # key positions (sim pose) from rest-pattern landmarks
    h = styles.half_outline(p, 0)
    def cluster(pt, r=0.04):
        idx = [i for i, c in enumerate(rest) if (c.x - pt[0]) ** 2 + (c.z - pt[1]) ** 2 < r * r]
        if not idx: raise RuntimeError("no verts near " + str(pt))
        return sum((simpos[i] for i in idx), Vector()) / len(idx)
    side_pts = {}
    for sgn in (1, -1):
        S = cluster((sgn * h["S"][0], h["S"][1])); mid_c = ((h["T"][0] + h["B"][0]) / 2 * sgn, (h["T"][1] + h["B"][1]) / 2)
        E = cluster(mid_c, 0.05); side_pts[sgn] = (S, E)
    zhem = min(c.z for c in simpos)
    nb_idx = min(range(len(rest)), key=lambda i: (rest[i].x ** 2 + (rest[i].z + p["neck_back"]) ** 2 + (0 if simpos[i].y > 0 else 9)))
    neck_back_pt = simpos[nb_idx]

    # thickness + materials
    for pl in sim.polygons: pl.use_smooth = True
    fabric = make_material("fabric", (1, 1, 1, 1)); plain = make_material("plain", (0.8, 0.8, 0.8, 1)); cord = make_material("cord", (0.92, 0.9, 0.84, 1))
    sim.materials.append(fabric); sim.materials.append(plain); sim.materials.append(cord)
    m = fin.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.006; m.offset = -1; m.use_rim = True; m.material_offset = 1; m.material_offset_rim = 1
    bpy.ops.object.modifier_apply(modifier="solid")
    # weights need the pre-solidify -> post-solidify map: use position (inner verts sit within 6mm of the outer ones)

    parts = [fin]
    if p.get("hood"):
        hood = build_hood(p, neck_back_pt); hood.data.materials.append(plain)
        for pl in hood.data.polygons: pl.material_index = 0
        parts.append(hood)
        for c in build_cords(p, ft, sim):
            c.data.materials.append(cord); parts.append(c)

    # ------------------------------------------------------------------ rig
    arm = bpy.data.armatures.new("rig"); rig = bpy.data.objects.new("rig", arm); bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    def bone(nm, a, b, parent=None):
        e = eb.new(nm); e.head = a; e.tail = b
        if (b - a).length < 1e-4: e.tail = a + Vector((0, 0, -0.01))
        if parent: e.parent = eb[parent]
        return e
    top = Vector((0, 0.0, 0.02)); zs = [-0.05, -0.30 * -zhem / 0.7 * 0.7, zhem]
    bone("root", Vector((0, 0, 0.14)), top)
    z1 = zhem * 0.33; z2 = zhem * 0.66
    bone("spine1", top, Vector((0, 0, z1)), "root"); bone("spine2", Vector((0, 0, z1)), Vector((0, 0, z2)), "spine1"); bone("spine3", Vector((0, 0, z2)), Vector((0, 0, zhem)), "spine2")
    chains = {}
    for sgn, tag in ((1, "L"), (-1, "R")):
        S, E = side_pts[sgn]; M = (S + E) / 2
        bone(f"sleeve{tag}1", S, M, "spine1"); bone(f"sleeve{tag}2", M, E, f"sleeve{tag}1"); chains[sgn] = (S, M, E)
    hood_bones = []
    if p.get("hood"):
        hb = neck_back_pt
        bone("hood1", Vector((0, hb.y + 0.01, 0.0)), Vector((0, hb.y + 0.045, 0.11)), "spine1"); bone("hood2", Vector((0, hb.y + 0.045, 0.11)), Vector((0, hb.y + 0.08, 0.22)), "hood1")
        hood_bones = ["hood1", "hood2"]
    bpy.ops.object.mode_set(mode='OBJECT')

    # ------------------------------------------------------------------ weights
    chest = p["chest"]
    def weights_for(co, rest_x):
        w = {}
        side = 1 if rest_x >= 0 else -1; tag = "L" if side == 1 else "R"
        m_ = smooth(chest - 0.045, chest + 0.035, abs(rest_x))
        # body: spine chain by height
        zt = co.z
        w1 = max(0.0, 1 - abs(zt - 0.0) / abs(z1 - 0.0)) if zt > z1 else 0
        w2 = max(0.0, 1 - abs(zt - z1) / abs(z2 - z1)) if z1 >= zt >= z2 else (max(0.0, 1 - abs(zt - z1) / abs(z1)) if zt > z1 else 0)
        w3 = smooth(z1, z2, zt) if False else None
        # simple linear partition of unity
        if zt >= z1: a = (zt - z1) / (0 - z1); wb = {"spine1": 1.0 - 0.0 * a}
        elif zt >= z2: t = (zt - z1) / (z2 - z1); wb = {"spine1": 1 - t, "spine2": t}
        else: t = max(0.0, min(1.0, (zt - z2) / (zhem - z2))); wb = {"spine2": 1 - t, "spine3": t}
        S, M, E = chains[side]
        t_, d = seg_param(co, S, E)
        up = 1 - smooth(0.30, 0.62, t_)
        ws = {f"sleeve{tag}1": up, f"sleeve{tag}2": 1 - up}
        blend_shoulder = smooth(0.0, 0.18, t_)  # near the shoulder the sleeve is mostly spine
        for k, v in wb.items(): w[k] = w.get(k, 0) + v * (1 - m_ * blend_shoulder)
        for k, v in ws.items(): w[k] = w.get(k, 0) + v * m_ * blend_shoulder
        return w
    def assign(obj, rest_lookup, bones_extra=None):
        for b in arm.bones: obj.vertex_groups.new(name=b.name)
        for v in obj.data.vertices:
            rx = rest_lookup(v.co) if rest_lookup else 0.0
            w = weights_for(v.co, rx) if bones_extra is None else bones_extra(v.co)
            items = sorted(w.items(), key=lambda kv: -kv[1])[:4]; tot = sum(x for _, x in items) or 1
            for k, x in items:
                if x / tot > 0.002: obj.vertex_groups[k].add([v.index], x / tot, 'REPLACE')
    kd_rest = kdtree.KDTree(len(simpos))
    for i, c in enumerate(simpos): kd_rest.insert(c, i)
    kd_rest.balance()
    def rest_x(co):
        _, i, _ = kd_rest.find(co); return rest[i].x
    assign(fin, rest_x)
    if p.get("hood"):
        hb = neck_back_pt
        def hood_w(co):
            t = max(0.0, min(1.0, (co.z - 0.0) / 0.22)); return {"hood1": 1 - smooth(0.15, 0.7, t), "hood2": smooth(0.15, 0.7, t)}
        assign(parts[1], None, hood_w)
        for o in parts[2:]:
            for b in arm.bones: o.vertex_groups.new(name=b.name)
            for v in o.data.vertices:
                zt = v.co.z; t = max(0.0, min(1.0, -zt / 0.3))
                k = "spine1" if t < 0.45 else "spine2"
                o.vertex_groups[k].add([v.index], 1.0, 'REPLACE')
    for o in parts:
        am = o.modifiers.new("Armature", "ARMATURE"); am.object = rig
        o.parent = rig
    # ------------------------------------------------------------------ export
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts + [rig]: o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_skins=True,
                              export_apply=False, export_animations=False, export_materials='EXPORT', export_cameras=False, export_lights=False)
    xs = [c.x for c in simpos]; zs_ = [c.z for c in simpos]
    meta = dict(name=name, label=p["label"], kind=p["kind"], verts=len(sim.vertices), width=max(xs) - min(xs), height=max(zs_) - min(zs_), seconds=round(time.time() - t0, 1))
    print("EXPORTED", json.dumps(meta)); return meta

if __name__ == "__main__":
    args = [a for a in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else sys.argv[1:]
    names = args or list(styles.STYLES)
    metas = []
    mp = os.path.join(OUT, "meta.json")
    for n in names:
        m = make(n)
        old = json.load(open(mp)) if os.path.exists(mp) else {}
        old[m["name"]] = m; json.dump(old, open(mp, "w"), indent=1)
