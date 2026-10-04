"""Shared dimensions and independently traced feature lines, in metres.

+X is driver's left, -Y the nose, +Z up. Side curves are recovered from the
registered reference. The quarter blade does not move the lower character line.
"""
import math
from . import reference as R

NOSE = -2.504
TAIL = 2.810
FRONT_AXLE = -1.610
REAR_AXLE = 1.525
WHEEL_X = 0.840
WHEEL_Z = 0.362222
TYRE_RADIUS = 0.362222
TYRE_WIDTH = 0.238
ARCH_A = 0.448
ARCH_B = 0.398
ARCH_Z = 0.346
ROCKER_Z = 0.274
MOLDING_Z = 0.475
PANEL_GAP = 0.0032
SKIN = 0.006
DOOR_FRONT = -0.742
DOOR_SPLIT = 0.234
DOOR_REAR = 1.233
COWL = -0.870
ROOF_FRONT = -0.320
ROOF_REAR = 1.136
REAR_SCREEN_BOTTOM = 1.525
HOOD_HALF_WIDTH = 0.764
LAMP_RADIUS = 0.073
LAMP_BEZEL_RADIUS = 0.0815
LAMP_Z = 0.724
LAMP_X = (0.573, 0.754)
GROUND_Z = 0.0


class Curve:
    """C1 monotone cubic, including shape-preserving endpoint derivatives."""
    def __init__(self, points):
        self.x, self.y = zip(*points)
        h = [b-a for a,b in zip(self.x,self.x[1:])]
        d = [(b-a)/dt for a,b,dt in zip(self.y,self.y[1:],h)]
        slopes = [d[0]]
        for i in range(1,len(points)-1):
            if d[i-1]*d[i]<=0:
                slopes.append(0.0)
            else:
                w1,w2 = 2*h[i]+h[i-1],h[i]+2*h[i-1]
                slopes.append((w1+w2)/(w1/d[i-1]+w2/d[i]))
        slopes.append(d[-1])
        if len(points)>2:
            for index,a,b in ((0,0,1),(-1,-1,-2)):
                m=((2*h[a]+h[b])*d[a]-h[a]*d[b])/(h[a]+h[b])
                if m*d[a]<=0: m=0
                elif abs(m)>3*abs(d[a]): m=3*d[a]
                slopes[index]=m
        self.m=slopes

    def __call__(self,x):
        if x<=self.x[0]: return self.y[0]
        if x>=self.x[-1]: return self.y[-1]
        i=next(i for i in range(len(self.x)-1) if self.x[i+1]>=x)
        h=self.x[i+1]-self.x[i]
        u=(x-self.x[i])/h
        return ((2*u**3-3*u*u+1)*self.y[i]+(u**3-2*u*u+u)*h*self.m[i]
                +(-2*u**3+3*u*u)*self.y[i+1]+(u**3-u*u)*h*self.m[i+1])


def traced(name,x=1.01):
    return Curve(sorted((float(y),float(z)) for _,y,z in R.trace(name,x)))


SILL = traced('sill',.91)
CHARACTER = traced('character',1.018)
BLADE = traced('blade',1.035)
FRONT_CROWN = traced('front_crown',.982)
MOLDING = Curve([(-2.58,.458),(-2.06,.484),(-1.17,.493),(.23,.473),
                 (1.04,.464),(1.95,.471),(2.713,.518),(2.81,.530)])
ROCKER = traced('rocker',.986)
PLAN_WIDTH = Curve([(-2.58,.995),(-2.33,1.018),(-1.61,1.018),(-.74,1.013),
                    (.23,1.005),(.80,1.013),(1.53,1.029),(2.2,1.024),(2.81,1.005)])
HOOD_CENTRE = Curve([(-2.504,.850),(-2.37,.911),(-2.14,.974),(-1.85,1.010),
                     (-1.32,1.030),(-.90,1.041),(-.84,1.040)])
HOOD_SECTION = Curve([(0,.0035),(.012,.0025),(.031,0),(.310,-.002),(.365,-.001),
                      (.405,-.006),(.445,-.012),(.480,-.020),(.510,-.022),(.552,-.009),
                      (.580,.007),(.620,.010),(.690,.004),(.764,-.006)])
ROOF_CENTRE = Curve([(-.320,1.477828),(-.271,1.477828),(.266,1.488586),(.714,1.473286),
                     (.960,1.441874),(1.136,1.405196)])
ROOF_EDGE = Curve([(-.320,1.366),(-.293,1.366),(.158,1.366),(.593,1.340),(.930,1.325),(1.200,1.303)])
ROOF_WIDTH = Curve([(-.320,.750),(-.03,.785),(.36,.793),(.593,.778),(.930,.710),(1.200,.642)])
FRONT_SEAM = Curve(sorted((float(z),float(y)) for _,y,z in R.trace('front_seam')))
MIDDLE_SEAM = Curve(sorted((float(z),float(y)) for _,y,z in R.trace('middle_seam')))
REAR_SEAM = Curve(sorted((float(z),float(y)) for _,y,z in R.trace('rear_seam',1.02)))
FRONT_ARCH_POINTS = [tuple(map(float,p[1:])) for p in R.trace('front_arch',1.02)]
REAR_ARCH_POINTS = [tuple(map(float,p[1:])) for p in R.trace('rear_arch',1.02)]
FRONT_ARCH = Curve(sorted(FRONT_ARCH_POINTS))
REAR_ARCH = Curve(sorted(REAR_ARCH_POINTS))
FRONT_LOWER_EDGE = Curve([(.340,-2.2186),(.460,-2.275),(.590,-2.335),
                          (.620,-2.420),(.640,NOSE),(.8705,NOSE)])
GRILLE_CORNER_Y = Curve([(.840,-2.529),(.900,-2.554),(.970,-2.577),
                         (1.007,-2.580),(1.023,-2.573)])


def front_fender_edge(z):
    """The lower nose is a rearward-sloping edge, not a vertical skirt."""
    return FRONT_LOWER_EDGE(z) if z<FRONT_CROWN(NOSE) else NOSE


def front_shell_leading(z):
    """First real side-shell station at a given height, including the crown."""
    if z<=CREST(NOSE):return front_fender_edge(z)
    lo,hi=NOSE,DOOR_FRONT
    for _ in range(40):
        mid=(lo+hi)/2
        if CREST(mid)<z:lo=mid
        else:hi=mid
    return (lo+hi)/2


def grille_y(x):
    """An independent forward corner cap beyond the adjacent lamp plane."""
    return GRILLE_CORNER_Y(abs(x)) if abs(x)>.840 else fascia_y(x)


def blade_weight(y):
    if y<=.650 or y>=2.81: return 0.
    rise=min(1,(y-.650)/.38)
    fall=min(1,(2.81-y)/.65)
    return rise*rise*(3-2*rise)*fall


def CREST(y):
    if y<DOOR_FRONT:
        # One monotone nose roll, with no additive local hump.
        if y< -2.10:
            return Curve([(NOSE,.8705),(-2.45,.891),(-2.35,.921),(-2.25,.946),(-2.10,.9686)])(y)
        return FRONT_CROWN(y)
    if y<.65: return SILL(y)
    # Only the upper edge of the quarter changes. All lower feature lines are
    # independent traces, so the blade cannot bend the entire flank.
    return max(SILL(y),BLADE(y)+.002*blade_weight(y)) if y<1.72 else BLADE(y)+.002*blade_weight(y)


def side_section(y):
    top=CREST(y)
    crease=min(CHARACTER(y),top-.038)
    bottom=ROCKER(y)
    # Absolute-height control lines keep the main crease and waist independent
    # of the upper ridge. Tight stations form the stamped crease, not a tube.
    return sorted([(bottom-.02,.968),(bottom+.010,.976),(MOLDING(y)-.03,.986),
                   (MOLDING(y)+.015,.990),((MOLDING(y)+crease)/2,.985),(crease-.026,1.004),
                   (crease-.003,1.012),(crease+.003,1.013),(crease+.028,1.010),
                   (max(crease+.031,top-.012),.990),(max(crease+.034,top),.973)])


def side_x(y,z):
    section=Curve(side_section(y))
    x=section(z)+PLAN_WIDTH(y)-1.013
    weight=blade_weight(y)
    edge=BLADE(y)
    if weight and edge-.065<z<edge+.024:
        d=z-edge
        if d<0:
            relief=max(0,1+d/.065)**2.3
        else:
            relief=max(0,1-d/.024)**.7
        x+=.038*weight*relief
    nose=max(0,1-(y-NOSE)/.33)
    x+=.040*nose*nose*max(0,min(1,(z-.610)/.180))
    return x


def side_point(s,y,z):
    x=s*side_x(y,z)
    return (x,body_y(x,y,z),z)


def body_y(x,y,z):
    front=grille_y(x) if abs(x)>.840 else fascia_y(x)
    if abs(x)>.840:
        blend=max(0,min(1,(z-.828)/.029));blend=blend*blend*(3-2*blend)
        front+=.028-.014*blend
    return y+(front-NOSE)*math.exp(-((y-NOSE)/.18)**2)+(tail_surface_y(x,z)-TAIL)*math.exp(-((y-TAIL)/.18)**2)


def tail_surface_y(x,z):
    return tail_y(x)-.024*math.exp(-((z-.814)/.06)**2)


def arch_bottom(y,axle):
    points,curve=(FRONT_ARCH_POINTS,FRONT_ARCH) if axle==FRONT_AXLE else (REAR_ARCH_POINTS,REAR_ARCH)
    lo,hi=min(p[0] for p in points),max(p[0] for p in points)
    return curve(y) if lo<=y<=hi else ROCKER(y)


def side_bottom(y):
    return max(ROCKER(y),arch_bottom(y,FRONT_AXLE),arch_bottom(y,REAR_AXLE))


def fascia_y(x):
    # Continuous shallow V, with the outer lamp brows swept into the fenders.
    a=abs(x)
    return -2.608+.085*a+.023*(a/.99)**8


def tail_y(x):
    return TAIL-.036*(abs(x)/1.01)**2


def hood_height(x,y):
    channel_run=max(0,min(1,(y-NOSE)/.29))
    channel_run=channel_run*channel_run*(3-2*channel_run)
    return HOOD_CENTRE(y)+HOOD_SECTION(abs(x))*channel_run


def arch_segments(a,b,z):
    """Visible trim runs at z. Nothing may cross either wheel opening."""
    out=[(a,b)]
    for points,curve in ((FRONT_ARCH_POINTS,FRONT_ARCH),(REAR_ARCH_POINTS,REAR_ARCH)):
        ys=[min(p[0] for p in points)+(max(p[0] for p in points)-min(p[0] for p in points))*i/400 for i in range(401)]
        cut=[y for y in ys if curve(y)>MOLDING(y)-.02]
        if not cut: continue
        lo,hi=min(cut)-.009,max(cut)+.009
        split=[]
        for u,v in out:
            if hi<=u or lo>=v: split.append((u,v))
            else:
                if lo>u: split.append((u,min(lo,v)))
                if hi<v: split.append((max(hi,u),v))
        out=split
    return out
