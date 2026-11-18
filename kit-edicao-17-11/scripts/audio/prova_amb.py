# Prova para os itens naturais do ambiente: (1) transcreve de 3 jeitos (sem borda, com 0,5 s de silencio, com ganho diferente);
# (2) pecas da estrada uma a uma; (3) energia que o DeepFilterNet deixa passar (voz) contra o original, nos trechos de origem.
import json, glob, os, numpy as np, soundfile as sf, pyloudnorm as pyln, scipy.signal as ss
from faster_whisper import WhisperModel
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; SR=48000
m=WhisperModel('medium',device='cpu',compute_type='int8',cpu_threads=4)
def tr(x,alvo=-20,pad=0.0):
    xx=np.tile(x,int(np.ceil(SR*1.2/len(x)))) if len(x)<SR else x
    L=pyln.Meter(SR).integrated_loudness(xx); y=np.clip(x*10**((alvo-L)/20),-1,1)
    if pad: y=np.concatenate([np.zeros(int(pad*SR),np.float32),y,np.zeros(int(pad*SR),np.float32)])
    segs,_=m.transcribe(ss.resample_poly(y,1,3).astype(np.float32),language='pt',vad_filter=False,condition_on_previous_text=False,beam_size=5)
    return ' / '.join(f'{s.text.strip()} (nsp {s.no_speech_prob:.2f} lp {s.avg_logprob:.2f})' for s in segs) or '(vazio)'
R={}
for f in sorted(glob.glob(A+'/amb_itens/*.wav')):
    x,_=sf.read(f,dtype='float32'); n=os.path.basename(f)
    R[n]=dict(sem_borda=tr(x),com_silencio=tr(x,pad=0.5),ganho_m26=tr(x,alvo=-26,pad=0.3)); print(n,R[n],flush=True)
# pecas da estrada
WIN={}
for f in glob.glob(A+'/df/*_o.wav'):
    c,a,b=os.path.basename(f)[:-6].rsplit('_',2); WIN.setdefault(c,[]).append((float(a),float(b),f))
def raw(clip,s0,s1,suf='_o'):
    for a,b,f in sorted(WIN[clip]):
        if a<=s0+1e-6 and b>=s1-1e-6:
            x=sf.read(f[:-6]+suf+'.wav',dtype='float32')[0]; return x[int(round((s0-a)*SR)):int(round((s1-a)*SR))]
from scipy.signal import butter,sosfilt
sos=butter(4,[200,3500],'bp',fs=SR,output='sos')
PEC={'P07':[('IMG_5161',16.22,19.45)],'P55':[('IMG_5169',0,0.733)],'P56':[('IMG_5170',1.415,2.967)],'P13':[('IMG_5172',0.2,2.6)],'P58':[('IMG_5178',72.10,72.60),('IMG_5178',73.25,74.55)],
     'P70-P71':[('IMG_5183',43.76,45.11),('v_183901',8.0,9.9),('v_183901',13.5,14.05),('v_183901',14.55,15.25),('IMG_5183',1.45,2.2),('v_183901',27.44,28.20)],
     'P72':[('IMG_5186',89.60,90.50),('IMG_5186',91.15,91.85)],'P43':[('IMG_5226',96.6,97.80),('IMG_5226',62.8,64.45)]}
D={}
for k,L in PEC.items():
    for c,a,b in L:
        o=raw(c,a,b); d=raw(c,a,b,'_d'); ob=sosfilt(sos,o); db=sosfilt(sos,d); h=int(0.05*SR); n=len(o)//h
        eo=10*np.log10(np.mean(ob[:n*h].reshape(n,h)**2,1)+1e-12); ed=10*np.log10(np.mean(db[:n*h].reshape(n,h)**2,1)+1e-12)
        r=dict(orig_db=round(float(np.median(eo)),1),df_max_db=round(float(ed.max()),1),df_menos_orig_max=round(float((ed-eo).max()),1),quadros_voz=int(((ed>-58)&(ed>eo-12)).sum()),de=n)
        if k=='P70-P71': r['transcricao']=tr(o,pad=0.5)
        D[f'{k} {c} {a}-{b}']=r; print(k,c,a,b,r,flush=True)
json.dump(dict(itens=R,origem=D),open(A+'/prova_amb.json','w'),indent=1,ensure_ascii=False)
