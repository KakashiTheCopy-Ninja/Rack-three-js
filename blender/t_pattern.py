import sys, bpy
sys.path.insert(0, '.')
import pattern, styles
bpy.ops.wm.read_factory_settings(use_empty=True)
for name in ['tee_classic', 'hoodie_oversized']:
    ob, info = pattern.build(styles.STYLES[name], name)
    me = ob.data
    print(name, len(me.vertices), len(me.polygons), info)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    nb = sum(1 for e in bm.edges if e.is_boundary); nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    print(' boundary edges', nb, 'nonmanifold(>2)', nm)
    bm.free()
