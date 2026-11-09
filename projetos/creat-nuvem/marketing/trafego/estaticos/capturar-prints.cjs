#!/usr/bin/env node
// Prints reais do Porta Aberta para os criativos (Paleta, 09/11/2026).
// Sobe um servidor local da pasta projetos/creat-nuvem e grava em ../saida/prints/
// node projetos/creat-nuvem/marketing/trafego/estaticos/capturar-prints.cjs
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '../../..');
const SAIDA = path.resolve(__dirname, '../saida/prints');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const NOMES = { barbearia: 'Barbearia Navalha Fictícia', salao: 'Salão Esmalte Fictício', academia: 'Studio Barra Fictícia' };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  fs.mkdirSync(SAIDA, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light', reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  // 1. hero com a placa FECHADO
  await pg.goto(base + '?nicho=barbearia', { waitUntil: 'networkidle' }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { const z = document.querySelector('.zap-flutuante'); if (z) z.style.visibility = 'hidden'; });
  await pg.screenshot({ path: path.join(SAIDA, 'home-fechado.png') });
  // 2. prévias dos 3 nichos: topo e meio (serviços + pedido)
  for (const [k, n] of Object.entries(NOMES)) {
    await pg.goto(base + 'previa/#k=' + k + '&n=' + encodeURIComponent(n) + '&p=1', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2000);
    await pg.screenshot({ path: path.join(SAIDA, 'previa-' + k + '-topo.png') });
    await pg.evaluate(() => window.scrollTo(0, innerHeight * 0.95)); await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(SAIDA, 'previa-' + k + '-servicos.png') });
    await pg.evaluate(() => window.scrollTo(0, innerHeight * 1.9)); await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(SAIDA, 'previa-' + k + '-pedido.png') });
  }
  // 3. o pedido chegando no WhatsApp (desenho do celular da home, mensagem de exemplo)
  await pg.goto(base + '?nicho=barbearia', { waitUntil: 'networkidle' }); await pg.waitForTimeout(800);
  await pg.addStyleTag({ content: '#consentimento,.zap-flutuante{display:none!important}' });
  await pg.fill('#nome', NOMES.barbearia);
  await pg.click('#teste-alternativa'); await pg.waitForTimeout(1200);
  const cel = await pg.$('#celular'); await cel.scrollIntoViewIfNeeded(); await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.join(SAIDA, 'home-teste-whatsapp.png') });
  await cel.screenshot({ path: path.join(SAIDA, 'whatsapp-pedido-chega.png') });
  await b.close(); srv.close();
  console.log('ok ->', SAIDA);
})().catch(e => { console.error(e); process.exit(1); });
