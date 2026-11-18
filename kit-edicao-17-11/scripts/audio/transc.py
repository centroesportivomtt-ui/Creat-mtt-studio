# transcreve um wav com faster-whisper (sem VAD), normalizando para -20 LUFS antes (stem baixo nao esconde voz)
import sys, json, numpy as np, soundfile as sf, pyloudnorm as pyln
from faster_whisper import WhisperModel
f=sys.argv[1]; out=sys.argv[2]; modelo=sys.argv[3] if len(sys.argv)>3 else 'medium'
x,sr=sf.read(f,dtype='float32'); x=x.mean(1) if x.ndim>1 else x
L=pyln.Meter(sr).integrated_loudness(x); x=x*10**((-20-L)/20); x=np.clip(x,-1,1)
import scipy.signal as ss; y=ss.resample_poly(x,1,3).astype(np.float32)
m=WhisperModel(modelo,device='cpu',compute_type='int8',cpu_threads=4)
segs,_=m.transcribe(y,language='pt',vad_filter=False,word_timestamps=True,condition_on_previous_text=False,beam_size=5)
R=[]
for s in segs:
    R.append(dict(i=round(s.start,2),f=round(s.end,2),txt=s.text.strip(),nsp=round(s.no_speech_prob,2),lp=round(s.avg_logprob,2)))
    print(f'{s.start:7.2f}-{s.end:7.2f} nsp={s.no_speech_prob:.2f} lp={s.avg_logprob:.2f} | {s.text.strip()}',flush=True)
json.dump(dict(arquivo=f,lufs_orig=round(L,1),segmentos=R),open(out,'w'),indent=1,ensure_ascii=False)
