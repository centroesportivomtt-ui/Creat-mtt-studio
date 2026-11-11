// Sede viva · renderiza o atlas dos 7 personagens (assets/sede-viva/elenco.webp) e a faixa de rostos (rostos.webp)
// a partir da sede 3D de verdade (/sede/index.html?modo=demo&debug=1, que expõe window.__sede). Não edita a sede.
// Órbita, 11/11.
//
// Uso: node scripts/sede-viva-elenco.cjs [--png <pasta>]   (--png também grava os quadros em PNG para olhar)
//
// Como funciona:
//  - a página da sede abre num Chromium sem GPU (SwiftShader); o three.js vem de node_modules, não do CDN;
//  - scene.onBeforeRender entrega o renderer; o laço da sede é parado e cada pose é desenhada por nós;
//  - tudo some da cena menos o personagem e as luzes; a pose (braços, cabeça, boca) é posta à mão;
//  - recorte sem franja por diferença: o mesmo quadro sobre branco e sobre preto dá o alfa exato
//    (alfa = 1 - (branco - preto); cor = preto / alfa), inclusive no contorno de nanquim com antialias;
//  - render a 2x da célula e redução para 200x240 (atlas 7x3) e 88x88 (rostos 7x1).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const REPO = path.resolve(RAIZ, '..', '..');
const SAIDA = path.join(RAIZ, 'assets', 'sede-viva');
const ORDEM = [['nimbus', 'diretor'], ['verbo', 'copywriter'], ['paleta', 'designer'], ['pixel', 'frontend'], ['lupa', 'qa'], ['muralha', 'seguranca'], ['trilho', 'devops']];
const CEL = { w: 200, h: 240 }, ROSTO = 88, ESC = 2;
const TETO = { elenco: 190 * 1024, rostos: 20 * 1024 };
const PNG = (() => { const i = process.argv.indexOf('--png'); return i > 0 ? process.argv[i + 1] : null; })();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  let f = path.join(REPO, p);
  if (!f.startsWith(REPO)) { r.writeHead(403); return r.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

// Poses: braço 0 = direito do personagem, braço 1 = esquerdo (mesma convenção do animateAgent da sede).
// O personagem fica de três quartos virado para a direita da tela; a cena espelha quem fica do lado direito.
const POSES = {
  parado:   { rx: [-0.18, -0.12], rz: [-0.16, 0.16], cab: [0.06, 0.1, 0], boca: 1, giro: 0.62 },
  gesto:    { rx: [-2.05, -1.35], rz: [-0.05, 0.22], cab: [-0.12, 0.18, 0.06], boca: 1.25, giro: 0.7 },
  comemora: { rx: [0, 0], rz: [-2.6, 2.6], cab: [-0.22, 0.05, 0.1], boca: 1.7, giro: 0.45 },
};

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: CEL.w * ESC, height: CEL.h * ESC }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
  await pg.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/.+/, (route) => {
    const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
    const f = m && path.join(REPO, 'node_modules', m[1], m[2]);
    return f && fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'text/javascript' }) : route.abort();
  });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await pg.goto(base + '/sede/index.html?modo=demo&debug=1', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__sede && window.__sede.scene, null, { timeout: 60000 });
  await pg.waitForTimeout(1500);

  // pega o renderer no próximo quadro e para o laço da sede
  await pg.evaluate(() => new Promise((ok) => {
    const s = window.__sede.scene;
    s.onBeforeRender = (r) => { window.__r = r; s.onBeforeRender = () => {}; window.requestAnimationFrame = () => 0; ok(); };
  }));
  await pg.waitForTimeout(300);

  const quadros = await pg.evaluate(({ ORDEM, POSES, CEL, ROSTO, ESC }) => {
    const S = window.__sede, scene = S.scene, R = window.__r, gl = R.getContext();
    const V3 = S.camera.position.constructor;
    const cam = new S.camera.constructor(18, CEL.w / CEL.h, 0.1, 100);
    scene.background = null; scene.fog = null;
    R.setPixelRatio(1); R.setSize(CEL.w * ESC, CEL.h * ESC, false);
    const canvas = R.domElement;

    const luzes = new Set();
    scene.traverse((o) => { if (o.isLight) { luzes.add(o); if (o.target) luzes.add(o.target); } });
    function isolar(root) {
      const anc = new Set(); for (let p = root; p; p = p.parent) anc.add(p);
      const dentro = new Set(); root.traverse((o) => dentro.add(o));
      scene.traverse((o) => { if (anc.has(o) || dentro.has(o) || luzes.has(o)) o.visible = o.userData.__vis === undefined ? o.visible : o.userData.__vis; else { if (o.userData.__vis === undefined) o.userData.__vis = o.visible; o.visible = false; } });
      root.traverse((o) => { if (o.userData.__vis !== undefined) o.visible = o.userData.__vis; });
    }
    function posar(a, p) {
      const [Rb, Lb] = a.arms;
      Rb.rotation.set(p.rx[0], 0, p.rz[0]); Lb.rotation.set(p.rx[1], 0, p.rz[1]);
      a.head.rotation.set(p.cab[0], p.cab[1], p.cab[2]);
      if (a.mouth) a.mouth.scale.y = p.boca;
      if (a._eyes) a._eyes.scale.y = 1;
      a.rig.position.set(0, 0, 0); a.rig.scale.set(1, 1, 1); a.rig.rotation.set(0, 0, 0);
      // compensa o giro da mesa: a frente do personagem fica a p.giro rad da câmera, seja qual for o pai
      a.root.rotation.y = 0; a.root.updateMatrixWorld(true);
      const f = new V3(0, 0, 1).applyQuaternion(a.root.getWorldQuaternion(a.root.quaternion.clone()));
      a.root.rotation.y = p.giro - Math.atan2(f.x, f.z);
    }
    // dois quadros (fundo branco e preto) e o recorte exato
    function capturar(w, h) {
      const fotos = [];
      for (const cor of [0xffffff, 0x000000]) {
        R.setClearColor(cor, 1); R.render(scene, cam);
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(canvas, 0, 0, w, h);
        fotos.push(c.getContext('2d').getImageData(0, 0, w, h).data);
      }
      const [W, B] = fotos, out = new ImageData(w, h), d = out.data;
      for (let i = 0; i < d.length; i += 4) {
        const dif = ((W[i] - B[i]) + (W[i + 1] - B[i + 1]) + (W[i + 2] - B[i + 2])) / 3;
        let a = 1 - dif / 255; if (a < 0.02) a = 0; if (a > 0.98) a = 1;
        d[i + 3] = Math.round(a * 255);
        if (a > 0) { d[i] = Math.min(255, Math.round(B[i] / a)); d[i + 1] = Math.min(255, Math.round(B[i + 1] / a)); d[i + 2] = Math.min(255, Math.round(B[i + 2] / a)); }
      }
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0); return c;
    }
    function reduzir(src, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h); return c; }

    const atlas = document.createElement('canvas'); atlas.width = CEL.w * ORDEM.length; atlas.height = CEL.h * 3;
    const rostos = document.createElement('canvas'); rostos.width = ROSTO * ORDEM.length; rostos.height = ROSTO;
    const ga = atlas.getContext('2d'), gr = rostos.getContext('2d');
    const info = [];
    ORDEM.forEach(([nome, id], col) => {
      const a = S.byId[id]; isolar(a.root);
      const pe = new V3(); a.root.getWorldPosition(pe);
      const esc = new V3(); a.root.getWorldScale(esc); const k = esc.y || 1;
      // corpo inteiro: janela de 2,75 unidades de altura, pé a ~6% do fundo, câmera um pouco acima
      const H = 2.75 * k, D = (H / 2) / Math.tan((18 / 2) * Math.PI / 180);
      const alvo = new V3(pe.x, pe.y + 1.18 * k, pe.z);
      cam.aspect = CEL.w / CEL.h; cam.position.set(pe.x, alvo.y + D * Math.sin(0.12), pe.z + D * Math.cos(0.12)); cam.lookAt(alvo); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      R.setSize(CEL.w * ESC, CEL.h * ESC, false);
      ['parado', 'gesto', 'comemora'].forEach((pose, lin) => {
        posar(a, POSES[pose]); scene.updateMatrixWorld(true);
        const c = capturar(CEL.w * ESC, CEL.h * ESC);
        ga.drawImage(reduzir(c, CEL.w, CEL.h), col * CEL.w, lin * CEL.h);
      });
      const pp = pe.clone().project(cam); info.push({ nome, pe: Math.round((1 - (pp.y + 1) / 2) * CEL.h * 10) / 10 });
      // rosto: cabeça quase de frente, em quadrado
      posar(a, Object.assign({}, POSES.parado, { giro: 0.28, cab: [0.02, 0.05, 0] })); scene.updateMatrixWorld(true);
      const cab = new V3(); a.head.getWorldPosition(cab);
      const Hr = 1.32 * k, Dr = (Hr / 2) / Math.tan((18 / 2) * Math.PI / 180);
      cam.aspect = 1; cam.position.set(cab.x, cab.y + 0.12 * k + Dr * Math.sin(0.08), cab.z + Dr * Math.cos(0.08)); cam.lookAt(new V3(cab.x, cab.y + 0.12 * k, cab.z)); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      R.setSize(ROSTO * ESC * 2, ROSTO * ESC * 2, false);
      const cr = capturar(ROSTO * ESC * 2, ROSTO * ESC * 2);
      gr.drawImage(reduzir(reduzir(cr, ROSTO * 2, ROSTO * 2), ROSTO, ROSTO), col * ROSTO, 0);
    });
    const webp = (c, q) => c.toDataURL('image/webp', q);
    window.__atlas = atlas; window.__rostos = rostos; window.__webp = webp;
    return { info, png: [atlas.toDataURL('image/png'), rostos.toDataURL('image/png')] };
  }, { ORDEM, POSES, CEL, ROSTO, ESC });

  async function gravar(nome, chave, teto) {
    let q = 0.86, buf;
    for (;;) {
      const url = await pg.evaluate(([k, q]) => window.__webp(window[k], q), [chave, q]);
      buf = Buffer.from(url.split(',')[1], 'base64');
      if (buf.length <= teto || q <= 0.5) break;
      q = Math.round((q - 0.04) * 100) / 100;
    }
    fs.writeFileSync(path.join(SAIDA, nome), buf);
    console.log('ok   ', 'assets/sede-viva/' + nome, buf.length, 'B', 'q' + q);
  }
  fs.mkdirSync(SAIDA, { recursive: true });
  await gravar('elenco.webp', '__atlas', TETO.elenco);
  await gravar('rostos.webp', '__rostos', TETO.rostos);
  if (PNG) {
    fs.mkdirSync(PNG, { recursive: true });
    fs.writeFileSync(path.join(PNG, 'elenco.png'), Buffer.from(quadros.png[0].split(',')[1], 'base64'));
    fs.writeFileSync(path.join(PNG, 'rostos.png'), Buffer.from(quadros.png[1].split(',')[1], 'base64'));
  }
  console.log('linha do pé (px da célula de 240):', JSON.stringify(quadros.info));
  if (erros.length) console.log('erros da página:', JSON.stringify(erros.slice(0, 5)));
  await b.close(); srv.close();
})().catch((e) => { console.error('falha', e && e.stack || e); process.exit(1); });
