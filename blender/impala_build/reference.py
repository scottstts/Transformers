"""Measured reference traces and pinhole registration for surface construction.

Side trace coordinates use a 2048-pixel-wide presentation of the original
3216 x 1452 image. Coordinates are never stretched to fit the model.
"""
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix
from . import kit as K

WIDTH = 2048
HEIGHT = WIDTH * 1452 / 3216
TARGET = np.array((0., 0., .55))
SIDE_FILE = '/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_side.jpeg'

# Pixel boundaries measured from the original photograph, including the tire
# outline below the body. Hub landmarks fix the registration independently of
# the shell being reconstructed.
TIRE_EDGES = (
    [(306,690.22),(326,711.23),(346,725.88),(366,736.07),(386,741.80),
     (406,744.35),(426,744.35),(446,743.07),(466,737.98),(486,729.06),
     (506,715.69),(526,696.59),(546,666.02)],
    [(1431,658.21),(1451,684.96),(1471,700.88),(1491,711.70),
     (1511,717.43),(1531,719.98),(1551,718.71),(1571,714.89),
     (1591,707.24),(1611,694.51),(1631,676.04)],
)
HUBS = np.array(((418.5,613.0),(1545.0,599.0)))
SIDE_CAMERA = np.array((-.13728967856325916,.06795052898888883,
                       2.0592142542779426,7.823392534734771,
                       966.4086118411086,512.4975184975721,
                       -.0024855602405421074,-1.0154980296449145))

SIDE_TRACES = {
    'front_crown':[(65,472),(88,434),(140,403),(210,389),(380,380),(570,376),(740,372)],
    'sill':[(742,371),(905,376),(1101,379),(1250,380),(1450,375)],
    'character':[(141,449),(415,439),(750,443),(1110,449),(1438,456),(1750,472),(1970,479)],
    'blade':[(1254,393),(1300,374),(1370,360),(1450,354),(1530,354),(1620,365),(1780,387),(1940,414)],
    'molding':[(180,620),(590,564),(1100,564),(1385,563),(1690,556),(1945,536)],
    'rocker':[(175,621),(246,622),(585,650),(850,645),(1150,642),(1380,637),(1700,605),(1930,572)],
    'front_arch':[(246,622),(240,571),(251,532),(280,510),(335,493),(395,486),
                  (465,493),(513,516),(549,550),(573,591),(583,650)],
    'rear_arch':[(1381,638),(1390,607),(1414,562),(1450,531),(1502,513),
                 (1570,510),(1635,521),(1670,548),(1688,582),(1696,617)],
    'front_seam':[(744,373),(744,445),(752,614)],
    'middle_seam':[(1101,379),(1091,449),(1060,558),(1045,614)],
    'rear_seam':[(1454,356),(1448,463),(1444,482),(1398,612)],
    'front_door_bottom':[(752,614),(900,613),(1045,614)],
    'rear_door_bottom':[(1045,614),(1240,609),(1398,612)],
    'tail':[(1620,366),(1780,387),(1940,414),(1953,419),(1973,478),(1968,500),(1930,572)],
    'roof_edge':[(899,241),(1060,241),(1210,251),(1300,284)],
    'roof_crown':[(879,215),(1050,211),(1190,216),(1320,235)],
    'pillar_front':[(1210,251),(1300,284),(1390,332),(1410,355)],
}


def trace(name,x=1.01):
    return [unproject(pixel,x) for pixel in SIDE_TRACES[name]]


def basis(p):
    yaw,pitch,_,_,_,_,roll = p[:7]
    back=np.array((math.cos(yaw)*math.cos(pitch),math.sin(yaw)*math.cos(pitch),math.sin(pitch)))
    right=np.array((-math.sin(yaw),math.cos(yaw),0.))
    up=np.cross(back,right)
    return (right*math.cos(roll)+up*math.sin(roll),
            up*math.cos(roll)-right*math.sin(roll),back)


def project(points,p):
    right,up,back=basis(p)
    local=np.asarray(points)-TARGET
    depth=math.exp(p[2])-local@back
    f=math.exp(p[3])
    return np.c_[p[4]+f*(local@right)/depth,p[5]-f*(local@up)/depth]


def unproject(pixel,x,p=None):
    p=SIDE_CAMERA if p is None else p
    right,up,back=basis(p)
    eye=TARGET+math.exp(p[2])*back
    ray=-back+right*(pixel[0]-p[4])/math.exp(p[3])-up*(pixel[1]-p[5])/math.exp(p[3])
    return tuple(eye+ray*((x-eye[0])/ray[0]))


def unproject_axis(pixel,axis,value,p):
    right,up,back=basis(p);eye=TARGET+math.exp(p[2])*back
    ray=-back+right*(pixel[0]-p[4])/math.exp(p[3])-up*(pixel[1]-p[5])/math.exp(p[3])
    return tuple(eye+ray*((value-eye[axis])/ray[axis]))


def calibrate_side():
    """Damped finite-difference least squares against tire silhouettes and hubs."""
    # Axial stations of the tire's measured, rounded section. Multiple stations
    # are necessary: the visible contour is not a flat circle on the hub plane.
    section=[(-.111,.275),(-.121,.304),(-.103,.343),(-.061,.352),
             (.043,.352),(.096,.345),(.122,.312),(.115,.278)]
    angles=np.linspace(math.pi,math.tau,361)
    clouds=[]
    for y in (-1.610,1.525):
        clouds.append([np.c_[np.full(len(angles),.866+x),y+r*np.cos(angles),
                            np.maximum(.0015,.352+r*np.sin(angles))] for x,r in section])
    def residual(p):
        radius=math.exp(p[7])
        landmarks=np.array(((1.011,-1.610,radius),(1.011,1.525,radius)))
        result=[]
        for cloud,edges in zip(clouds,TIRE_EDGES):
            sample=np.array(edges)
            curves=[]
            for points in cloud:
                points=points.copy()
                y=points[:,1].mean()
                points[:,1]=y+(points[:,1]-y)*radius/.352
                points[:,2]=points[:,2]*radius/.352
                uv=project(points,p)
                order=np.argsort(uv[:,0])
                curves.append(np.interp(sample[:,0],uv[order,0],uv[order,1],left=-1000,right=-1000))
            result.extend(np.max(curves,axis=0)-sample[:,1])
        result.extend(((project(landmarks,p)-HUBS)*2).ravel())
        # A gentle roll prior removes the residual ambiguity between the two
        # circular silhouettes without fitting any car-body feature.
        result.append(p[6]*20)
        # The visible roof strip constrains elevation: a high camera would
        # expose the full roof width rather than the narrow strip in this view.
        result.append((p[1]-.055)*150)
        return np.array(result)

    p=np.array((-.34,.14,math.log(10),math.log(3800),1010,565,0.,math.log(.38)))
    damping=.003
    for _ in range(100):
        r=residual(p)
        eps=np.array((1e-5,1e-5,1e-5,1e-5,.001,.001,1e-5,1e-5))
        J=np.column_stack([(residual(p+np.eye(8)[i]*eps[i])-r)/eps[i] for i in range(8)])
        A=J.T@J
        delta=np.linalg.solve(A+damping*np.diag(np.maximum(np.diag(A),1e-6)), -J.T@r)
        candidate=p+delta
        candidate[0]=np.clip(candidate[0],-.75,-.01)
        candidate[1]=np.clip(candidate[1],.015,.09)
        candidate[2]=np.clip(candidate[2],math.log(6),math.log(60))
        candidate[3]=np.clip(candidate[3],math.log(1000),math.log(30000))
        candidate[7]=np.clip(candidate[7],math.log(.33),math.log(.44))
        if np.dot(residual(candidate),residual(candidate))<np.dot(r,r):
            p=candidate
            damping=max(1e-7,damping*.45)
            if np.linalg.norm(delta)<1e-7: break
        else:
            damping=min(1e7,damping*4)
    global SIDE_CAMERA
    SIDE_CAMERA=p
    return {'parameters':p.tolist(),'tire_and_hub_rms_px':float(np.sqrt(np.mean(residual(p)**2))),
            'tire_radius':math.exp(p[7]),
            'hubs':project(((1.011,-1.610,math.exp(p[7])),(1.011,1.525,math.exp(p[7]))),p).tolist()}


def camera_side():
    p=SIDE_CAMERA
    if p is None: calibrate_side(); p=SIDE_CAMERA
    name='review.reference_side'
    camera=bpy.data.objects.get(name)
    if camera is None:
        data=bpy.data.cameras.new(name)
        camera=bpy.data.objects.new(name,data)
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(camera)
        camera['impala_build']=True
    right,up,back=basis(p)
    camera.matrix_world=Matrix(((right[0],up[0],back[0],0),
                               (right[1],up[1],back[1],0),
                               (right[2],up[2],back[2],0),(0,0,0,1)))
    camera.location=Vector(TARGET+math.exp(p[2])*back)
    K.enum_set(camera.data,'type','PERSP')
    camera.data.lens=math.exp(p[3])*36/WIDTH
    camera.data.sensor_width=36
    K.enum_set(camera.data,'sensor_fit','HORIZONTAL')
    camera.data.shift_x=(WIDTH/2-p[4])/WIDTH
    camera.data.shift_y=(p[5]-HEIGHT/2)/WIDTH
    camera.data.clip_start=.04
    camera.data.clip_end=180
    camera.data.background_images.clear()
    background=camera.data.background_images.new()
    background.image=bpy.data.images.load(SIDE_FILE,check_existing=True)
    background.alpha=.5
    background.scale=1
    K.enum_set(background,'display_depth','FRONT')
    K.enum_set(background,'frame_method','FIT')
    camera.data.show_background_images=True
    return camera


def fit_landmarks(world,pixels,seed,priors=()):
    """Recover a single pinhole pose from correspondences, without image warps."""
    world=np.array(world);pixels=np.array(pixels);p=np.array(seed,dtype=float)
    damping=.001
    def error(p):
        r=(project(world,p)-pixels).ravel()
        return np.r_[r,[(p[index]-value)*weight for index,value,weight in priors]]
    for _ in range(120):
        r=error(p);eps=np.array((1e-5,1e-5,1e-5,1e-5,.001,.001,1e-5))
        J=np.column_stack([(error(p+np.eye(7)[i]*eps[i])-r)/eps[i] for i in range(7)])
        A=J.T@J
        delta=np.linalg.solve(A+damping*np.diag(np.maximum(np.diag(A),1e-6)),-J.T@r)
        candidate=p+delta
        candidate[2]=np.clip(candidate[2],math.log(4),math.log(50))
        candidate[3]=np.clip(candidate[3],math.log(500),math.log(20000))
        if np.dot(error(candidate),error(candidate))<np.dot(r,r):
            p=candidate;damping=max(1e-8,damping*.5)
            if np.linalg.norm(delta)<1e-8:break
        else:damping=min(1e8,damping*4)
    return p,float(np.sqrt(np.mean(error(p)**2)))


def registered_camera(name,p,filename,width,height):
    name='review.reference_'+name
    ob=bpy.data.objects.get(name)
    if ob is None:
        ob=bpy.data.objects.new(name,bpy.data.cameras.new(name))
        bpy.data.collections['90_REVIEW_STAGE'].objects.link(ob);ob['impala_build']=True
    right,up,back=basis(p)
    ob.matrix_world=Matrix(((right[0],up[0],back[0],0),(right[1],up[1],back[1],0),
                           (right[2],up[2],back[2],0),(0,0,0,1)))
    ob.location=Vector(TARGET+math.exp(p[2])*back)
    K.enum_set(ob.data,'type','PERSP');K.enum_set(ob.data,'sensor_fit','HORIZONTAL')
    ob.data.lens=math.exp(p[3])*36/width;ob.data.sensor_width=36
    ob.data.shift_x=(width/2-p[4])/width;ob.data.shift_y=(p[5]-height/2)/width
    ob.data.clip_start=.04;ob.data.clip_end=180
    ob.data.background_images.clear()
    bg=ob.data.background_images.new();bg.image=bpy.data.images.load(filename,check_existing=True)
    bg.alpha=.5;bg.scale=1;K.enum_set(bg,'display_depth','FRONT');K.enum_set(bg,'frame_method','FIT')
    ob.data.show_background_images=True
    ob['reference_projection']=p.tolist();ob['reference_width']=width;ob['reference_height']=height
    return ob


def camera_front():
    from . import cabin,contract as D
    world=[(-1,D.fascia_y(-1),.846),(1,D.fascia_y(1),.846),
           cabin.wind_point(0,-1),cabin.wind_point(0,1),cabin.wind_point(0,0),
           (0,D.fascia_y(0),.856),(-.84,-1.61,.0015),(.84,-1.61,.0015),cabin.roof_point(.28,0)]
    pixels=[(243,817),(1580,826),(486,566),(1310,565),(899,573),(899,835),(395,1159),(1385,1193),(899,351)]
    p,rms=fit_landmarks(world,pixels,(-math.pi/2,.18,math.log(6.8),math.log(2600),900,740,0))
    ob=registered_camera('front',p,'/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_front.jpeg',1824,1824*1448/1948)
    print('Front registration rms:',round(rms,3),'parameters:',p.tolist())
    return ob


def camera_rear():
    from . import cabin,contract as D
    world=[(1,D.tail_y(1),.846),(-1,D.tail_y(-1),.846),
           cabin.wind_point(0,1,True),cabin.wind_point(0,-1,True),cabin.wind_point(0,0,True),
           (0,D.tail_y(0),.856),cabin.roof_point(.41,0),(.84,1.525,.0015),(-.84,1.525,.0015)]
    pixels=[(346,533),(1523,533),(584,365),(1278,369),(938,367),(938,539),(935,212),(496,940),(1380,919)]
    p,rms=fit_landmarks(world,pixels,(math.pi/2,.18,math.log(7),math.log(2300),938,620,0))
    ob=registered_camera('rear',p,'/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_back.jpeg',1790,1154)
    print('Rear registration rms:',round(rms,3),'parameters:',p.tolist())
    return ob


def camera_top():
    from . import contract as D
    world=[D.side_point(s,y,D.CREST(y)) for y in (D.NOSE,D.TAIL,-.74) for s in (-1,1)]
    pixels=[(1901,750),(1885,152),(151,778),(148,155),(1314,760),(1311,108)]
    p,rms=fit_landmarks(world,pixels,(math.pi,math.pi/2,math.log(6),math.log(2000),1050,457,0),
                        priors=((0,math.pi,800),(1,math.pi/2,800),(6,0,800)))
    ob=registered_camera('top',p,'/Users/scott/Documents/Projects/Node/Transformers/ref_images/67_impala_top.jpeg',2048,2048*1226/2714)
    print('Top registration rms:',round(rms,3),'parameters:',p.tolist())
    return ob


def view_side(overlay=True):
    scene=bpy.context.scene
    scene.camera=camera_side()
    scene.render.resolution_x,scene.render.resolution_y=3216,1452
    scene.render.resolution_percentage=50
    scene.camera.data.background_images[0].alpha=.5 if overlay else 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.camera=scene.camera
                K.enum_set(space.region_3d,'view_perspective','CAMERA')
                space.region_3d.view_camera_zoom=0
                space.overlay.show_overlays=True
                space.overlay.show_extras=False
                space.overlay.show_floor=False
                space.overlay.show_axis_x=False
                space.overlay.show_axis_y=False
                space.overlay.show_cursor=False
                space.overlay.show_relationship_lines=False
                space.region_3d.view_camera_zoom=20
    return scene.camera
