# transcreve cada item natural do ambiente (sem VAD), normalizado a -20 LUFS. Vazio = aprovado.
import sys, json, glob, os, numpy as np, soundfile as sf, pyloudnorm as pyln, scipy.signal as ss
from faster_whisper import WhisperModel
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'
m=WhisperModel('medium',device='cpu',compute_type='int8',cpu_threads=4); R={}
for f in sorted(glob.glob(A+'/amb_itens/*.wav')):
    x,sr=sf.read(f,dtype='float32'); xx=np.tile(x,int(np.ceil(sr*1.2/len(x)))) if len(x)<sr else x
    L=pyln.Meter(sr).integrated_loudness(xx)
    if not np.isfinite(L): L=10*np.log10(np.mean(x**2)+1e-20)
    y=np.clip(x*10**((-20-L)/20),-1,1); y=ss.resample_poly(y,1,3).astype(np.float32)
    segs,_=m.transcribe(y,language='pt',vad_filter=False,condition_on_previous_text=False,beam_size=5)
    R[os.path.basename(f)]=[dict(i=round(s.start,2),f=round(s.end,2),txt=s.text.strip(),nsp=round(s.no_speech_prob,2),lp=round(s.avg_logprob,2)) for s in segs]
    print(os.path.basename(f),R[os.path.basename(f)],flush=True)
json.dump(R,open(A+'/tr_amb_itens.json','w'),indent=1,ensure_ascii=False)
