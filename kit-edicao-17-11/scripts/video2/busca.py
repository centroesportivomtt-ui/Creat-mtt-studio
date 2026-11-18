# busca.py: baixa do Drive SO os trechos necessarios de um bruto, num arquivo esparso (buracos nao ocupam disco).
# uso: busca.py CLIP "a-b,c-d"  (segundos do bruto).  Idempotente (sidecar .faixas.json).
import os, sys, json, struct, subprocess
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'; V=M+'/build/video'
L={l.split('\t')[1]:(l.split('\t')[0],int(l.split('\t')[2])) for l in open(M+'/tools/lista.tsv').read().split('\n') if l.strip()}
def url(i): return f'https://drive.usercontent.google.com/download?id={i}&export=download&confirm=t'
def faixa(fid,a,b,fh):
    """baixa bytes a..b (inclusive) e grava na posicao a"""
    for tent in range(4):
        p=subprocess.Popen(['curl','-sS','-L','--retry','3','-r',f'{a}-{b}',url(fid)],stdout=subprocess.PIPE)
        fh.seek(a); n=0
        while True:
            buf=p.stdout.read(1<<20)
            if not buf: break
            fh.write(buf); n+=len(buf)
        p.wait()
        if n==b-a+1: return
        print('faixa incompleta',a,b,n,'tentando de novo',flush=True)
    raise SystemExit('falha na faixa')
def une(R):
    R=sorted(R); o=[]
    for a,b in R:
        if o and a<=o[-1][1]+1: o[-1][1]=max(o[-1][1],b)
        else: o.append([a,b])
    return o
def falta(tem,a,b):
    out=[]; x=a
    for c,d in une(tem):
        if d<x: continue
        if c>b: break
        if c>x: out.append([x,c-1])
        x=max(x,d+1)
    if x<=b: out.append([x,b])
    return out
def busca(clip,trechos,margem=1.5):
    fid,tam=L[clip]; f=f'{V}/raw/{clip}.mov'; sc=f+'.faixas.json'
    tem=json.load(open(sc)) if os.path.exists(sc) and os.path.exists(f) else []
    if not os.path.exists(f):
        with open(f,'wb') as fh: fh.truncate(tam)
    fh=open(f,'r+b')
    def pega(a,b):
        nonlocal tem
        a=max(0,a); b=min(tam-1,b)
        for x,y in falta(tem,a,b): faixa(fid,x,y,fh); tem=une(tem+[[x,y]]); fh.flush(); json.dump(tem,open(sc,'w'))
    # cabecalho + moov
    pega(0,(1<<20)-1)
    fh.seek(0); head=fh.read(1<<20); off=0; moov=None
    while off+16<=tam:
        if off+16>len(head):
            fh.seek(off); hb=fh.read(16)
            if not any(c<=off and off+15<=d for c,d in tem): pega(off,off+15); fh.seek(off); hb=fh.read(16)
        else: hb=head[off:off+16]
        sz,tp=struct.unpack('>I4s',hb[:8])
        if sz==1: sz=struct.unpack('>Q',hb[8:16])[0]
        if sz==0: sz=tam-off
        if tp==b'moov': moov=(off,sz)
        if tp not in (b'ftyp',b'wide',b'mdat',b'moov',b'free',b'skip',b'uuid',b'meta'): print('atomo estranho',tp,off); break
        if tp!=b'mdat': pega(off,off+sz-1)
        off+=sz
    assert moov, 'moov nao achado'
    # pacotes dos trechos -> faixas de bytes
    iv=','.join(f'{max(0,a-margem):.3f}%{b+margem:.3f}' for a,b in trechos)
    r=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-read_intervals',iv,'-show_entries','packet=pts_time,pos,size','-of','csv=p=0',f],capture_output=True,text=True).stdout
    P=[l.split(',') for l in r.split('\n') if l.strip()]; P=[(float(a),int(b),int(c)) for a,c,b in [(x[0],x[1],x[2]) for x in P]] if False else [(float(x[0]),int(x[2]),int(x[1])) for x in P]
    tot=0
    for a,b in trechos:
        Q=[(pos,sz) for t,pos,sz in P if a-margem-3<=t<=b+margem+0.2]
        # o ffprobe ja comeca no quadro-chave anterior a (a-margem)
        lo=min(p for p,s in Q)-(1<<16); hi=max(p+s for p,s in Q)+(1<<16)
        for x,y in falta(tem,max(0,lo),min(tam-1,hi)): tot+=y-x+1
        pega(lo,hi)
    fh.close(); print(clip,'trechos',trechos,'baixado agora',round(tot/1e6,1),'MB; no disco',round(sum(d-c+1 for c,d in tem)/1e6,1),'MB de',round(tam/1e6,1)); return f
if __name__=='__main__':
    busca(sys.argv[1],[tuple(float(x) for x in s.split('-')) for s in sys.argv[2].split(',')])
