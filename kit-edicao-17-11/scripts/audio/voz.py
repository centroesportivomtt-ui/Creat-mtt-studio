# VOZ v2: mesma cadeia da v1 (DeepFilterNet3 85/15, passa-alta, presenca, de-esser, compressor leve, -18 LUFS por trecho,
# atempo com pitch preservado, crossfade de 30 ms adaptativo). Novidade: planos contiguos na fonte (mesmo clipe, mesma
# velocidade, src_out == src_in) sao processados como UM trecho so (P54+P11, P71+P26): um folego, sem fade no meio.
import json, os, subprocess, glob, numpy as np, soundfile as sf, pyloudnorm as pyln
A='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/audio2'; M=A+'/../..'
E=json.load(open(M+'/direcao/edl.json')); SR=48000; DUR=E['dur']; N=int(round(DUR*SR))
WIN={}
for f in glob.glob(A+'/df/*_o.wav'):
    c,a,b=os.path.basename(f)[:-6].rsplit('_',2); WIN.setdefault(c,[]).append((float(a),float(b),f[:-6]))
def janela(clip,s0,s1):
    for a,b,base in sorted(WIN[clip]):
        if a<=s0+1e-6 and b>=s1-1e-6: return a,base
    raise SystemExit(f'sem janela {clip} {s0}-{s1}')
MX={'v_210219':0.90}
# nivelador so onde a fala cai dentro do plano: P63, de 843,98 s em diante o homem vira o rosto (-20 dB). Usa o DeepFilterNet com
# limite de 14 dB (df_p63.py) e sobe ate +12 dB para chegar em -19 dB RMS (6 dB abaixo do comeco da frase: a dinamica continua natural)
RIDER={'P63':dict(desde=843.98,suf='_d14',alvo=-19.0,maxdb=12.0)}
HAND=0.06; XF=0.030
meter=pyln.Meter(SR)
voz=np.zeros(N+SR,np.float32); info=[]; CORTE=[]
planos=[p for p in E['planos'] if p['fala']]
grupos=[]
for p in planos:
    g=grupos[-1] if grupos else None
    if g and g['clip']==p['clip'] and abs(g['vel']-p['vel'])<1e-9 and abs(g['src_out']-p['src_in'])<1e-3 and abs(g['t1']-p['t0'])<1e-3:
        g['src_out']=p['src_out']; g['t1']=p['t1']; g['ids'].append(p['id'])
    else: grupos.append(dict(clip=p['clip'],vel=p['vel'],src_in=p['src_in'],src_out=p['src_out'],t0=p['t0'],t1=p['t1'],ids=[p['id']]))
SOLTA=E.get('correcao1',{}).get('voz_solta',{}); VOZ_IN=E.get('correcao1',{}).get('voz_in',{})
for p in grupos:
    c=p['clip']; s0=p['src_in']-HAND*p['vel']; s1=p['src_out']+HAND*p['vel']; nome='+'.join(p['ids'])
    if nome in SOLTA: s0=min(s0,SOLTA[nome]['pedacos'][0][0]-0.05)
    a,base=janela(c,max(0,s0),s1)
    o,_=sf.read(base+'_o.wav',dtype='float32'); d,_=sf.read(base+'_d.wav',dtype='float32')
    if nome in SOLTA:
        # correcao 1: voz solta da imagem (plano geral, sem boca em quadro). Pedacos da fonte emendados com pausa curta, mesma cadeia e mesmo alvo.
        so=SOLTA[nome]; mx=MX.get(c,0.85); F=int(0.02*SR); pos=0.0; xs=np.zeros(int(4*SR),np.float32); fim=0
        for n_,(u0,u1) in enumerate(so['pedacos']):
            j0=int(round((u0-a)*SR)); j1=int(round((u1-a)*SR)); z=(mx*d[j0:j1]+(1-mx)*o[j0:j1]).astype(np.float32)
            z[:F]*=np.sin(np.linspace(0,np.pi/2,F))**2; z[-F:]*=np.cos(np.linspace(0,np.pi/2,F))**2
            if n_: pos=fim/SR-(so['pedacos'][n_-1][1]-so['fala_fim'][n_-1])+so['pausa']-(so['fala_ini'][n_]-u0)
            k=int(round(pos*SR)); xs[k:k+len(z)]+=z; fim=k+len(z)
        x=xs[:fim]; tmp=f"{A}/tmp/{nome}_in.wav"; sf.write(tmp,x,SR,subtype='FLOAT'); out=f"{A}/tmp/{nome}_v.wav"
        af=('highpass=f=85:poles=2,equalizer=f=3200:t=q:w=1.2:g=1.5,deesser=i=0.3:m=0.5:f=0.5,acompressor=threshold=-26dB:ratio=1.8:attack=18:release=260:makeup=1:knee=8')
        subprocess.run(['ffmpeg','-v','error','-y','-i',tmp,'-af',af,'-c:a','pcm_f32le',out],check=True)
        y,_=sf.read(out,dtype='float32'); L=meter.integrated_loudness(np.concatenate([y]*3) if len(y)<0.5*SR else y); g=np.clip(-18.0-L,-14,14); y=y*10**(g/20)
        k=int(round(so['t_ini']*SR)); voz[k:k+len(y)]+=y
        CORTE.append((nome,'voz solta: fade de 20 ms em cada pedaco','idem')); info.append(dict(id=nome,clip=c,t0=so['t_ini'],t1=round(so['t_ini']+len(y)/SR,3),vel=1.0,lufs_in=round(L,1),ganho_db=round(float(g),1),mx=mx,solta=so))
        print(nome,c,'VOZ SOLTA',so['t_ini'],'a',round(so['t_ini']+len(y)/SR,3),'L',round(L,1),'g',round(float(g),1),flush=True); continue
    i0=int(round((s0-a)*SR)); i1=int(round((s1-a)*SR)); pad=0
    if i0<0: pad=-i0; i0=0
    mx=MX.get(c,0.85); x=mx*d[i0:i1]+(1-mx)*o[i0:i1]
    if nome in RIDER:
        r=RIDER[nome]; d2,_=sf.read(base+r['suf']+'.wav',dtype='float32'); x2=d2[i0:i1]; k0=int(round((r['desde']-a)*SR))-i0; X2=int(0.03*SR)
        w=np.zeros(len(x),np.float32); w[k0:]=1; w[k0-X2:k0]=np.linspace(0,1,X2); x=x*(1-w)+x2*w
        nwin=int(0.30*SR); L=10*np.log10(np.convolve(x**2,np.ones(nwin)/nwin,'same')+1e-12)
        gdb=np.clip(r['alvo']-L,0,r['maxdb'])*w; nsm=int(0.12*SR); gdb=np.convolve(gdb,np.ones(nsm)/nsm,'same')
        x=(x*10**(gdb/20)).astype(np.float32); print(nome,'nivelador: ganho medio',round(float(gdb[k0:].mean()),1),'dB, max',round(float(gdb.max()),1),flush=True)
    if pad: x=np.concatenate([np.zeros(pad,np.float32),x])
    tmp=f"{A}/tmp/{nome}_in.wav"; sf.write(tmp,x,SR,subtype='FLOAT'); out=f"{A}/tmp/{nome}_v.wav"
    af=('highpass=f=85:poles=2,equalizer=f=3200:t=q:w=1.2:g=1.5,deesser=i=0.3:m=0.5:f=0.5,'
        'acompressor=threshold=-26dB:ratio=1.8:attack=18:release=260:makeup=1:knee=8')
    if abs(p['vel']-1)>1e-6: af+=f",atempo={p['vel']}"
    subprocess.run(['ffmpeg','-v','error','-y','-i',tmp,'-af',af,'-c:a','pcm_f32le',out],check=True)
    y,_=sf.read(out,dtype='float32')
    L=meter.integrated_loudness(np.concatenate([y]*3) if len(y)<0.5*SR else y)
    g=np.clip(-18.0-L,-14,14); y=y*10**(g/20)
    t_start=p['t0']-HAND
    n_exp=int(round((p['t1']-p['t0']+2*HAND)*SR)); y=y[:n_exp]
    def quieto(t_a,t_b):
        i_a=int(round((t_a-a)*SR)); i_b=int(round((t_b-a)*SR)); seg=d[max(0,i_a):max(0,i_b)]
        return len(seg)>0 and 20*np.log10(np.sqrt(np.mean(seg**2))+1e-9)<-55
    X=int(round(XF*SR)); H=int(round(HAND*SR)); Lp=int(round((p['t1']-p['t0'])*SR))
    env=np.zeros(len(y),np.float32)
    ib=H if quieto(p['src_in']-0.05,p['src_in']) else H+X//2
    if nome in VOZ_IN: ib=H+int(round((VOZ_IN[nome]-p['src_in'])/p['vel']*SR))+X      # correcao 1: a voz entra depois do resto da palavra anterior da fonte
    ie=H+Lp if quieto(p['src_out'],p['src_out']+0.05) else H+Lp-X
    env[ib:ie]=1; env[ib-X:ib]=np.sin(np.linspace(0,np.pi/2,X))**2
    env[ie:ie+X]=np.cos(np.linspace(0,np.pi/2,len(env[ie:ie+X])))**2
    CORTE.append((nome,'fade-in antes do corte' if ib==H else 'fade-in centrado','fade-out depois do corte' if ie==H+Lp else 'fade-out termina no corte'))
    y=y*env[:len(y)]
    k=int(round(t_start*SR))
    if k<0: y=y[-k:]; k=0
    voz[k:k+len(y)]+=y[:len(voz)-k]
    info.append(dict(id=nome,clip=c,t0=p['t0'],t1=p['t1'],vel=p['vel'],lufs_in=round(L,1),ganho_db=round(float(g),1),mx=mx))
    print(nome,c,'L',round(L,1),'g',round(float(g),1),flush=True)
voz=voz[:N]
json.dump(CORTE,open(A+'/voz_cortes.json','w'),indent=1,ensure_ascii=False)
sf.write(A+'/voz_base.wav',voz,SR,subtype='FLOAT'); json.dump(info,open(A+'/voz_planos.json','w'),indent=1)
print('voz ok', round(meter.integrated_loudness(voz),1),'LUFS')
