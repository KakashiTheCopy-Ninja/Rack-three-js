"""Wooden hanger (shoulder arms + bar + metal neck/hook). Coordinates: garment space, z = 0 at the garment's shoulder line, rail contact at z = hook_h."""
import math, bpy, bmesh
from mathutils import Vector

def _tube(bm, pts, radius, sides=8, mat=0):
    rings = []
    for i, c in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(tan.y) < 0.9 else Vector((1, 0, 0))
        u = tan.cross(ref).normalized(); w = tan.cross(u).normalized()
        rings.append([bm.verts.new(c + (u * math.cos(a) + w * math.sin(a)) * radius) for a in [k * math.tau / sides for k in range(sides)]])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            f = bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k])); f.material_index = mat; f.smooth = True

def _bar(bm, pts, hw_y, hh_z0, hh_z1, mat=0):
    """Rounded-rectangle bar swept along pts; thickness tapers from hh_z0 to hh_z1."""
    rings = []
    n = len(pts)
    for i, c in enumerate(pts):
        t = i / (n - 1); hz = hh_z0 + (hh_z1 - hh_z0) * t
        ring = []
        for k in range(10):
            a = k * math.tau / 10
            ring.append(bm.verts.new(c + Vector((0, math.cos(a) ** 1 * hw_y, math.sin(a) * hz))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(10):
            f = bm.faces.new((r0[k], r0[(k + 1) % 10], r1[(k + 1) % 10], r1[k])); f.material_index = mat; f.smooth = True
    for r, rev in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(r[::-1] if rev else r); f.material_index = mat

def arm_points(w, drop=0.066, apex=-0.010, n=14):
    return [Vector((w * i / (n - 1), 0, apex - drop * (i / (n - 1)) ** 1.5)) for i in range(n)]

def build_hanger(w=0.21, hook_h=0.10, name="hanger", collider=False):
    bm = bmesh.new()
    for s in (1, -1):
        pts = [Vector((s * p.x, p.y, p.z)) for p in arm_points(w)]
        if s == -1: pts = pts  # same order, mirrored
        _bar(bm, pts, 0.0085, 0.0085, 0.0062, mat=0)
    if not collider:
        end_z = arm_points(w)[-1].z
        # lower bar
        _tube(bm, [Vector((-w, 0, end_z)), Vector((w, 0, end_z))], 0.0042, 8, 0)
        # wooden neck block
        _bar(bm, [Vector((0, 0, -0.004)), Vector((0, 0, 0.026))], 0.011, 0.0, 0.0, 0)
        # metal stem + hook around the rail (rail axis = X, rail centre at z = hook_h)
        r = 0.0165
        stem = [Vector((0, 0, 0.022)), Vector((0, 0, hook_h - r - 0.004))]
        arc = [Vector((0, r * math.sin(math.radians(a)), hook_h - r * math.cos(math.radians(a)))) for a in range(0, 262, 14)]
        _tube(bm, stem + arc, 0.0026, 8, 1)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob
