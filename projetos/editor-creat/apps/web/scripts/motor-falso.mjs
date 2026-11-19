#!/usr/bin/env node
// Motor falso do Editor creat.MTT: mesma API HTTP da ARQUITETURA §4.6, com estados simulados.
// Serve para a frente D (site) andar e ser testada sem depender das frentes A, B e C.
//   EDITOR_DADOS=/caminho MOTOR_TOKEN=xyz node scripts/motor-falso.mjs   (porta MOTOR_FALSO_PORTA, padrão 8788)
// Lê e grava no mesmo armazenamento local que o site ($EDITOR_DADOS/armazenamento), como o motor real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PORTA = Number(process.env.MOTOR_FALSO_PORTA || 8788);
const TOKEN = process.env.MOTOR_TOKEN || '';
const PASSO = Number(process.env.MOTOR_FALSO_PASSO_MS || 700);
const DADOS = path.resolve(process.env.EDITOR_DADOS || path.join(process.cwd(), '..', '..', 'dados'));
const ARM = path.join(DADOS, 'armazenamento');
const TIPOS = ['auto', 'evento', 'empresa', 'daily_vlog', 'anuncio', 'depoimento', 'bastidor'];
const ABERTOS = ['recebendo', 'lendo'];

const agora = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const projetos = new Map();
const eventos = [];
let proximoEvento = 1;

// ---------- vídeo de amostra (5 s, 540x960, H.264 + AAC, faststart) ----------
const AMOSTRA = path.join(ARM, '_amostras', 'final_5s.mp4');
function garantirAmostra() {
  if (fs.existsSync(AMOSTRA) && fs.statSync(AMOSTRA).size > 1000) return;
  fs.mkdirSync(path.dirname(AMOSTRA), { recursive: true });
  const tmp = AMOSTRA + '.tmp.mp4';
  execFileSync('nice', ['-n', '5', 'ffmpeg', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=5',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5',
    '-vf', "drawbox=x=0:y=0:w=iw:h=120:color=0x16171a@0.85:t=fill,drawtext=text='creat.MTT · v1':x=40:y=40:fontsize=44:fontcolor=0xf2a516",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '2', '-shortest', tmp]);
  fs.renameSync(tmp, AMOSTRA);
}
function semTexto() { // ffmpeg sem drawtext (sem fontconfig): tenta de novo sem o letreiro
  const tmp = AMOSTRA + '.tmp.mp4';
  execFileSync('nice', ['-n', '5', 'ffmpeg', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=5',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '2', '-shortest', tmp]);
  fs.renameSync(tmp, AMOSTRA);
}

// ---------- eventos ----------
function emitir(pid, tipo, extra = {}) {
  const e = { id: proximoEvento++, projeto: pid, ts: agora(), tipo, etapa: null, alvo: null, progresso: null, estado: null, mensagem: null, dados: null, ...extra };
  eventos.push(e);
  if (eventos.length > 20000) eventos.splice(0, 5000);
  const p = projetos.get(pid);
  if (p) p.atualizado = e.ts;
  return e;
}
function mudarEstado(p, estado, mensagem) {
  p.estado = estado;
  emitir(p.id, 'estado', { estado, mensagem });
}

// ---------- simulação ----------
async function lerArquivo(p, a) {
  emitir(p.id, 'arquivo_recebido', { alvo: a.id, mensagem: `Chegou: ${a.nome}` });
  emitir(p.id, 'etapa_inicio', { etapa: 'ingest', alvo: a.id, mensagem: `Lendo quadros-chave e áudio de ${a.nome}` });
  await dormir(PASSO / 2);
  a.estado = 'ingerido';
  emitir(p.id, 'etapa_fim', { etapa: 'ingest', alvo: a.id, progresso: 1, mensagem: `${a.nome}: quadros-chave e áudio prontos` });
  emitir(p.id, 'etapa_inicio', { etapa: 'analise', alvo: a.id, mensagem: `Transcrevendo as falas de ${a.nome}` });
  await dormir(PASSO / 2);
  a.estado = 'analisado';
  emitir(p.id, 'etapa_fim', { etapa: 'analise', alvo: a.id, progresso: 1, mensagem: `${a.nome}: falas, momentos e rostos lidos` });
  tentarDirigir(p);
}

function tentarDirigir(p) {
  if (!ABERTOS.includes(p.estado) || p.rodando) return false;
  if (!p.dados.envio_fechado || !p.dados.pedido || !p.arquivos.length) return false;
  if (p.arquivos.some((a) => a.estado !== 'analisado')) return false;
  p.rodando = true;
  rodarVersao(p).finally(() => { p.rodando = false; });
  return true;
}

async function etapa(p, nome, alvo, mensagens) {
  emitir(p.id, 'etapa_inicio', { etapa: nome, alvo, mensagem: mensagens[0] });
  for (let i = 1; i < mensagens.length; i++) {
    await dormir(PASSO);
    emitir(p.id, 'etapa_progresso', { etapa: nome, alvo, progresso: i / mensagens.length, mensagem: mensagens[i] });
  }
  await dormir(PASSO);
  emitir(p.id, 'etapa_fim', { etapa: nome, alvo, progresso: 1, mensagem: `${mensagens[0].replace(/…$/, '')}: pronto` });
}

async function rodarVersao(p) {
  const n = p.versoes.length + 1;
  const v = `v${n}`;
  mudarEstado(p, 'dirigindo', 'O diretor está lendo o catálogo e o pedido.');
  await etapa(p, 'catalogo', null, ['Montando o catálogo compacto…', `${p.arquivos.length} arquivo(s), falas e momentos em texto curto`]);
  await etapa(p, 'direcao', null, ['Direção: escolhendo gancho, falas e ritmo…', 'Crítico conferindo a direção', 'Resolvendo a direção em EDL']);
  const versao = { id: v, estado: 'montando', video: null, qa: null, link: null, reprovacao: null, criado: agora() };
  p.versoes.push(versao);
  mudarEstado(p, 'montando', `Montando a versão ${v}.`);
  await etapa(p, 'montagem', v, ['Cortando os planos…', 'Planos 1080x1920 prontos (12 de 12)', 'Legendas e motion renderizados', 'Mix: voz, trilha com ducking e tom de sala']);
  const chave = `saidas/${p.id}/${v}/final.mp4`;
  const destino = path.join(ARM, chave);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try { fs.rmSync(destino, { force: true }); fs.linkSync(AMOSTRA, destino); } catch { fs.copyFileSync(AMOSTRA, destino); }
  versao.video = chave;
  mudarEstado(p, 'conferindo', `Conferindo a versão ${v} (QA automático).`);
  await etapa(p, 'qa', v, ['Conferindo LUFS, pico, quadros pretos e zona segura…', 'Transcrevendo o mix e o tom de sala']);
  versao.qa = JSON.stringify({
    versao: '1', projeto: p.id, video: chave, aprovado: true, tempo_s: 41,
    checagens: [
      { id: 'lufs', ok: true, bloqueia: true, valor: -14.1 },
      { id: 'true_peak', ok: true, bloqueia: true, valor: -1.4 },
      { id: 'frase_repetida', ok: true, bloqueia: true },
      { id: 'tom_sala_sem_voz', ok: true, bloqueia: true },
      { id: 'quadros_pretos', ok: true, bloqueia: true },
      { id: 'zona_segura', ok: true, bloqueia: true },
      { id: 'formato', ok: true, bloqueia: true, valor: '1080x1920 30fps H.264' },
    ],
  });
  versao.estado = 'aprovada_qa';
  emitir(p.id, 'versao_pronta', { alvo: v, mensagem: `Versão ${v} pronta e aprovada no QA.` });
  await etapa(p, 'entrega', v, ['Gerando link e capa…']);
  versao.estado = 'entregue';
  versao.link = `/v1/arquivos/${chave}`;
  p.estado = 'entregue';
  emitir(p.id, 'entregue', { alvo: v, estado: 'entregue', mensagem: `Versão ${v} entregue.`, dados: { video: chave } });
}

// ---------- HTTP ----------
function json(res, status, corpo) {
  const b = Buffer.from(JSON.stringify(corpo));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length });
  res.end(b);
}
const falha = (res, status, detail) => json(res, status, { detail });

function lerCorpo(req) {
  return new Promise((ok, erro) => {
    let t = 0; const partes = [];
    req.on('data', (c) => { t += c.length; if (t > 1e6) { erro(new Error('grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { ok(null); } });
    req.on('error', erro);
  });
}

function chaveValida(chave) {
  if (!chave || chave.length > 512 || chave.startsWith('/') || chave.includes('\\') || /[\x00-\x1f]/.test(chave)) return false;
  return chave.split('/').every((p) => p && p !== '.' && p !== '..');
}

function verProjeto(p) {
  const { rodando, ...resto } = p;
  return { ...resto, arquivos: p.arquivos.map((a) => ({ ...a })), versoes: p.versoes.map((v) => ({ ...v })), jobs: [] };
}

function servirArquivo(req, res, chave) {
  if (!chaveValida(chave)) return falha(res, 422, 'chave inválida');
  const f = path.join(ARM, chave);
  if (!f.startsWith(ARM + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return falha(res, 404, 'arquivo não encontrado');
  // igual ao motor real: vídeo de versão só sai depois de entregue (QA aprovado)
  const ms = /^saidas\/([^/]+)\/([^/]+)\/(final\.mp4|mix\.wav|stems\/.*|capa\.jpg)$/.exec(chave);
  if (ms) {
    const ver = projetos.get(ms[1])?.versoes.find((x) => x.id === ms[2]);
    if (!ver || ver.estado !== 'entregue') return falha(res, 403, 'esta versão ainda não passou na conferência automática (QA)');
  }
  const tam = fs.statSync(f).size;
  const tipo = f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.json') ? 'application/json' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let ini = 0, fim = tam - 1, status = 200;
  if (m && (m[1] || m[2])) {
    if (m[1]) { ini = Number(m[1]); fim = m[2] ? Math.min(Number(m[2]), tam - 1) : tam - 1; }
    else { ini = Math.max(0, tam - Number(m[2])); }
    if (ini > fim || ini >= tam) { res.writeHead(416, { 'content-range': `bytes */${tam}` }); return res.end(); }
    status = 206;
  }
  const h = { 'content-type': tipo, 'accept-ranges': 'bytes', 'content-length': fim - ini + 1, 'cache-control': 'private, max-age=60' };
  if (status === 206) h['content-range'] = `bytes ${ini}-${fim}/${tam}`;
  res.writeHead(status, h);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f, { start: ini, end: fim }).pipe(res);
}

function sse(req, res, pid, url) {
  const depois = Number(url.searchParams.get('depois') || 0);
  const ultimo = Number(req.headers['last-event-id'] || 0);
  const seguir = url.searchParams.get('seguir') !== 'false';
  let cursor = Math.max(depois || 0, ultimo || 0);
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n');
  let ping = Date.now();
  const tick = () => {
    for (const e of eventos) {
      if (e.projeto === pid && e.id > cursor) {
        cursor = e.id;
        res.write(`id: ${e.id}\nevent: ${e.tipo}\ndata: ${JSON.stringify(e)}\n\n`);
      }
    }
    if (!seguir) { clearInterval(t); res.end(); return; }
    if (Date.now() - ping > 15000) { ping = Date.now(); res.write(': ping\n\n'); }
  };
  const t = setInterval(tick, 250);
  tick();
  req.on('close', () => clearInterval(t));
}

async function rotear(req, res) {
  const url = new URL(req.url, 'http://motor');
  const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return falha(res, 401, 'token do motor inválido');
  if (partes[0] !== 'v1') return falha(res, 404, 'rota não encontrada');
  const [, r1, pid, r3, r4, r5] = partes;
  const M = req.method;

  if (r1 === 'saude' && M === 'GET') return json(res, 200, { ok: true, falso: true, provedores: { armazenamento: 'local', transcricao: 'falso', visao: 'falso', cerebro: 'fixture', render: 'falso', publicacao: 'nenhuma' } });
  if (r1 === 'arquivos' && (M === 'GET' || M === 'HEAD')) return servirArquivo(req, res, partes.slice(2).join('/'));
  if (r1 === 'memoria' && M === 'GET') return json(res, 200, memoriaDaCasa());
  if (r1 !== 'projetos') return falha(res, 404, 'rota não encontrada');

  if (!pid) {
    if (M === 'GET') {
      const lista = [...projetos.values()].sort((a, b) => b.atualizado.localeCompare(a.atualizado))
        .map((p) => ({ id: p.id, nome: p.nome, estado: p.estado, tipo_video: p.tipo_video, criado: p.criado, atualizado: p.atualizado, arquivos: p.arquivos.length }));
      return json(res, 200, lista);
    }
    if (M === 'POST') {
      const c = await lerCorpo(req);
      const nome = String(c?.nome ?? '').split(/\s+/).filter(Boolean).join(' ');
      if (!nome || nome.length > 120) return falha(res, 422, 'nome entre 1 e 120 caracteres');
      const tipo = c?.tipo_video ?? 'auto';
      if (!TIPOS.includes(tipo)) return falha(res, 422, `tipo_video deve ser um de ${TIPOS.join(', ')}`);
      const id = 'p_' + randomBytes(5).toString('hex');
      const p = { id, nome, estado: 'recebendo', tipo_video: tipo, criado: agora(), atualizado: agora(), dados: {}, arquivos: [], versoes: [], rodando: false };
      projetos.set(id, p);
      emitir(id, 'projeto_criado', { estado: 'recebendo', mensagem: `Projeto criado: ${nome}` });
      return json(res, 201, verProjeto(p));
    }
    return falha(res, 405, 'método não permitido');
  }

  const p = projetos.get(pid);
  if (!p) return falha(res, 404, 'projeto não encontrado');
  if (!r3 && M === 'GET') return json(res, 200, verProjeto(p));
  if (r3 === 'eventos' && M === 'GET') return sse(req, res, pid, url);
  if (r3 === 'versoes' && !r4 && M === 'GET') return json(res, 200, p.versoes);
  if (M !== 'POST') return falha(res, 405, 'método não permitido');
  const c = await lerCorpo(req);
  if (c === null) return falha(res, 422, 'JSON inválido');

  if (r3 === 'arquivos') {
    const chave = String(c.chave ?? '');
    if (!chaveValida(chave)) return falha(res, 422, 'chave inválida');
    if (!chave.startsWith(`entrada/${pid}/`)) return falha(res, 422, `a chave precisa começar com entrada/${pid}/`);
    if (!ABERTOS.includes(p.estado)) return falha(res, 409, 'o projeto já está em direção/montagem; crie uma nova versão para mandar material novo');
    const f = path.join(ARM, chave);
    if (!fs.existsSync(f)) return falha(res, 409, 'o arquivo ainda não chegou ao armazenamento (termine o envio antes)');
    const real = fs.statSync(f).size;
    if (c.bytes && Number(c.bytes) !== real) return falha(res, 409, `tamanho não confere: o envio diz ${c.bytes} bytes, o armazenamento tem ${real}`);
    const existente = p.arquivos.find((a) => a.chave === chave);
    if (existente) return json(res, 201, { id: existente.id, novo: false, chave, bytes: real });
    const a = { id: `a${String(p.arquivos.length + 1).padStart(3, '0')}`, nome: String(c.nome ?? 'arquivo').slice(0, 255), chave, bytes: real, estado: 'recebido', criado: agora() };
    p.arquivos.push(a);
    lerArquivo(p, a);
    return json(res, 201, { id: a.id, novo: true, chave, bytes: real });
  }
  if (r3 === 'importar') {
    const u = String(c.url ?? '').trim();
    let host = '';
    try { host = new URL(u).hostname; } catch { /* inválido */ }
    if (!/(^|\.)dropbox\.com$|(^|\.)drive\.google\.com$|(^|\.)dropboxusercontent\.com$/.test(host)) return falha(res, 422, 'mande um link compartilhado do Dropbox ou do Google Drive');
    if (!ABERTOS.includes(p.estado)) return falha(res, 409, 'o projeto já está em direção/montagem');
    const a = { id: `a${String(p.arquivos.length + 1).padStart(3, '0')}`, nome: 'importando do link…', chave: null, bytes: 0, estado: 'recebido', criado: agora() };
    p.arquivos.push(a);
    (async () => { await dormir(PASSO); a.nome = decodeURIComponent(u.split('/').pop()?.split('?')[0] || 'arquivo-importado.mp4'); a.bytes = 1; await lerArquivo(p, a); })();
    return json(res, 202, { id: a.id, mensagem: 'Importação na fila: o motor baixa e já começa a ler.' });
  }
  if (r3 === 'fechar-envio') {
    if (!p.arquivos.length) return falha(res, 409, 'nenhum arquivo enviado ainda');
    p.dados.envio_fechado = true;
    p.dados.envio_fechado_em = agora();
    const dirigindo = tentarDirigir(p);
    if (!dirigindo && p.estado === 'recebendo') mudarEstado(p, 'lendo', `Envio fechado (${p.arquivos.length} arquivo(s)). Falta ${p.dados.pedido ? 'terminar a leitura' : 'o pedido'}.`);
    return json(res, 200, { envio_fechado: true, dirigindo, arquivos: p.arquivos.length });
  }
  if (r3 === 'pedido') {
    const texto = String(c.texto ?? '').trim();
    if (!texto && !c.audio_chave) return falha(res, 422, 'mande o pedido em texto ou a chave do áudio gravado');
    if (texto.length > 4000) return falha(res, 422, 'pedido longo demais (até 4000 caracteres)');
    if (c.duracao_alvo != null && (Number(c.duracao_alvo) < 5 || Number(c.duracao_alvo) > 600)) return falha(res, 422, 'duração alvo entre 5 e 600 s');
    if (c.modo != null && !['auto', 'criativo', 'ultra', 'cinema', 'ia', 'clean', 'serio', 'fala'].includes(c.modo)) return falha(res, 422, 'modo inválido');
    p.dados.pedido = { texto: texto.slice(0, 200), tipo_video: c.tipo_video ?? 'auto', modo: c.modo ?? 'auto' };
    emitir(pid, 'estado', { mensagem: 'Pedido recebido.', dados: { pedido: texto.slice(0, 200) } });
    const dirigindo = tentarDirigir(p);
    return json(res, 201, { pedido: { versao: '1', projeto: pid, texto }, dirigindo });
  }
  if (r3 === 'versoes' && r4 && r5 === 'reprovar') {
    const v = p.versoes.find((x) => x.id === r4);
    if (!v) return falha(res, 404, 'versão não encontrada');
    const motivo = String(c.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 1000) return falha(res, 422, 'motivo entre 3 e 1000 caracteres');
    v.estado = 'reprovada';
    v.reprovacao = motivo;
    emitir(pid, 'estado', { mensagem: `Versão ${v.id} reprovada: ${motivo.slice(0, 120)}. Virou regra da casa.` });
    p.estado = 'lendo';
    setTimeout(() => tentarDirigir(p), PASSO);
    return json(res, 200, { regra: { id: `r_${Date.now()}`, texto: motivo }, checagem: null, nova_direcao: true });
  }
  if (r3 === 'versoes' && r4 && r5 === 'publicar') return json(res, 202, { mensagem: 'Publicação desligada neste motor (provedor nenhuma).' });
  return falha(res, 404, 'rota não encontrada');
}

fs.mkdirSync(ARM, { recursive: true });
try { garantirAmostra(); } catch { semTexto(); }
http.createServer((req, res) => {
  rotear(req, res).catch((e) => { if (!res.headersSent) falha(res, 500, String(e?.message || e)); else res.end(); });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`motor falso em http://127.0.0.1:${PORTA} · armazenamento ${ARM} · passo ${PASSO} ms`);
});

// Memória da casa lida direto de projetos/editor-creat/memoria (a mesma que o motor real usa).
function memoriaDaCasa() {
  const raiz = new URL('../../../memoria/', import.meta.url);
  const ler = (n, padrao) => { try { return JSON.parse(fs.readFileSync(new URL(n, raiz), 'utf8')); } catch { return padrao; } };
  const r = ler('regras.json', { regras: [], vocabulario: [] });
  const ordem = ['criativo', 'ultra', 'cinema', 'ia', 'clean', 'serio', 'fala'];
  return { regras: r.regras ?? [], vocabulario: r.vocabulario ?? [], checagens: ler('checagens.json', { checagens: [] }).checagens ?? [],
    modelos: [], modos: ordem.map((m) => ler(`modos/${m}.json`, null)).filter(Boolean), raiz_isolada: false };
}
