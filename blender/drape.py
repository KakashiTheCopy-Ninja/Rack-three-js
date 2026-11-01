import bpy, bmesh, math
from mathutils import Vector

def add_hanger_collider(p):
    """Two sloped bars the shoulders rest on, so the garment holds a hanger-shaped shoulder line."""
    w = p["pins"] + 0.02
    verts = [(0, 0, 0.015), (w, 0, -0.045), (-w, 0, -0.045)]
    me = bpy.data.meshes.new("hanger"); me.from_pydata(verts, [(0, 1), (0, 2)], []); me.update()
    ob = bpy.data.objects.new("hanger", me); bpy.context.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", "SKIN"); 
    for v in me.skin_vertices[0].data: v.radius = (0.006, 0.012)
    ob.modifiers.new("sub", "SUBSURF")
    bpy.context.view_layer.objects.active = ob
    ob.modifiers.new("col", "COLLISION")
    ob.collision.thickness_outer = 0.002
    ob.collision.use_culling = False
    return ob

def drape(ob, p, frames=110, pin_x=None):
    scene = bpy.context.scene
    scene.frame_start = 1; scene.frame_end = frames
    scene.render.fps = 24
    pins = ob.vertex_groups.new(name="pin")
    me = ob.data
    px = pin_x if pin_x is not None else p["pins"]
    n = 0
    for v in me.vertices:
        if v.co.z > -0.032 and abs(v.co.x) < px:
            pins.add([v.index], 1.0, 'REPLACE'); n += 1
    bpy.context.view_layer.objects.active = ob
    cl = ob.modifiers.new("Cloth", "CLOTH")
    s = cl.settings
    s.quality = 7; s.mass = p["mass"]; s.air_damping = 1.6
    s.tension_stiffness = 22; s.compression_stiffness = 22; s.shear_stiffness = 16
    s.bending_stiffness = 0.35 * p["stiff"]; s.bending_damping = 0.8
    s.tension_damping = 6; s.compression_damping = 6; s.shear_damping = 6
    s.use_pressure = True; s.uniform_pressure_force = p.get('air', 0.28)
    s.vertex_group_mass = "pin"; s.pin_stiffness = 1.0
    c = cl.collision_settings
    c.use_collision = True; c.distance_min = 0.0035; c.collision_quality = 3
    c.use_self_collision = True; c.self_distance_min = 0.004; c.self_friction = 4
    add_hanger_collider(p)
    cl.point_cache.frame_start = 1; cl.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me2 = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
    return me2, n
