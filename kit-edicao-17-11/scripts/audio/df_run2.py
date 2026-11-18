# DeepFilterNet3 para as janelas que a v2 precisa e a v1 nao tinha. Reaproveita build/audio/df por link. Idempotente.
import sys, os, subprocess, json, glob
S='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad'; M=S+'/maxima'; O=M+'/build/audio2/df'; O1=M+'/build/audio/df'
os.makedirs(O,exist_ok=True)
for f in glob.glob(O1+'/*.wav'):
    d=O+'/'+os.path.basename(f)
    if not os.path.exists(d): os.symlink(f,d)
sys.path.insert(0,S+'/drako/V2/lib'); sys.path.insert(0,S+'/mesa/E1/py')
E=json.load(open(M+'/direcao/edl.json'))
def wins():
    W={}
    for f in glob.glob(O+'/*_o.wav'):
        c,a,b=os.path.basename(f)[:-6].rsplit('_',2); W.setdefault(c,[]).append((float(a),float(b)))
    return W
W=wins(); need={}
itens=[(p['clip'],p['src_in'],p['src_out'],p.get('vel',1)) for p in E['planos'] if p['clip']!='CARTAO_FECHO']+[(p['clip'],p['src_in'],p['src_out'],1) for p in E['inserts']]
for c,a,b,v in itens:
    s0=max(0,a-0.07*v); s1=b+0.07*v
    if any(x<=s0+1e-6 and y>=s1-1e-6 for x,y in W.get(c,[])): continue
    need.setdefault(c,[]).append((a,b))
J=[]
for c,R in need.items():
    dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'{M}/ing/{c}/audio_orig.m4a']))
    U=[]
    for a,b in sorted((max(0,a-6),min(dur,b+6)) for a,b in R):
        if U and a<=U[-1][1]+2: U[-1][1]=max(U[-1][1],b)
        else: U.append([a,b])
    for a,b in U: J.append((c,round(a,2),round(b,2)))
print('janelas novas:',J,flush=True)
import dfshim, torch, numpy as np, soundfile as sf
torch.set_num_threads(4); model=None
for c,a,b in J:
    n=f'{O}/{c}_{a:.2f}_{b:.2f}'; o=n+'_o.wav'; dd=n+'_d.wav'
    if not os.path.exists(o):
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(a),'-t',str(b-a),'-i',f'{M}/ing/{c}/audio_orig.m4a','-ac','1','-ar','48000','-c:a','pcm_f32le',o],check=True)
    if not os.path.exists(dd):
        if model is None:
            from df.enhance import init_df, enhance
            model, st, _ = init_df(S+'/mesa/E1/dfn3', log_level='ERROR')
        x,sr=sf.read(o,dtype='float32',always_2d=True)
        y=enhance(model, st, torch.from_numpy(x.T.copy()))
        sf.write(dd+'.tmp.wav',y.numpy().T,sr,subtype='FLOAT'); os.replace(dd+'.tmp.wav',dd)
    print('ok',c,a,b,flush=True)
