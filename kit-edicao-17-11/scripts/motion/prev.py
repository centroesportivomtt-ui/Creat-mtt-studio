# Base de conferência da linha v2 (planos + inserts + placas VFX, sem transições): prev/base540.mp4 (540x960) + rostos.json (4 qps)
# e função quadro(g) para pegar um quadro global em 1080x1920.
import json, subprocess, os, sys, numpy as np
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
PV=json.load(open(M+'/build/video/planos_v2.json')); VF=json.load(open(M+'/build/vfx/vfx.json'))
N=PV['quadros_total']
def fonte(g):
    """(arquivo, k) do quadro global g: VFX > insert > plano"""
    for k,v in VF.items():
        if k!='_geral' and v['g0']<=g<v['g1']: return (M+'/build/vfx/%s.mp4'%k, g-v['g0'])
    for p in PV['planos']:
        if p['id'].startswith('I') and p['corpo'][0]<=g<p['corpo'][1]: return (M+'/'+p['arquivo'], g-p['F'][0])
    for p in PV['planos']:
        if not p['id'].startswith('I') and p['corpo'][0]<=g<p['corpo'][1]: return (M+'/'+p['arquivo'], g-p['F'][0])
    raise SystemExit('sem fonte %d'%g)
def quadro(g, w=1080, h=1920):
    a,k=fonte(g)
    b=subprocess.run(['ffmpeg','-v','error','-i',a,'-vf',f'select=eq(n\\,{k}),scale={w}:{h}','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE).stdout
    return np.frombuffer(b,np.uint8).reshape(h,w,3)
if __name__=='__main__':
    out=M+'/build/motion2/prev/base540.mp4'
    if not os.path.exists(out):
        # trechos contíguos por arquivo
        segs=[]
        for g in range(N):
            a,k=fonte(g)
            if segs and segs[-1][0]==a and segs[-1][2]==k: segs[-1][2]=k+1
            else: segs.append([a,k,k+1])
        enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','540x960','-r','30','-i','-','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-g','15',out+'.tmp.mp4'],stdin=subprocess.PIPE)
        tot=0
        for a,k0,k1 in segs:
            p=subprocess.Popen(['ffmpeg','-v','error','-i',a,'-vf',f'select=between(n\\,{k0}\\,{k1-1}),scale=540:960','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
            n=0
            while True:
                b=p.stdout.read(540*960*3)
                if len(b)<540*960*3: break
                enc.stdin.write(b); n+=1
            if n!=k1-k0: print('AVISO',a,k0,k1,'leu',n); 
            # completa se faltou (repete o último)
            for _ in range(k1-k0-n): enc.stdin.write(b if len(b)==540*960*3 else bytes(540*960*3))
            tot+=k1-k0
        enc.stdin.close(); enc.wait(); os.rename(out+'.tmp.mp4',out); print('base540',tot,'quadros',len(segs),'trechos')
    ro=M+'/build/motion2/rostos.json'
    if not os.path.exists(ro):
        import cv2
        cas=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
        prof=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_profileface.xml')
        p=subprocess.Popen(['ffmpeg','-v','error','-i',out,'-vf','fps=5,format=gray','-f','rawvideo','-'],stdout=subprocess.PIPE)
        k=0;res=[]
        while True:
            b=p.stdout.read(540*960)
            if len(b)<540*960: break
            g=np.frombuffer(b,np.uint8).reshape(960,540); g=cv2.equalizeHist(g)
            fs=list(cas.detectMultiScale(g,1.1,5,minSize=(45,45)))+list(prof.detectMultiScale(g,1.1,6,minSize=(50,50)))
            res.append(dict(t=k/5,rostos=[[int(x*2),int(y*2),int(w*2),int(h*2)] for x,y,w,h in fs])); k+=1
        json.dump(res,open(ro,'w')); print('rostos',k)
