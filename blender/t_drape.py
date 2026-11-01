import sys, bpy, time, math
sys.path.insert(0, '.')
import pattern, styles, drape
name = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
p = styles.STYLES[name]
ob, info = pattern.build(p, name)
t0 = time.time()
me2, n = drape.drape(ob, p, frames=int(sys.argv[sys.argv.index('--') + 2]) if len(sys.argv) > sys.argv.index('--') + 2 else 100)
print('pinned', n, 'sim secs', round(time.time() - t0, 1), 'verts', len(me2.vertices))
zs = [v.co.z for v in me2.vertices]; ys = [v.co.y for v in me2.vertices]; xs = [v.co.x for v in me2.vertices]
print('bbox x', min(xs), max(xs), 'y', min(ys), max(ys), 'z', min(zs), max(zs))
# preview render
ob2 = bpy.data.objects.new('final', me2); bpy.context.collection.objects.link(ob2)
ob.hide_render = True; ob.hide_viewport = True
mat = bpy.data.materials.new('m'); mat.diffuse_color = (0.7, 0.35, 0.3, 1); ob2.data.materials.append(mat)
scn = bpy.context.scene; scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = 24; scn.cycles.use_denoising = False
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.9, 0.92, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0; scn.world = w
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); bpy.context.collection.objects.link(sun)
mat.use_nodes = True; mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.3, 0.28, 1); mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
for pp in ob2.data.polygons: pp.use_smooth = True
mat.use_backface_culling = False
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); scn.camera = cam
out = sys.argv[sys.argv.index('--') + 3] if len(sys.argv) > sys.argv.index('--') + 3 else 'prev'
for tag, loc, rot in [('front', (0, -2.6, -0.35), (math.radians(90), 0, 0)), ('side', (2.6, 0, -0.35), (math.radians(90), 0, math.radians(90)))]:
    cam.location = loc; cam.rotation_euler = rot; cam.data.lens = 85
    scn.render.resolution_x = 700; scn.render.resolution_y = 800
    scn.render.filepath = f'/tmp/claude-0/-home-user/1aefecbb-77bc-5976-9c66-d68578071a73/scratchpad/shots/{out}_{tag}.png'
    bpy.ops.render.render(write_still=True)
