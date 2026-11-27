import librosa, numpy as np, json, sys, subprocess
from faster_whisper import WhisperModel
wm = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
for nome in ["m1_loser","m2_dancin","m3_messy"]:
    y, sr = librosa.load(f"musica/{nome}.mp3", sr=22050, mono=True)
    dur = len(y)/sr
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    rms = librosa.feature.rms(y=y, hop_length=sr//2)[0]
    rms_db = (20*np.log10(rms+1e-6)).round(1).tolist()   # a cada 0,5 s
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    # seções: agrupamento por timbre/harmonia
    S = np.vstack([librosa.feature.mfcc(y=y,sr=sr,n_mfcc=13), librosa.feature.chroma_cqt(y=y,sr=sr)])
    Sb = librosa.util.sync(S, librosa.time_to_frames(beats, sr=sr), aggregate=np.median)
    k = 10
    bounds = librosa.segment.agglomerative(Sb, k)
    bt = [0.0]+[float(beats[min(b,len(beats)-1)]) for b in bounds[1:]]
    secs=[]
    for i,t in enumerate(bt):
        t2 = bt[i+1] if i+1<len(bt) else dur
        a,b=int(t*2),int(t2*2)
        secs.append({"ini":round(t,2),"fim":round(t2,2),"energia_db":round(float(np.mean(rms_db[a:b])) if b>a else 0,1)})
    pcm = subprocess.run(["ffmpeg","-v","error","-i",f"musica/{nome}.mp3","-ac","1","-ar","16000","-f","f32le","-"],capture_output=True).stdout
    segs,_ = wm.transcribe(np.frombuffer(pcm,dtype=np.float32), language="en", vad_filter=True, beam_size=1)
    letra=[{"ini":round(s.start,1),"fim":round(s.end,1),"txt":s.text.strip()} for s in segs]
    json.dump({"musica":nome,"dur":round(dur,2),"bpm":float(np.atleast_1d(tempo)[0]),"batidas":[round(float(b),3) for b in beats],
               "rms_db_meio_segundo":rms_db,"secoes":secs,"letra":letra}, open(f"musica/{nome}.json","w"), ensure_ascii=False)
    print(nome, round(dur,1), "bpm", np.atleast_1d(tempo)[0], "secoes", [(s['ini'],s['energia_db']) for s in secs], flush=True)
    for l in letra: print("   ", l["ini"], l["txt"][:70])
