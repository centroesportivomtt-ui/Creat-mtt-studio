#!/usr/bin/env node
// Servidor local da sede com modo ao vivo: serve a sede e regenera
// estado.json a cada 3 s a partir dos diários dos fluxos do Claude Code.
//   node sede/servidor.cjs [porta]              → só nesta máquina: http://127.0.0.1:8000
//   HOST=0.0.0.0 node sede/servidor.cjs [porta] → abre para a rede local (qualquer pessoa
//                                                 na mesma rede lê o estado dos seus fluxos)
// Escuta só no loopback por padrão e serve só a lista branca abaixo (nada mais da pasta).
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const porta = Number(process.argv[2] || process.env.PORT || 8000);
const host = process.env.HOST || '127.0.0.1';
const raiz = __dirname;
const gerador = path.join(raiz, '..', '.claude', 'skills', 'sede-ao-vivo', 'estado.cjs');
// rota → arquivo dentro de sede/. estado.json vem da memória (gerado), não do disco.
const LIBERADOS = { '/': 'index.html', '/index.html': 'index.html', '/estado-publico.json': 'estado-publico.json' };
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
let estado = '{"atualizado":null,"total_trabalhando":0,"personagens":{},"fluxos":[]}';
function atualizar(){ cp.execFile(process.execPath, [gerador], { maxBuffer: 8e6 }, (err, out) => { if (!err && out) estado = out; }); }
function dentroDaRaiz(f){ const r = path.relative(raiz, f); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r); }
function responder(rsp, cod, txt){ rsp.writeHead(cod, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }); rsp.end(txt); }
const servidor = http.createServer((req, rsp) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return responder(rsp, 405, '405');
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { return responder(rsp, 400, '400'); }
  if (p === '/estado.json') { rsp.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); return rsp.end(req.method === 'HEAD' ? undefined : estado); }
  const nome = Object.prototype.hasOwnProperty.call(LIBERADOS, p) ? LIBERADOS[p] : null;
  const f = nome && path.join(raiz, nome);
  if (!f || !dentroDaRaiz(f) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return responder(rsp, 404, '404');
  rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') return rsp.end();
  fs.createReadStream(f).on('error', () => rsp.destroy()).pipe(rsp);
});
if (require.main === module) {
  atualizar(); setInterval(atualizar, 3000);
  servidor.listen(porta, host, () => {
    const todas = host === '0.0.0.0' || host === '::';
    const local = todas ? 'localhost' : host.includes(':') ? `[${host}]` : host;
    console.log(`Sede ao vivo em http://${local}:${porta}  (estado dos fluxos a cada 3 s)`);
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) console.log(`Atenção: escutando em ${host}. Quem alcança esse endereço na rede vê o estado dos seus fluxos.`);
  });
}
module.exports = { servidor, LIBERADOS, dentroDaRaiz };
