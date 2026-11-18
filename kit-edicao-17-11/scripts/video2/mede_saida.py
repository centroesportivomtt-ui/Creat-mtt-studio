# mede_saida.py: tremor residual medido NO ARQUIVO renderizado (LK + afim parcial, px de 1080), e borda preta (colunas/linhas < 6 de luma nas bordas)
import sys, json, subprocess, numpy as np, cv2
W,H=1080,1920
def mede(f):
    p=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',f,'-vf','scale=360:640','-pix_fmt','gray','-f','rawvideo','-'],stdout=subprocess.PIPE)
    prev=None; tr=[(0,0)]; borda=0.0; n=0
    while True:
        b=p.stdout.read(360*640)
        if len(b)<360*640: break
        g=np.frombuffer(b,np.uint8).reshape(640,360); n+=1
        e=[g[:,0].mean(),g[:,-1].mean(),g[0].mean(),g[-1].mean()]; i=[g[:,3].mean(),g[:,-4].mean(),g[3].mean(),g[-4].mean()]
        borda=max(borda,max((b_-a_) for a_,b_ in zip(e,i)))      # borda escura em relacao a 3 px para dentro
        if prev is not None:
            pts=cv2.goodFeaturesToTrack(prev,400,0.006,8); M=None
            if pts is not None and len(pts)>=12:
                q,st,_=cv2.calcOpticalFlowPyrLK(prev,g,pts,None); ok=st.ravel()==1
                if ok.sum()>=8: M,_=cv2.estimateAffinePartial2D(pts[ok],q[ok],method=cv2.RANSAC,ransacReprojThreshold=1.5)
            if M is not None:
                c=M@np.array([180,320,1.0]); d=((c[0]-180)*3,(c[1]-320)*3); tr.append(d if np.hypot(*d)<130 else (0,0))
            else: tr.append((0,0))
        prev=g.copy()
    c=np.cumsum(np.array(tr),0); k=15
    if len(c)<k+2: return dict(quadros=n,tremor_px=None,borda=round(float(borda),1))
    ker=np.ones(k)/k; sm=lambda x:np.convolve(np.pad(x,(k//2,k//2),mode='edge'),ker,'valid')
    res=np.stack([c[:,j]-sm(c[:,j]) for j in range(2)],1)
    return dict(quadros=n,tremor_px=round(float(np.sqrt(np.mean(res[:,0]**2+res[:,1]**2))),2),borda=round(float(borda),1))
if __name__=='__main__':
    for f in sys.argv[1:]: print(f.split('/')[-1],mede(f))
