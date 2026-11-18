# apara.py: tira os quadros a mais da CABECA dos arquivos da v1 reaproveitados, para todo arquivo comecar exatamente em F0 - cauda_in da v2
# (o Leitor do base.py supoe isso). Recodifica em crf 11 (perda de geracao desprezivel); original guardado em planos_v1_guardados/.
import sys, json, os, subprocess, shutil
M_='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M_ + '/build/video/py')
import mx
from mx import V
AN = json.load(open(V + '/py2/analise.json')); sc = V + '/py2/aparados.json'; AP = json.load(open(sc)) if os.path.exists(sc) else {}
for p in mx.planos():
    a = AN.get(p['id'], {})
    if a.get('acao') != 'reusa': continue
    K = (p['F0'] - p['nin']) - a['F'][0]
    if K <= 0 or p['id'] in AP: continue
    f = f"{V}/planos/{p['id']}.mp4"; g = f"{V}/planos_v1_guardados/{p['id']}.mp4"
    if not os.path.exists(g): shutil.copy2(f, g)
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', g, '-vf', f"select='gte(n,{K})',setpts=N/30/TB", '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '11', '-pix_fmt', 'yuv420p',
                    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-an', f + '.tmp.mp4'], check=True)
    os.replace(f + '.tmp.mp4', f); AP[p['id']] = dict(quadros_tirados_da_cabeca=K, quadros_v1=a['n1']); json.dump(AP, open(sc, 'w'), indent=1); print(p['id'], 'aparado', K)
print(AP)
