# Prova final do ambiente: amb.wav em janelas (com 0,5 s de silencio nas pontas) + lista do que existe em cada janela.
import json, numpy as np, soundfile as sf, pyloudnorm as pyln, scipy.signal as ss
from faster_whisper import WhisperModel
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; SR=48000
m=WhisperModel('medium',device='cpu',compute_type='int8',cpu_threads=4)
amb=sf.read(A+'/amb.wav',dtype='float32')[0].mean(1); it=json.load(open(A+'/amb_itens.json')); R=[]
for a,b in [(0,30),(25,60),(55,90),(85,128.248)]:
    x=amb[int(a*SR):int(b*SR)]; L=pyln.Meter(SR).integrated_loudness(x); y=np.clip(x*10**((-20-L)/20),-1,1)
    y=np.concatenate([np.zeros(SR//2,np.float32),y,np.zeros(SR//2,np.float32)])
    segs,_=m.transcribe(ss.resample_poly(y,1,3).astype(np.float32),language='pt',vad_filter=False,condition_on_previous_text=False,beam_size=5)
    r=dict(janela=[a,b],texto=[dict(i=round(s.start-0.5+a,2),f=round(s.end-0.5+a,2),txt=s.text.strip(),nsp=round(s.no_speech_prob,2)) for s in segs],
           naturais=[x['fonte'].split(' (')[0] for x in it if x['natural'] and x['t1']>a and x['t0']<b]); R.append(r); print(r,flush=True)
json.dump(R,open(A+'/tr_amb_janelas.json','w'),indent=1,ensure_ascii=False)
