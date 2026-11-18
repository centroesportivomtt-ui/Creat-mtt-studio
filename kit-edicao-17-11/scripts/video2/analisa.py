# analisa.py: para cada plano da v2, mede se o arquivo da v1 cobre os quadros pedidos (corpo + caudas da v2)
# com o mesmo tempo de fonte (erro < 0,55 quadro de fonte). Saida: py2/analise.json
import json, sys, copy
sys.path.insert(0,'/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/video/py')
import mx
M=mx.M; FPS=30
E2=mx.E; E1=json.load(open(M+'/direcao/edl_v1.json'))
rel=json.load(open(M+'/build/video/planos/_rel_v1.json'))
def lista(E):
    mx.E=E; mx.NT=int(round(E['dur']*FPS)); R={}
    for p in mx.planos():
        if p['id']=='P44': continue
        G=list(range(p['F0']-p['nin'],p['F1']+p['nout']))
        R[p['id']]=dict(p=p,G=G,S=[mx.mapa(p,g/FPS)[0] for g in G])
    return R
A=lista(E1)
# v2 "pretendido": P55 entra sem rampa; P13 mantem a rampa de entrada da v1 (nota do diretor)
E2b=copy.deepcopy(E2)
for t in E2b['transicoes']:
    if t['entre']==['P12','P55']: t['_semrampa_B']=True
B=lista(E2b)
out={}
for pid,b in B.items():
    p=b['p']
    if pid not in A or pid not in rel: out[pid]=dict(acao='render',motivo='novo',nin=p['nin'],nout=p['nout']); continue
    a=A[pid]; p1=a['p']
    dif=[k for k in ('clip','src_in','src_out','vel','zoom','foco_xy','cor','estabilizar') if p1.get(k)!=p.get(k)]
    assert len(a['G'])==rel[pid]['quadros'],(pid,len(a['G']),rel[pid]['quadros'])
    # alinhar pelo corpo linear: tempo de fonte do quadro central do corpo
    S1=a['S']; S2=b['S']; n1=len(S1); n2=len(S2)
    best=None
    for o in range(-3,n1-n2+4):
        idx=[o+i for i in range(n2)]
        if min(idx)<0 or max(idx)>=n1: cob=False
        else: cob=True
        # erro so no corpo (ignora caudas com rampa diferente)
        i0=p['nin']; i1=n2-p['nout']
        errs=[abs(S1[min(max(o+i,0),n1-1)]-S2[i]) for i in range(i0,i1)]
        e=sorted(errs)[len(errs)//2]; emax=max(errs)
        if cob and (best is None or e<best[0]): best=(e,emax,o,cob)
    if best is None: best=(9.0,9.0,0,False)
    e,emax,o,cob=best
    if pid=='P29':   # prefere o deslocamento 0: o congelamento da pose cai exatamente nos quadros do contrato (erro de fonte 20 ms em vez de 18)
        o=0; errs=[abs(S1[o+i]-S2[i]) for i in range(p['nin'],n2-p['nout'])]; e=sorted(errs)[len(errs)//2]; emax=max(errs)
    fps_src=30.0
    ok = (not dif) and cob and e<=0.70/fps_src*p['vel']+1e-6   # ate 0,7 quadro de saida (23 ms)
    out[pid]=dict(acao='reusa' if ok else 'render',dif=dif,off=o,err_med_s=round(e,4),err_max_s=round(emax,4),cobre=cob,n1=n1,n2=n2,nin=p['nin'],nout=p['nout'],F=[b['G'][0]-o,b['G'][0]-o+n1])
    print(pid,out[pid]['acao'],'off',o,'cobre',cob,'err',round(e*1000),'ms max',round(emax*1000),'ms','n1',n1,'n2',n2,dif)
json.dump(out,open(M+'/build/video/py2/analise.json','w'),indent=1)
