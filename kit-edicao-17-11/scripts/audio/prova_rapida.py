# Prova objetiva rapida (retomada): VAD silero nos stems sem voz, busca de laco por autocorrelacao, janela 43-61 s do amb transcrita de novo.
import json, numpy as np, soundfile as sf, pyloudnorm as pyln, scipy.signal as ss
from faster_whisper.vad import get_speech_timestamps, VadOptions
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; R={}
def le(n):
    x,sr=sf.read(f'{A}/{n}.wav',dtype='float32'); R.setdefault('formato',{})[n]=dict(sr=sr,canais=x.shape[1],dur=round(len(x)/sr,3),subtipo=sf.info(f'{A}/{n}.wav').subtype,pico_amostra_db=round(float(20*np.log10(np.abs(x).max()+1e-12)),2))
    return x.mean(1),sr
S={n:le(n)[0] for n in ['voz','amb','trilha','sfx','mix']}; SR=48000
def n16(x,alvo=-20):
    L=pyln.Meter(SR).integrated_loudness(x); return np.clip(ss.resample_poly(x*10**((alvo-L)/20),1,3),-1,1).astype(np.float32)
for n in ['amb','sfx','trilha','voz']:
    y=n16(S[n]); R.setdefault('vad_silero',{})[n]={}
    for thr in (0.5,0.3):
        ts=get_speech_timestamps(y,VadOptions(threshold=thr,min_speech_duration_ms=120,min_silence_duration_ms=200,speech_pad_ms=0))
        R['vad_silero'][n][f'thr{thr}']=[[round(t['start']/16000,2),round(t['end']/16000,2)] for t in ts]
# laco: autocorrelacao do amb e da soma amb+sfx (8 kHz, blocos nivelados)
def laco(x):
    y=ss.resample_poly(x,1,6).astype(np.float64); b=4000; 
    for i in range(0,len(y),b):
        r=np.sqrt(np.mean(y[i:i+b]**2))+1e-9; y[i:i+b]/=r
    F=np.fft.rfft(y,2*len(y)); ac=np.fft.irfft(F*np.conj(F))[:len(y)]; ac/=ac[0]
    lo=int(0.25*8000); k=np.argsort(ac[lo:])[::-1][:5]+lo
    return [[round(i/8000,3),round(float(ac[i]),3)] for i in k]
R['laco_autocorr(lag_s,coef)']={'amb':laco(S['amb']),'sfx':laco(S['sfx']),'mix_menos_voz':laco(S['amb']+S['sfx']+S['trilha'])}
# soma dos stems x mix (deve ser um ganho constante)
soma=S['voz']+S['amb']+S['trilha']+S['sfx']; n=min(len(soma),len(S['mix'])); g=float(np.dot(soma[:n],S['mix'][:n])/np.dot(soma[:n],soma[:n])); res=S['mix'][:n]-g*soma[:n]
R['mix_vs_stems']=dict(ganho_db=round(20*np.log10(abs(g)),2),residuo_db=round(float(10*np.log10(np.mean(res**2)/np.mean(S['mix'][:n]**2)+1e-20)),1))
json.dump(R,open(A+'/prova_rapida.json','w'),indent=1,ensure_ascii=False); print(json.dumps(R,ensure_ascii=False))
from faster_whisper import WhisperModel
m=WhisperModel('medium',device='cpu',compute_type='int8',cpu_threads=4); T={}
for nome,st,a,b in [('amb 43-61',S['amb'],43,61),('amb 53-82',S['amb'],53,82),('amb+sfx 43-61',S['amb']+S['sfx'],43,61)]:
    x=st[int(a*SR):int(b*SR)]; y=np.concatenate([np.zeros(8000,np.float32),n16(x),np.zeros(8000,np.float32)])
    segs,_=m.transcribe(y,language='pt',vad_filter=False,condition_on_previous_text=False,beam_size=5)
    T[nome]=[dict(i=round(s.start-0.5+a,2),f=round(s.end-0.5+a,2),txt=s.text.strip(),nsp=round(s.no_speech_prob,2),lp=round(s.avg_logprob,2)) for s in segs]; print(nome,T[nome],flush=True)
R['transcricao_janelas']=T; json.dump(R,open(A+'/prova_rapida.json','w'),indent=1,ensure_ascii=False)
