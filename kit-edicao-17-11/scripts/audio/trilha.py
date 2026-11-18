# TRILHA v2: mesma faixa ElevenMusic da v1 (108 s), reeditada para 128,248 s.
# Medido nesta rodada: a faixa esta em 120 bpm cravados (bumbo em 2k + 0,5j s), nao 117,6. Cortes sempre 12 ms antes do ataque.
# Saida: trilha_edit.wav (cheia, sem ducking) + trilha_mapa.json (segmentos e batidas na linha final). Ducking no mix.py.
import json, os, subprocess, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; A1=A+'/../audio'
M=A+'/../..'; E=json.load(open(M+'/direcao/edl.json')); DUR=E['dur']; SR=48000; N=int(round(DUR*SR))
if not os.path.exists(A1+'/musica/el_take1.wav'): subprocess.run(['ffmpeg','-v','error','-y','-i',A1+'/musica/el_take1.mp3','-ar','48000','-c:a','pcm_f32le',A1+'/musica/el_take1.wav'],check=True)
m,sr=sf.read(A1+'/musica/el_take1.wav',dtype='float32'); assert sr==SR
m=np.concatenate([m,np.zeros((SR*4,2),np.float32)])
LD=0.012   # corte antes do ataque
# (nome, src_a, src_b, out_a, entrada, saida, ganho_dB)  entrada/saida: ('x',X) crossfade centrado no ponto; ('f',X) fade simples por dentro
SEG=[
 ('intro+CT+groove A ate o stop',      0.0,     44-LD,   0.134,        ('f',0.004), ('f',0.010), 0),
 ('stop-time: acento no pisca 1',      16-LD,   16.17,   44.977-LD,    ('f',0.003), ('f',0.080), -1.5),
 ('volta no pisca 2 (frase A G C D A A A)', 40-LD, 54-LD, 45.742-LD,   ('f',0.003), ('x',0.016), 0),
 ('queda: pad (1a parte)',             54-LD,   54.90,   59.730,       ('x',0.016), ('x',0.20), 0),
 ('queda: pad (2a parte, -0,54 s)',    55.44,   62-LD,   60.642,       ('x',0.20),  ('x',0.016), 0),
 ('subida + estrada (corta no relampago)', 62-LD, 69.5-LD, 67.190,     ('x',0.016), ('f',0.008), 0),
 ('Valente (D | A G C D)',             70-LD,   80-LD,   76.274-LD,    ('f',0.003), ('f',0.010), 0),
 ('pose: acento no impact frame',      80-LD,   80.30,   86.639-LD,    ('f',0.003), ('f',0.070), 0),
 ('retoma + titulo BRABUS + 1o compasso do lounge', 80.5-LD, 88-LD, 87.359-LD, ('f',0.003), ('x',0.016), 0),
 ('lounge (A G C D A G) sob passa-baixa', 24-LD, 36-LD,  94.847,       ('x',0.016), ('f',0.50), 0),
 ('DROP (C) + virada (D) + resolucao A G C D', 92-LD, 103.80, 107.571-LD, ('f',0.003), ('x',0.25), 0),
 ('Rota: A G C',                       96.15,   101.315, 119.371,      ('x',0.25),  ('x',0.25), 0),
 ('mapa: subida (D) + ataque em A',    62-LD,   64.25,   124.548-LD,   ('x',0.25),  ('x',0.50), 0),
 ('acorde final na logo (A)',          104-LD,  111.9,   126.548-LD,   ('f',0.005), ('f',0.010), 4.0),
]
out=np.zeros((N+SR*6,2),np.float32); mapa=[]
def sin2(n): return np.sin(np.linspace(0,np.pi/2,max(n,1)))**2
for nome,a,b,oa,ent,sai,gdb in SEG:
    pre=ent[1]/2 if ent[0]=='x' else 0; pos=sai[1]/2 if sai[0]=='x' else 0
    i0=int(round((a-pre)*SR)); i1=int(round((b+pos)*SR)); x=m[max(0,i0):i1].copy()*10**(gdb/20)
    nin=int(round(ent[1]*SR)); nout=int(round(sai[1]*SR))
    if nin>1: x[:nin]*=np.sqrt(sin2(nin))[:,None] if ent[0]=='x' else sin2(nin)[:,None]
    if nout>1: x[-nout:]*=np.sqrt(sin2(nout)[::-1])[:,None] if sai[0]=='x' else sin2(nout)[::-1][:,None]
    k=int(round((oa-pre)*SR))+ (max(0,i0)-i0)
    x=x[:len(out)-k]; out[k:k+len(x)]+=x
    mapa.append(dict(nome=nome,src=[round(a,3),round(b,3)],out=[round(oa,3),round(oa+b-a,3)],entrada=ent,saida=sai,ganho_db=gdb))
out=out[:N]
# ---- automacao de filtro (curva emocional)
t=np.arange(N)/SR
def env(pts): p=np.array(pts,float); return np.interp(t,p[:,0],p[:,1])
hp=sosfilt(butter(4,220,'hp',fs=SR,output='sos'),out,axis=0)            # CT: pulso de trabalho sem grave, abre no match da porta
k_hp=env([(0,1),(15.90,1),(16.134,0),(DUR,0)])[:,None]
lp=sosfilt(butter(4,700,'lp',fs=SR,output='sos'),out,axis=0)            # BRABUS: som da pista ao lado; abre um pouco quando a luz do conceito acende
k_lp=env([(0,0),(92.70,0),(92.90,1),(99.33,1),(99.42,0.55),(100.70,1),(102.91,1),(103.00,0.45),(104.50,1),(107.0,1),(107.3,0),(DUR,0)])[:,None]
y=out*(1-k_hp-k_lp)+hp*k_hp+lp*k_lp*1.25
# ---- nivel por secao (dB)
g=env([(0,-8),(0.134,-8),(1.6,-1),(1.9,-1.5),(15.9,-1.5),(16.134,0),(59.6,0),(59.9,2.0),(67.0,2.0),(69.15,1.5),(74.70,1.5),(76.2,0),
       (107.5,0),(107.571,1.0),(111.3,1.0),(111.9,4.0),(124.3,4.0),(124.55,1.5),(126.40,1.5),(126.50,0.0),(DUR,0.0)])
y*=10**(g/20)[:,None]
sf.write(A+'/trilha_edit.wav',y.astype(np.float32),SR,subtype='FLOAT')
# batidas na linha final (para motion/montagem)
bat=[]
for s in mapa:
    a,b=s['src']; oa=s['out'][0]; k=np.ceil((a-1e-6)/0.5)
    while k*0.5<b-0.02: bat.append((round(oa+k*0.5-a,3), int(k)%4==0)); k+=1
bat=sorted(set(bat))
json.dump(dict(bpm=120.0,tempo_s=0.5,nota='faixa medida em 120 bpm (bumbo em 2k+0,5j s); a conta 117,6 bpm da v1 estava errada',segmentos=mapa,
  eventos={'bumbo entra (match da porta)':16.134,'para (silencio no clique 44,212)':44.122,'acento pisca 1':44.977,'volta pisca 2':45.742,'queda (pad)':59.742,
           'subida':67.202,'estouro no soco do Kal':69.202,'corta no relampago':74.690,'volta em Valente':76.274,'frase nova no P27':78.274,'acento da pose':86.639,
           'retoma':87.359,'titulo BRABUS (aberto)':90.859,'lounge filtrado':92.859,'some antes do drop':106.847,'DROP':107.571,'virada':109.571,'resolve (A)':111.571,
           'subida do mapa':124.548,'acorde final na logo':126.548},
  cabecas_de_compasso=[t for t,c in bat if c],batidas=[t for t,c in bat]),open(A+'/trilha_mapa.json','w'),indent=1,ensure_ascii=False)
for s in mapa: print(s['out'],s['src'],s['nome'])
print('ok',len(y)/SR)
