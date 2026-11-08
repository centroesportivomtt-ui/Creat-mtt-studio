#!/usr/bin/env node
// Servidor local da sede com modo ao vivo: serve esta pasta e regenera
// estado.json a cada 3 s a partir dos diários dos fluxos do Claude Code.
//   node sede/servidor.cjs [porta]             → só nesta máquina: http://127.0.0.1:8000
//   HOST=0.0.0.0 node sede/servidor.cjs [porta] → abre para a rede local (qualquer pessoa
//                                                  na mesma rede lê o estado dos seus fluxos)
// Versão do pacote à venda: escuta só no loopback por padrão e só serve arquivos de dentro de sede/.
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const porta = Number(process.argv[2] || process.env.PORT || 8000);
const host = process.env.HOST || '127.0.0.1';
const raiz = __dirname;
const gerador = path.join(raiz, '..', '.claude', 'skills', 'sede-ao-vivo', 'estado.cjs');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.cjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
let estado = '{"atualizado":null,"total_trabalhando":0,"personagens":{},"fluxos":[]}';
function atualizar(){ cp.execFile(process.execPath, [gerador], { maxBuffer: 8e6 }, (err, out) => { if (!err && out) estado = out; }); }
atualizar(); setInterval(atualizar, 3000);
function dentroDaRaiz(f){ return f === raiz || f.startsWith(raiz + path.sep); }
http.createServer((req, rsp) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { rsp.writeHead(400); return rsp.end('400'); }
  if (p === '/estado.json') { rsp.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return rsp.end(estado); }
  const f = path.join(raiz, p === '/' ? 'index.html' : p);
  if (!dentroDaRaiz(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('404'); }
  rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rsp);
}).listen(porta, host, () => {
  const todas = host === '0.0.0.0' || host === '::';
  const local = todas ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  console.log(`Sede ao vivo em http://${local}:${porta}  (estado dos fluxos a cada 3 s)`);
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) console.log(`Atenção: escutando em ${host}. Quem alcança esse endereço na rede vê o estado dos seus fluxos.`);
});
