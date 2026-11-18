# Mapa de presenca de voz por clipe: DF (so voz) vs original, quadros de 50 ms. Lista trechos SEM voz >= 0,6 s.
import json, glob, os, numpy as np, soundfile as sf
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; M=A+'/../..'
from scipy.signal import butter,sosfilt
sos=butter(4,[200,3500],'bp',fs=48000,output='sos')
def words(clip):
    return json.load(open(f'{M}/ing/{clip}/transcricao.json'))['palavras']
res={}
for f in sorted(glob.glob(A+'/df/*_o.wav')):
    base=os.path.basename(f)[:-6]; clip,a,b=base.rsplit('_',2); a=float(a); b=float(b)
    o,sr=sf.read(f,dtype='float32'); d,_=sf.read(f[:-6]+'_d.wav',dtype='float32')
    h=int(0.05*sr); n=min(len(o),len(d))//h
    ob=sosfilt(sos,o[:n*h]); db=sosfilt(sos,d[:n*h])
    eo=10*np.log10(np.mean(ob.reshape(n,h)**2,1)+1e-12); ed=10*np.log10(np.mean(db.reshape(n,h)**2,1)+1e-12)
    voz=(ed>-58)&(ed>eo-12)     # o DF manteve energia de fala
    # dilata 150 ms
    v=np.convolve(voz.astype(float),np.ones(7),'same')>0
    W=[(x[0],x[1]) for x in words(clip)]
    t=a+np.arange(n)*0.05
    for w0,w1 in W: v[(t>=w0-0.2)&(t<=w1+0.2)]=True
    gaps=[]; i=0
    while i<n:
        if not v[i]:
            j=i
            while j<n and not v[j]: j+=1
            if (j-i)*0.05>=0.6: gaps.append((round(t[i],2),round(t[min(j,n-1)],2),round(float(np.median(eo[i:j])),1)))
            i=j
        else: i+=1
    res[base]=dict(clip=clip,a=a,b=b,gaps=gaps,voz=[round(float(x),2) for x in t[v]] if False else None)
    print(base,'sem voz:',gaps)
json.dump(res,open(A+'/vad.json','w'),indent=1)
