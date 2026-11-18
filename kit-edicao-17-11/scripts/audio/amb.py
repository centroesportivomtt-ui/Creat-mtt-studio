# AMB v2: som natural dos planos sem fala (so trechos SEM voz) + tom de sala sintetico (perfil espectral, fase aleatoria:
# nao tem como conter voz) sob as falas. Cada item natural e gravado em amb_itens/ para ser transcrito sozinho.
import json, glob, os, subprocess, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import stft, istft
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; M=A+'/../..'
E=json.load(open(M+'/direcao/edl.json')); SR=48000; DUR=E['dur']; N=int(round(DUR*SR)); meter=pyln.Meter(SR)
SUB=json.load(open(A+'/amb_troca.json')) if os.path.exists(A+'/amb_troca.json') else {}   # itens naturais reprovados na transcricao -> tom sintetico
WIN={}
for f in glob.glob(A+'/df/*_o.wav'):
    c,a,b=os.path.basename(f)[:-6].rsplit('_',2); WIN.setdefault(c,[]).append((float(a),float(b),f))
CACHE={}
def raw(clip,s0,s1,vel=1.0):
    for a,b,f in sorted(WIN[clip]):
        if a<=s0+1e-6 and b>=s1-1e-6:
            if f not in CACHE: CACHE[f]=sf.read(f,dtype='float32')[0]
            x=CACHE[f][int(round((s0-a)*SR)):int(round((s1-a)*SR))].copy()
            if abs(vel-1)>1e-6:
                sf.write(A+'/tmp/_a.wav',x,SR,subtype='FLOAT')
                subprocess.run(['ffmpeg','-v','error','-y','-i',A+'/tmp/_a.wav','-af',f'atempo={vel}','-c:a','pcm_f32le',A+'/tmp/_b.wav'],check=True)
                x=sf.read(A+'/tmp/_b.wav',dtype='float32')[0]
            return x
    raise SystemExit(f'sem janela {clip} {s0}-{s1}')
def junta(pecas,dur,xf=0.08,repete=True):
    X=int(xf*SR); out=np.zeros(0,np.float32); k=0
    while len(out)<int(dur*SR)+X:
        if k>=len(pecas) and not repete: raise SystemExit('material sem voz insuficiente (sem laço)')
        x=pecas[k%len(pecas)].copy(); k+=1
        if len(out)==0: out=x; continue
        w=np.sin(np.linspace(0,np.pi/2,X))**2
        out=np.concatenate([out[:-X],out[-X:]*(1-w)+x[:X]*w,x[X:]])
    return out[:int(dur*SR)]
def tom_sintetico(pecas,dur,seed=71):
    X=np.concatenate(pecas); f,t,Z=stft(X,SR,nperseg=4096); prof=np.percentile(np.abs(Z),30,axis=1)
    n=int(dur*SR)+8192; rng=np.random.default_rng(seed); _,_,W=stft(rng.standard_normal(n),SR,nperseg=4096)
    W=W/(np.abs(W)+1e-12)*prof[:,None]; _,y=istft(W,SR,nperseg=4096); return y[:int(dur*SR)].astype(np.float32)
def nivel(x,alvo):
    L=meter.integrated_loudness(np.tile(x,int(np.ceil(SR*1.2/len(x)))) if len(x)<SR else x)
    if not np.isfinite(L): L=10*np.log10(np.mean(x**2)+1e-20)-0.691
    return x*10**((alvo-L)/20)
P={p['id']:p for p in E['planos']}
# trechos SEM voz por clipe (vad.json desta rodada: DeepFilterNet + palavras do whisper +-0,2 s; bordas aparadas 0,05 s)
G={'IMG_5159':[(0.05,2.45)],'IMG_5161':[(0.05,1.50),(12.75,13.35)],'IMG_5168':[(0.05,2.60)],'IMG_5172':[(0.25,4.05),(50.1,50.55)],
   'IMG_5178':[(39.4,40.4),(42.0,42.9),(71.6,72.6),(73.25,74.55)],'IMG_5186':[(33.2,37.55),(74.85,76.5)],'IMG_5226':[(62.8,64.45),(65.6,66.15)],
   'v_210219':[(226.55,228.1),(596.8,597.4),(854.1,855.5),(778.02,778.87)],'v_164647':[(13.23,14.38),(26.03,26.63),(27.18,28.68)],
   'v_164913':[(1.42,1.74),(4.18,4.52)]}   # correcao 1: P09 estava sem tom de sala (pausas curtas entre palavras, conferidas sem voz no DF)
TOM={'IMG_5159':'IMG_5159','IMG_5160':'IMG_5159','IMG_5161':'IMG_5161','IMG_5168':'IMG_5168','IMG_5172':'IMG_5172','IMG_5173':'IMG_5172',
     'IMG_5178':'IMG_5178','IMG_5186':'IMG_5186','v_185741':'IMG_5186','IMG_5226':'IMG_5226','v_210219':'v_210219','v_164647':'v_164647','v_164913':'v_164913'}
itens=[]   # (t0,t1,x,nome,natural?)
def natural(pid,alvo,s_ini=None,s_fim=None):
    p=P[pid]; s0=s_ini if s_ini else p['src_in']; x=raw(p['clip'],s0,s_fim if s_fim else p['src_out'],p['vel'])
    pre=int(round((s0-p['src_in'])/p['vel']*SR)); x=np.concatenate([np.zeros(pre,np.float32),x]); return nivel(x,alvo)
def poe(pid,x,nome,nat=True,t0=None,t1=None):
    p=P[pid]; a=p['t0'] if t0 is None else t0; b=p['t1'] if t1 is None else t1
    chave=nome.split()[0]
    if nat and chave in SUB:      # reprovado na transcricao: troca pelo tom sintetico do mesmo lugar
        c=SUB[chave]; x=nivel(tom_sintetico([raw(c,u,v) for u,v in G[c]],b-a,seed=sum(map(ord,chave))),-36); nome=f'{chave} TROCADO por tom sintetico de {c} (o natural tinha voz na transcricao)'; nat=False
    itens.append((a,b,x,nome,nat))
poe('P07',natural('P07',-30,16.22),'P07 porta real (IMG_5161 16.22-19.45, depois do fim da fala)')
poe('P55',natural('P55',-38),'P55 balcao do caixa (IMG_5169 0-0.73, sem voz)')
poe('P56',natural('P56',-30),'P56 rua com a moto real (IMG_5170 1.415-2.967, sem voz)')
poe('P13',natural('P13',-33),'P13 corredor (IMG_5172 0.2-2.6, sem voz)')
# P58: o vad marcou 72.65-73.2 como duvidoso -> usa so 73.25-74.55 precedido do fim de 71.6-72.6
p=P['P58']; x58=junta([raw('IMG_5178',72.10,72.60),raw('IMG_5178',73.25,74.55)],p['t1']-p['t0'],repete=False)
poe('P58',nivel(x58,-32),'P58 fachada na hora azul (IMG_5178 72.10-72.60 + 73.25-74.55, sem voz)')
# estrada P70 + inserts: carro e chuva reais so de trechos sem conversa, em ordem, SEM laço
t0=P['P70']['t0']; t1=P['P71']['t1']
pec=[raw('IMG_5183',43.76,45.11),raw('v_183901',8.0,9.9),raw('v_183901',13.5,14.05),raw('v_183901',14.55,15.25),raw('IMG_5183',1.45,2.2),raw('v_183901',27.44,28.20)]   # v_183901 0.05-0.80 saiu: o whisper leu 'E ai' numa das provas
pec=[nivel(x,-29) for x in pec]
poe('P70',junta(pec,t1-t0,xf=0.08,repete=False),'P70-P71 carro/chuva reais (IMG_5183 43.76-45.11 e 1.45-2.2; v_183901 8-9.9, 13.5-14.05, 14.55-15.25, 27.44-28.20; sem voz, sem laço)',t0=t0,t1=t1)
# P72: geral da academia; o vad marcou 90.55-91.1 -> usa 89.60-90.50 + 91.15-91.80
p=P['P72']; x72=junta([raw('IMG_5186',89.60,90.50),raw('IMG_5186',91.15,91.85)],p['t1']-p['t0'],repete=False)
poe('P72',nivel(x72,-33),'P72 academia (IMG_5186 89.60-90.50 + 91.15-91.85, sem voz)')
for pid,sd in (('P60',60),('P36',36)):
    p=P[pid]; poe(pid,nivel(tom_sintetico([raw('v_210219',a,b) for a,b in G['v_210219']],p['t1']-p['t0'],sd),-33),f'{pid} salao (perfil espectral v_210219, sintetico)',nat=False)
# P43 brinde: som real ate antes do 'ai sim', depois tom do Rota
p=P['P43']; xa=raw('IMG_5226',96.6,97.80,p['vel']); xb=junta([raw('IMG_5226',*G['IMG_5226'][0])],p['t1']-p['t0'])
X=int(0.12*SR); w=np.sin(np.linspace(0,np.pi/2,X))**2; xa=nivel(xa,-31); xb=nivel(xb,-38)
x43=np.concatenate([xa[:-X],xa[-X:]*(1-w)+xb[:X]*w,xb[X:]])[:int((p['t1']-p['t0'])*SR)]
poe('P43',x43,'P43 brinde real (IMG_5226 96.6-97.8) + tom do Rota (62.8-64.45)')
# tom de sala sob as falas (sintetico por local, bem baixo, constante)
for p in E['planos']:
    if not p['fala'] or p['id']=='P71': continue      # P71 = voz sobre a estrada: quem fica por baixo e a chuva
    c=TOM.get(p['clip'])
    if not c: continue
    pec=[raw(c,a,b) for a,b in G[c]]; x=tom_sintetico(pec,p['t1']-p['t0']+0.3,seed=int(p['id'][1:]))
    itens.append((p['t0']-0.15,p['t1']+0.15,nivel(x,-46),f"{p['id']} tom de sala (perfil espectral de {c}, sintetico)",False))
amb=np.zeros(N+SR,np.float32); F=int(0.15*SR)
os.makedirs(A+'/amb_itens',exist_ok=True)
for f in glob.glob(A+'/amb_itens/*.wav'): os.remove(f)
for k,(t0,t1,x,nome,nat) in enumerate(itens):
    x=x[:int(round((t1-t0)*SR))].copy(); f=min(F,len(x)//4)
    if nome.startswith('P55') or nome.startswith('P56') or nome.startswith('P13'): f=int(0.03*SR)   # corte seco entre chave, carro e corredor
    x[:f]*=np.sin(np.linspace(0,np.pi/2,f))**2; x[-f:]*=np.cos(np.linspace(0,np.pi/2,f))**2
    kk=max(0,int(round(t0*SR))); amb[kk:kk+len(x)]+=x[:len(amb)-kk]
    if nat: sf.write(f"{A}/amb_itens/{k:02d}_{nome.split()[0]}.wav",x,SR,subtype='FLOAT')
amb=amb[:N]
sf.write(A+'/amb_base.wav',amb,SR,subtype='FLOAT')
json.dump([dict(t0=round(a,3),t1=round(b,3),natural=n2,fonte=n) for a,b,_,n,n2 in itens],open(A+'/amb_itens.json','w'),indent=1,ensure_ascii=False)
print('amb ok',len(itens),'itens;',sum(1 for i in itens if i[4]),'naturais')
