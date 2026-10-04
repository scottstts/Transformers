"""Measure the projected crown silhouette, including its nearer transverse surface."""
import numpy as np
from . import cabin,contract as D,reference as R,geometry as G

YS=(-.271,.266,.714,.960,1.136)


def silhouette(xs):
    contours=[]
    for u in G.lin(-1,1,79):
        points=np.array([cabin.roof_point(t,u) for t in G.lin(0,1,181)])
        uv=R.project(points,R.SIDE_CAMERA);order=np.argsort(uv[:,0])
        contours.append(np.interp(xs,uv[order,0],uv[order,1],left=np.inf,right=np.inf))
    return np.min(contours,axis=0)


def measure():
    p=np.array(R.SIDE_TRACES['roof_crown']);xs=np.linspace(p[0,0]+4,p[-1,0]-4,55)
    trace=D.Curve([(float(x),float(y)) for x,y in p])
    ys=np.array([trace(float(x)) for x in xs]);projected=silhouette(xs)
    return {'max_silhouette_error_px':float(np.max(abs(projected-ys))),
            'rms_silhouette_error_px':float(np.sqrt(np.mean((projected-ys)**2))),
            'samples':[(round(float(x),2),round(float(a),2),round(float(b),2))
                       for x,a,b in zip(xs[::9],ys[::9],projected[::9])]}


def fit():
    original=D.ROOF_CENTRE
    p=np.array(R.SIDE_TRACES['roof_crown']);xs=np.linspace(p[0,0]+6,p[-1,0]-6,45)
    trace=D.Curve([(float(x),float(y)) for x,y in p]);ys=np.array([trace(float(x)) for x in xs])
    z=np.array([original(y) for y in YS]);seed=z.copy()
    def residual(values):
        D.ROOF_CENTRE=D.Curve([(-.320,float(values[0]))]+[(y,float(a)) for y,a in zip(YS,values)])
        return np.r_[silhouette(xs)-ys,(values-seed)*8]
    damping=.01
    try:
        for _ in range(24):
            r=residual(z);eps=.00002
            jac=np.column_stack([(residual(z+np.eye(5)[i]*eps)-r)/eps for i in range(5)])
            a=jac.T@jac
            delta=np.linalg.solve(a+damping*np.diag(np.maximum(np.diag(a),1e-6)),-jac.T@r)
            trial=z+np.clip(delta,-.015,.015)
            if np.sum(residual(trial)**2)<np.sum(r*r):
                z=trial;damping=max(1e-7,damping*.4)
                if np.max(abs(delta))<.000002:break
            else:damping=min(1e6,damping*4)
        residual(z)
        return {'canonical_centre_stations':[(-.320,round(float(z[0]),6))]+
                [(y,round(float(a),6)) for y,a in zip(YS,z)],'projection':measure()}
    finally:D.ROOF_CENTRE=original
