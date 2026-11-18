# r_planos.py <id,...> : renderiza planos NOVOS que o VFX precisa, com o MESMO codigo da imagem (build/video/py/render.py),
# em build/vfx/src/planos/<id>.mp4. So roda se build/video/planos/<id>.mp4 nao existir (ai o VFX usa o da imagem).
# Ajustes pedidos no contrato: P54 em estabilizacao leve (igual ao P11); P55 sem rampa de entrada e congelado em 0,600 s;
# sem cauda de transicao, exceto P58 (5 quadros de cauda para o whip vertical).
import sys, os, json, time, types
M = '/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M + '/build/video/py')
import mx
OUT = M + '/build/vfx/src'
src = open(M + '/build/video/py/render.py').read().split("if __name__ == '__main__':")[0]
src = src.replace("if p['id'] in ('P09',):", "if p['id'] in LEVE:").replace('out = f"{V}/planos/', 'out = f"{OUT}/planos/')
R = types.ModuleType('r'); R.__dict__.update(OUT=OUT, LEVE=('P09', 'P54')); exec(compile(src, 'render_vfx', 'exec'), R.__dict__)
_mapa = mx.mapa
def mapa(p, t):
    s, v = _mapa(p, t)
    c = p.get('congela')
    if c and s >= c['src_t']: return c['src_t'], 0.0
    return s, v
R.mapa = mapa
RAW = {'IMG_5169': M + '/build/cenas/brutos/IMG_5169.MOV', 'IMG_5170': M + '/build/cenas/brutos/IMG_5170.MOV'}
def bruto(clip):
    f = RAW.get(clip) or f'{M}/build/vfx/raw/{clip}.mov'
    if not os.path.exists(f): raise SystemExit('falta o bruto ' + f)
    return f
if __name__ == '__main__':
    ids = sys.argv[1].split(','); relf = OUT + '/planos/_rel.json'
    rel = json.load(open(relf)) if os.path.exists(relf) else {}
    for p in mx.planos():
        if p['id'] not in ids: continue
        out = f"{OUT}/planos/{p['id']}.mp4"
        if os.path.exists(out) and p['id'] in rel: print(p['id'], 'pronto'); continue
        p['nin'] = 0; p['nout'] = 5 if p['id'] == 'P58' else 0
        if p['id'] in ('P55', 'P56', 'P58'): p['tin'] = None; p['tout'] = None
        t = time.time(); info = {}
        R.render(p, bruto(p['clip']), info); info['seg'] = round(time.time() - t, 1); info['nout'] = p['nout']
        rel[p['id']] = info; json.dump(rel, open(relf, 'w'), indent=0); print(p['id'], info, flush=True)
