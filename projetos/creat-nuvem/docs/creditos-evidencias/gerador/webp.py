# png/<nome>.png -> webp/<nome>.webp, <= 80 KB, sem EXIF/XMP/ICC; qualidade desce até caber
import os, sys
from PIL import Image
os.makedirs('webp', exist_ok=True)
for f in sorted(os.listdir('png')):
    n = f[:-4]; im = Image.open('png/' + f).convert('RGB')
    im.info.clear()
    for q in range(88, 40, -4):
        im.save(f'webp/{n}.webp', 'WEBP', quality=q, method=6)
        sz = os.path.getsize(f'webp/{n}.webp')
        if sz <= 78 * 1024: break
    print(n, im.size, 'q', q, sz)
