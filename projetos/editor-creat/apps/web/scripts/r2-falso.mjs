#!/usr/bin/env node
// R2 falso: servidor S3 mínimo (só o que o Editor usa) para testar o envio direto sem conta nem rede.
//   R2_FALSO_DIR=/tmp/x R2_BUCKET=editor R2_ACCESS_KEY_ID=a R2_SECRET_ACCESS_KEY=b node scripts/r2-falso.mjs
//   porta R2_FALSO_PORTA (padrão 8790); origens CORS em R2_FALSO_ORIGENS (vírgulas; padrão: qualquer uma).
// Operações: CreateMultipartUpload, UploadPart, ListParts (paginado), CompleteMultipartUpload, AbortMultipartUpload,
// PutObject, GetObject (com Range), HeadObject, DeleteObject, ListObjectsV2. ETag verdadeiro (md5; multipart = md5 dos
// md5 + "-N"), regras do R2 (parte mínima de 5 MiB menos a última, partes do mesmo tamanho, até 10 000 partes) e
// assinatura SigV4 conferida (cabeçalho e URL pré-assinada, com validade) quando há chave configurada.
// Objetos ficam em <R2_FALSO_DIR>/<chave> (no aceite é o mesmo armazenamento do motor falso) e o multipart em
// <R2_FALSO_DIR>/.multipart/. Controle para testes (só 127.0.0.1):
//   POST /__controle/derrubar?parte=N&depois=BYTES   a próxima UploadPart da parte N (ou qualquer uma, sem parte) cai
//                                                     depois de BYTES recebidos (simula queda de rede no meio da parte)
//   GET  /__controle/estado                           contadores por operação e por parte
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PORTA = Number(process.env.R2_FALSO_PORTA || 8790);
const RAIZ = path.resolve(process.env.R2_FALSO_DIR || path.join(process.env.TMPDIR || '/tmp', 'r2-falso'));
const BUCKET = process.env.R2_BUCKET || 'editor';
const ACESSO = process.env.R2_ACCESS_KEY_ID || '';
const SEGREDO = process.env.R2_SECRET_ACCESS_KEY || '';
const ORIGENS = (process.env.R2_FALSO_ORIGENS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const MP = path.join(RAIZ, '.multipart');
const MIN_PARTE = 5 * 1024 * 1024;

const estado = { operacoes: {}, partes: {}, derrubadas: 0, assinaturas_recusadas: 0, concluidos: [] };
let derrubar = null; // { parte: number|null, depois: number }

const conta = (op) => { estado.operacoes[op] = (estado.operacoes[op] || 0) + 1; };
const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// ---------- CORS (como o painel do R2: AllowedOrigins, AllowedMethods, AllowedHeaders, ExposeHeaders) ----------
function cors(req, res) {
  const origem = req.headers.origin;
  if (!origem) return true;
  if (!ORIGENS.includes('*') && !ORIGENS.includes(origem)) return false;
  res.setHeader('Access-Control-Allow-Origin', ORIGENS.includes('*') ? '*' : origem);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  return true;
}

function responder(res, status, corpo = '', h = {}) {
  const b = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo);
  res.writeHead(status, { 'content-length': b.length, ...(b.length ? { 'content-type': 'application/xml' } : {}), ...h });
  res.end(b);
}
function erroS3(res, status, codigo, msg) {
  responder(res, status, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code><Message>${xmlEsc(msg)}</Message></Error>`);
}

// ---------- SigV4 ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
function chaveDeAssinatura(data, regiao, servico) {
  return hmac(hmac(hmac(hmac(`AWS4${SEGREDO}`, data), regiao), servico), 'aws4_request');
}
function paresDaConsulta(bruta) {
  return (bruta ? bruta.split('&') : []).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    const k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, '%20'));
    const v = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, '%20'));
    return [k, v];
  });
}
/** Confere a assinatura (cabeçalho Authorization ou URL pré-assinada). Devolve null se ok, ou o motivo. */
function conferirAssinatura(req, caminhoBruto, consultaBruta) {
  if (!SEGREDO) return null;
  const pares = paresDaConsulta(consultaBruta);
  const q = Object.fromEntries(pares);
  let credencial, assinados, assinatura, data, hashCorpo;
  const filtrados = [];
  if (q['X-Amz-Signature']) {
    credencial = q['X-Amz-Credential'];
    assinados = q['X-Amz-SignedHeaders'];
    assinatura = q['X-Amz-Signature'];
    data = q['X-Amz-Date'];
    hashCorpo = 'UNSIGNED-PAYLOAD';
    const exp = Number(q['X-Amz-Expires'] || 0);
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(data || '');
    if (!m) return 'data inválida';
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (!exp || Date.now() > t + exp * 1000) return 'Request has expired';
    for (const p of pares) if (p[0] !== 'X-Amz-Signature') filtrados.push(p);
  } else {
    const a = req.headers.authorization || '';
    const m = /^AWS4-HMAC-SHA256 Credential=([^,]+),\s*SignedHeaders=([^,]+),\s*Signature=([0-9a-f]+)$/.exec(a);
    if (!m) return 'sem assinatura';
    [, credencial, assinados, assinatura] = m;
    data = req.headers['x-amz-date'];
    hashCorpo = req.headers['x-amz-content-sha256'] || 'UNSIGNED-PAYLOAD';
    filtrados.push(...pares);
  }
  const [id, dia, regiao, servico] = String(credencial || '').split('/');
  if (id !== ACESSO) return 'chave de acesso desconhecida';
  const nomes = String(assinados || '').split(';');
  const cab = nomes.map((n) => `${n}:${String(req.headers[n] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const consulta = filtrados.map(([k, v]) => [enc(k), enc(v)]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const canonico = [req.method, caminhoBruto, consulta, cab, nomes.join(';'), hashCorpo].join('\n');
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`;
  const paraAssinar = ['AWS4-HMAC-SHA256', data, escopo, createHash('sha256').update(canonico).digest('hex')].join('\n');
  const certa = createHmac('sha256', chaveDeAssinatura(dia, regiao, servico)).update(paraAssinar).digest('hex');
  const a = Buffer.from(certa), b = Buffer.from(String(assinatura));
  return a.length === b.length && timingSafeEqual(a, b) ? null : 'SignatureDoesNotMatch';
}

// ---------- armazenamento ----------
function chaveSegura(k) {
  if (!k || k.length > 1024 || k.startsWith('/') || k.startsWith('.multipart') || /[\x00-\x1f\\]/.test(k)) return false;
  return k.split('/').every((p) => p && p !== '.' && p !== '..');
}
const arquivoDe = (k) => path.join(RAIZ, k);
const etagDe = (f) => { try { return fs.readFileSync(`${f}.etag`, 'utf8'); } catch { return null; } };
function md5Arquivo(f) {
  const h = createHash('md5');
  const fd = fs.openSync(f, 'r');
  const buf = Buffer.alloc(4 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}
function etagObjeto(k) {
  // sidecar oculto ao lado do objeto (nunca listado); objeto gravado por fora (motor falso) ganha md5 na hora
  const meta = path.join(path.dirname(arquivoDe(k)), `.${path.basename(k)}.etag`);
  try { return fs.readFileSync(meta, 'utf8'); } catch { /* calcula */ }
  return `"${md5Arquivo(arquivoDe(k))}"`;
}
function gravarEtagObjeto(k, etag) {
  fs.writeFileSync(path.join(path.dirname(arquivoDe(k)), `.${path.basename(k)}.etag`), etag);
}

/** Recebe o corpo para um arquivo temporário, calculando o md5; pode derrubar a conexão no meio. */
function receber(req, destino, parte) {
  return new Promise((ok, falha) => {
    const tmp = `${destino}.${randomBytes(4).toString('hex')}.tmp`;
    const out = fs.createWriteStream(tmp);
    const h = createHash('md5');
    let n = 0;
    const armada = derrubar && (derrubar.parte == null || derrubar.parte === parte) ? derrubar : null;
    if (armada) derrubar = null;
    req.on('data', (c) => {
      n += c.length;
      h.update(c);
      out.write(c);
      if (armada && n >= armada.depois) {
        estado.derrubadas++;
        req.socket.destroy();
      }
    });
    let fechado = false;
    const descartar = (e) => {
      if (fechado) return;
      fechado = true;
      out.destroy();
      fs.rm(tmp, { force: true }, () => falha(e));
    };
    out.on('error', (e) => { req.resume(); descartar(e); }); // envio abortado no meio: a pasta do multipart sumiu
    req.on('error', descartar);
    req.on('close', () => { if (!req.complete) descartar(new Error('conexão caiu')); });
    req.on('end', () => {
      if (fechado) return;
      fechado = true;
      out.end(() => {
        try { fs.renameSync(tmp, destino); } catch (e) { fs.rm(tmp, { force: true }, () => falha(e)); return; }
        ok({ bytes: n, md5: h.digest('hex') });
      });
    });
  });
}
function lerTudo(req, limite = 4 << 20) {
  return new Promise((ok, falha) => {
    const partes = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limite) { falha(new Error('grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
    req.on('error', falha);
  });
}

const metaMP = (id) => { try { return JSON.parse(fs.readFileSync(path.join(MP, id, 'meta.json'), 'utf8')); } catch { return null; } };
function partesMP(id) {
  const d = path.join(MP, id);
  return fs.readdirSync(d).filter((f) => /^\d{5}$/.test(f)).map((f) => {
    const st = fs.statSync(path.join(d, f));
    return { n: Number(f), bytes: st.size, etag: etagDe(path.join(d, f)), quando: st.mtime.toISOString() };
  }).filter((p) => p.etag).sort((a, b) => a.n - b.n);
}

// ---------- operações ----------
async function rotear(req, res) {
  const [caminhoBruto, consultaBruta = ''] = req.url.split('?', 2);
  const q = new URLSearchParams(consultaBruta);

  if (caminhoBruto.startsWith('/__controle/')) {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!local) return responder(res, 403);
    if (caminhoBruto === '/__controle/derrubar' && req.method === 'POST') {
      derrubar = { parte: q.get('parte') ? Number(q.get('parte')) : null, depois: Number(q.get('depois') || 1) };
      return responder(res, 200, JSON.stringify({ armado: derrubar }), { 'content-type': 'application/json' });
    }
    if (caminhoBruto === '/__controle/estado') return responder(res, 200, JSON.stringify(estado), { 'content-type': 'application/json' });
    return responder(res, 404);
  }

  if (!cors(req, res)) return erroS3(res, 403, 'AccessDenied', 'origem não permitida pelo CORS do bucket');
  if (req.method === 'OPTIONS') {
    conta('Preflight');
    const metodo = req.headers['access-control-request-method'];
    if (!['PUT', 'GET', 'HEAD'].includes(metodo)) return erroS3(res, 403, 'AccessDenied', 'método não permitido pelo CORS');
    const pedidos = String(req.headers['access-control-request-headers'] || '');
    return responder(res, 204, '', {
      'Access-Control-Allow-Methods': 'PUT, GET, HEAD',
      ...(pedidos ? { 'Access-Control-Allow-Headers': pedidos } : {}),
      'Access-Control-Max-Age': '3600',
    });
  }

  const segs = caminhoBruto.split('/').slice(1);
  const bucket = decodeURIComponent(segs[0] || '');
  const chave = segs.slice(1).map(decodeURIComponent).join('/');
  if (bucket !== BUCKET) return erroS3(res, 404, 'NoSuchBucket', 'bucket não existe');
  const motivo = conferirAssinatura(req, caminhoBruto, consultaBruta);
  if (motivo) {
    estado.assinaturas_recusadas++;
    return erroS3(res, 403, motivo === 'Request has expired' ? 'AccessDenied' : 'SignatureDoesNotMatch', motivo);
  }
  const M = req.method;

  // ListObjectsV2
  if (!chave && M === 'GET') {
    conta('ListObjectsV2');
    const prefixo = q.get('prefix') || '';
    const max = Math.min(1000, Number(q.get('max-keys') || 1000));
    const inicio = q.get('continuation-token') ? Buffer.from(q.get('continuation-token'), 'base64url').toString() : (q.get('start-after') || '');
    const todas = [];
    const andar = (d, rel) => {
      for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) andar(path.join(d, e.name), r);
        else if (!e.name.endsWith('.tmp') && r.startsWith(prefixo)) todas.push(r);
      }
    };
    andar(RAIZ, '');
    todas.sort();
    const depois = todas.filter((k) => k > inicio);
    const pagina = depois.slice(0, max);
    const truncado = depois.length > max;
    const itens = pagina.map((k) => {
      const st = fs.statSync(arquivoDe(k));
      return `<Contents><Key>${xmlEsc(k)}</Key><LastModified>${st.mtime.toISOString()}</LastModified><ETag>${xmlEsc(etagObjeto(k))}</ETag><Size>${st.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
    }).join('');
    return responder(res, 200, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${BUCKET}</Name><Prefix>${xmlEsc(prefixo)}</Prefix><KeyCount>${pagina.length}</KeyCount><MaxKeys>${max}</MaxKeys><IsTruncated>${truncado}</IsTruncated>${truncado ? `<NextContinuationToken>${Buffer.from(pagina[pagina.length - 1]).toString('base64url')}</NextContinuationToken>` : ''}${itens}</ListBucketResult>`);
  }
  if (!chaveSegura(chave)) return erroS3(res, 400, 'InvalidArgument', 'chave inválida');

  // CreateMultipartUpload
  if (M === 'POST' && q.has('uploads')) {
    conta('CreateMultipartUpload');
    const id = randomBytes(16).toString('hex');
    fs.mkdirSync(path.join(MP, id), { recursive: true });
    fs.writeFileSync(path.join(MP, id, 'meta.json'), JSON.stringify({ chave, tipo: req.headers['content-type'] || 'application/octet-stream', criado: Date.now() }));
    return responder(res, 200, `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>${BUCKET}</Bucket><Key>${xmlEsc(chave)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
  }
  const uploadId = q.get('uploadId');
  if (uploadId) {
    if (!/^[0-9a-f]{32}$/.test(uploadId)) return erroS3(res, 404, 'NoSuchUpload', 'envio não existe');
    const meta = metaMP(uploadId);
    if (!meta || meta.chave !== chave) return erroS3(res, 404, 'NoSuchUpload', 'envio não existe');
    const d = path.join(MP, uploadId);

    if (M === 'PUT') { // UploadPart
      const n = Number(q.get('partNumber'));
      if (!Number.isInteger(n) || n < 1 || n > 10000) return erroS3(res, 400, 'InvalidArgument', 'partNumber de 1 a 10000');
      conta('UploadPart');
      const declarado = Number(req.headers['content-length']);
      const f = path.join(d, String(n).padStart(5, '0'));
      let r;
      try { r = await receber(req, f, n); } catch {
        if (!res.headersSent && !req.socket.destroyed) erroS3(res, 404, 'NoSuchUpload', 'envio não existe');
        return; // conexão caiu ou envio abortado: nada gravado
      }
      if (!metaMP(uploadId)) { fs.rmSync(f, { force: true }); return erroS3(res, 404, 'NoSuchUpload', 'envio abortado'); }
      if (Number.isFinite(declarado) && r.bytes !== declarado) { fs.rmSync(f, { force: true }); return erroS3(res, 400, 'IncompleteBody', 'corpo menor que o Content-Length'); }
      const etag = `"${r.md5}"`;
      fs.writeFileSync(`${f}.etag`, etag);
      estado.partes[n] = (estado.partes[n] || 0) + 1;
      return responder(res, 200, '', { ETag: etag });
    }
    if (M === 'GET') { // ListParts
      conta('ListParts');
      const max = Math.min(1000, Number(q.get('max-parts') || 1000));
      const marcador = Number(q.get('part-number-marker') || 0);
      const todas = partesMP(uploadId).filter((p) => p.n > marcador);
      const pagina = todas.slice(0, max);
      const truncado = todas.length > max;
      const itens = pagina.map((p) => `<Part><PartNumber>${p.n}</PartNumber><LastModified>${p.quando}</LastModified><ETag>${xmlEsc(p.etag)}</ETag><Size>${p.bytes}</Size></Part>`).join('');
      return responder(res, 200, `<?xml version="1.0" encoding="UTF-8"?><ListPartsResult><Bucket>${BUCKET}</Bucket><Key>${xmlEsc(chave)}</Key><UploadId>${uploadId}</UploadId><PartNumberMarker>${marcador}</PartNumberMarker>${truncado ? `<NextPartNumberMarker>${pagina[pagina.length - 1].n}</NextPartNumberMarker>` : ''}<MaxParts>${max}</MaxParts><IsTruncated>${truncado}</IsTruncated>${itens}</ListPartsResult>`);
    }
    if (M === 'POST') { // CompleteMultipartUpload
      conta('CompleteMultipartUpload');
      const xml = await lerTudo(req);
      const pedidas = [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({
        n: Number(/<PartNumber>(\d+)<\/PartNumber>/.exec(m[1])?.[1]),
        etag: (/<ETag>([\s\S]*?)<\/ETag>/.exec(m[1])?.[1] ?? '').replace(/&quot;/g, '"'),
      }));
      if (!pedidas.length) return erroS3(res, 400, 'MalformedXML', 'sem partes');
      const gravadas = new Map(partesMP(uploadId).map((p) => [p.n, p]));
      for (let i = 0; i < pedidas.length; i++) {
        const p = pedidas[i], g = gravadas.get(p.n);
        if (i && pedidas[i - 1].n >= p.n) return erroS3(res, 400, 'InvalidPartOrder', 'partes fora de ordem');
        if (!g || g.etag.replace(/"/g, '') !== p.etag.replace(/"/g, '')) return erroS3(res, 400, 'InvalidPart', `parte ${p.n} não confere`);
        const ultima = i === pedidas.length - 1;
        if (!ultima && g.bytes < MIN_PARTE) return erroS3(res, 400, 'EntityTooSmall', `parte ${p.n} menor que 5 MiB`);
        if (!ultima && g.bytes !== gravadas.get(pedidas[0].n).bytes) return erroS3(res, 400, 'InvalidPart', 'no R2 todas as partes (menos a última) têm o mesmo tamanho');
      }
      const destino = arquivoDe(chave);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const tmp = `${destino}.${uploadId.slice(0, 6)}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      const md5s = [];
      for (const p of pedidas) {
        const f = path.join(d, String(p.n).padStart(5, '0'));
        fs.writeSync(fd, fs.readFileSync(f));
        md5s.push(Buffer.from(gravadas.get(p.n).etag.replace(/"/g, ''), 'hex'));
      }
      fs.closeSync(fd);
      fs.renameSync(tmp, destino);
      const etag = `"${createHash('md5').update(Buffer.concat(md5s)).digest('hex')}-${pedidas.length}"`;
      gravarEtagObjeto(chave, etag);
      fs.rmSync(d, { recursive: true, force: true });
      estado.concluidos.push({ chave, partes: pedidas.length, bytes: fs.statSync(destino).size });
      return responder(res, 200, `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Location>/${BUCKET}/${xmlEsc(chave)}</Location><Bucket>${BUCKET}</Bucket><Key>${xmlEsc(chave)}</Key><ETag>${xmlEsc(etag)}</ETag></CompleteMultipartUploadResult>`);
    }
    if (M === 'DELETE') { // AbortMultipartUpload
      conta('AbortMultipartUpload');
      fs.rmSync(d, { recursive: true, force: true });
      return responder(res, 204);
    }
    return erroS3(res, 405, 'MethodNotAllowed', 'método não suportado');
  }

  const f = arquivoDe(chave);
  if (M === 'PUT') { // PutObject
    conta('PutObject');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let r;
    try { r = await receber(req, f, 0); } catch { return; }
    const etag = `"${r.md5}"`;
    gravarEtagObjeto(chave, etag);
    return responder(res, 200, '', { ETag: etag });
  }
  if (M === 'DELETE') {
    conta('DeleteObject');
    fs.rmSync(f, { force: true });
    fs.rmSync(path.join(path.dirname(f), `.${path.basename(f)}.etag`), { force: true });
    return responder(res, 204);
  }
  if (M === 'GET' || M === 'HEAD') {
    conta(M === 'GET' ? 'GetObject' : 'HeadObject');
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
      if (M === 'HEAD') return responder(res, 404);
      return erroS3(res, 404, 'NoSuchKey', 'objeto não existe');
    }
    const st = fs.statSync(f);
    const tam = st.size;
    let ini = 0, fim = tam - 1, status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      if (m[1]) { ini = Number(m[1]); fim = m[2] ? Math.min(Number(m[2]), tam - 1) : tam - 1; } else ini = Math.max(0, tam - Number(m[2]));
      if (ini > fim || ini >= tam) return erroS3(res, 416, 'InvalidRange', 'faixa fora do objeto');
      status = 206;
    }
    const h = {
      'content-type': 'application/octet-stream', 'content-length': fim - ini + 1, 'accept-ranges': 'bytes',
      etag: etagObjeto(chave), 'last-modified': st.mtime.toUTCString(),
      ...(status === 206 ? { 'content-range': `bytes ${ini}-${fim}/${tam}` } : {}),
    };
    res.writeHead(status, h);
    if (M === 'HEAD') return res.end();
    fs.createReadStream(f, { start: ini, end: fim }).pipe(res);
    return;
  }
  return erroS3(res, 405, 'MethodNotAllowed', 'método não suportado');
}

fs.mkdirSync(MP, { recursive: true });
http.createServer((req, res) => {
  rotear(req, res).catch((e) => { if (!res.headersSent) erroS3(res, 500, 'InternalError', String(e?.message || e)); else res.end(); });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`r2 falso em http://127.0.0.1:${PORTA} · bucket ${BUCKET} · pasta ${RAIZ} · assinatura ${SEGREDO ? 'conferida' : 'ignorada'}`);
});
