# Gera kit/cenas/dia2.json a partir do contrato v2 (direcao/edl.json) + mapa de rostos (build/motion2/rostos.json).
# Fonte única do overlay da rodada 2: rodar de novo regera a cena. Tempos vêm todos do contrato; desvios ficam em MUDANCAS.md.
import json, re, unicodedata, os
from PIL import Image
M = '/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
E = json.load(open(M + '/direcao/edl.json'))
ROS = json.load(open(M + '/build/motion2/rostos.json'))
DUR = E['dur']; W, H = 1080, 1920
PL = {p['id']: p for p in E['planos']}
G = E['graficos']; SEL = {s['id']: s for s in E['selos']}
MAR = M + '/build/marcas'; A2 = M + '/kit/assets/marca2'; os.makedirs(A2, exist_ok=True)
ABS = lambda p: '/@abs' + p
def norm(w): return re.sub(r'[^A-Z0-9.]', '', unicodedata.normalize('NFD', w.upper()).encode('ascii', 'ignore').decode())
def r3(x): return round(x, 3)

# ------------------------------------------------------------------ marcas reduzidas (Lanczos, 2x o tamanho de tela; nunca ampliadas)
def reduz(src, nome, larg):
    out = f'{A2}/{nome}'
    if not os.path.exists(out):
        im = Image.open(f'{MAR}/{src}'); assert im.size[0] >= larg, (src, im.size, larg)
        im.resize((larg, round(im.size[1] * larg / im.size[0])), Image.LANCZOS).save(out)
    return ABS(out)
CREAT_G = reduz('creatmtt_logo_oficial_alfa.png', 'creat_1400.png', 1400)   # fecho a 700 px
CREAT_M = reduz('creatmtt_logo_oficial_alfa.png', 'creat_720.png', 720)     # hub do mapa
CREAT_P = reduz('creatmtt_logo_oficial_alfa.png', 'creat_460.png', 460)     # hub do cartão (230 px)
CREAT_X = reduz('creatmtt_logo_oficial_alfa.png', 'creat_300.png', 300)     # rec mini (150 px)
PROD = reduz('creat_studio_producao_alfa.png', 'producao_1080.png', 1080)   # abertura a 540 px
BAST = reduz('creat_bastidores_alfa.png', 'bastidores_780.png', 780)        # claquete a 390 px
DRK_H = reduz('drako_dragao_nome_horizontal.png', 'drako_h_1280.png', 1280) # placa a 640 px, recolhido a 420 px
DRK_I = reduz('drako_dragao.png', 'drako_icone_320.png', 320)
MARCAS = dict(creat=CREAT_P, creatG=CREAT_G, ct=ABS(MAR + '/ctmtt_logo.svg'), ctDivisa=[351, 374.5], sk=ABS(MAR + '/superkal_logo.svg'), drako=DRK_I)

# ------------------------------------------------------------------ vetores em peças (S02 e S03)
def subcaminhos(d): return re.findall(r'M[^M]*', d)
def bb(d):
    n = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]; xs, ys = n[0::2], n[1::2]
    return [min(xs), min(ys), max(xs), max(ys)]
svg = open(MAR + '/ctmtt_logo.svg').read()
ct_d, mtt_d = [m.group(1) for m in re.finditer(r' d="([^"]*)"', svg)]
svg = open(MAR + '/superkal_logo.svg').read()
am, br = [m for m in re.finditer(r'<path fill="(#[0-9a-f]+)" fill-rule="evenodd" d="([^"]*)"', svg)]
ya, wa = subcaminhos(am.group(2)), subcaminhos(br.group(2))
assert len(ya) == 9 and len(wa) == 4
AM, BR = am.group(1), br.group(1)
PECAS = [dict(g='arco', fill=AM, d=ya[8], bb=bb(ya[8]))]
for idx in ([2], [3], [1, 6], [4, 7], [5]):          # s u p e r (com os miolos)
    PECAS.append(dict(g='super', fill=AM, d=''.join(ya[i] for i in idx), bb=bb(ya[idx[0]])))
for idx in ([0], [1, 3], [2]):                       # k a l
    PECAS.append(dict(g='kal', fill=BR, d=''.join(wa[i] for i in idx), bb=bb(wa[idx[0]])))
gfill = re.search(r'<g fill="(#[0-9a-f]+)"', svg).group(1)
for m in re.finditer(r'<path transform="(translate\(([\d.]+) ([\d.]+)\)[^"]*)" d="([^"]*)"', svg):   # G R U P O
    x, y = float(m.group(2)), float(m.group(3))
    PECAS.append(dict(g='grupo', fill=gfill, transform=m.group(1), d=m.group(4), bb=[x - 20, y - 20, x + 20, y + 20]))
assert sum(1 for p in PECAS if p['g'] == 'grupo') == 5
PECAS.append(dict(g='faixa', fill=AM, d=ya[0], bb=bb(ya[0])))

# ------------------------------------------------------------------ rostos
def rostos(t0, t1):
    out = []
    for a in ROS:
        if t0 - 0.01 <= a['t'] <= t1 + 0.01:
            for x, y, w, h in a['rostos']:
                if w >= 80: out.append((x, y, w, h))
    return out
def cobre(t0, t1, ya_, yb, xa=60, xb=960):
    n = 0
    for x, y, w, h in rostos(t0, t1):
        cx0, cx1, cy0, cy1 = x + 0.15 * w, x + 0.85 * w, y + 0.2 * h, y + 0.95 * h
        if min(cx1, xb) - max(cx0, xa) > 20 and min(cy1, yb) - max(cy0, ya_) > 20: n += 1
    return n

cam = []
def L(**k): cam.append(k)
def gr(modelo, n=0): return [g for g in G if g['modelo'] == modelo][n]
PAL = [(w['p'], w['i'], w['f'], l['plano']) for l in E['legendas'] for w in l['palavras']]
def tw(pal, depois=0.0):
    for p, i, f, _ in PAL:
        if i >= depois - 1e-3 and norm(p).strip('.,!?') == norm(pal): return i
    raise SystemExit('palavra não achada: ' + pal)

# ================================================================== 1. vinheta do mapa (fica por baixo de tudo)
v = [g for g in G if g['modelo'] == 'mapa_rota' and g['props'].get('forma') == 'tela_cheia'][0]
L(id='mapaVinheta', modelo='mapa_rota', de=r3(v['t0']), ate=r3(v['t1']), props=dict(forma='vinheta', marcas=MARCAS, deMarca='ct', deRotulo='A BASE', paraMarca='sk', paraRotulo='1ª OPERAÇÃO', cidade='RIACHÃO DO JACUÍPE', A=[240, 1235], B=[770, 960], yCidade=1400))   # abaixo da legenda do P09 (y 0.40), que continua por cima

# ================================================================== 2. abertura
s = SEL['S01']
L(id='selo01', modelo='selo2', de=0.0, ate=r3(s['t1']), props=dict(tipo='abertura', src=PROD, caixa=s['caixa'], sai=1.03))
g = gr('gancho2', 0)
L(id='gancho', modelo='gancho2', de=0.0, ate=r3(g['t1']), props=dict(y=0.289, largura=0.74, maximo=230, a=dict(linhas=g['props']['a']['linhas'], sai=g['props']['a']['sai'], saiDur=0.2)))

# ================================================================== 3. selos de lugar e de marca
s = SEL['S02']
L(id='selo02', modelo='selo2', de=r3(s['t0']), ate=r3(s['t1']), props=dict(tipo='lugar_ct', caixa=s['caixa'], sobrelinha='RIACHÃO DO JACUÍPE', etiqueta='A BASE', larguraLogo=s['largura_px'], vb=[757, 145],
  ct=dict(d=ct_d), mtt=dict(d=mtt_d), divisa=MARCAS['ctDivisa'], recolhe=[60, 300]))
s = SEL['S03']; x0, y0, x1, y1 = s['caixa']
S03_VIAJA = dict(de=29.60, ate=29.90); S03_ATE = 30.1          # a plaquinha da V02 termina de acender no g 903 (medido): a logo do motion fica por cima até o g 902
L(id='selo03', modelo='selo2', de=r3(s['t0']), ate=S03_ATE, props=dict(tipo='marca_sk', caixa=[x0, y0, x1, y1], vb=[1206, 1588], pecas=PECAS, viaja=S03_VIAJA, final=[805, 1302, 932, 1469], controle=[300, 1520]))
s = SEL['S04']
L(id='selo04', modelo='selo2', de=r3(s['t0']), ate=r3(PL['P27']['t1']), props=dict(tipo='valente', caixa=s['caixa'], recolhida=s['caixa_recolhida'], src=DRK_H, larguraLogo=s['largura_px'], larguraRecolhida=s['largura_recolhida_px'], sinc=s['sincronia'], topo=[60, 300]))
s = SEL['S05']
T_P32 = PL['P32']['t0']
L(id='selo05', modelo='selo2', de=r3(s['t0']), ate=r3(s['t1']), props=dict(tipo='titulo_cinema', caixa=[90, 700, 930, 1120], cx=510, linhas=s['texto'], dur=r3(T_P32 - s['t0']), topo=[60, 392]))
s = SEL['S06']
L(id='selo06', modelo='selo2', de=r3(s['t0']), ate=r3(s['t1']), props=dict(tipo='bastidores', caixa=s['caixa'], src=BAST, bate=r3(tw('bastidores', 119.0) + 0.12)))

# ================================================================== 4. mapas, agenda, modos, chips, rótulos
m = [g for g in G if g['modelo'] == 'mapa_rota' and g['props'].get('forma') == 'cartao'][0]
ac = {a['no']: a['t'] for a in m['props']['acende']}
NOS = [dict(id='ct', marca='ct', rotulo='A BASE', x=96), dict(id='sk', marca='sk', rotulo='1ª OPERAÇÃO', x=262), dict(id='igreja', texto='IGREJA|MATRIZ', icone='sparkles', rotulo='ESPECIAL', x=428),
       dict(id='valente', marca='drako', texto='ELITE DRAKO', rotulo='2ª OPERAÇÃO', x=620), dict(id='seleto', texto='SELETO', rotulo='DEPOIS', x=800)]
for i, n in enumerate(NOS): n.update(t=r3(ac[n['id']]), i=i)
L(id='mapaAgenda', modelo='mapa_rota', de=r3(m['t0']), ate=r3(m['t1']), props=dict(forma='cartao', caixa=m['props']['caixa'], titulo=m['props']['titulo'], hub=dict(largura_px=m['props']['hub']['largura_px']), marcas=MARCAS, nos=NOS,
  cidades=[dict(nome='RIACHÃO DO JACUÍPE', x0=20, x1=504, t=r3(m['t0'] + 0.3)), dict(nome='VALENTE', x0=544, x1=696, t=r3(m['props']['estrada']['desenha_em']))], estrada=dict(x=[508, 540], t=r3(m['props']['estrada']['desenha_em']))))
f = [g for g in G if g['modelo'] == 'mapa_rota' and g['props'].get('forma') == 'faixa'][0]
L(id='mapaEstrada', modelo='mapa_rota', de=r3(f['t0']), ate=r3(f['t1']), props=dict(forma='faixa', caixa=f['props']['caixa'], de=f['props']['de_cidade'], para=f['props']['para_cidade'], rotulo=f['props']['rotulo']))
a = gr('agenda')
ETQ = {'feito': None, 'remarcada': 'REMARCADA', 'agora': 'AGORA', 'fila': 'NA FILA'}
L(id='agenda', modelo='agenda', de=r3(a['t0']), ate=r3(a['t1']), props=dict(caixa=a['props']['caixa'], titulo=a['props']['titulo'], relogio=a['props']['relogio'],
  linhas=[dict({k: v for k, v in ln.items() if k != 'id'}, etiqueta=ln.get('etiqueta') or ETQ[ln['estado']]) for ln in a['props']['linhas']]))
for i, g in enumerate([g for g in G if g['modelo'] == 'hud_chip']):
    L(id=f'modo{i}', modelo='hud_chip', de=r3(g['t0']), ate=r3(g['t1']), props=dict(g['props']))
chips = [g for g in G if g['modelo'] == 'chip']
def chip_no_ar(t0, t1): return any(c['t0'] < t1 and t0 < c['t1'] for c in chips)
for i, g in enumerate(chips):
    pr = dict(g['props']); pr['cargoCru'] = pr.get('cargo') == 'creat.MTT'
    if pr.get('y') == 404: pr.update(y=412, aba=False)   # o contrato dava 404 com aba: encostava 3 px no relógio (base em 372) e o canto direito entrava no cabelo do depoente; sem o selo 'c.' a placa termina em x~430, antes da cabeça
    if g['t1'] - g['t0'] < 1.0: pr['rapido'] = True
    L(id=f'chip{i}', modelo='chip', de=r3(g['t0']), ate=r3(g['t1']), props=pr)
for i, g in enumerate([g for g in G if g['modelo'] == 'rotulo']):
    L(id=f'rot{i:02d}', modelo='rotulo', de=r3(g['t0']), ate=r3(g['t1']), props=dict(g['props'], x=60, tam=44, subTam=22))
ck = gr('checklist')
L(id='check', modelo='checklist', de=r3(ck['t0']), ate=r3(ck['t1']), props=dict(x=60, y=404, w=420, titulo=ck['props']['titulo'], sub=ck['props']['sub'], itens=ck['props']['itens']))

# ================================================================== 5. títulos cinéticos (nunca sobre rosto, nunca na faixa do topo: topo >= 388)
TOPO_MIN = 388
def titulo(id, g, linhas, tempos, alt_est, cands=(0.30, 0.34, 0.38, 0.42, 0.46), maximo=190, largura=0.80, extra=None, ate=None):
    t0, t1 = g['t0'], ate or g['t1']
    cands = [y for y in cands if y * H - alt_est / 2 >= TOPO_MIN] or [round((TOPO_MIN + alt_est / 2) / H + 0.005, 3)]
    melhor = min(cands, key=lambda y: (cobre(t0, t1, y * H - alt_est / 2, y * H + alt_est / 2), cands.index(y)))
    pr = dict(linhas=linhas, modo='entrada', y=melhor, largura=largura, maximo=maximo, cantos=True)
    if tempos: pr['tempos'] = [r3(x) for x in tempos]
    if extra: pr.update(extra)
    L(id=id, modelo='gancho', de=r3(t0), ate=r3(t1), props=pr)
    return melhor, cobre(t0, t1, melhor * H - alt_est / 2, melhor * H + alt_est / 2)
gs = [g for g in G if g['modelo'] == 'gancho']
ys = {}
ys['pcr'] = titulo('tPensado', gs[0], ['*PENSADO.*', 'CRIADO.', 'RESULTADO.'], [tw('pensado', 38), tw('criado', 39), tw('resultado', 40)], 500, maximo=165)
ys['emrota'] = titulo('tEmRota', gs[1], ['EM *ROTA*.'], [gs[1]['t0'], gs[1]['t0'] + 0.07], 210, cands=(0.64,), maximo=200)   # no lugar da legenda (que para no 'em'): em cima o rosto do Marcos ocupa o quadro
ys['diluvio'] = titulo('tDiluvio', gs[2], ['*DILÚVIO*.'], [tw('dilúvio', 75)], 200, cands=(0.262,), maximo=190)   # acima da placa PISO MOLHADO (ela é a imagem)
# o contrato abria o título em 'modo' (80,911), mas o rosto do Marcos enche o quadro até 82,0 s (rostos.json): o título espera o rosto sair (82,15)
# e as duas últimas palavras continuam batendo na fala ('em' 82,547; 'rota' 83,274). Até lá a legenda segue ('aqui no modo', 'operação').
tm = 82.15
ys['modo'] = titulo('tModo', dict(gs[3], t0=tm), ['● MODO', '*OPERAÇÃO*', 'EM ROTA.'], [tm, tm + 0.04, tm + 0.12, tw('em', 82), tw('rota', 82)], 380, cands=(0.58,), maximo=130)
ys['maximo'] = titulo('tMaximo', gs[4], ['O *MÁXIMO*.'], [gs[4]['t0'], gs[4]['t0'] + 0.07], 210, maximo=200)
kin = [l for l in E['legendas'] if l['estilo'] == 'kinetic']
k16 = [l for l in kin if l['plano'] == 'P16'][0]; k35 = [l for l in kin if l['plano'] == 'P35'][0]
L(id='tNaoCresce', modelo='gancho', de=r3(k16['t0'] - 0.03), ate=r3(PL['P16']['t1']), props=dict(linhas=['ELA *NÃO*', 'CRESCE.'], modo='entrada', y=0.685, largura=0.78, maximo=150, cantos=True, tempos=[r3(w['i']) for w in k16['palavras']]))
L(id='tComunica', modelo='gancho', de=r3(k35['t0'] - 0.03), ate=r3(PL['P35']['t1']), props=dict(linhas=['ISSO É', '*COMUNICAÇÃO!*'], modo='entrada', y=0.68, largura=0.80, maximo=170, cantos=True, tempos=[r3(w['i']) for w in k35['palavras']]))
g2 = [g for g in G if g['modelo'] == 'gancho2'][1]
t_no = tw('no', 114.5)
L(id='tNoRota', modelo='gancho', de=r3(g2['t0']), ate=r3(g2['t1']), props=dict(linhas=['EM ROTA.'], sobrelinha='// o dia todo', modo='entrada', y=0.269, largura=0.80, maximo=230, cantos=True,
  tempos=[r3(g2['t0']), r3(g2['t0'] + 0.08)], troca=dict(de='EM', para='NO', em=r3(max(0.45, t_no - g2['t0'] - 0.1)), dur=0.3, ponto=False)))

# ================================================================== 6. legendas palavra a palavra
# desvios pedidos pelo contrato (campo 'legenda' dos selos, gráficos e placas VFX): (plano, de, ate) -> props
INF = 1e9
DESV = [
 ('P02', 0, SEL['S02']['t1'], dict(y=0.70)),                                         # selo CT MTT na faixa da legenda
 ('P03', 0, INF, dict(y=0.70)),                                                      # réplica do monitor (V01)
 ('P10', 0, INF, dict(cx=672, largura=0.50, por=2, tamanho=84)),                     # logo Super Kal à esquerda
 ('P54', 0, 29.825, dict(cx=696, largura=0.46, por=2, tamanho=72)),                 # 72 px e 24 px mais à direita: 'LOGOMARCA,' (palavra-chave, 1,22x) não encosta na logo que se monta nem na logo viajando
 ('P54', 29.825, INF, dict(cx=330, largura=0.48, por=2, y=0.64)),                    # Kal 1 no canto de baixo à direita (V02)
 ('P11', 0, INF, dict(y=0.66)),                                                      # cartão das TVs (V03)
 ('P09', 0, INF, dict(cx=380, largura=0.56, y=0.40)),                                # selfie andando: Ruan embaixo à esquerda, Marcos à direita; a legenda sobe para o céu à esquerda
 ('P14', 0, INF, dict(cx=420, largura=0.60, y=0.475, tamanho=84)),                   # açougue cheio de gente e a câmera desce: a legenda fica na parede, entre o painel e os rostos
 ('P15', 0, 53.1, dict(cx=420, largura=0.60, y=0.475, tamanho=84)),
 ('P15', 53.1, INF, dict(cx=330, largura=0.49, por=2, y=0.66, tamanho=66)),                      # Kal 2 (V06)
 ('P16', 0, INF, dict(y=0.70)),                                                      # depoimento em close: abaixo do queixo
 ('P50', 0, 22.2, dict(y=0.553, tamanho=76)),
 ('P50', 22.2, INF, dict(cx=230, largura=0.30, y=0.53, tamanho=76)),            # correcao 1: 'DEPOIS SELETO.' caia na barba do Marcos -> coluna da esquerda (x 68 a 392), 2 linhas, acima da agenda
                                                      # mapa-cartão embaixo
 ('P51', 0, INF, dict(y=0.574)), ('P20', 0, INF, dict(y=0.56)),                       # agenda embaixo
 ('P26', 0, INF, dict(y=0.72)),                                                      # abaixo da placa CUIDADO PISO MOLHADO
 ('P27', 0, INF, dict(y=0.652, tamanho=76)),                                         # correcao 1: 40 px abaixo (encostava na ponta da barba), 76 px para nao tocar a faixa VALENTE (y 1305)
 # correcao 1: P28 = close de perfil que enche o quadro. A legenda vai para a coluna da direita (x 669 a 961, prateleira desfocada), 2 linhas,
 # e NAO fica na tela de 80,90 a 81,52 (o perfil passa pela coluna): 'modo' entra adiantado na pagina 'AQUI NO MODO'; 'OPERAÇÃO' volta quando o rosto sai.
 ('P28', 0, 80.56, dict(cx=815, largura=0.27, y=0.66, tamanho=66)),
 ('P28', 80.56, 81.49, dict(cx=815, largura=0.27, y=0.66, tamanho=66, _ate=80.95, _adianta={'NO': 80.60, 'MODO': 80.66})),
 ('P28', 81.49, INF, dict(cx=815, largura=0.27, y=0.66, tamanho=66, _de=81.55)),
 ('P71', 0, INF, dict(y=0.72)),                                                      # correcao 1: perfil do Ruan agora no meio do quadro: a legenda fica abaixo do queixo (e segue igual na pista)

 ('P61', 0, INF, dict(y=0.72, tamanho=72)), ('P62', 0, INF, dict(y=0.72, tamanho=72)), ('P63', 0, INF, dict(y=0.72, tamanho=72)),
]
# palavras que viram título/selo (a legenda para antes)
CORTA = {'P28': tm, 'P21': gs[1]['t0'], 'P26': tw('dilúvio', 75)}
def desvio(pid, t):
    for p, a, b, d in DESV:
        if p == pid and a - 1e-3 <= t < b - 1e-3: return d
    return {}
leg = [l for l in E['legendas'] if l['estilo'] in ('fala', 'narracao', 'cliente')]
# segmentos: (plano, desvio) contíguos
segs = []
for l in leg:
    d = desvio(l['plano'], l['t0'])
    chave = (l['plano'], json.dumps(d, sort_keys=True), l['estilo'])
    if not segs or segs[-1][0] != chave: segs.append((chave, d, []))
    segs[-1][2].append(l)
info_leg = []
for n, (chave, d, ls) in enumerate(segs):
    pid, _, estilo = chave
    pal = []
    for l in ls:
        dest = {norm(x) for x in l['destaque']}
        if 'SUPER' in dest: dest.add('KAL')
        por = d.get('por')
        for k2, w in enumerate(l['palavras']):
            txt = w['p']; nn = norm(txt).strip('.,!?')
            if nn == 'CREAT.MTT': txt = '~' + txt
            if nn in dest:
                mm = re.match(r'^(~?)(.*?)([.,!?]*)$', txt)
                corpo, pont = mm.group(1) + mm.group(2), mm.group(3)
                txt = '*' + corpo + ('*' + pont if pont != '.' else '.*') if pont else '*' + corpo + '*'
            pal.append(dict(p=txt, i=r3(w['i']), f=r3(w['f']), quebra=(k2 == 0 or (por and k2 % por == 0))))
    if pid in CORTA: pal = [w for w in pal if w['i'] < CORTA[pid] - 1e-3]
    for w in pal:
        nn = norm(w['p']).strip('.,!?*')
        if nn in d.get('_adianta', {}): w['i'] = d['_adianta'][nn]
        if d.get('_de'): w['i'] = max(w['i'], d['_de'])
    if not pal: continue
    de = r3(pal[0]['i'] - 0.04)
    prox = segs[n + 1][2][0]['t0'] if n + 1 < len(segs) else DUR
    fim_pl = PL[pid]['t1']
    ate = r3(max(ls[-1]['t1'] + 0.05, min(ls[-1]['t1'] + 0.45, prox - 0.03, fim_pl + 0.02)))
    ate = min(ate, r3(prox - 0.03))
    if pid in CORTA: ate = r3(min(CORTA[pid], prox - 0.03) if (n + 1 < len(segs) and segs[n + 1][0][0] == pid) else CORTA[pid])   # correcao 1: plano com mais de um segmento
    if pid == 'P27': ate = r3(min(ate, SEL['S04']['legenda']['so_ate']))
    if d.get('_ate'): ate = r3(min(ate, d['_ate']))
    if pid == 'P16': ate = r3(min(ate, k16['t0'] - 0.09))      # correcao 1: a legenda sai antes de o titulo 'ELA NAO CRESCE.' entrar (lia-se 'ELATODA EMPRESA')
    if pid == 'P02' and d: ate = r3(min(ate, SEL['S02']['t1']))
    tam = d.get('tamanho', 90)
    y = d.get('y')
    if y is None:
        y = 0.622
        ya_, yb = 1100, 1290
        if cobre(de, ate, ya_, yb) >= 2 and not chip_no_ar(de, ate) and cobre(de, ate, 1250, 1440) < cobre(de, ate, ya_, yb): y = 0.70
    pr = dict(palavras=pal, y=y, tamanho=tam, largura=d.get('largura', 0.80), cx=d.get('cx', 510), porPagina=12)
    if estilo != 'fala': pr['estilo'] = estilo
    alt = tam * (2 if pr['largura'] > 0.6 else 3)
    info_leg.append((pid, de, ate, y, cobre(de, ate, y * H - alt / 2, y * H + alt / 2, pr['cx'] - pr['largura'] * W / 2, pr['cx'] + pr['largura'] * W / 2)))
    L(id=f'leg{pid}_{n:02d}', modelo='legenda', de=de, ate=ate, props=pr)

# ================================================================== 7. linha do tempo + REC mini (por cima)
lt = gr('linha_tempo')
# rosto em close enchendo o quadro: a faixa do topo (y 300 a 372) cairia em cima de testa/olhos (medido em rostos.json e olhado a 100%). O HUD cede nessas janelas.
T_V09_FIM = json.load(open(M + '/build/vfx/vfx.json'))['V09']['g1'] / 30
CEDE_REL = [[PL['P27']['t0'], 79.4], [T_V09_FIM, PL['P36']['t0']], [PL['P38']['t0'], 112.42]]
CEDE_REC = [[PL['P63']['t0'], 102.3], [PL['P35']['t0'], PL['P36']['t0']], [PL['P38']['t0'], 112.42]]
PARADA = {'CT MTT · RIACHÃO DO JACUÍPE': 0, 'SUPER KAL': 1, 'ESTRADA': 2, 'VALENTE · ELITE DRAKO GYM': 3, 'BRABUS LOUNGE': 4, 'ROTA': 5}
T_HUD = 1.6   # o contrato dava 1,5; o gancho da abertura só termina de sair em 1,6
L(id='linhaTempo', modelo='linha_tempo', de=T_HUD, ate=r3(lt['t1']), props=dict(x=lt['props']['x'], y=lt['props']['y'], largura=560, opacidade=1,
  relogio=[dict(t=r3(r['t']), tela=r['tela'], nome=r['nome']) for r in lt['props']['relogio']], saltos=[dict(t0=r3(s_['t0']), t1=r3(s_['t1']), de=s_['de'], ate=s_['ate']) for s_ in lt['props']['saltos']],
  paradas=lt['props']['paradas'], paradaDe=PARADA, tardeDe='16H40', cede=CEDE_REL))
s = SEL['S08']
CEDE = [[SEL[k]['t0'], SEL[k]['t1']] for k in ('S02', 'S04', 'S05', 'S06')]
L(id='recMini', modelo='selo2', de=T_HUD, ate=r3(s['t1']), props=dict(tipo='rec_mini', caixa=s['caixa'], src=CREAT_X, larguraLogo=150, opacidade=0.92, cede=[[r3(a_), r3(b_)] for a_, b_ in CEDE + CEDE_REC]))

# ================================================================== 8. mapa do ecossistema + fecho
mf = [g for g in G if g['modelo'] == 'mapa_rota' and g['props'].get('forma') == 'tela_cheia'][1]
fe = gr('fecho2')
POS = dict(ct=(190, 566), sk=(510, 566), valente=(830, 566), brabus=(230, 1126), rota=(790, 1126), igreja=(370, 1356), seleto=(650, 1356))
NF = []
for n in mf['props']['nos']:
    x, y = POS[n['id']]
    d = dict(id=n['id'], x=x, y=y, t=r3(n['t']), estado=n['estado'], estilo=n.get('estilo'))
    if n['id'] == 'ct': d['marca'] = 'ct'
    elif n['id'] == 'sk': d['marca'] = 'sk'
    elif n['id'] == 'valente': d.update(marca='drako', texto='ELITE DRAKO')
    else: d['texto'] = n['texto'].replace('IGREJA MATRIZ', 'IGREJA|MATRIZ').replace('BRABUS LOUNGE', 'BRABUS|LOUNGE')
    NF.append(d)
L(id='mapaFinal', modelo='mapa_rota', de=r3(mf['t0']), ate=r3(DUR), props=dict(forma='final', titulo=mf['props']['titulo'], hub=dict(largura_px=mf['props']['hub']['largura_px']), marcas=dict(MARCAS, creat=CREAT_P), nos=NF,
  colapsa_em=r3(mf['props']['colapsa_em']), cx=510, cy=848, larguraLogo=fe['props']['larguraLogo'], cta=fe['props']['cta'], arroba=fe['props']['arroba'], apoio=fe['props']['apoio'], pousa=0.42, ctaMin=1.25))

comp = dict(nome='creatMTT-UmDiaNaMaxima-v2', formato=dict(w=W, h=H, fps=30), duracao=DUR, cor='#0B0B0C', camadas=cam)
json.dump(comp, open(M + '/kit/cenas/dia2.json', 'w'), ensure_ascii=False, indent=1)
print('camadas', len(cam), 'títulos (y, rostos cobertos)', ys)
for x in info_leg:
    if x[3] != 0.622 or x[4]: print('legenda', x)
