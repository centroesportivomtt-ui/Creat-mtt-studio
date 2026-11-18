import sys, subprocess, numpy as np, cv2
V='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/video'
def quadros(f, w=168):
    h=w*16//9//2*2
    r=subprocess.run(['ffmpeg','-nostdin','-v','error','-i',f,'-vf',f'scale={w}:{h}:flags=area','-pix_fmt','bgr24','-f','rawvideo','-'],capture_output=True).stdout
    return np.frombuffer(r,np.uint8).reshape(-1,h,w,3)
def folha(ids, out, n=6):
    rows=[]
    for pid in ids:
        Q=quadros(f'{V}/planos/{pid}.mp4'); idx=np.linspace(0,len(Q)-1,n).astype(int); row=np.hstack([Q[i] for i in idx]).copy()
        cv2.putText(row,f'{pid} ({len(Q)}q)',(6,18),cv2.FONT_HERSHEY_SIMPLEX,0.55,(0,0,0),3); cv2.putText(row,f'{pid} ({len(Q)}q)',(6,18),cv2.FONT_HERSHEY_SIMPLEX,0.55,(255,255,255),1); rows.append(row)
    cv2.imwrite(out,np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,88])
folha(['P50','P54','P55','P56','P51','P58','P70','I02'],V+'/chk2/folha_novos_a.jpg')
folha(['I03','I04','P72','P60','P61','P62','P63','P44'],V+'/chk2/folha_novos_b.jpg')
folha(['P09','P10','P15','P26','P30','P35','P36','P40','P41'],V+'/chk2/folha_refeitos.jpg')
