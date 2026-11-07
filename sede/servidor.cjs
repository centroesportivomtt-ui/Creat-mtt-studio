#!/usr/bin/env node
// Servidor local da sede com modo ao vivo: serve esta pasta e regenera
// estado.json a cada 3 s a partir dos diários dos fluxos do Claude Code.
//   node sede/servidor.cjs [porta]   → http://localhost:8000
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const porta = Number(process.argv[2] || 8000);
const raiz = __dirname;
const gerador = path.join(raiz, '..', '.claude', 'skills', 'sede-ao-vivo', 'estado.cjs');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.cjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
let estado = '{"atualizado":null,"total_trabalhando":0,"personagens":{},"fluxos":[]}';
function atualizar(){ cp.execFile(process.execPath, [gerador], { maxBuffer: 8e6 }, (err, out) => { if (!err && out) estado = out; }); }
atualizar(); setInterval(atualizar, 3000);
http.createServer((req, rsp) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/estado.json') { rsp.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return rsp.end(estado); }
  let f = path.join(raiz, p === '/' ? 'index.html' : p);
  if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('404'); }
  rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rsp);
}).listen(porta, () => console.log(`Sede ao vivo em http://localhost:${porta}  (estado dos fluxos a cada 3 s)`));
