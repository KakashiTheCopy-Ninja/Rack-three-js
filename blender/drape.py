import bpy, bmesh, math
from mathutils import Vector

def add_hanger_collider(p):
    import hanger
    ob = hanger.build_hanger(w=p["pins"] + 0.03, collider=True, name="hanger_collider")
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
    s.quality = 8; s.mass = p["mass"]; s.air_damping = 1.6
    s.tension_stiffness = 22; s.compression_stiffness = 22; s.shear_stiffness = 16
    s.bending_stiffness = 0.22 * p["stiff"]; s.bending_damping = 0.8
    s.tension_damping = 6; s.compression_damping = 6; s.shear_damping = 6
    s.use_pressure = True; s.uniform_pressure_force = p.get('air', 0.38)
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
