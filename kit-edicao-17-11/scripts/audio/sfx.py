# SFX v2: so gravacoes reais da build/sfx2 (+ 2 pedidos novos feitos aqui das mesmas fontes reais) e os sons reais do proprio dia.
# Um timbre por transicao; arquivo de uso unico entra uma vez (checado no fim). Saida: sfx_raw.wav + sfx_eventos.json
import json, os, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly, fftconvolve
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; M=A+'/../..'; S2=M+'/build/sfx2'; A1=M+'/build/audio'
E=json.load(open(M+'/direcao/edl.json')); SR=48000; DUR=E['dur']; N=int(round(DUR*SR)); BIB=json.load(open(S2+'/biblioteca.json'))
os.makedirs(A+'/sfx_novos',exist_ok=True)
def st(x): return np.stack([x,x],1) if x.ndim==1 else x
def fade(x,fi=0.003,fo=0.01):
    x=x.copy(); a=max(1,int(fi*SR)); b=max(1,int(fo*SR)); x[:a]*=(np.sin(np.linspace(0,np.pi/2,a))**2)[:,None]; x[-b:]*=(np.cos(np.linspace(0,np.pi/2,b))**2)[:,None]; return x
def pico(x,db): return x*10**(db/20)/np.abs(x).max()
def lp(x,f,o=2): return sosfilt(butter(o,f,'lp',fs=SR,output='sos'),x,axis=0).astype(np.float32)
def hp(x,f,o=2): return sosfilt(butter(o,f,'hp',fs=SR,output='sos'),x,axis=0).astype(np.float32)
def sala(x,rt=0.45,db=-14,corte=4500,seed=5):
    # resposta de sala simples (ruido filtrado com queda exponencial): so da espaco a gravacao real
    rng=np.random.default_rng(seed); n=int(rt*1.6*SR); t=np.arange(n)/SR
    h=np.stack([rng.standard_normal(n),rng.standard_normal(n)],1)*np.exp(-6.9*t/rt)[:,None]; h=lp(h,corte); h[:int(0.012*SR)]=0
    h/=np.sqrt((h**2).sum(0)).max(); w=np.stack([fftconvolve(x[:,c],h[:,c]) for c in (0,1)],1)
    y=np.zeros((len(w),2),np.float32); y[:len(x)]=x; return (y+w*10**(db/20)).astype(np.float32)
def le(nome):
    x,sr=sf.read(f'{S2}/{nome}.wav',dtype='float32'); assert sr==SR; return st(x)
# ---- pedidos novos (mesmas fontes reais Sonniss GDC)
# 1) tecido de subida do Kal 2: outro trecho do Cloth 61 (5,88-6,38 s; os outros sons do Kal usam 0,10-0,60, 3,10-3,50 e 5,05-5,16)
x,sr=sf.read(S2+'/_fontes/tecido_61.wav',dtype='float32'); x=resample_poly(x[int(5.88*sr):int(6.38*sr)],SR,sr).astype(np.float32)
sf.write(A+'/sfx_novos/kal2_sobe_tecido.wav',pico(fade(st(hp(x[:,None],180)[:,0]),0.02,0.10),-18).astype(np.float32),SR,subtype='FLOAT')
# 2) interruptor de luz real: 3maze - Buttons and Switches/light_switch_019.wav (outro take, nao o switch_on_042 da fila) + resposta de salao
x,sr=sf.read(A+'/fontes_novas/light_switch_019.wav',dtype='float32'); x=resample_poly(x,SR,sr,axis=0).astype(np.float32)
sf.write(A+'/sfx_novos/interruptor_luz_salao.wav',pico(sala(fade(st(x),0.001,0.03),rt=0.55,db=-13,corte=4200),-12).astype(np.float32),SR,subtype='FLOAT')
def novo(n): return sf.read(f'{A}/sfx_novos/{n}.wav',dtype='float32')[0]
def real(n): return st(sf.read(f'{A1}/sfx/{n}.wav',dtype='float32')[0])
# ---- limpador: as 2 batidas reais do arquivo (0,38-0,68 e 1,06-1,32), uma por passada visivel, alternadas e com ganho variado
lim=le('limpador_dentro_2x'); LA=fade(lim[int(0.36*SR):int(0.70*SR)],0.03,0.10); LB=fade(lim[int(1.04*SR):int(1.34*SR)],0.03,0.10)
# ---- trovao perto: estalo inteiro e, 0,7 s depois, a cauda fecha em passa-baixa (ja estamos dentro da academia) e cai -8 dB
tv=le('trovao_perto_com_chuva'); n=len(tv); t=np.arange(n)/SR; k=np.clip((t-0.375-0.7)/0.6,0,1)[:,None]
tv=tv*(1-k)+lp(tv,1300)*k*10**(-8/20)
EV=[]   # (inicio_s, nome, x, ganho_db, nota, evento_t)
def ev(t_evento,nome,x,anc,g=0.0,nota='',corta=None,ini_arq=0.0,fi=0.003,fo=0.012):
    x=x[int(ini_arq*SR):]; ini=t_evento-(anc-ini_arq)
    if corta is not None: x=x[:max(1,int(round((corta-ini)*SR)))]
    EV.append((ini,nome,fade(x,fi,fo),g,nota,t_evento))
ev(0.75,'porta_real_abre (IMG_5159)',real('porta_real_abre'),0.0,-6,'macaneta real da abertura (som do proprio dia)')
ev(1.05,'porta_ct_abre',le('porta_ct_abre'),0.02,-8,'reforco discreto da porta abrindo')
ev(7.67,'wh_camiseta_rapido',le('wh_camiseta_rapido'),0.087,-2,'whip rosto -> tela')
ev(16.134,'porta_ct_encosta',le('porta_ct_encosta'),0.145,-2,'MATCH DA PORTA: a batida da folha (0,145 s do arquivo) cai no corte e na cabeca do compasso; soma com a porta real (amb P07)')
ev(19.538,'wh_corda_chicote',le('wh_corda_chicote'),0.078,-1,'chicote pelo batente')
ev(23.575,'wh_luva_curto',le('wh_luva_curto'),0.089,0,'loja -> fachada')
ev(26.199,'wh_ar_suave',le('wh_ar_suave'),0.152,-1,'vinheta do mapa')
ev(26.599,'moto_passa_rua',le('moto_passa_rua'),2.0,-10,'moto real por baixo do som do plano; sai com o plano',corta=28.289,ini_arq=1.45,fi=0.20,fo=0.30)
ev(29.933,'kal_sobe_tecido',le('kal_sobe_tecido'),0.05,0,'Kal 1 sobe')
ev(30.153,'kal_pop_discreto',le('kal_pop_discreto'),0.003,0,'etiqueta O MASCOTE (unico pop do filme)')
ev(30.933,'kal_cruza_bracos',le('kal_cruza_bracos'),0.15,0,'Kal 1 cruza os bracos')
ev(44.212,'chave_clique_perto',le('chave_clique_perto'),0.245,3,'CLIQUE no silencio da trilha: o estalo principal (0,245 s do arquivo) no quadro do polegar')
ev(45.006,'moto_cruza_esq_dir',le('moto_cruza_esq_dir'),2.0,-6,'moto azul cruzando, so dentro do P56',corta=45.802,ini_arq=1.372,fi=0.05,fo=0.06)
ev(44.977+0.045,'carro_trancando_longe',le('carro_trancando_longe'),0.075,3,'travas + bip do outro lado da rua: 1o tranco 45 ms depois do pisca 1 (tempo do som atravessar a rua), nunca antes da luz')
ev(44.977,'trena_hud',le('trena_hud'),0.434,-10,'cadeado do HUD')
ev(45.822,'wh_camiseta_medio',le('wh_camiseta_medio'),0.119,-2,'speed ramp do corredor')
ev(53.217,'kal2_sobe_tecido (novo)',novo('kal2_sobe_tecido'),0.05,0,'Kal 2 sobe (outro trecho do Cloth 61)')
ev(53.617,'kal_aponta_joinha',le('kal_aponta_joinha'),0.11,0,'Kal 2 aponta')
ev(53.75,'fila_botao_e_chamada_loja',le('fila_botao_e_chamada_loja'),0.09,3,'botao (0,09 s do arquivo) no instante em que o 013 salta; o toque vem depois, do alto')
ev(64.629,'wh_isopor_textura',le('wh_isopor_textura'),0.286,0,'risco da agenda: IGREJA MATRIZ -> REMARCADA')
ev(69.255,'wh_rajada_folhas',le('wh_rajada_folhas'),0.458,-2,'rajada que emenda o whip na chuva')
ev(69.202,'kal_soco_bora',le('kal_soco_bora'),0.32,2,'SOCO do Kal: o baque de luva (0,32 s do arquivo) no pico do soco')
ev(69.555,'trovao_longe_estrada',le('trovao_longe_estrada'),0.25,-2,'trovao distante, de dentro do carro; morre antes do relampago',corta=74.429,fo=0.9)
x=le('chuva_parabrisa_dentro_12s'); ev(69.205,'chuva_parabrisa_dentro_12s',x,0.0,1,'cama do diluvio (chuva no para-brisa, de dentro); corta seco no relampago',corta=74.729,fi=0.30,fo=0.012)
# correcao 1: o I02 saiu e o I04 ficou com 3,1 s: 6 passadas visiveis (vales de luma medidos nos quadros 2151, 2163, 2182, 2194, 2213, 2224)
for i,tp in enumerate([71.643,72.043,72.677,73.060,73.709,74.089]):
    ev(tp,'limpador_dentro_2x (batida %s)'%('AB'[i%2]),[LA,LB][i%2],0.06,[-9,-11,-10,-11,-9,-11][i],'limpador: uma batida real por passada visivel')
ev(73.989,'pista_molhada_carro_cruza',le('pista_molhada_carro_cruza'),1.95,-4,'farois vindo na pista alagada, ouvido de dentro',corta=74.729,fi=0.4,fo=0.012)
ev(74.779,'trovao_perto_com_chuva',tv,0.375,0,'TROVAO do relampago real: estala 50 ms depois do corte; a cauda fecha e some ate o fim do P26',corta=76.874,fi=0.02,fo=0.9)
ev(76.754,'wh_couro',le('wh_couro'),0.215,-1,'whip para o geral da academia')
ev(83.696,'wh_vara_grave',le('wh_vara_grave'),0.163,-3,'mergulho na placa SALA DE POSE')
ev(90.859,'wh_vassoura_longo',le('wh_vassoura_longo'),0.21,0,'relogio varrendo 19H00 -> 21H00 (cai na cabeca do compasso)')
ev(99.387,'interruptor_luz_salao (novo)',novo('interruptor_luz_salao'),0.021,0,'a luz do conceito acende (interruptor real, 1 uso)')
x=le('chuva_fina_rua_8s'); ev(110.151,'chuva_fina_rua_8s',x,0.0,0,'chuvisco do Rota',corta=114.243,fi=0.5,fo=0.45)
ev(114.163,'wh_baqueta_seco',le('wh_baqueta_seco'),0.078,0,'whip seco para os dois com os lanches')
ev(114.923,'wh_alca',le('wh_alca'),0.202,-1,'risco do EM -> NO ROTA')
ev(123.748,'wh_corda_gira',le('wh_corda_gira'),0.332,-1,'garrafa cobrindo a lente')
out=np.zeros((N+SR*8,2),np.float32); L=[]
for ini,nome,x,g,nota,te in sorted(EV,key=lambda e:e[0]):
    k=int(round(ini*SR)); 
    if k<0: x=x[-k:]; k=0
    out[k:k+len(x)]+=x*10**(g/20)
    L.append(dict(inicio=round(ini,3),evento_t=round(te,3),fim=round(ini+len(x)/SR,3),som=nome,ganho_db=g,pico_dbfs=round(float(20*np.log10(np.abs(x).max()*10**(g/20)+1e-9)),1),nota=nota))
sf.write(A+'/sfx_raw.wav',out[:N],SR,subtype='FLOAT')
# checagens: uso unico e nenhum arquivo repetido entre transicoes (limpador = mesma acao repetida, declarada)
from collections import Counter
c=Counter(e['som'].split(' (')[0] for e in L); rep={k:v for k,v in c.items() if v>1}
uni=[k for k in c if BIB.get(k,{}).get('usar_1x') and c[k]>1]
json.dump(dict(eventos=L,repetidos=rep,uso_unico_violado=uni),open(A+'/sfx_eventos.json','w'),indent=1,ensure_ascii=False)
print(len(L),'eventos;',len(c),'sons distintos; repetidos:',rep,'; uso unico violado:',uni,'; pico',round(float(20*np.log10(np.abs(out).max())),1))
