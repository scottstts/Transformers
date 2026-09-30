"""Studio review cameras. OUT, VIEWS and RES can be passed in exec globals."""
import os
import bpy
from mathutils import Vector

ROOT=os.path.dirname(os.path.abspath(__file__))
OUT=globals().get('OUT',os.path.join(ROOT,'review'))
RES=globals().get('RES',1100)
sc=bpy.context.scene
sc.render.engine='CYCLES'
sc.cycles.samples=40
sc.cycles.use_denoising=True
sc.render.resolution_x=RES
sc.render.resolution_y=RES
sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG'
sc.render.film_transparent=False
coll=bpy.data.collections.get('COMMANDER_REVIEW') or bpy.data.collections.new('COMMANDER_REVIEW')
if coll.name not in sc.collection.children:
    sc.collection.children.link(coll)
world=bpy.data.worlds.get('commander.studio') or bpy.data.worlds.new('commander.studio')
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.20,.23,.29,1)
bg.inputs[1].default_value=.45
sc.world=world


def obj(name,data):
    o=bpy.data.objects.get(name)
    if o is None:
        o=bpy.data.objects.new(name,data); coll.objects.link(o)
    return o


def aim(ob,at):
    ob.rotation_euler=(Vector(at)-ob.location).to_track_quat('-Z','Y').to_euler()


for name,loc,power,size,col in [
    ('key',(-4,-5,9),1800,5,(.87,.93,1)),
    ('fill',(5,-2,6),1350,4,(1,.92,.84)),
    ('rim',(2,4,8),2300,3,(.78,.86,1)),
    ('top',(-1,0,10),1200,3,(1,1,1)),
]:
    name='cmd.review.'+name
    o=obj(name,bpy.data.lights.get(name) or bpy.data.lights.new(name,'AREA'))
    o.location=loc; o.data.energy=power; o.data.shape='DISK'; o.data.size=size; o.data.color=col
    aim(o,(0,0,3))
cam=obj('cmd.review.camera',bpy.data.cameras.get('cmd.review.camera') or bpy.data.cameras.new('cmd.review.camera'))
cam.data.type='ORTHO'; sc.camera=cam
floor=bpy.data.objects.get('cmd.review.floor')
if floor is None:
    me=bpy.data.meshes.new('cmd.review.floor')
    me.from_pydata([(-200,-200,-.012),(200,-200,-.012),(200,200,-.012),(-200,200,-.012)],[],[(0,1,2,3)])
    floor=obj('cmd.review.floor',me)
    mat=bpy.data.materials.new('cmd.review.floor'); mat.use_nodes=True
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(.26,.29,.34,1)
    bs.inputs['Roughness'].default_value=.32
    me.materials.append(mat)
SHOTS={
    'front':((0,-18,3.4),(-.12,0,3.35),7.25),
    'side':((18,0,3.5),(0,0,3.35),7.25),
    'back':((0,18,3.5),(0,0,3.35),7.25),
    'three-quarter':((-10,-18,8.2),(-.10,0,3.35),7.5),
    'head':((-.9,-3,6.1),(0,0,5.80),1.48),
    'weapon-in-hand':((-4,-8,4.3),(-1.46,-.26,3.28),1.25),
}
os.makedirs(OUT,exist_ok=True)
for view in globals().get('VIEWS',list(SHOTS)):
    position,target,scale=SHOTS[view]
    cam.location=position; aim(cam,target); cam.data.ortho_scale=scale
    sc.render.filepath=os.path.join(OUT,view+'.png')
    bpy.ops.render.render(write_still=True)
