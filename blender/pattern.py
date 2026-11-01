"""Builds a closed 'pillow' garment mesh (front + back panel welded at the seams) with exact boundary sampling."""
import math, bpy, bmesh
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from styles import half_outline

STEP = 0.0145

def neck_curve(neck_w, depth, n=14):
    """Smooth scoop from the shoulder-neck point down to the centre."""
    pts = []
    for i in range(1, n + 1):
        t = i / n
        a = t * math.pi / 2
        x = neck_w * math.cos(a)
        z = -depth * (1 - math.cos(a * 1.0)) ** 1.0 if False else -depth * math.sin(a) ** 1.8
        pts.append((x, z))
    return pts

def outline(p, side):
    depth = p["neck_front"] if side == "front" else p["neck_back"]
    h = half_outline(p, depth)
    right = [("hem", h["H"]), ("seam", h["A"]), ("cuff", h["B"]), ("cuff", h["T"]), ("seam", h["S"]), ("seam", h["N"])]
    # right half: hem centre -> hem corner -> armpit -> cuff bottom -> cuff top -> shoulder -> neck point -> down the neck to the centre
    poly = [("hem", (0.0, -p["length"]))]
    for kind, pt in right:
        poly.append((kind, pt))
    for x, z in neck_curve(p["neck_w"], depth):
        poly.append(("neck", (x, z)))
    # mirror (skip centre points)
    left = []
    for kind, (x, z) in reversed(poly[1:-1]):
        left.append((kind, (-x, z)))
    full = poly + left
    return full

def sample_boundary(poly):
    """Sample every polygon edge at STEP; returns list of (point, tag). Tag of an edge = tag of its first vertex (seam / hem / cuff / neck)."""
    out = []
    n = len(poly)
    for i in range(n):
        ka, a = poly[i]; kb, b = poly[(i + 1) % n]
        a = Vector(a); b = Vector(b)
        L = (b - a).length
        k = max(1, round(L / STEP))
        tag = ka if ka != "seam" or kb == "seam" else "seam"
        if ka == "neck" or kb == "neck":
            tag = "neck"
        if ka == "cuff" and kb == "cuff":
            tag = "cuff"
        if ka == "hem" and kb == "hem":
            tag = "hem"
        # edges that join seam->cuff etc: the underarm / sleeve top are seams
        if (ka, kb) in (("seam", "cuff"), ("cuff", "seam")):
            tag = "seam"
        if (ka, kb) in (("hem", "seam"), ("seam", "hem")):
            tag = "seam"
        for j in range(k):
            out.append((a.lerp(b, j / k), tag))
    return out

def inside(pt, poly):
    x, z = pt; c = False; n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]; x2, z2 = poly[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            c = not c
    return c

def dist_to_poly(pt, poly):
    best = 1e9; px, pz = pt; n = len(poly)
    for i in range(n):
        ax, az = poly[i]; bx, bz = poly[(i + 1) % n]
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-12
        t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
        d = math.hypot(px - ax - t * dx, pz - az - t * dz)
        best = min(best, d)
    return best

def triangulate(bpts):
    pts2 = [(p.x, p.y) for p, _ in bpts]
    poly = pts2
    xs = [p[0] for p in poly]; zs = [p[1] for p in poly]
    verts = list(pts2)
    row = 0; z = max(zs) - STEP * 0.8
    while z > min(zs):
        off = (STEP * 0.5) if row % 2 else 0.0
        x = min(xs) + off
        while x < max(xs):
            if inside((x, z), poly) and dist_to_poly((x, z), poly) > STEP * 0.55:
                verts.append((x, z))
            x += STEP
        z -= STEP * 0.866; row += 1
    nb = len(pts2)
    edges = [(i, (i + 1) % nb) for i in range(nb)]
    v, e, f, *_ = delaunay_2d_cdt([tuple(a) for a in verts], edges, [], 1, 1e-6)
    return v, f

def build(p, name):
    """Returns (object, rest_info). Mesh verts: x, y(depth), z. Front panel faces use material 0 & uv left half, back panel uv right half."""
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    tagl = bm.verts.layers.int.new("seam")
    panels = {}
    allx = []; allz = []
    for side in ("front", "back"):
        poly = outline(p, side); bpts = sample_boundary(poly)
        v, f = triangulate(bpts)
        panels[side] = (bpts, v, f)
        allx += [a[0] for a in v]; allz += [a[1] for a in v]
    xmin, xmax, zmin, zmax = min(allx), max(allx), min(allz), max(allz)
    zmax_uv = zmax + p.get('uv_top', 0.0)   # hoodie photos include the hood above the collar
    gap = 0.02
    for side in ("front", "back"):
        bpts, v, f = panels[side]
        y = -gap / 2 if side == "front" else gap / 2
        bv = []
        for i, (x, z) in enumerate(v):
            vert = bm.verts.new((x, y, z)); bv.append(vert)
            if i < len(bpts) and bpts[i][1] == "seam":
                vert[tagl] = 1
        for tri in f:
            vs = [bv[i] for i in tri]
            if len(set(vs)) < 3:
                continue
            # winding so that normals face outwards (front: -Y, back: +Y)
            try:
                face = bm.faces.new(vs if side == "front" else vs[::-1])
            except ValueError:
                continue
            for loop in face.loops:
                x, z = loop.vert.co.x, loop.vert.co.z
                u = (x - xmin) / (xmax - xmin); vv = (z - zmin) / (zmax_uv - zmin)
                loop[uv].uv = (u * 0.5, vv) if side == "front" else (0.5 + (1 - u) * 0.5, vv)
    bm.normal_update()
    # fix winding: make normals of the front panel face -Y
    for fc in bm.faces:
        cy = sum(vv.co.y for vv in fc.verts) / 3
        if (cy < 0 and fc.normal.y > 0) or (cy > 0 and fc.normal.y < 0):
            fc.normal_flip()
    # weld the seams: pull welded verts to y = 0 and merge
    for vert in bm.verts:
        if vert[tagl]:
            vert.co.y = 0.0
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    bm.to_mesh(me); bm.free()
    for poly_ in me.polygons: poly_.use_smooth = True
    return ob, dict(xmin=xmin, xmax=xmax, zmin=zmin, zmax=zmax)
