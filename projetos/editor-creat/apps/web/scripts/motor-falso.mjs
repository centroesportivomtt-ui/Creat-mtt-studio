#!/usr/bin/env node
// Motor falso do Editor creat.MTT: mesma API HTTP da ARQUITETURA §4.6, com estados simulados.
// Serve para a frente D (site) andar e ser testada sem depender das frentes A, B e C.
//   EDITOR_DADOS=/caminho MOTOR_TOKEN=xyz node scripts/motor-falso.mjs   (porta MOTOR_FALSO_PORTA, padrão 8788)
// Lê e grava no mesmo armazenamento local que o site ($EDITOR_DADOS/armazenamento), como o motor real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

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
// links de aprovação do cliente: igual ao motor real, só o sha256 do token fica guardado
const LINKS = [];
const hashTok = (t) => createHash('sha256').update(t).digest('hex');
function linkDono(l) { const { hash, ...d } = l; return { ...d, ativo: !l.revogado && l.expira > agora() }; }
function linkPublico(tok) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(tok ?? '')) return { status: 404 };
  const l = LINKS.find((x) => x.hash === hashTok(tok));
  if (!l) return { status: 404 };
  const v = projetos.get(l.projeto)?.versoes.find((x) => x.id === l.versao);
  if (l.revogado || l.expira <= agora() || !v || v.estado !== 'entregue') return { status: 410, l };
  return { status: 200, l, v };
}

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

// Revisão da cor simulada (mesmo formato do motor real: saidas/<p>/<v>/cor.json + cor/<plano>_{antes,depois}.jpg).
function gravarCorFalsa(pid, v) {
  const base = `saidas/${pid}/${v}`;
  const dir = path.join(ARM, base, 'cor');
  fs.mkdirSync(dir, { recursive: true });
  const itens = [];
  for (const [i, plano] of ['p1', 'p2'].entries()) {
    for (const [lado, filtro] of [['antes', 'eq=saturation=0.7:brightness=-0.06'], ['depois', 'eq=saturation=1.1:contrast=1.08']]) {
      spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(1 + i * 2), '-i', AMOSTRA, '-frames:v', '1', '-vf', `scale=270:480,${filtro}`,
        path.join(dir, `${plano}_${lado}.jpg`)]);
    }
    const hist = Array.from({ length: 32 }, (_, k) => Number((Math.exp(-((k - 14 - i * 3) ** 2) / 40) / 11).toFixed(4)));
    itens.push({ plano, t0: i * 2.5, t1: (i + 1) * 2.5, look: 'loja', look_nome: 'Interno de loja', balanco: { ganho: [1.04, 1, 0.95], exp: 1.08 },
      antes: { p50: 0.38, estouro: 0.004, esmagado: 0.01, pele: { angulo: 128.0 }, hist },
      depois: { p50: 0.46, estouro: 0.006, esmagado: 0.012, pele: { angulo: 126.5 }, hist: [...hist.slice(2), 0, 0] },
      antes_chave: `${base}/cor/${plano}_antes.jpg`, depois_chave: `${base}/cor/${plano}_depois.jpg` });
  }
  fs.writeFileSync(path.join(ARM, base, 'cor.json'), JSON.stringify(itens));
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
  gravarCorFalsa(p.id, v);
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
      { id: 'voz_externa', ok: false, bloqueia: false, detalhe: '[em observação, ainda não segura a entrega] 1 fala de outra voz na peça: V3 aos 6.6 s «vai de novo» (semelhança 0.30)' },
      { id: 'olho_ia', ok: true, bloqueia: true, detalhe: 'custo US$ 0.12 · o Claude olhou 6 imagem(ns) e não achou defeito que segure a entrega' },
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
  const ms = /^saidas\/([^/]+)\/([^/]+)\/(final\.mp4|mix\.wav|stems\/.*|capa\.jpg|cor\.json|cor\/.*)$/.exec(chave);
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
  if (r1 === 'referencias' && M === 'GET') return json(res, 200, { andamento: [], referencias: REFS });
  if (r1 === 'referencias' && M === 'POST') {
    const c = (await lerCorpo(req)) ?? {};
    const url = String(c?.url ?? '').trim();
    if (!/^https:\/\/([a-z0-9-]+\.)*(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|dropbox\.com|drive\.google\.com|vimeo\.com)\//i.test(url)) return falha(res, 422, 'link não reconhecido');
    REFS.unshift({ id: `ref_${REFS.length + 1}`, url, autor: 'teste', licao: `30 s, 12 planos (plano médio 2.5 s); 1º corte em 1.2 s${c.nota ? '; o dono quer: ' + c.nota : ''}` });
    return json(res, 202, { id: REFS[0].id, estado: 'lendo' });
  }
  if (r1 === 'biblioteca') {
    if (!pid && M === 'GET') return json(res, 200, { ...BIB, tipos_licenca: { propria: 'gravada ou composta pela creat.MTT', comprada: 'biblioteca paga (Artlist, Epidemic, Musicbed…)', gerada_ia: 'gerada por IA em plano que permite uso comercial', livre: 'livre de direitos (CC0, licença Pixabay…)' }, nomes_sfx: ['abre', 'chip', 'cta', 'embaralha', 'impacto', 'risco'], andamento: [] });
    if (!pid && M === 'POST') {
      const c = (await lerCorpo(req)) ?? {};
      if (!c.licenca || c.licenca.uso_comercial !== true || !String(c.licenca.fonte ?? '').trim()) return falha(res, 422, 'não registro som sem licença válida');
      if (!/^https:\/\/([a-z0-9-]+\.)*(dropbox\.com|drive\.google\.com)\//.test(String(c.url ?? ''))) return falha(res, 422, 'Link não aceito: use um link https compartilhado do Dropbox ou do Google Drive.');
      const item = { id: c.tipo === 'sfx' ? c.nome : 'mercado-em-festa', tipo: c.tipo, titulo: c.titulo, dur: c.tipo === 'sfx' ? 0.8 : 62.4, bpm: c.tipo === 'sfx' ? undefined : 124,
        clima: c.clima ?? null, ativo: true, licenca: { ...c.licenca }, pode_tocar: true, problema: null };
      (c.tipo === 'sfx' ? BIB.sfx : BIB.trilhas).push(item);
      return json(res, 202, { id: 'x', estado: 'entrando' });
    }
    return falha(res, 404, 'rota não encontrada');
  }
  if (r1 === 'gastos' && M === 'GET') {
    const mes = url.searchParams.get('mes') || agora().slice(0, 7);
    const ultimas = [
      { quando: `${mes}-19T20:00:00Z`, o_que: 'olho_ia', projeto: 'p_teste', versao: 'v1', modelo: 'claude-opus-5-5', custo_usd: 0.12 },
      { quando: `${mes}-19T19:41:00Z`, o_que: 'olho_ia_autoteste', projeto: null, versao: null, modelo: 'claude-opus-5-5', custo_usd: 0.024 },
      { quando: `${mes}-03T10:00:00Z`, o_que: 'direcao', projeto: 'p_teste', versao: 'v1', modelo: 'claude-opus-5-5', custo_usd: 0.234 },
    ];
    return json(res, 200, { mes, meses: [mes], total_usd: 0.378, chamadas: 3, estimado_usd: 0,
      por_servico: [{ id: 'anthropic', custo_usd: 0.378, chamadas: 3 }],
      por_tipo: [{ id: 'direcao', nome: 'direção do filme', custo_usd: 0.234, chamadas: 1 }, { id: 'olho_ia', nome: 'olho de IA (revisão)', custo_usd: 0.12, chamadas: 1 },
        { id: 'olho_ia_autoteste', nome: 'autoteste do olho de IA', custo_usd: 0.024, chamadas: 1 }],
      por_projeto: [{ id: 'p_teste', nome: 'Reel de teste', custo_usd: 0.354, chamadas: 2 }, { id: 'sem projeto', custo_usd: 0.024, chamadas: 1 }],
      por_dia: [], ultimas, fora_do_editor: 'ElevenLabs e Higgsfield usados pelas sessões de trabalho não passam por aqui.' });
  }
  if (r1 === 'backup') {      // mesmo contrato do motor real: nunca devolve o endereço, só se existe
    if (!pid && M === 'GET') return json(res, 200, BACKUP);
    if (pid === 'config' && M === 'POST') {
      const c = (await lerCorpo(req)) ?? {};
      if (!/^https:\/\/www\.dropbox\.com\/request\/[A-Za-z0-9]{8,40}$/.test(String(c?.pedido ?? '').trim())) return falha(res, 422, 'endereço não reconhecido: cole o link da solicitação de arquivos (https://www.dropbox.com/request/...)');
      BACKUP.destino = 'configurado';
      return json(res, 200, BACKUP);
    }
    if (pid === 'rodar' && M === 'POST') {
      Object.assign(BACKUP, { estado: 'ok', ultimo_ok: agora(), bytes: 25014, arquivos: 22, horas_desde_o_ultimo: 0, midia_fora: { arquivos: 7, bytes: 15304535 } });
      return json(res, 202, { ...BACKUP, estado: 'rodando' });
    }
    return falha(res, 404, 'rota não encontrada');
  }
  if (r1 === 'cliente') {             // página pública (o site chama do servidor dele)
    const { status, l, v } = linkPublico(pid);
    if (status === 404) return falha(res, 404, 'link não encontrado');
    if (status === 410) return falha(res, 410, 'este link venceu ou foi trocado; peça um novo a quem te mandou');
    if (!r3 && M === 'GET') {
      if (url.searchParams.get('contar') !== 'false') { if (l.vistas === 0) emitir(l.projeto, 'cliente', { mensagem: `O cliente abriu o link da ${l.versao}.` }); l.vistas += 1; l.visto_em = agora(); }
      return json(res, 200, { titulo: l.titulo, versao: l.versao, expira: l.expira, resposta: l.resposta, texto: l.resposta ? l.texto : null, respondido: l.respondido, pode_responder: !l.resposta && l.tentativas < 6, capa: fs.existsSync(path.join(ARM, 'saidas', l.projeto, l.versao, 'capa.jpg')) });
    }
    if ((r3 === 'video' || r3 === 'capa') && (M === 'GET' || M === 'HEAD')) return servirArquivo(req, res, r3 === 'video' ? v.video : `saidas/${l.projeto}/${l.versao}/capa.jpg`);
    if (r3 === 'responder' && M === 'POST') {
      const c = (await lerCorpo(req)) ?? {};
      if (!['aprovar', 'ajuste'].includes(c.acao) || String(c.texto ?? '').length > 600 || String(c.nome ?? '').length > 60) return falha(res, 422, 'resposta inválida');
      if (l.resposta) return falha(res, 409, 'a resposta deste link já foi enviada');
      if (l.tentativas >= 6) return falha(res, 429, 'muitas tentativas neste link; fale com quem te mandou');
      l.tentativas += 1;
      const texto = String(c.texto ?? '').replace(/[ \t]+/g, ' ').trim();
      if (c.acao === 'ajuste' && texto.length < 3) return falha(res, 422, 'escreva em poucas palavras o que quer ajustar');
      Object.assign(l, { resposta: c.acao, texto: texto || null, nome: String(c.nome ?? '').trim().slice(0, 60) || null, respondido: agora() });
      emitir(l.projeto, 'cliente', { mensagem: c.acao === 'aprovar' ? `O cliente aprovou a ${l.versao}.` : `O cliente pediu ajuste na ${l.versao}: “${texto}”` });
      return json(res, 200, { resposta: l.resposta, respondido: l.respondido });
    }
    return falha(res, 404, 'rota não encontrada');
  }
  if (r1 === 'clientes') {
    if (!pid && M === 'GET') return json(res, 200, { respostas: LINKS.filter((l) => l.resposta).map((l) => ({ ...linkDono(l), projeto_nome: projetos.get(l.projeto)?.nome ?? null })).reverse() });
    const l = LINKS.find((x) => x.id === pid);
    if (!l) return falha(res, 404, 'link não encontrado');
    if (r3 === 'revogar' && M === 'POST') { if (!l.revogado) { l.revogado = agora(); emitir(l.projeto, 'cliente', { mensagem: `Link do cliente da ${l.versao} desligado.` }); } return json(res, 200, linkDono(l)); }
    if (r3 === 'tratar' && M === 'POST') { if (!l.resposta) return falha(res, 404, 'pedido não encontrado'); l.tratado = l.tratado || agora(); return json(res, 200, linkDono(l)); }
    return falha(res, 404, 'rota não encontrada');
  }
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
  if (r3 === 'links-cliente' && M === 'GET') return json(res, 200, { links: LINKS.filter((l) => l.projeto === pid).map(linkDono).reverse() });
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
    // como o motor de verdade (importar.sondar): link restrito da equipe é recusado NA HORA, com o passo a passo
    if (/restrito/.test(u)) return falha(res, 422, 'Esse link do Dropbox só abre para quem está logado (link restrito da equipe). No app do Dropbox: Compartilhar > Configurações do link > "Qualquer pessoa com o link" > Copiar link, e cole aqui de novo.');
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
    p.dados.pedido.respostas = { formato: c.formato ?? null, destino: c.destino ?? null, obrigatorio: c.obrigatorio ?? [], proibido: c.proibido ?? [] };
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
  if (r3 === 'versoes' && r4 && r5 === 'aprovar') {
    const v = p.versoes.find((x) => x.id === r4);
    if (!v) return falha(res, 404, 'versão não encontrada');
    if (v.estado !== 'entregue') return falha(res, 409, 'só dá para aprovar versão entregue (conferida pelo QA)');
    p.dados.aprovadas = { ...(p.dados.aprovadas ?? {}), [v.id]: { em: agora(), nota: c.nota ?? null } };
    emitir(pid, 'estado', { mensagem: `Corta! Versão ${v.id} aprovada. Virou caso de referência da casa.` });
    return json(res, 200, { aprovada: v.id, caso: `${pid}-${v.id}` });
  }
  if (r3 === 'versoes' && r4 && r5 === 'link-cliente') {
    const v = p.versoes.find((x) => x.id === r4);
    if (!v) return falha(res, 404, 'versão não encontrada');
    if (v.estado !== 'entregue') return falha(res, 409, 'só gero link de versão entregue (conferida pelo QA)');
    const dias = Number(c.dias ?? 7);
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) return falha(res, 422, 'dias entre 1 e 30');
    if (c.titulo != null && String(c.titulo).length > 80) return falha(res, 422, 'título com até 80 caracteres');
    for (const l of LINKS) if (l.projeto === pid && l.versao === v.id && !l.revogado) l.revogado = agora();
    const token = randomBytes(32).toString('base64url');
    const l = { id: 'lc_' + randomBytes(6).toString('hex'), hash: hashTok(token), projeto: pid, versao: v.id, titulo: String(c.titulo ?? '').trim() || p.nome, criado: agora(),
      expira: new Date(Date.now() + dias * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z'), revogado: null, vistas: 0, visto_em: null, tentativas: 0,
      resposta: null, texto: null, nome: null, respondido: null, tratado: null };
    LINKS.push(l);
    emitir(pid, 'cliente', { mensagem: `Link de aprovação da ${v.id} gerado para o cliente (vale ${dias} dias).` });
    return json(res, 201, { id: l.id, token, caminho: `/c/${token}`, expira: l.expira, versao: v.id, titulo: l.titulo });
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

const REFS = [];
const BACKUP = { destino: 'falta configurar', estado: 'nunca rodou' };
const BIB = { trilhas: [], sfx: [] };

// Memória da casa lida direto de projetos/editor-creat/memoria (a mesma que o motor real usa).
function memoriaDaCasa() {
  const raiz = new URL('../../../memoria/', import.meta.url);
  const ler = (n, padrao) => { try { return JSON.parse(fs.readFileSync(new URL(n, raiz), 'utf8')); } catch { return padrao; } };
  const r = ler('regras.json', { regras: [], vocabulario: [] });
  const ordem = ['criativo', 'ultra', 'cinema', 'ia', 'clean', 'serio', 'fala'];
  return { regras: r.regras ?? [], vocabulario: r.vocabulario ?? [], checagens: (ler('checagens.json', { checagens: [] }).checagens ?? []).map((c) => ([].includes(c.tipo) && c.gravidade === 'bloqueia' ? { ...c, gravidade: 'observacao' } : c)),
    modelos: [], modos: ordem.map((m) => ler(`modos/${m}.json`, null)).filter(Boolean),
    looks: Object.entries(ler('cor/looks.json', { looks: {} }).looks).map(([id, l]) => ({ id, nome: l.nome, desc: l.desc })), raiz_isolada: false };
}
