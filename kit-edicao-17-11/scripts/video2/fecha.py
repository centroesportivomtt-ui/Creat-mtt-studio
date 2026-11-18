# fecha.py: monta planos/_rel.json (v2) e planos_v2.json, conferindo cada arquivo (quadros, formato, cobertura do corpo + caudas da v2).
import sys, json, os, subprocess
M_='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M_ + '/build/video/py')
import mx
from mx import V, M, FPS, fr
E = mx.E; E1 = json.load(open(M + '/direcao/edl_v1.json'))
AN = json.load(open(V + '/py2/analise.json')); AP = json.load(open(V + '/py2/aparados.json')); R1 = json.load(open(V + '/planos/_rel_v1.json')); R = json.load(open(V + '/planos/_rel.json'))
R.update(json.load(open(V + '/planos/_rel_chuva.json'))); R['P44'] = json.load(open(V + '/planos/_rel_p44.json'))
def probe(f):
    r = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,pix_fmt,color_range,color_space,color_transfer,color_primaries,codec_name', '-of', 'json', f], capture_output=True, text=True).stdout)['streams'][0]
    return r
PL = mx.planos(); out = []; rel2 = {}; erros = []
ordem = [p for p in PL if p['id'].startswith('P')] + [p for p in PL if p['id'].startswith('I')]
for p in ordem:
    pid = p['id']; a = AN.get(pid, {}); arq = f'{V}/planos/{pid}.mp4'
    reusa = a.get('acao') == 'reusa'
    if reusa:
        info = dict(R1[pid]); kk = AP.get(pid, {}).get('quadros_tirados_da_cabeca', 0); info['F'] = [a['F'][0] + kk, a['F'][1]]; info['v2'] = False; info['aparado_cabeca'] = kk; info['reuso_v1'] = dict(deslocamento_quadros=a['off'], erro_tempo_fonte_ms=round(a['err_med_s'] * 1000, 1))
    else:
        info = dict(R[pid])
    pr = probe(arq); n = int(pr['nb_read_frames'])
    ok_fmt = (pr['width'], pr['height'], pr['r_frame_rate'], pr['pix_fmt'], pr.get('color_range'), pr.get('color_space')) == (1080, 1920, '30/1', 'yuv420p', 'tv', 'bt709')
    nin = 2 if pid == 'I04' else p['nin']; nout = p['nout']
    if pid in ('I04', 'P71'): nout = 2
    need = [p['F0'] - p['nin'], p['F1'] + p['nout']]
    F = info['F']
    if n != F[1] - F[0]: erros.append(f'{pid}: arquivo tem {n} quadros, F diz {F[1]-F[0]}')
    if not ok_fmt: erros.append(f'{pid}: formato {pr}')
    if F[0] > need[0] or F[1] < need[1]: erros.append(f'{pid}: nao cobre {need}, tem {F}')
    info['quadros'] = n; rel2[pid] = info
    item = dict(id=pid, arquivo=f'build/video/planos/{pid}.mp4', dur=round(p['t1'] - p['t0'], 3), t0=p['t0'], t1=p['t1'], quadros=n, dur_arquivo=round(n / FPS, 3),
                F=F, corpo=[p['F0'], p['F1']], cauda_in_pedida=p['nin'], cauda_out_pedida=p['nout'], cauda_in_arquivo=p['F0'] - F[0], cauda_out_arquivo=F[1] - p['F1'],
                mudou=(not reusa) or info.get('aparado_cabeca', 0) > 0, origem=(('v1 (arquivo intacto)' if not info.get('aparado_cabeca') else f"v1 com {info['aparado_cabeca']} quadro(s) tirado(s) da cabeca (recodificado crf 11; original em planos_v1_guardados)") if reusa else ('chuva tratada: ' + info['origem'] if 'origem' in info and pid != 'P44' else ('gerado' if pid == 'P44' else 'render v2'))),
                clip=p['clip'], cor=p.get('cor'))
    if reusa: item['reuso_v1'] = info['reuso_v1']
    for k in ('jit_antes', 'jit_depois', 'zoom_x', 'zextra', 'estab_auto', 'fora_px', 'emenda_antes', 'emenda_depois', 'pico_relampago', 'repetidos', 'fps_origem'):
        if k in info: item[k] = info[k]
    if pid.startswith('I'): item['sobre'] = p['sobre']
    out.append(item)
# P29: quadros do freeze (pose) em coordenada global da v2, no arquivo da v1
g1 = next(g for g in E1['graficos'] if g['modelo'] == 'freeze_espelho'); g2 = next(g for g in E['graficos'] if g['modelo'] == 'freeze_espelho')
h1 = [g for g in range(R1['P29']['F'][0], R1['P29']['F'][1]) if g1['t0'] <= g / FPS < g1['t1']]
k29 = AP.get('P29', {}).get('quadros_tirados_da_cabeca', 0); i0, i1 = h1[0] - R1['P29']['F'][0] - k29, h1[-1] - R1['P29']['F'][0] + 1 - k29
p29 = next(o for o in out if o['id'] == 'P29'); p29['congela_F'] = [p29['F'][0] + i0, p29['F'][0] + i1]; p29['congela_contrato_F'] = [min(g for g in range(9999) if g / FPS >= g2['t0']), min(g for g in range(9999) if g / FPS >= g2['t1'])]
p55 = next(o for o in out if o['id'] == 'P55'); p55['congela_F'] = [p55['corpo'][0] + 18, p55['F'][1]]; p55['nota'] = 'do quadro 18 do bruto (LED aceso, 0,600 s) em diante o quadro esta congelado, com o punch-in do contrato; a cauda de saida tambem'
next(o for o in out if o['id'] == 'P71')['nota'] = 'P71 = I02+I03+I04 em sequencia (a imagem do P71 do contrato e 100% coberta pelos inserts); use P71.mp4 OU os tres inserts, nao os dois'
next(o for o in out if o['id'] == 'I04')['nota'] = 'ultimo quadro do corpo = pico do relampago (F 2241); os 2 quadros de cauda sao o pico segurado (flash da transicao relampago_real)'
next(o for o in out if o['id'] == 'P13')['nota'] = 'rampa de entrada x4 -> 1,5x embutida (v1); a cauda de entrada do arquivo tem 5 quadros, a v2 pede 2'
next(o for o in out if o['id'] == 'P12')['nota'] = 'rampa de saida ate x4 embutida nos ultimos 0,15 s (v1)'
# cobertura da linha
L = [o for o in out if o['id'].startswith('P')]
for a, b in zip(L, L[1:]):
    if a['corpo'][1] != b['corpo'][0]: erros.append(f"buraco entre {a['id']} e {b['id']}")
if L[0]['corpo'][0] != 0 or L[-1]['corpo'][1] != mx.NT: erros.append('linha nao fecha')
json.dump(rel2, open(V + '/planos/_rel.json', 'w'), indent=0)
json.dump(dict(versao='v2', fps=FPS, w=1080, h=1920, quadros_total=mx.NT, dur=E['dur'],
               convencao='quadro k do arquivo = quadro global F[0]+k da linha final; corpo = [F0,F1) do contrato; o que sobra antes/depois e cauda para a transicao',
               codec='H.264 crf 14, yuv420p, bt709 tv, 30 fps', planos=out, erros=erros), open(V + '/planos_v2.json', 'w'), indent=1, ensure_ascii=False)
print('planos', len(out), 'mudou', sum(o['mudou'] for o in out), 'erros', erros, 'cabeca != pedida:', [o['id'] for o in out if o['cauda_in_arquivo'] != o['cauda_in_pedida']])
print('P29 congela', p29['congela_F'], 'contrato', p29['congela_contrato_F'])
for o in out: print(o['id'], o['quadros'], o['F'], o['corpo'], 'cauda', o['cauda_in_arquivo'], o['cauda_out_arquivo'], 'pede', o['cauda_in_pedida'], o['cauda_out_pedida'], 'MUDOU' if o['mudou'] else '')
