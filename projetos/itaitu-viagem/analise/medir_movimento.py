# Mede, por meio segundo, o tremor (alta frequência), a velocidade de pan/giro (baixa frequência) e a nitidez de cada clipe.
import cv2, numpy as np, json, sys, os
from scipy.ndimage import gaussian_filter1d
for c in sys.argv[1:]:
    out=f"mov/{c}.json"
    if os.path.exists(out): continue
    cap=cv2.VideoCapture(f"proxy/{c}.mp4"); fps=cap.get(cv2.CAP_PROP_FPS) or 30
    prev=None; dx=[];dy=[];da=[];sharp=[]
    while True:
        ok,f=cap.read()
        if not ok: break
        g=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY); h,w=g.shape; s=270/min(h,w); g=cv2.resize(g,(int(w*s),int(h*s)))
        sharp.append(cv2.Laplacian(g,cv2.CV_64F).var())
        if prev is not None:
            p0=cv2.goodFeaturesToTrack(prev,200,0.01,8)
            m=None
            if p0 is not None and len(p0)>=10:
                p1,st,_=cv2.calcOpticalFlowPyrLK(prev,g,p0,None)
                gd=st.ravel()==1
                if gd.sum()>=8: m,_=cv2.estimateAffinePartial2D(p0[gd],p1[gd])
            if m is None: dx.append(np.nan);dy.append(np.nan);da.append(np.nan)
            else: dx.append(m[0,2]);dy.append(m[1,2]);da.append(np.degrees(np.arctan2(m[1,0],m[0,0])))
        prev=g
    dx,dy,da=[np.nan_to_num(np.array(v,float),nan=0.0) for v in (dx,dy,da)]
    diag=np.hypot(*g.shape)
    def hf(v): return v-gaussian_filter1d(v,fps*0.5)
    jit=np.hypot(hf(dx),hf(dy))/diag*100+np.abs(hf(da))*0.5      # % da diagonal por quadro
    pan=np.hypot(gaussian_filter1d(dx,fps*0.25),gaussian_filter1d(dy,fps*0.25))/diag*100*fps  # % da diagonal por segundo
    gir=np.abs(gaussian_filter1d(da,fps*0.25))*fps                  # graus por segundo
    sharp=np.array(sharp[1:]) if len(sharp)>1 else np.array(sharp)
    n=int(len(jit)/(fps/2))
    W=[]
    for i in range(n):
        a,b=int(i*fps/2),int((i+1)*fps/2)
        W.append({"t":i/2,"tremor":round(float(np.mean(jit[a:b])),3),"pan":round(float(np.mean(pan[a:b])),1),"giro":round(float(np.mean(gir[a:b])),1),"nitidez":round(float(np.median(sharp[a:b])),0)})
    json.dump({"clip":c,"janela_s":0.5,"legenda":"tremor=% da diagonal por quadro (alta freq; >0,35 forte, 0,15-0,35 médio, <0,15 firme); pan=% da diagonal por segundo (>60 = câmera virando/chicote); giro=graus/s; nitidez=variância do Laplaciano (cair muito = borrado)","janelas":W},open(out,"w"))
    j=[x["tremor"] for x in W]; print(c,"tremor médio",round(float(np.mean(j)),3),"máx",round(float(np.max(j)),3) if j else 0,flush=True)
