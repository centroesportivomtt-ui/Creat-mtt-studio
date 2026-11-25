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
  // conversa com o editor (bloco novo, no fim do arquivo): rotas R1 a R8, SSE v2 e as rotas de teste do aceite
  if (r1 === 'conversa' || r1 === '_teste' || (r1 === 'projetos' && pid && (r3 === 'conversa' || (r3 === 'eventos' && url.searchParams.get('v') === '2')))) {
    return rotearConversa(req, res, url, partes);
  }

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
        .map((p) => ({ id: p.id, nome: p.nome, estado: p.estado, tipo_video: p.tipo_video, criado: p.criado, atualizado: p.atualizado, arquivos: p.arquivos.length, espera: CONVERSA.espera.get(p.id)?.tipo ?? null }));
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

// =====================================================================================================================
// Conversa com o editor (bloco novo; docs/plano-conversa-25-11.md, seção 13). Mesmo contrato do motor real
// (services/motor/motor/api/conversa.py e o SSE v2 de api/projetos.py), com um cérebro roteirizado pelo texto do dono:
//   "pergunta"/"gancho" → pergunta com botões · "ajuste" → cartão de ajuste da versão pronta · "pedido" → cartão de troca
//   do pedido · "mostra" → abrir o player num ponto · "erro" → a resposta para com erro · "devagar" → resposta longa
//   (para o Parar) · o resto → "Entendi: …", duas ferramentas e a resposta.
// Rotas /v1/_teste/* só existem aqui (o proxy do site não deixa passar): o aceite usa para semear o gasto do dia,
// desligar a conversa no servidor e simular o motor reiniciando no meio da resposta.
// =====================================================================================================================
const CONVERSA = {
  servidor: process.env.MOTOR_FALSO_CONVERSA !== '0',
  ligada: true,
  teto: 3,
  gasto: 0,
  cmid: new Map(),        // pid|cliente_msg_id -> turno (o mesmo id devolve o mesmo turno)
  espera: new Map(),      // pid -> { tipo, tool_use_id, turno, desde, dados }
  rodando: new Map(),     // pid -> contexto do turno
  rascunho: new Map(),    // pid -> { turno, bloco, texto, v }
  interrompido: new Map(),// pid -> turno com aviso "retomar" ativo
  decididos: new Set(),
  v: 0,
};
const DELTA_MS = Number(process.env.MOTOR_FALSO_DELTA_MS || 100);
const PING_MS = Number(process.env.MOTOR_FALSO_PING_MS || 15000);
const CUSTO_CHAMADA = 0.0352;
const TOKENS = { entrada: 1800, cache_lida: 40000, cache_escrita: 1000, saida: 600 };
const RE_CMID = /^[A-Za-z0-9_-]{8,40}$/;
const RE_TOOL = /^[A-Za-z0-9_-]{1,80}$/;
const novoTurno = () => 't_' + randomBytes(5).toString('hex');
const novaFerramenta = (p) => `toolu_${p}${randomBytes(5).toString('hex')}`;
const emitirC = (pid, tipo, dados) => emitir(pid, tipo, { dados });
const ligadaC = () => CONVERSA.servidor && CONVERSA.ligada;

function estadoChaveC() {
  const ligada = ligadaC();
  const amanha = new Date(Date.now() - 3 * 3600e3);
  amanha.setUTCHours(24 + 3, 0, 0, 0);
  return {
    ligada, ...(ligada ? {} : { motivo: CONVERSA.servidor ? 'desligada_pelo_dono' : 'sem_chave' }),
    teto_usd_dia: CONVERSA.teto, gasto_hoje_usd: +CONVERSA.gasto.toFixed(4), dia_vira_em: amanha.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    esperando: [...CONVERSA.espera].map(([pid, e]) => ({ projeto: pid, nome: projetos.get(pid)?.nome ?? pid, tipo: e.tipo, desde: e.desde })),
  };
}
function instantaneoC(pid) {
  const d = { ligada: ligadaC(), gasto_hoje_usd: +CONVERSA.gasto.toFixed(4), teto_usd_dia: CONVERSA.teto };
  if (!d.ligada) d.motivo = CONVERSA.servidor ? 'desligada_pelo_dono' : 'sem_chave';
  const ctx = CONVERSA.rodando.get(pid);
  if (ctx) { d.turno_rodando = ctx.turno; const r = CONVERSA.rascunho.get(pid); if (r && r.turno === ctx.turno) d.rascunho = { ...r }; }
  const e = CONVERSA.espera.get(pid);
  if (e) d.espera = { tipo: e.tipo, tool_use_id: e.tool_use_id };
  return d;
}

// ---------- o turno roteirizado ----------
function dividir(texto, n) {
  const pedacos = [];
  const tam = Math.max(1, Math.ceil(texto.length / n));
  for (let i = 0; i < texto.length; i += tam) pedacos.push(texto.slice(i, i + tam));
  return pedacos;
}
async function escreverC(pid, ctx, texto, deltas = 20) {
  const bloco = ctx.bloco++;
  const r = { turno: ctx.turno, bloco, texto: '', v: ++CONVERSA.v };
  CONVERSA.rascunho.set(pid, r);
  ctx.chamadas = Math.max(ctx.chamadas, 1);
  for (const p of dividir(texto, deltas)) {
    await dormir(DELTA_MS);
    if (ctx.fechado) return false;
    r.texto += p;
    r.v = ++CONVERSA.v;
  }
  if (ctx.fechado) return false;
  emitirC(pid, 'fala_editor', { turno: ctx.turno, bloco, texto });
  return true;
}
async function ferramentaC(pid, ctx, nome, entrada, resumo, ms = 350) {
  const id = novaFerramenta(nome.slice(0, 3));
  ctx.chamadas += 1;
  emitirC(pid, 'ferramenta', { turno: ctx.turno, tool_use_id: id, nome, fase: 'inicio' });
  await dormir(ms);
  if (ctx.fechado) { emitirC(pid, 'ferramenta', { turno: ctx.turno, tool_use_id: id, nome, fase: 'erro', resumo: 'não executado' }); return false; }
  emitirC(pid, 'ferramenta', { turno: ctx.turno, tool_use_id: id, nome, fase: 'fim', resumo, s: ms / 1000, entrada });
  return true;
}
function fimC(pid, ctx, stop, extra = {}) {
  if (ctx.fechado && stop !== 'parado') return;
  ctx.fechado = true;
  const custo = +(CUSTO_CHAMADA * Math.max(1, ctx.chamadas) * (extra.estimado ? 0.5 : 1)).toFixed(4);
  CONVERSA.gasto += custo;
  emitirC(pid, 'turno_fim', { turno: ctx.turno, stop, custo_usd: custo, s: +((Date.now() - ctx.t0) / 1000).toFixed(1), gasto_hoje_usd: +CONVERSA.gasto.toFixed(4), tokens: TOKENS, ...extra });
  if (CONVERSA.rodando.get(pid) === ctx) CONVERSA.rodando.delete(pid);
  if (CONVERSA.rascunho.get(pid)?.turno === ctx.turno) CONVERSA.rascunho.delete(pid);
}
function versaoPronta(p) {
  const v = [...p.versoes].reverse().find((x) => x.estado !== 'reprovada');
  return v && v.estado === 'entregue' ? v : null;
}
function guardaAjuste(p, versao) {
  const v = p.versoes.find((x) => x.id === versao);
  if (!v || v.estado !== 'entregue') return `a ${versao} ainda não está pronta`;
  if (p.dados.aprovadas?.[versao]) return `a ${versao} já foi aprovada`;
  if (p.versoes[p.versoes.length - 1].id !== versao) return `a ${versao} não é a versão mais nova`;
  if (p.rodando) return 'a mesa está trabalhando agora';
  return null;
}
function guardaPedido(p) {
  if (!ABERTOS.includes(p.estado)) return 'a edição já começou';
  if (p.versoes.length) return 'já existe uma versão';
  if (p.rodando) return 'a mesa está trabalhando agora';
  return null;
}
const hashC = (tid, entrada) => createHash('sha256').update(`${tid}\n${JSON.stringify(entrada)}`).digest('hex');

async function rodarTurnoC(pid, ctx, texto, contexto) {
  const p = projetos.get(pid);
  const t = texto.toLowerCase();
  const tempo = typeof contexto?.t_player === 'number' ? `${Math.floor(contexto.t_player / 60)}:${String(Math.floor(contexto.t_player % 60)).padStart(2, '0')}, ` : '';
  const eco = `Entendi: ${tempo}${texto.replace(/\s+/g, ' ').slice(0, 120).replace(/[.!?…]+$/, '')}.`;
  try {
    if (/erro/.test(t)) {
      if (!(await escreverC(pid, ctx, `${eco} Vou olhar o projeto.`, 6))) return;
      await dormir(200);
      return fimC(pid, ctx, 'erro', { detalhe: 'o Claude não respondeu (529); tente de novo' });
    }
    if (/devagar/.test(t)) {
      const longo = Array.from({ length: 12 }, (_, i) => `Parte ${i + 1}: olhando cada fala com calma para achar o melhor gancho.`).join(' ');
      if (!(await escreverC(pid, ctx, `${eco} ${longo}`, 160))) return;
      return fimC(pid, ctx, 'end_turn');
    }
    if (!(await escreverC(pid, ctx, `${eco} Vou olhar o projeto primeiro.`))) return;
    if (!(await ferramentaC(pid, ctx, 'ver_projeto', {}, `Olhou o projeto: ${p.arquivos.length} vídeo(s), ${p.versoes.length} versão(ões)`))) return;
    if (/pergunta|gancho/.test(t)) {
      const tid = novaFerramenta('per');
      const dados = { turno: ctx.turno, tool_use_id: tid, texto: 'Abro com o gancho da troca de palavra ou com você falando?',
        opcoes: [{ id: 'gancho', rotulo: 'Pelo gancho', efeito: 'abre com FILMAR riscado virando CONTAR' }, { id: 'fala', rotulo: 'Pela sua fala', efeito: 'abre com você apresentando a equipe' }],
        aceita_texto: true, sugestao: 'gancho' };
      CONVERSA.espera.set(pid, { tipo: 'pergunta', tool_use_id: tid, turno: ctx.turno, desde: agora(), dados });
      emitirC(pid, 'pergunta', dados);
      ctx.chamadas += 1;
      return fimC(pid, ctx, 'pausa');
    }
    if (/ajuste/.test(t)) {
      const v = versaoPronta(p);
      const porque = v ? guardaAjuste(p, v.id) : 'ainda não há versão pronta';
      if (porque) {
        await escreverC(pid, ctx, `Ainda não dá para pedir ajuste: ${porque}. Quando a versão ficar pronta, eu preparo o cartão.`);
        return fimC(pid, ctx, 'end_turn');
      }
      const tid = novaFerramenta('aju');
      const entrada = { versao: v.id, o_que_mudar: texto.slice(0, 1000) };
      const dados = { turno: ctx.turno, tool_use_id: tid, acao: 'ajuste', versao: v.id, titulo: `Pedir ajuste da ${v.id}`, texto_exato: entrada.o_que_mudar,
        refaz: ['direcao', 'montagem', 'qa'], comeca_agora: true, custo_usd_est: 0.4, minutos_est: 10, vira_regra: true,
        volta: `A ${v.id} continua guardada. Vira regra da casa, como no botão Pedir ajuste.`, entrada_hash: hashC(tid, entrada) };
      await escreverC(pid, ctx, `Preparei o ajuste da ${v.id.toUpperCase()}. Todo ajuste refaz direção, montagem e conferência e vira regra da casa. Confira o cartão.`, 8);
      CONVERSA.espera.set(pid, { tipo: 'confirmacao', tool_use_id: tid, turno: ctx.turno, desde: agora(), dados, entrada });
      emitirC(pid, 'confirmacao', dados);
      return fimC(pid, ctx, 'pausa');
    }
    if (/pedido/.test(t)) {
      const porque = guardaPedido(p);
      if (porque) {
        await escreverC(pid, ctx, `Não dá para trocar o pedido agora: ${porque}.`);
        return fimC(pid, ctx, 'end_turn');
      }
      const tid = novaFerramenta('ped');
      const entrada = { texto: texto.slice(0, 4000), duracao_alvo: 30 };
      const antes = p.dados.pedido?.texto ?? '';
      const comeca = Boolean(p.dados.envio_fechado && p.arquivos.length && p.arquivos.every((a) => a.estado === 'analisado'));
      const dados = { turno: ctx.turno, tool_use_id: tid, acao: 'pedido', titulo: 'Trocar o pedido', texto_exato: entrada.texto,
        mudancas: [{ campo: 'texto', antes, depois: entrada.texto }, { campo: 'duracao_alvo', antes: '', depois: '30 s' }],
        refaz: comeca ? ['direcao', 'montagem', 'qa'] : [], comeca_agora: comeca, custo_usd_est: 0.4, minutos_est: 10, vira_regra: false,
        volta: 'Dá para trocar de novo antes de a edição começar.', entrada_hash: hashC(tid, entrada) };
      await escreverC(pid, ctx, 'Montei o pedido novo. Confira o antes e o depois no cartão.', 6);
      CONVERSA.espera.set(pid, { tipo: 'confirmacao', tool_use_id: tid, turno: ctx.turno, desde: agora(), dados, entrada });
      emitirC(pid, 'confirmacao', dados);
      return fimC(pid, ctx, 'pausa');
    }
    if (/mostra/.test(t)) {
      const v = versaoPronta(p);
      if (v) {
        if (!(await ferramentaC(pid, ctx, 'mostrar', { versao: v.id, tempo_s: 2 }, 'Abriu no ponto 0:02'))) return;
        emitirC(pid, 'mostrar', { versao: v.id, tempo_s: 2 });
      }
      await escreverC(pid, ctx, v ? `Separei o ponto 0:02 da ${v.id.toUpperCase()}. Toque para ver no player.` : 'Ainda não há filme pronto para mostrar.');
      return fimC(pid, ctx, 'end_turn');
    }
    if (!(await ferramentaC(pid, ctx, 'ver_material', { busca: 'gancho' }, `Leu ${Math.max(3, p.arquivos.length * 4)} trechos`))) return;
    await continuarC(pid, ctx, `Olhei o projeto e o material: **${p.arquivos.length} vídeo(s)** e ${p.versoes.length} versão(ões). Nada mudou no filme; se quiser um ajuste, é só pedir.`);
  } catch (e) {
    fimC(pid, ctx, 'erro', { detalhe: String(e?.message || e).slice(0, 120) });
  }
}
/** Fim normal do turno: responde também ao que o dono mandou enquanto a mesa falava ("na fila"). */
async function continuarC(pid, ctx, texto) {
  if (!(await escreverC(pid, ctx, texto))) return;
  if (ctx.fila.length) {
    const ult = ctx.fila.splice(0).pop();
    if (!(await escreverC(pid, ctx, `Sobre o que você mandou agora (“${ult.slice(0, 80)}”): anotado, entra no próximo passo.`, 6))) return;
  }
  fimC(pid, ctx, 'end_turn');
}
function iniciarC(pid, turno, texto, contexto, continuar) {
  const ctx = { turno, t0: Date.now(), bloco: 0, chamadas: 0, fechado: false, fila: [] };
  CONVERSA.rodando.set(pid, ctx);
  CONVERSA.interrompido.delete(pid);
  (continuar ? continuar(ctx) : rodarTurnoC(pid, ctx, texto, contexto)).catch(() => fimC(pid, ctx, 'erro'));
  return ctx;
}
function proximoBloco(pid, turno) {
  let n = 0;
  for (const e of eventos) if (e.projeto === pid && e.tipo === 'fala_editor' && e.dados?.turno === turno) n = Math.max(n, e.dados.bloco + 1);
  return n;
}

// ---------- SSE v2 ----------
function sseV2(req, res, pid, url) {
  const sem = url.searchParams.get('sem');
  if (sem && !/^[a-z_]+(,[a-z_]+)*$/.test(sem)) return falha(res, 422, 'sem: tipos separados por vírgula, só letras minúsculas e _');
  const fora = new Set((sem ?? '').split(',').filter(Boolean));
  const depois = Number(url.searchParams.get('depois') || 0);
  const ultimo = Number(req.headers['last-event-id'] || 0);
  const seguir = url.searchParams.get('seguir') !== 'false';
  const ate = Math.max(1, Math.min(Number(url.searchParams.get('ate') || 600), 6 * 3600)) * 1000;
  let cursor = Math.max(depois || 0, ultimo || 0);
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n');
  const efemero = (tipo, dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify({ tipo, projeto: pid, dados })}\n\n`);
  const novos = () => {
    for (const e of eventos) {
      if (e.projeto === pid && e.id > cursor) {
        cursor = e.id;
        if (!fora.has(e.tipo)) res.write(`id: ${e.id}\nevent: ${e.tipo}\ndata: ${JSON.stringify(e)}\n\n`);
      }
    }
  };
  novos();
  const inst = instantaneoC(pid);
  let ultimoV = inst.rascunho?.v ?? -1;
  efemero('instantaneo', inst);
  if (!seguir) return res.end();
  const t0 = Date.now();
  let ping = Date.now();
  const t = setInterval(() => {
    novos();
    const ctx = CONVERSA.rodando.get(pid);
    const r = CONVERSA.rascunho.get(pid);
    if (ctx && r && r.turno === ctx.turno && r.v !== ultimoV) { ultimoV = r.v; efemero('rascunho', { ...r }); }
    if (Date.now() - ping > PING_MS) { ping = Date.now(); efemero('ping', { ts: agora() }); }
    if (Date.now() - t0 > ate) { clearInterval(t); res.end(); }
  }, 100);
  req.on('close', () => clearInterval(t));
}

// ---------- rotas ----------
async function rotearConversa(req, res, url, partes) {
  const [, r1, pid, r3, r4] = partes;
  const M = req.method;
  if (r1 === 'conversa') {
    if (M === 'GET') return json(res, 200, estadoChaveC());
    if (M === 'POST') {
      const c = await lerCorpo(req);
      if (typeof c?.ligada !== 'boolean') return falha(res, 422, 'ligada: verdadeiro ou falso');
      if (c.ligada && !CONVERSA.servidor) return falha(res, 409, 'a conversa está desligada no servidor');
      CONVERSA.ligada = c.ligada;
      if (!c.ligada) for (const [p, ctx] of CONVERSA.rodando) pararC(p, ctx);
      return json(res, 200, estadoChaveC());
    }
    return falha(res, 405, 'método não permitido');
  }
  if (r1 === '_teste') {
    const c = (await lerCorpo(req)) ?? {};
    if (pid === 'conversa') {
      if (typeof c.gasto === 'number') CONVERSA.gasto = c.gasto;
      if (typeof c.servidor === 'boolean') CONVERSA.servidor = c.servidor;
      if (typeof c.ligada === 'boolean') CONVERSA.ligada = c.ligada;
      return json(res, 200, estadoChaveC());
    }
    if (pid === 'interromper' && projetos.has(r3)) {
      // como o motor real no boot (reconciliar_conversas): turno aberto ganha turno_fim "erro" e um aviso "retomar"
      const ctx = CONVERSA.rodando.get(r3);
      let turno = ctx?.turno;
      if (ctx) { ctx.fechado = true; CONVERSA.rodando.delete(r3); CONVERSA.rascunho.delete(r3); }
      if (!turno) turno = [...eventos].reverse().find((e) => e.projeto === r3 && e.tipo === 'fala_dono')?.dados?.turno;
      if (!turno) return falha(res, 409, 'nenhum turno para interromper');
      emitirC(r3, 'turno_fim', { turno, stop: 'erro', custo_usd: 0.06, estimado: true, s: 0, gasto_hoje_usd: +(CONVERSA.gasto += 0.06).toFixed(4), detalhe: 'o motor reiniciou no meio da resposta', tokens: { entrada: 0, cache_lida: 0, cache_escrita: 7500, saida: 0 } });
      emitirC(r3, 'aviso', { acao: 'retomar', turno });
      CONVERSA.interrompido.set(r3, turno);
      return json(res, 200, { turno });
    }
    return falha(res, 404, 'rota não encontrada');
  }
  const p = projetos.get(pid);
  if (!p) return falha(res, 404, 'projeto não encontrado');
  if (r3 === 'eventos' && M === 'GET') return sseV2(req, res, pid, url);
  if (M !== 'POST') return falha(res, 405, 'método não permitido');

  if (r4 === 'audio') {
    const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'].includes(tipo)) return falha(res, 415, 'formato de áudio não aceito');
    let total = 0;
    try { for await (const pedaco of req) { total += pedaco.length; if (total > 950000) return falha(res, 413, 'grave até 1 minuto'); } } catch { return falha(res, 422, 'não entendi, grave de novo'); }
    if (total < 200) return falha(res, 422, 'não entendi, grave de novo');
    const tid = 'au_' + randomBytes(5).toString('hex');
    const t0 = Date.now();
    emitirC(pid, 'ferramenta', { turno: null, tool_use_id: tid, nome: 'ouvir_audio', fase: 'inicio' });
    await dormir(Number(process.env.MOTOR_FALSO_OUVIR_MS || 700));
    const s_audio = Math.max(1, Math.round(total / 16000));
    emitirC(pid, 'ferramenta', { turno: null, tool_use_id: tid, nome: 'ouvir_audio', fase: 'fim', resumo: `Ouviu ${s_audio} s`, s: +((Date.now() - t0) / 1000).toFixed(2) });
    return json(res, 200, { texto: 'Corta o silêncio do começo e abre com a minha fala mais forte.', conf: 0.91, s_audio, s: +((Date.now() - t0) / 1000).toFixed(2) });
  }

  const c = await lerCorpo(req);
  if (c === null) return falha(res, 422, 'JSON inválido');
  if (!r4) {                                                     // R3: o dono manda uma mensagem
    const texto = typeof c.texto === 'string' ? c.texto.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim() : '';
    if (!texto || texto.length > 4000) return falha(res, 422, 'mensagem entre 1 e 4000 caracteres');
    if (!RE_CMID.test(String(c.cliente_msg_id ?? ''))) return falha(res, 422, 'cliente_msg_id inválido');
    if (c.via != null && !['texto', 'audio'].includes(c.via)) return falha(res, 422, 'via: texto ou audio');
    if (c.contexto?.versao != null && !/^v[0-9]{1,3}$/.test(c.contexto.versao)) return falha(res, 422, 'contexto.versao: vN');
    const chave = `${pid}|${c.cliente_msg_id}`;
    if (CONVERSA.cmid.has(chave)) return json(res, 202, { turno: CONVERSA.cmid.get(chave), na_fila: false });
    if (!ligadaC()) return falha(res, 503, 'a conversa está desligada');
    if (CONVERSA.gasto >= CONVERSA.teto - 1e-9) return falha(res, 429, `chegou no teto de hoje (US$ ${CONVERSA.teto.toFixed(2).replace('.', ',')}); a conversa volta à meia-noite`);
    const via = c.via ?? 'texto';
    const contexto = c.contexto && typeof c.contexto === 'object' ? c.contexto : undefined;
    const rodando = CONVERSA.rodando.get(pid);
    if (rodando) {
      CONVERSA.cmid.set(chave, rodando.turno);
      rodando.fila.push(texto);
      emitirC(pid, 'fala_dono', { turno: rodando.turno, texto, via, ...(contexto ? { contexto } : {}), na_fila: true });
      return json(res, 202, { turno: rodando.turno, na_fila: true });
    }
    const esp = CONVERSA.espera.get(pid);
    if (esp) {                                                  // mensagem livre responde a pergunta ou cancela o cartão
      CONVERSA.espera.delete(pid);
      CONVERSA.decididos.add(esp.tool_use_id);
      if (esp.tipo === 'pergunta') emitirC(pid, 'resposta', { tool_use_id: esp.tool_use_id, tipo: 'pergunta', texto: texto.slice(0, 1000), por: 'mensagem' });
      else emitirC(pid, 'resposta', { tool_use_id: esp.tool_use_id, tipo: 'confirmacao', sim: false, resultado: 'cancelado', detalhe: 'Cancelado: você mandou outra mensagem.', por: 'mensagem' });
    }
    const turno = novoTurno();
    CONVERSA.cmid.set(chave, turno);
    emitirC(pid, 'fala_dono', { turno, texto, via, ...(contexto ? { contexto } : {}) });
    iniciarC(pid, turno, texto, contexto);
    return json(res, 202, { turno, na_fila: false });
  }
  if (r4 === 'responder') {                                     // R5
    const tid = String(c.tool_use_id ?? '');
    if (!RE_TOOL.test(tid) || (c.escolha_id == null && !String(c.texto ?? '').trim())) return falha(res, 422, 'toque numa opção ou escreva a resposta');
    const esp = CONVERSA.espera.get(pid);
    if (!esp || esp.tipo !== 'pergunta' || esp.tool_use_id !== tid) {
      return CONVERSA.decididos.has(tid) ? falha(res, 409, 'essa pergunta já foi respondida') : falha(res, 404, 'essa pergunta não existe');
    }
    const op = c.escolha_id != null ? esp.dados.opcoes.find((o) => o.id === c.escolha_id) : null;
    if (c.escolha_id != null && !op) return falha(res, 422, 'essa opção não existe nesta pergunta');
    if (!ligadaC()) return falha(res, 503, 'a conversa está desligada');
    if (CONVERSA.rodando.has(pid)) return falha(res, 409, 'a conversa ainda está respondendo; espere terminar');
    CONVERSA.espera.delete(pid);
    CONVERSA.decididos.add(tid);
    const textoLivre = String(c.texto ?? '').trim().slice(0, 1000);
    emitirC(pid, 'resposta', { tool_use_id: tid, tipo: 'pergunta', ...(op ? { escolha_id: op.id } : { texto: textoLivre }), por: 'dono' });
    iniciarC(pid, esp.turno, '', null, async (ctx) => {
      ctx.bloco = proximoBloco(pid, esp.turno);
      if (!(await ferramentaC(pid, ctx, 'ver_material', { busca: op ? op.id : 'resposta' }, 'Leu 6 trechos'))) return;
      await continuarC(pid, ctx, `Combinado: ${op ? op.rotulo.toLowerCase() : `“${textoLivre.slice(0, 80)}”`}. Anotei para a próxima versão; nada roda sem o seu toque.`);
    });
    return json(res, 202, { turno: esp.turno });
  }
  if (r4 === 'confirmar') {                                     // R6
    const tid = String(c.tool_use_id ?? '');
    if (!RE_TOOL.test(tid) || typeof c.sim !== 'boolean' || !/^[0-9a-f]{64}$/.test(String(c.entrada_hash ?? ''))) return falha(res, 422, 'cartão inválido');
    const esp = CONVERSA.espera.get(pid);
    if (!esp || esp.tipo !== 'confirmacao' || esp.tool_use_id !== tid) {
      return CONVERSA.decididos.has(tid) ? falha(res, 409, 'esse cartão já foi decidido') : falha(res, 404, 'esse cartão não existe');
    }
    if (esp.dados.entrada_hash !== c.entrada_hash) return falha(res, 409, 'o cartão mudou');
    CONVERSA.espera.delete(pid);
    CONVERSA.decididos.add(tid);
    const ev = { tool_use_id: tid, tipo: 'confirmacao', sim: c.sim, por: 'dono' };
    if (!c.sim) { emitirC(pid, 'resposta', { ...ev, resultado: 'cancelado', detalhe: 'Cancelado. Nada mudou.' }); return json(res, 200, { feito: false }); }
    const porque = esp.dados.acao === 'ajuste' ? guardaAjuste(p, esp.entrada.versao) : guardaPedido(p);
    if (porque) { emitirC(pid, 'resposta', { ...ev, resultado: 'nao_deu', detalhe: `não deu: ${porque}` }); return falha(res, 409, `não deu: ${porque}`); }
    if (esp.dados.acao === 'ajuste') {                          // o mesmo que o botão "Pedir ajuste"
      const v = p.versoes.find((x) => x.id === esp.entrada.versao);
      v.estado = 'reprovada';
      v.reprovacao = esp.entrada.o_que_mudar;
      emitir(pid, 'estado', { mensagem: `Versão ${v.id} reprovada: ${v.reprovacao.slice(0, 120)}. Virou regra da casa.` });
      p.estado = 'lendo';
      setTimeout(() => tentarDirigir(p), PASSO);
      emitirC(pid, 'resposta', { ...ev, resultado: 'feito', detalhe: 'Pedido de ajuste enviado. A direção recomeça; acompanhe na mesa.' });
      return json(res, 200, { feito: true, resultado: { nova_direcao: true } });
    }
    p.dados.pedido = { texto: esp.entrada.texto.slice(0, 200), tipo_video: p.tipo_video ?? 'auto', modo: p.dados.pedido?.modo ?? 'auto' };
    emitir(pid, 'estado', { mensagem: 'Pedido recebido.', dados: { pedido: esp.entrada.texto.slice(0, 200) } });
    const dirigindo = tentarDirigir(p);
    emitirC(pid, 'resposta', { ...ev, resultado: 'feito', detalhe: dirigindo ? 'Pedido trocado. A edição começou; acompanhe na mesa.' : 'Pedido trocado.' });
    return json(res, 200, { feito: true, resultado: { dirigindo } });
  }
  if (r4 === 'parar') {                                         // R7
    const ctx = CONVERSA.rodando.get(pid);
    if (!ctx) return json(res, 200, { parou: false });
    pararC(pid, ctx);
    return json(res, 200, { parou: true });
  }
  if (r4 === 'retomar') {                                       // R8
    if (!ligadaC()) return falha(res, 503, 'a conversa está desligada');
    if (CONVERSA.gasto >= CONVERSA.teto - 1e-9) return falha(res, 429, `chegou no teto de hoje (US$ ${CONVERSA.teto.toFixed(2).replace('.', ',')}); a conversa volta à meia-noite`);
    if (CONVERSA.rodando.has(pid)) return falha(res, 409, 'a conversa já está respondendo');
    const turno = CONVERSA.interrompido.get(pid);
    if (!turno) return falha(res, 409, 'não há conversa interrompida');
    iniciarC(pid, turno, '', null, async (ctx) => {
      ctx.bloco = proximoBloco(pid, turno);
      if (!(await ferramentaC(pid, ctx, 'ver_projeto', {}, 'Olhou o projeto'))) return;
      await continuarC(pid, ctx, 'Voltei de onde parei. Olhei o projeto de novo: nada se perdeu.');
    });
    return json(res, 202, { turno });
  }
  return falha(res, 404, 'rota não encontrada');
}
function pararC(pid, ctx) {
  const r = CONVERSA.rascunho.get(pid);
  const parcial = r && r.turno === ctx.turno && !eventos.some((e) => e.projeto === pid && e.tipo === 'fala_editor' && e.dados?.turno === ctx.turno && e.dados?.bloco === r.bloco) ? r.texto : '';
  ctx.fechado = true;
  const custo = +(CUSTO_CHAMADA * 0.5).toFixed(4);
  CONVERSA.gasto += custo;
  emitirC(pid, 'turno_fim', { turno: ctx.turno, stop: 'parado', custo_usd: custo, estimado: true, s: +((Date.now() - ctx.t0) / 1000).toFixed(1), gasto_hoje_usd: +CONVERSA.gasto.toFixed(4), tokens: TOKENS, ...(parcial ? { texto_parcial: parcial } : {}) });
  CONVERSA.rodando.delete(pid);
  CONVERSA.rascunho.delete(pid);
}
