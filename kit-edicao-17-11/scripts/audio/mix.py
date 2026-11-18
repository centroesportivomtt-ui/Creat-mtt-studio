# MIX final: voz (base) + amb + trilha (ducking suave) + sfx. -14 LUFS, pico real <= -1,0 dBTP (teto -1,4 no limitador).
# Saidas (48 kHz estereo): mix.wav (PCM 24) e stems no nivel do mix: voz.wav, amb.wav, trilha.wav, sfx.wav (float)
import json, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import resample_poly, butter, sosfilt
from scipy.ndimage import minimum_filter1d, uniform_filter1d, maximum_filter1d
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; M=A+'/../..'
E=json.load(open(M+'/direcao/edl.json')); SR=48000; DUR=E['dur']; N=int(round(DUR*SR))
def ld(f):
    x,_=sf.read(f'{A}/{f}.wav',dtype='float32'); x=np.stack([x,x],1) if x.ndim==1 else x
    return np.pad(x,((0,max(0,N-len(x))),(0,0)))[:N]
# P63 tem duas dinamicas (o homem vira o rosto em 103,35 s): a margem voz/cama e medida e ajustada em duas partes
PL=[]
for p in E['planos']:
    if p['id']=='P63': PL+=[dict(p,id='P63a',t1=103.35),dict(p,id='P63b',t0=103.35)]
    else: PL.append(p)
voz=ld('voz_base'); amb=ld('amb_base'); mus=ld('trilha_edit'); fx=ld('sfx_raw')
G_MUS=0.5; G_FX=0.0; G_AMB=0.0                      # niveis de base (dB) antes do loudness final
mus*=10**(G_MUS/20); fx*=10**(G_FX/20); amb*=10**(G_AMB/20)
# ---- deteccao de fala (envelope da voz em 10 ms), ponte sobre pausas curtas para nao bombear entre palavras
h=int(0.01*SR); v=voz[:,0]; nh=N//h
e=np.sqrt(np.mean(v[:nh*h].reshape(nh,h)**2,1)); edb=20*np.log10(e+1e-9)
fala=(edb>-40).astype(np.float32)
nfe=int(1.25/0.01)|1; fala=minimum_filter1d(maximum_filter1d(fala,nfe),nfe)   # correcao 1: pausa menor que 1,25 s no meio da fala NAO solta o ducking (bombeava em 49,0; 52,1; 82,3)
fala=maximum_filter1d(fala,int(0.45/0.01)); fala=minimum_filter1d(fala,int(0.15/0.01))   # fecha pausas < ~0,45 s; ignora estalos < 0,15 s
t=np.arange(nh)*0.01
g=np.zeros(nh); s=0.0
for i in range(nh):                                    # rampas assimetricas: desce em 0,35 s, sobe em 0,6 s
    s=min(fala[i],s+0.01/0.35) if fala[i]>s else max(fala[i],s-0.01/0.70); g[i]=s
g=np.sin(g*np.pi/2)**2
PROF=10.0                                              # ducking de 10 dB (ROTEIRO)
duck=10**(-PROF*g/20)
up=lambda c: np.interp(np.arange(N)/SR,(np.arange(nh)+0.5)*0.01,c).astype(np.float32)[:,None]
mus*=up(duck); fx*=up(10**(-4.0*g/20))
# ---- margem voz/cama por PLANO com fala (banda 250-4000 Hz, so onde ha fala): ajusta a cama para 10,5 dB (alvo 9-11),
# um ganho por plano com rampas de 0,4 s (sem bombear dentro da frase)
sosb=butter(2,[250,4000],'bp',fs=SR,output='sos')
vb=sosfilt(sosb,voz[:,0]); fm=up(g)[:,0]>0.9
adj_t=[0.0]; adj_v=[0.0]; AJ=[]
cb=sosfilt(sosb,(mus+fx+amb).mean(1))
for p in PL:
    if not p['fala']: continue
    a_=int(p['t0']*SR); b_=int(p['t1']*SR); k=fm[a_:b_]
    if k.sum()<SR*0.2: continue
    mg=20*np.log10(np.sqrt(np.mean(vb[a_:b_][k]**2))/np.sqrt(np.mean(cb[a_:b_][k]**2)))
    d=float(np.clip(10.5-mg,-7.5,8.0)); AJ.append((p['id'],round(mg,1),round(d,1)))
    adj_t+= [p['t0']+0.2, p['t1']-0.2]; adj_v+=[d,d]
adj_t.append(DUR); adj_v.append(0.0)
o=np.argsort(adj_t); adj=np.interp(np.arange(nh)*0.01,np.array(adj_t)[o],np.array(adj_v)[o])
adj=adj*g + 0.0*(1-g)                                   # so vale enquanto ha fala (fora dela a trilha volta ao nivel cheio)
ga=up(10**(-adj/20)); mus*=ga; fx*=ga
ajuste=adj
# ---- soma e loudness
meter=pyln.Meter(SR)
def picos4(x):
    out=np.empty(len(x),np.float32); B=SR*8; P=2048
    for i in range(0,len(x),B):
        a=max(0,i-P); b=min(len(x),i+B+P); upx=resample_poly(x[a:b],4,1,axis=0); pk=np.max(np.abs(upx),1).reshape(-1,4).max(1)
        out[i:min(len(x),i+B)]=pk[i-a:i-a+min(B,len(x)-i)]
    return out
def tp_limit(x,ceil_db=-1.4):
    pk=picos4(x); c=10**(ceil_db/20); gg=np.minimum(1,c/np.maximum(pk,1e-9)).astype(np.float32)
    wd=int(0.004*SR); gg=minimum_filter1d(gg,2*wd+1); gg=uniform_filter1d(gg,2*wd+1); return x*gg[:,None]
mix=(voz+amb+mus+fx).astype(np.float32); gt=1.0
for it in range(6):
    Lf=meter.integrated_loudness(mix); k=10**((-14.0-Lf)/20); gt*=k; mix=tp_limit(mix*k)
fd=int(0.60*SR); mix[-fd:]*=(np.linspace(1,0,fd)**1.5)[:,None]
sf.write(A+'/mix.wav',mix,SR,subtype='PCM_24')
for n,x in [('voz',voz),('amb',amb),('trilha',mus),('sfx',fx)]: sf.write(f'{A}/{n}.wav',(x*gt).astype(np.float32),SR,subtype='FLOAT')
rvz=np.sqrt(np.mean(vb[fm[:len(vb)]]**2)); cb2=sosfilt(sosb,(mus+fx+amb).mean(1)); rcm=np.sqrt(np.mean(cb2[fm]**2))
R=dict(lufs=round(meter.integrated_loudness(mix),2),pico_real_dbtp=round(20*np.log10(picos4(mix).max()),2),ganho_total_db=round(20*np.log10(gt),2),
       voz_sobre_cama_db=round(20*np.log10(rvz/rcm),1),ducking_db=PROF,ajuste_margem_max_db=round(float(ajuste.max()),1),ajuste_margem_min_db=round(float(ajuste.min()),1))
# margem por plano com fala
mp=[]
for p in PL:
    if not p['fala']: continue
    a=int(p['t0']*SR); b=int(p['t1']*SR); k=fm[a:b]
    if k.sum()<SR*0.2: continue
    mp.append((p['id'],round(20*np.log10(np.sqrt(np.mean(vb[a:b][k]**2))/np.sqrt(np.mean(cb2[a:b][k]**2))),1)))
R['margem_por_plano']=mp; R['ajuste_cama_por_plano(id,margem_antes,descida_db)']=AJ
json.dump(R,open(A+'/mix_medidas.json','w'),indent=1,default=float); print(json.dumps(R,default=float))
