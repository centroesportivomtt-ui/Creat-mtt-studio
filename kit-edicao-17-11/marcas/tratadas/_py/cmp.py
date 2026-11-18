import numpy as np,sys
from PIL import Image
x0,y0,x1,y1=map(int,open('_py/ctmtt_crop.txt').read().split())
o=np.array(Image.open('../../assets/marcas/ctmtt_logo.png').convert('RGBA'))[y0:y1,x0:x1].astype(float)
v=np.array(Image.open('_conf/ct_1x.png').convert('RGBA')).astype(float)
d=np.abs(o[...,3]-v[...,3]); print('alpha diff medio %.2f p99 %.0f px>128 %d'%(d.mean(),np.percentile(d,99),(d>128).sum()))
c=np.abs(o[...,:3]*o[...,3:]/255-v[...,:3]*v[...,3:]/255).mean(); print('cor premult diff %.2f'%c)
im=np.zeros(o.shape[:2]+(3,),np.uint8)+30
im[...,0]=np.clip(30+np.maximum(o[...,3]-v[...,3],0),0,255); im[...,1]=np.clip(30+np.maximum(v[...,3]-o[...,3],0),0,255)
Image.fromarray(im).resize((im.shape[1]*2,im.shape[0]*2),Image.NEAREST).save('_conf/ct_diff.png')
L=Image.open('ctmtt_logo_2400.png'); bg=Image.new('RGBA',L.size,(20,20,20,255)); bg.alpha_composite(L); bg.save('_conf/ct_2400_dark.png'); bg.crop((1300,0,2400,460)).save('_conf/ct_2400_crop.png'); bg.crop((0,0,1100,460)).save('_conf/ct_2400_cropL.png')
