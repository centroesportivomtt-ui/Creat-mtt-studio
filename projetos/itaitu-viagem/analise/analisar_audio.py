import sys, json, subprocess, os, numpy as np
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=2)
B = os.path.dirname(os.path.abspath(__file__))
def rms_profile(f):
    p = subprocess.run(["ffmpeg","-v","error","-i",f,"-ac","1","-ar","8000","-f","s16le","-"],capture_output=True)
    a = np.frombuffer(p.stdout,dtype=np.int16).astype(np.float32)/32768
    n = len(a)//8000
    r = [20*np.log10(np.sqrt(np.mean(a[i*8000:(i+1)*8000]**2))+1e-9) for i in range(n)]
    return [round(float(x),1) for x in r]
for c in sys.argv[1:]:
    out = f"{B}/ana/{c}.json"
    if os.path.exists(out): continue
    f = f"{B}/aud/{c}.flac"
    if not os.path.exists(f): continue
    pcm = subprocess.run(["ffmpeg","-v","error","-i",f,"-ac","1","-ar","16000","-f","f32le","-"],capture_output=True).stdout
    au = np.frombuffer(pcm,dtype=np.float32)
    segs, info = m.transcribe(au, language="pt", vad_filter=True, beam_size=1)
    S = [{"ini":round(s.start,1),"fim":round(s.end,1),"txt":s.text.strip(),"nospeech":round(s.no_speech_prob,2)} for s in segs]
    json.dump({"clip":c,"rms_db_por_segundo":rms_profile(f),"fala":S}, open(out,"w"), ensure_ascii=False)
    print(c, "ok", len(S), flush=True)
