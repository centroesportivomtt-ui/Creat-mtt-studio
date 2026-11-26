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

// ---------- Cloudflare: entregas do filme aprovado e espelho do material (mesmo contrato do motor real) ----------
// Desligados por padrão, como o motor real sem as variáveis R2_ENTREGAS_* e EDITOR_ESPELHO. O aceite liga e força os estados
// por /v1/_falso/* (rota só deste motor falso: o proxy do site não deixa passar).
const ENT = { ligado: process.env.MOTOR_FALSO_ENTREGAS === '1', proximo: null };
const ESP = { ligado: process.env.MOTOR_FALSO_ESPELHO === '1', teto_gb: 4 };
const PUBLICO = 'https://pub-falso-entregas.r2.dev';
const CLIENTES_FIXOS = ['super-kal', 'creat-mtt', 'marcos'];
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slug = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nomeArquivo = (t) => semAcento(t).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
const nomeCliente = (c) => c.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const bahia = (ms = Date.now()) => new Date(ms - 3 * 3600e3).toISOString();
const adivinharCliente = (p) => (/super\s*-?\s*kal/i.test(semAcento(`${p.nome} ${p.dados.pedido?.texto ?? ''}`)) ? 'super-kal' : 'creat-mtt');
const CAMPOS_ENT = ['estado', 'cliente', 'painel', 'video_url', 'capa_url', 'motivo', 'proxima', 'substituida_por', 'em'];
function entPublico(e) {
  const o = Object.fromEntries(CAMPOS_ENT.map((k) => [k, e[k] ?? null]));
  o.nome_cliente = nomeCliente(e.cliente || 'creat-mtt');
  return o;
}
function gravarEnt(p, v, campos, mensagem) {
  const e = ((p.dados.entregas ??= {})[v] ??= {});
  Object.assign(e, campos);
  // como a etapa de fundo do motor: evento "estado" da etapa entrega, sem mudar o estado do projeto (o site recarrega)
  emitir(p.id, 'estado', { etapa: 'entrega', alvo: v, mensagem, dados: { entregas: entPublico(e) } });
  return e;
}
async function enviarEntregas(p, v, cliente) {
  p.dados.entregas_data ??= bahia().slice(0, 10);       // data da 1ª aprovação: re-aprovar cai na mesma pasta
  gravarEnt(p, v, { estado: 'enviando', cliente, motivo: null, proxima: null, substituida_por: null }, `Subindo a ${v} para a página de entregas.`);
  await dormir(PASSO * 2);
  const e = p.dados.entregas[v];
  if (e.estado !== 'enviando') return;                  // reprovada no meio: a retirada ganha
  const forca = ENT.proximo; ENT.proximo = null;
  if (forca === 'pendente') {
    gravarEnt(p, v, { estado: 'pendente', motivo: 'sem conexão com o Cloudflare agora. O filme continua guardado aqui', proxima: bahia(Date.now() + 15 * 60e3).slice(11, 16) }, 'A página de entregas não respondeu; tento de novo em 15 min.');
    return;
  }
  if (forca === 'falhou') {
    gravarEnt(p, v, { estado: 'falhou', motivo: 'o filme mudou depois que você aprovou, então nada subiu. Aprove de novo para mandar este' }, 'Não deu para mandar para as entregas.');
    return;
  }
  for (const [v2, e2] of Object.entries(p.dados.entregas)) {
    if (v2 !== v && ['no_ar', 'enviando', 'pendente'].includes(e2.estado)) gravarEnt(p, v2, { estado: 'substituida', substituida_por: v }, `${v2} trocada pela ${v} na página de entregas.`);
  }
  const pasta = `${slug(cliente)}/${p.dados.entregas_data}-${slug(p.nome).slice(0, 60) || 'projeto'}`;
  gravarEnt(p, v, { estado: 'no_ar', painel: `${PUBLICO}/entregas.html?c=${cliente}`, video_url: `${PUBLICO}/${pasta}/${nomeArquivo(p.nome) || 'Projeto'}_${v}.mp4`,
    capa_url: `${PUBLICO}/${pasta}/${nomeArquivo(p.nome) || 'Projeto'}_capa_${v}.jpg`, motivo: null, proxima: null, em: agora() }, `A ${v} está na página de entregas.`);
}
async function retirarEntregas(p, v) {
  gravarEnt(p, v, { estado: 'retirando' }, `Tirando a ${v} da página de entregas.`);
  await dormir(PASSO);
  gravarEnt(p, v, { estado: 'retirada', motivo: null, proxima: null }, `A ${v} saiu da página de entregas.`);
}
// Pasta do Google Drive: mesmas formas de link e mesmos textos do motor real (importar.py)
const RE_PASTA_DRIVE = /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/|mobile\/)?folders\/([^/?#]+)|(?:embedded)?folderview\?(?:[^#]*&)?id=([^&#]+))/;
const MSG_PASTA = {
  restrita: 'Essa pasta do Google Drive está restrita. No Drive: toque nos 3 pontinhos da pasta > Compartilhar > Acesso geral: "Qualquer pessoa com o link" (pode deixar como Leitor) > Copiar link, e cole aqui de novo.',
  apagada: 'Essa pasta do Drive não existe mais (foi apagada ou o link veio pela metade). Copie o link de novo e cole aqui.',
  vazia: 'A pasta do Drive não tem vídeo nem áudio. Confira se colou a pasta certa.',
};
const ITENS_PASTA = [
  { nome: 'C0001.MP4', bytes: 412334100 }, { nome: 'C0002.MP4', bytes: 288100442 }, { nome: 'Audio/voz-lapela.WAV', bytes: 61200000 },
];

// ---------- simulação ----------
async function lerArquivo(p, a) {
  emitir(p.id, 'arquivo_recebido', { alvo: a.id, mensagem: `Chegou: ${a.nome}` });
  emitir(p.id, 'etapa_inicio', { etapa: 'ingest', alvo: a.id, mensagem: `Lendo quadros-chave e áudio de ${a.nome}` });
  const mi = mesaInicio(p, 'ingest', a.id);            // mesa ao vivo (onda 2, bloco no fim do arquivo)
  await mi.trecho(0, 1, PASSO / 2);
  a.estado = 'ingerido';
  mi.fim();
  emitir(p.id, 'etapa_fim', { etapa: 'ingest', alvo: a.id, progresso: 1, mensagem: `${a.nome}: quadros-chave e áudio prontos` });
  emitir(p.id, 'etapa_inicio', { etapa: 'analise', alvo: a.id, mensagem: `Transcrevendo as falas de ${a.nome}` });
  const ma = mesaInicio(p, 'analise', a.id);
  await ma.trecho(0, 1, PASSO / 2);
  a.estado = 'analisado';
  ma.fim();
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
  const m = mesaInicio(p, nome, alvo);                 // mesa ao vivo: os passos de dentro correm no mesmo tempo de antes
  for (let i = 1; i < mensagens.length; i++) {
    await m.trecho(i - 1, mensagens.length, PASSO);
    emitir(p.id, 'etapa_progresso', { etapa: nome, alvo, progresso: i / mensagens.length, mensagem: mensagens[i] });
  }
  await m.trecho(mensagens.length - 1, mensagens.length, PASSO);
  m.fim();
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
  await fimDaVersao(p, versao, true);
}
// montagem (opcional) -> conferência -> entrega de uma versão: o fim de toda edição, do refazer e da troca de música
async function fimDaVersao(p, versao, montar, msgConferindo) {
  const v = versao.id;
  if (montar) {
  await etapa(p, 'montagem', v, ['Cortando os planos…', 'Planos 1080x1920 prontos (12 de 12)', 'Legendas e motion renderizados', 'Mix: voz, trilha com ducking e tom de sala']);
  const chave = `saidas/${p.id}/${v}/final.mp4`;
  const destino = path.join(ARM, chave);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try { fs.rmSync(destino, { force: true }); fs.linkSync(AMOSTRA, destino); } catch { fs.copyFileSync(AMOSTRA, destino); }
  versao.video = chave;
  gravarCorFalsa(p.id, v);
  } else versao.estado = 'montada';       // conferir de novo: o filme montado volta para a conferência
  mudarEstado(p, 'conferindo', msgConferindo ?? `Conferindo a versão ${v} (QA automático).`);
  await etapa(p, 'qa', v, ['Conferindo LUFS, pico, quadros pretos e zona segura…', 'Transcrevendo o mix e o tom de sala']);
  versao.qa = JSON.stringify({
    versao: '1', projeto: p.id, video: versao.video, aprovado: true, tempo_s: 41,
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
  versao.link = `/v1/arquivos/${versao.video}`;
  p.estado = 'entregue';
  emitir(p.id, 'entregue', { alvo: v, estado: 'entregue', mensagem: `Versão ${v} entregue.`, dados: { video: versao.video } });
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
  const { rodando, nuvemEstados, ...resto } = p;
  const out = { ...resto, arquivos: p.arquivos.map((a) => ({ ...a })), versoes: p.versoes.map((v) => ({ ...v })), jobs: [] };
  if (ESP.ligado) {          // igual ao motor real: com o espelho desligado, nenhum destes campos existe
    out.arquivos.forEach((a, i) => { a.nuvem = nuvemEstados?.[i] ?? null; });
    const conta = (e) => out.arquivos.filter((a) => a.nuvem === e);
    out.nuvem = { guardados: conta('guardado').length, total: out.arquivos.length, bytes: conta('guardado').reduce((t, a) => t + a.bytes, 0),
      pendentes: conta('pendente').length, fora_do_teto: conta('fora_do_teto').length, teto_gb: ESP.teto_gb };
  }
  return out;
}

function servirArquivo(req, res, chave) {
  if (!chaveValida(chave)) return falha(res, 422, 'chave inválida');
  const f = path.join(ARM, chave);
  if (!f.startsWith(ARM + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return falha(res, 404, 'arquivo não encontrado');
  // igual ao motor real: vídeo de versão só sai depois de entregue (QA aprovado)
  const ms = /^saidas\/([^/]+)\/([^/]+)\/(final\.mp4|mix\.wav|stems\/.*|capa\.jpg|cor\.json|cor\/.*)$/.exec(chave);
  if (ms) {
    const ver = projetos.get(ms[1])?.versoes.find((x) => x.id === ms[2]);
    if (!ver || ver.estado !== 'entregue') return falha(res, 403, 'esta versão não foi entregue: não baixa, não tem link e não vai para o cliente (a segurada pela conferência dá para assistir só na tela do projeto)');
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

  if (r1 === 'saude' && M === 'GET') return json(res, 200, { ok: true, falso: true, provedores: { armazenamento: 'local', transcricao: 'falso', visao: 'falso', cerebro: 'fixture', render: 'falso', publicacao: 'nenhuma' },
    entregas: { ligado: ENT.ligado }, ...(ESP.ligado ? { espelho: { ligado: true, teto_gb: ESP.teto_gb } } : {}) });
  if (r1 === '_falso' && M === 'POST') {      // controle do aceite (o proxy do site não deixa passar: só quem tem o token do motor)
    const c = (await lerCorpo(req)) ?? {};
    if (pid === 'entregas') {
      if (typeof c.ligado === 'boolean') ENT.ligado = c.ligado;
      if (c.proximo !== undefined) ENT.proximo = c.proximo;
      const p = projetos.get(c.projeto);
      if (p && c.versao && c.estado) gravarEnt(p, c.versao, { estado: c.estado, motivo: c.motivo ?? null, proxima: c.proxima ?? null, substituida_por: c.substituida_por ?? null }, `entregas da ${c.versao}: ${c.estado}`);
      return json(res, 200, { ligado: ENT.ligado, entregas: p ? Object.fromEntries(Object.entries(p.dados.entregas ?? {}).map(([k, e]) => [k, entPublico(e)])) : null });
    }
    if (pid === 'cenario') {                  // onda 3: põe o projeto em erro, com a conferência segurando ou com vídeo de fora
      const p = projetos.get(c.projeto);
      if (!p) return falha(res, 404, 'projeto não encontrado');
      return json(res, 200, cenarioF(p, c));
    }
    if (pid === 'memoria') return json(res, 200, semearMemoriaF(c));
    if (pid === 'espelho') {
      if (typeof c.ligado === 'boolean') ESP.ligado = c.ligado;
      const p = projetos.get(c.projeto);
      if (p && Array.isArray(c.estados)) { p.nuvemEstados = c.estados; emitir(p.id, 'estado', { etapa: 'entrega', mensagem: 'espelho do material atualizado' }); }
      return json(res, 200, { ligado: ESP.ligado });
    }
    return falha(res, 404, 'rota não encontrada');
  }
  if (r1 === 'entregas' && pid === 'clientes' && M === 'GET') {
    const slugs = [...CLIENTES_FIXOS];
    const out = { ligado: ENT.ligado, clientes: slugs.map((c) => ({ slug: c, nome: nomeCliente(c) })), padrao: 'creat-mtt' };
    const p = projetos.get(url.searchParams.get('projeto') ?? '');
    if (url.searchParams.get('projeto') && !p) return falha(res, 404, 'projeto não encontrado');
    if (p) {
      const ultimo = Object.values(p.dados.entregas ?? {}).map((e) => e.cliente).filter(Boolean).pop();
      out.sugerido = ultimo ?? adivinharCliente(p);
      if (!slugs.includes(out.sugerido)) out.clientes.push({ slug: out.sugerido, nome: nomeCliente(out.sugerido) });
    }
    return json(res, 200, out);
  }
  if (r1 === 'arquivos' && (M === 'GET' || M === 'HEAD')) return servirArquivo(req, res, partes.slice(2).join('/'));
  if (r1 === 'memoria' && M === 'GET' && !pid) return json(res, 200, memoriaOnda3(memoriaDaCasa()));
  if (r1 === 'memoria' && M === 'POST') return rotaApagarMemoria(res, partes);          // R16 a R18 (onda 3)
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
      Object.assign(BACKUP, { estado: 'ok', ultimo_ok: agora(), bytes: 25014, arquivos: 22, horas_desde_o_ultimo: 0, midia_fora: { arquivos: 7, bytes: 15304535 }, r2: true, copias: ['R2', 'Dropbox'] });
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
  if (r1 === 'marcas') return rotaMarcas(req, res, partes);                         // onda 4, item 5
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

  if ((r3 === 'refazer' || r3 === 'apagar' || r5 === 'retirar') && !RE_PID.test(pid)) return falha(res, 404, 'projeto não encontrado');
  const p = projetos.get(pid);
  if (!p) return falha(res, 404, 'projeto não encontrado');
  if (!r3 && M === 'GET') return json(res, 200, verProjeto(p));
  if (r3 === 'refazer' && !r4) return rotaRefazer(req, res, p, M);                  // R11 / R12 (onda 3)
  if (r3 === 'apagar' && !r4) return rotaApagar(req, res, p, M);                    // R13 / R14 (onda 3)
  if (r3 === 'versoes' && r4 && r5 === 'retirar' && M === 'POST') return rotaRetirar(res, p, r4);   // R15 (onda 3)
  if (r3 === 'eventos' && M === 'GET') return sse(req, res, pid, url);
  // mesmo formato do motor real ({projeto, versoes}); "entregas" só com as entregas ligadas
  if (r3 === 'versoes' && !r4 && M === 'GET') return json(res, 200, { projeto: pid, versoes: p.versoes.map((v) => ({ ...v, segurada: seguradaF(p, v), ...(ENT.ligado && p.dados.entregas?.[v.id] ? { entregas: entPublico(p.dados.entregas[v.id]) } : {}) })) });
  if (r3 === 'versoes' && r4 && r5 === 'segurada' && (M === 'GET' || M === 'HEAD')) return rotaSegurada(req, res, p, r4, partes[6]);   // onda 4, item 6
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
    const pasta = RE_PASTA_DRIVE.exec(u);
    if (pasta) {               // pasta do Drive: lida na hora; cada vídeo de dentro vira um arquivo do projeto
      const fid = pasta[1] ?? pasta[2];
      for (const k of Object.keys(MSG_PASTA)) if (fid.includes(k)) return falha(res, 422, MSG_PASTA[k]);
      if ((p.dados.pastas_drive ??= {})[fid]) return falha(res, 422, `Essa pasta já está no projeto (${ITENS_PASTA.length} vídeos). Não tem vídeo novo nela.`);
      p.dados.pastas_drive[fid] = true;
      const a = { id: `a${String(p.arquivos.length + 1).padStart(3, '0')}`, nome: 'importando do link…', chave: null, bytes: 0, estado: 'recebido', criado: agora() };
      p.arquivos.push(a);
      (async () => {
        await dormir(PASSO);
        for (const [i, it] of ITENS_PASTA.entries()) {
          const alvo = i === 0 ? a : { id: `a${String(p.arquivos.length + 1).padStart(3, '0')}`, nome: '', chave: null, bytes: 0, estado: 'recebido', criado: agora() };
          if (i > 0) p.arquivos.push(alvo);
          Object.assign(alvo, { nome: `Gravacoes do evento/${it.nome}`, bytes: it.bytes });
          lerArquivo(p, alvo);
        }
      })();
      return json(res, 202, { id: a.id, mensagem: 'Importação na fila: o editor baixa e já começa a ler.',
        pasta: { nome: 'Gravações do evento', videos: ITENS_PASTA.length, ignorados: 2, subpastas: 1, ja_no_projeto: 0, bytes: null },
        detalhe: `Pasta “Gravações do evento”: ${ITENS_PASTA.length} vídeos na fila; vão aparecendo aqui conforme baixam. 2 arquivos que não são vídeo nem áudio ficam de fora.` });
    }
    const a = { id: `a${String(p.arquivos.length + 1).padStart(3, '0')}`, nome: 'importando do link…', chave: null, bytes: 0, estado: 'recebido', criado: agora() };
    p.arquivos.push(a);
    (async () => { await dormir(PASSO); a.nome = decodeURIComponent(u.split('/').pop()?.split('?')[0] || 'arquivo-importado.mp4'); a.bytes = 1; await lerArquivo(p, a); })();
    return json(res, 202, { id: a.id, mensagem: 'Importação na fila: o editor baixa e já começa a ler.' });
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
    let cliente = null;                        // como o motor real: "Super Kal" e "super_kal" viram "super-kal"; "-" é 422
    if (c.cliente != null && String(c.cliente).trim()) {
      cliente = slug(String(c.cliente)).slice(0, 40).replace(/-+$/, '');
      if (!RE_CLIENTE_F.test(cliente)) return falha(res, 422, 'nome de cliente inválido');
    }
    p.dados.pedido = { texto: texto.slice(0, 200), tipo_video: c.tipo_video ?? 'auto', modo: c.modo ?? 'auto', ...(cliente ? { cliente } : {}) };
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
    if (ENT.ligado && ['no_ar', 'enviando', 'pendente'].includes(p.dados.entregas?.[v.id]?.estado)) retirarEntregas(p, v.id);
    emitir(pid, 'estado', { mensagem: `Versão ${v.id} reprovada: ${motivo.slice(0, 120)}. Virou regra da casa.` });
    p.estado = 'lendo';
    setTimeout(() => tentarDirigir(p), PASSO);
    return json(res, 200, { regra: { id: `r_${Date.now()}`, texto: motivo }, checagem: null, nova_direcao: true });
  }
  if (r3 === 'versoes' && r4 && r5 === 'aprovar') {
    const v = p.versoes.find((x) => x.id === r4);
    if (!v) return falha(res, 404, 'versão não encontrada');
    if (v.estado !== 'entregue') return falha(res, 409, 'só dá para aprovar versão entregue (conferida pelo QA)');
    if (c.cliente != null && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(String(c.cliente))) return falha(res, 422, 'cliente inválido');
    p.dados.aprovadas = { ...(p.dados.aprovadas ?? {}), [v.id]: { em: agora(), nota: c.nota ?? null } };
    emitir(pid, 'estado', { mensagem: `Corta! Versão ${v.id} aprovada. Virou caso de referência da casa.` });
    const out = { aprovada: v.id, caso: `${pid}-${v.id}` };
    if (ENT.ligado && c.entregas !== false) {        // sem as entregas ligadas (ou "não mandar"), a resposta fica idêntica à de antes
      const cliente = c.cliente || adivinharCliente(p);
      enviarEntregas(p, v.id, cliente);
      out.entregas = entPublico(p.dados.entregas[v.id]);
    }
    return json(res, 200, out);
  }
  if (r3 === 'versoes' && r4 && r5 === 'entregas') {          // "Tentar agora" / "Mandar para as entregas"
    const v = p.versoes.find((x) => x.id === r4);
    if (!v) return falha(res, 404, 'versão não encontrada');
    if (!ENT.ligado) return falha(res, 409, 'as entregas no Cloudflare estão desligadas neste editor');
    if (v.estado !== 'entregue' || !p.dados.aprovadas?.[v.id]) return falha(res, 409, 'só vai para a página de entregas a versão que você aprovou');
    if (c.cliente != null && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(String(c.cliente))) return falha(res, 422, 'cliente inválido');
    const cliente = c.cliente || p.dados.entregas?.[v.id]?.cliente || adivinharCliente(p);
    enviarEntregas(p, v.id, cliente);
    return json(res, 202, { entregas: entPublico(p.dados.entregas[v.id]) });
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
  retencao: Number.isInteger(Number(process.env.MOTOR_FALSO_RETENCAO)) && process.env.MOTOR_FALSO_RETENCAO !== '' ? Number(process.env.MOTOR_FALSO_RETENCAO) : 90,
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
    retencao_dias: CONVERSA.retencao,          // onda 3 (R20)
  };
}
function instantaneoC(pid) {
  const d = { ligada: ligadaC(), gasto_hoje_usd: +CONVERSA.gasto.toFixed(4), teto_usd_dia: CONVERSA.teto };
  if (!d.ligada) d.motivo = CONVERSA.servidor ? 'desligada_pelo_dono' : 'sem_chave';
  const ctx = CONVERSA.rodando.get(pid);
  if (ctx) { d.turno_rodando = ctx.turno; const r = CONVERSA.rascunho.get(pid); if (r && r.turno === ctx.turno) d.rascunho = { ...r }; }
  const e = CONVERSA.espera.get(pid);
  if (e) d.espera = { tipo: e.tipo, tool_use_id: e.tool_use_id };
  const ab = passosAbertos(pid);
  if (ab.length) d.passos_abertos = ab;
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
      return fimC(pid, ctx, 'erro', { detalhe: 'o Claude não respondeu agora; tente de novo' });
    }
    if (/devagar/.test(t)) {
      const longo = Array.from({ length: 12 }, (_, i) => `Parte ${i + 1}: olhando cada fala com calma para achar o melhor gancho.`).join(' ');
      if (!(await escreverC(pid, ctx, `${eco} ${longo}`, 160))) return;
      return fimC(pid, ctx, 'end_turn');
    }
    if (!(await escreverC(pid, ctx, `${eco} Vou olhar o projeto primeiro.`))) return;
    if (!(await ferramentaC(pid, ctx, 'ver_projeto', {}, `Olhou o projeto: ${p.arquivos.length} vídeo(s), ${p.versoes.length} versão(ões)`))) return;
    if (await turnoOnda3(pid, ctx, texto, contexto)) return;     // onda 3: refazer, trocar a música, anotar, procurar no filme
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
        volta: `A ${v.id} continua guardada. Vira regra da casa e vale para TODOS os projetos, como no botão Pedir ajuste.`, entrada_hash: hashC(tid, entrada) };
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
      if (Number.isInteger(c.retencao) && c.retencao >= 0) CONVERSA.retencao = c.retencao;
      return json(res, 200, estadoChaveC());
    }
    if (pid === 'mesa-erro' && projetos.has(r3)) return json(res, 200, mesaErro(projetos.get(r3)));
    if (pid === 'mesa-interrompida' && projetos.has(r3)) return json(res, 200, mesaInterrompida(projetos.get(r3)));
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
    if (['refazer', 'trilha', 'nota'].includes(esp.dados.acao)) { const [st, corpo] = confirmarOnda3(p, esp, ev); return json(res, st, corpo); }
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

// =====================================================================================================================
// Mesa ao vivo (onda 2; docs/plano-conversa-25-11.md, seção 7 e 13.3): o mesmo contrato do motor real
// (services/motor/motor/etapas/passos.py). Cada etapa simulada abre um passo raiz e, dentro dela, os passos da equipe
// (com ferramenta, modelo, esforço, tokens, conta, custo e achado em números), e a direção emite a `decisao`.
// Os números são de um filme de exemplo (14 falas, 6 momentos fortes, 275 ml conferido): o site só mostra o que chega.
// =====================================================================================================================
const novoPasso = () => 'ps_' + randomBytes(5).toString('hex');
const conta = (m, partes, c) => `${m}: (${partes}) ÷ 1.000.000 = US$ ${c.toFixed(4).replace('.', ',')}`;
const PASSOS_MESA = {
  ingest: [],
  analise: [
    { chave: 'analise.transcricao', ferramenta: 'faster-whisper small', numeros: { falas: 14, palavras: 212 }, achado: '14 falas em 52 s de vídeo' },
    { chave: 'analise.visao', ferramenta: 'visão claude-leve', modelo: 'claude-haiku-5-5', custo_usd: 0.0011,
      tokens: { entrada: 9000, cache_lida: 0, cache_escrita: 0, saida: 400 }, conta: conta('claude-haiku-5-5', '9.000 novos × 0.1 + 400 de saída × 0.5', 0.0011),
      numeros: { momentos: 9, fortes: 6, rostos: 3, cenas: 4 }, achado: '14 falas, 6 momentos fortes de 9 marcados' },
  ],
  catalogo: [],
  direcao: [
    { chave: 'direcao.diretor', ferramenta: 'Claude (Messages API, JSON estrito, cache do catálogo)', modelo: 'claude-opus-5-5', esforco: 'high', custo_usd: 0.0698,
      tokens: { entrada: 1200, cache_lida: 15000, cache_escrita: 0, saida: 3100 }, conta: conta('claude-opus-5-5', '1.200 novos × 4 + 15.000 do cache × 0.2 + 3.100 de saída × 20', 0.0698),
      numeros: { blocos: 5 }, achado: 'Conceito: a equipe chega e o salão vira palco.' },
    { chave: 'direcao.resolvedor', ferramenta: 'resolvedor do editor (encaixe por palavra e batida)', numeros: { dur: 38, blocos: 5, planos: 14, falas: 9, drop_s: 14 },
      achado: '38 s em 5 blocos e 14 planos, 9 trechos de fala; a música explode aos 0:14' },
    { chave: 'direcao.critico', ferramenta: 'Claude (Messages API, JSON estrito, cache do catálogo)', modelo: 'claude-opus-5-5', esforco: 'medium', custo_usd: 0.0226,
      tokens: { entrada: 400, cache_lida: 15000, cache_escrita: 0, saida: 900 }, conta: conta('claude-opus-5-5', '400 novos × 4 + 15.000 do cache × 0.2 + 900 de saída × 20', 0.0226),
      numeros: { avisos: 2, resultado: 'sem mudança' }, achado: 'Manteve a direção (2 pontos conferidos)' },
  ],
  montagem: [
    { chave: 'montagem.fatos', ferramenta: 'Claude com busca na web (fonte oficial) e leitura do rótulo nos quadros', numeros: { n: 1, confere: 1, corrigidos: 0, sem_fonte: 0 }, achado: '275 ml confere' },
    { chave: 'montagem.voz', ferramenta: 'DeepFilterNet3 (limpeza com IA, local) + nivelamento', numeros: { n: 9 }, achado: '9 trechos de fala limpos e nivelados' },
    { chave: 'montagem.planos', ferramenta: 'ffmpeg: cor por ambiente, estabilização e enquadre', numeros: { n: 14 }, achado: '14 planos com cor e enquadre (3 já estavam prontos)' },
    { chave: 'montagem.overlay', ferramenta: 'Chromium + kit de motion da casa, quadro a quadro', numeros: { n: 23, quadros: 1140 }, achado: '23 camadas de legenda e motion em 1140 quadros' },
    { chave: 'montagem.mix', ferramenta: 'mixagem do editor (ducking da música sob a fala, -14 LUFS)', numeros: { lufs: -14.1, margem_db: 9 }, achado: 'Fala 9 dB acima da música; -14,1 LUFS; o acorde final cai aos 0:36' },
    { chave: 'montagem.comp', ferramenta: 'ffmpeg (libx264), vídeo e áudio numa passada', numeros: { Q: 1140 }, achado: '1140 quadros compostos' },
  ],
  qa: [
    ['lufs', 'ok', '-14,1 LUFS (alvo -14)'], ['true_peak', 'ok', 'pico -1,4 dBTP'], ['frase_repetida', 'ok', 'nenhuma frase repetida'],
    ['tom_sala_sem_voz', 'ok', 'tom de sala por baixo de todo silêncio'], ['quadros_pretos', 'ok', 'nenhum quadro preto fora do fade'],
    ['zona_segura', 'ok', 'legendas dentro da zona segura do Reels'], ['formato', 'ok', '1080x1920 30fps H.264'],
    ['voz_externa', 'aviso', '[em observação] 1 fala de outra voz aos 0:06'], ['olho_ia', 'ok', 'o Claude olhou 6 imagens e não achou defeito'],
  ].map(([id, r, a]) => ({ chave: `qa.${id}`, ferramenta: `motor.etapas.qa.${id}`, numeros: { nome: id, resultado: r }, achado: a,
    ...(id === 'olho_ia' ? { modelo: 'claude-haiku-5-5', custo_usd: 0.00075, tokens: { entrada: 6000, cache_lida: 0, cache_escrita: 0, saida: 300 }, conta: conta('claude-haiku-5-5', '6.000 novos × 0.1 + 300 de saída × 0.5', 0.00075) } : {}) })),
  entrega: [],
};
const RAIZ_MESA = {
  catalogo: { numeros: { falas: 14, momentos: 9, videos: 1 }, achado: '14 falas e 9 momentos de 1 vídeo, prontos para o diretor' },
  analise: { numeros: { falas: 14, momentos: 9 } },
  qa: { numeros: { aprovadas: 8, total: 9 }, achado: 'Passou em 8 de 9 conferências' },
};
const DECISAO = {
  conceito: 'A equipe chega e o salão vira palco.', gancho: 'NÃO É SÓ FILMAR. (risca FILMAR e vira CONTAR)',
  alem_do_pedido: 'Gancho com troca de palavra no quadro 0; fecho com o acorde caindo no logo', critica: 'sem mudança',
  riscos: ['"creat" transcrito com confiança 0,7: conferir na legenda', 'Rosto de terceiro aos 0:22'],
  blocos: [{ id: 'B1', funcao: 'gancho', intensidade: 4 }, { id: 'B2', funcao: 'prova', intensidade: 5 }, { id: 'B3', funcao: 'bastidor', intensidade: 3 },
    { id: 'B4', funcao: 'climax', intensidade: 5 }, { id: 'B5', funcao: 'convite', intensidade: 4 }],
  trilha: { clima: 'energia de evento', drop_em: 'B2' },
};
function emitirPasso(p, etapaNome, alvo, dados) { emitir(p.id, 'passo', { etapa: etapaNome, alvo: alvo ?? null, dados }); }
function mesaInicio(p, nome, alvo) {
  const numeros = {};
  const i = alvo ? p.arquivos.findIndex((a) => a.id === alvo) : -1;
  if (i >= 0) { numeros.n = i + 1; const a = p.arquivos[i]; if (a.bytes >= 50000) numeros.mb = +(a.bytes / 1e6).toFixed(1); }
  else if (alvo && /^v\d+$/.test(alvo)) numeros.versao = alvo;
  const raiz = { passo: novoPasso(), chave: nome, t0: Date.now() };
  emitirPasso(p, nome, alvo, { passo: raiz.passo, chave: nome, fase: 'inicio', numeros });
  const filhos = PASSOS_MESA[nome] ?? [];
  let custo = 0;
  const heranca = { ...(numeros.n ? { n: numeros.n } : {}), ...(numeros.versao ? { versao: numeros.versao } : {}) };
  return {
    async trecho(i, total, ms) {
      const de = Math.floor((i * filhos.length) / total), ate = Math.floor(((i + 1) * filhos.length) / total);
      const meus = filhos.slice(de, ate);
      if (!meus.length) { await dormir(ms); return; }
      for (const f of meus) {
        const id = novoPasso();
        const { custo_usd, tokens, conta: ct, achado, ...base } = f;
        const nums = { ...heranca, ...(f.numeros ?? {}) };
        emitirPasso(p, nome, alvo, { passo: id, pai: raiz.passo, ...base, fase: 'inicio', numeros: nums });
        const t0 = Date.now();
        await dormir(ms / meus.length);
        custo += custo_usd ?? 0;
        emitirPasso(p, nome, alvo, { passo: id, pai: raiz.passo, ...base, fase: 'fim', s: +((Date.now() - t0) / 1000).toFixed(2), numeros: nums,
          ...(custo_usd ? { custo_usd } : {}), ...(tokens ? { tokens } : {}), ...(ct ? { conta: ct } : {}), ...(achado ? { achado } : {}) });
      }
    },
    fim() {
      if (nome === 'direcao') emitir(p.id, 'decisao', { etapa: 'direcao', alvo: `v${p.versoes.length + 1}`, dados: DECISAO });
      const r = RAIZ_MESA[nome] ?? {};
      emitirPasso(p, nome, alvo, { passo: raiz.passo, chave: nome, fase: 'fim', s: +((Date.now() - raiz.t0) / 1000).toFixed(2),
        numeros: { ...numeros, ...(r.numeros ?? {}) }, ...(r.achado ? { achado: r.achado } : {}), ...(custo > 0 ? { custo_total_usd: +custo.toFixed(5) } : {}) });
    },
  };
}
function passosAbertos(pid) {
  const por = new Map();
  for (const e of eventos) {
    if (e.projeto !== pid || e.tipo !== 'passo') continue;
    const d = e.dados;
    if (d.fase === 'inicio') por.set(d.passo, { passo: d.passo, chave: d.chave, desde: e.ts });
    else por.delete(d.passo);
  }
  return [...por.values()];
}
// /v1/_teste/mesa-erro/<pid>: um vídeo que não dá para ler (frase em pt-BR, técnico recolhido) e o aviso de que ficou de fora
function mesaErro(p) {
  const a = p.arquivos[p.arquivos.length - 1];
  const alvo = a?.id ?? 'a_quebrado';
  const n = a ? p.arquivos.length : 2;
  emitir(p.id, 'etapa_inicio', { etapa: 'analise', alvo, mensagem: `Radar começou a ouvir e olhar o vídeo ${n}.` });
  const raiz = novoPasso(), filho = novoPasso();
  emitirPasso(p, 'analise', alvo, { passo: raiz, chave: 'analise', fase: 'inicio', numeros: { n } });
  emitirPasso(p, 'analise', alvo, { passo: filho, pai: raiz, chave: 'analise.transcricao', ferramenta: 'faster-whisper small', fase: 'inicio', numeros: { n } });
  emitirPasso(p, 'analise', alvo, { passo: filho, pai: raiz, chave: 'analise.transcricao', ferramenta: 'faster-whisper small', fase: 'erro', s: 0.8, numeros: { n }, achado: 'Parou com um erro técnico (veja o detalhe).' });
  const frase = `A leitura do vídeo ${n} parou.`;
  emitirPasso(p, 'analise', alvo, { passo: raiz, chave: 'analise', fase: 'erro', s: 0.9, numeros: { n }, achado: frase });
  emitir(p.id, 'etapa_erro', { etapa: 'analise', alvo, mensagem: frase, dados: { detalhe: 'ValueError: moov atom not found (<script>alert(1)</script>)', vai_tentar: false } });
  emitir(p.id, 'aviso', { etapa: 'analise', alvo, mensagem: `O vídeo ${n} (<b>quebrado</b>.mov) não pôde ser lido e ficou de fora. O resto do material segue.`, dados: { detalhe: 'ValueError: moov atom not found' } });
  return { ok: true };
}
// /v1/_teste/mesa-interrompida/<pid>: o editor reiniciou no meio da montagem (o motor real fecha com fase 'interrompido')
function mesaInterrompida(p) {
  const v = `v${p.versoes.length + 1}`;
  emitir(p.id, 'etapa_inicio', { etapa: 'montagem', alvo: v, mensagem: `A montagem da ${v.toUpperCase()} começou: voz, planos, legendas e mix.` });
  const raiz = novoPasso(), filho = novoPasso();
  emitirPasso(p, 'montagem', v, { passo: raiz, chave: 'montagem', fase: 'inicio', numeros: { versao: v } });
  emitirPasso(p, 'montagem', v, { passo: filho, pai: raiz, chave: 'montagem.comp', fase: 'inicio', numeros: { versao: v, Q: 1140 } });
  emitirPasso(p, 'montagem', v, { passo: filho, pai: raiz, chave: 'montagem.comp', fase: 'interrompido' });
  emitirPasso(p, 'montagem', v, { passo: raiz, chave: 'montagem', fase: 'interrompido' });
  return { ok: true, versao: v };
}

// =====================================================================================================================
// Onda 3 (docs/plano-onda3-25-11.md): refazer uma etapa (R11/R12), apagar projeto (R13/R14), tirar da página de entregas
// (R15), regras do Caderno (R16 a R19), prazo da conversa (R20) e os cartões novos da conversa (refazer, trilha, nota).
// Mesmos textos e frases do motor real (services/motor/motor/refazer.py, apagar.py, api/memoria.py, memoria/loja.py).
// O aceite põe o projeto num cenário por /v1/_falso/cenario e semeia regras do dono por /v1/_falso/memoria.
// A memória da casa (projetos/editor-creat/memoria) é só LIDA: o que se apaga aqui fica em memória do processo.
// =====================================================================================================================
const RE_PID = /^p_[a-z0-9]{4,40}$/;
const ATENCAO_DIRECAO = 'Se a conferência reprovar, o editor pode tentar corrigir sozinho até 2 vezes, cada uma com custo de direção.';
const ROTULO_FILA = { catalogo: 'organizando o material', direcao: 'a direção', montagem: 'a montagem', qa: 'a conferência', entrega: 'a entrega' };
const nVideo = (p, aid) => p.arquivos.findIndex((a) => a.id === aid) + 1;
const maisNova = (p) => p.versoes[p.versoes.length - 1] ?? null;
const contaF = (rotulo, usd, ate) => ({ custo_usd_est: usd, custo_ate: ate, ...(usd > 0 ? { partes: [{ rotulo, usd }] } : {}) });

function opcaoF(p, de, { v, aid } = {}) {
  const o = { de, pela_conversa: ['montagem', 'conferencia', 'entrega', 'leitura'].includes(de), ...(v ? { versao: v } : {}) };
  if (de === 'montagem') return { ...o, titulo: `Montar de novo a ${v}`, faz: `Montar de novo a ${v} com a mesma direção. Depois o editor confere e entrega sozinho.`,
    refaz: ['montagem', 'qa', 'entrega'], minutos_est: 9, volta: 'Nada da direção muda. Se a conferência reprovar, o editor para e espera você (não gasta com correção automática).',
    botao: 'Montar de novo', ...contaF('Olhar o filme novo com IA (conferência)', 0.3, true) };
  if (de === 'conferencia') return { ...o, titulo: `Conferir de novo a ${v}`, faz: `Rodar a conferência automática de novo na ${v}, sem montar de novo. Se aprovar, entrega sozinho.`,
    volta: 'O filme não muda. Se reprovar de novo, o editor para e espera você.', botao: 'Conferir de novo', refaz: ['qa', 'entrega'], minutos_est: 3,
    ...contaF('Olhar o filme com IA (conferência)', 0.12, false) };
  if (de === 'entrega') return { ...o, titulo: `Entregar de novo a ${v}`, faz: `Conferir a ${v} (aproveita a conferência se nada mudou) e entregar de novo. Não publica nem manda para o cliente.`,
    volta: 'O filme não muda.', botao: 'Entregar de novo', refaz: ['qa', 'entrega'], minutos_est: 3, ...contaF('Olhar o filme com IA (conferência)', 0, false) };
  if (de === 'leitura') {
    const n = nVideo(p, aid);
    const outrosLidos = p.arquivos.every((a) => a.id === aid || a.estado === 'analisado');
    const comeca = Boolean(p.dados.envio_fechado && p.dados.pedido && outrosLidos);
    const partes = [{ rotulo: 'Ler o vídeo com IA (visão)', usd: 0.05 }, ...(comeca ? [{ rotulo: 'Direção, se a edição começar', usd: 0.4 }] : [])];
    return { ...o, arquivo_id: aid, n_video: n, titulo: `Ler de novo o vídeo ${n}`,
      faz: `Tentar ler o vídeo ${n} de novo: ouvir as falas e olhar os quadros. Ele ficou de fora porque não deu para ler.`,
      refaz: ['leitura'], minutos_est: comeca ? 14 : 2, volta: 'Os outros vídeos não mudam.', botao: 'Ler de novo',
      custo_usd_est: +partes.reduce((t, x) => t + x.usd, 0).toFixed(2), custo_ate: true, partes,
      ...(comeca ? { atencao: `Se der certo e o resto já estiver lido, a edição começa sozinha. ${ATENCAO_DIRECAO}` } : {}) };
  }
  if (de === 'catalogo') return { ...o, titulo: 'Organizar o material de novo', faz: 'Organizar o material de novo e seguir sozinho para a direção, a montagem, a conferência e a entrega.',
    refaz: ['direcao', 'montagem', 'qa', 'entrega'], minutos_est: 12, atencao: ATENCAO_DIRECAO, volta: 'O material e o pedido não mudam.', botao: 'Tentar de novo', ...contaF('Direção do filme', 0.4, false) };
  return { ...o, titulo: 'Tentar a direção de novo', faz: 'Pedir a direção de novo com o mesmo material e o mesmo pedido. Depois o editor monta, confere e entrega sozinho.',
    refaz: ['direcao', 'montagem', 'qa', 'entrega'], minutos_est: 11, atencao: ATENCAO_DIRECAO, volta: 'O material e o pedido não mudam.', botao: 'Tentar de novo', ...contaF('Direção do filme', 0.4, false) };
}

/** A guarda (seção 2.3), na mesma ordem e com as mesmas frases do motor. null = pode. */
function porqueF(p, de, { versao, arquivo_id } = {}) {
  if (de === 'leitura') {
    const a = p.arquivos.find((x) => x.id === arquivo_id);
    if (!a) return 'esse vídeo não existe neste projeto';
    const n = nVideo(p, a.id);
    if (a.estado !== 'falhou') return `o vídeo ${n} não ficou de fora`;
    if (p.versoes.length || p.rodando) return 'a edição já começou; um vídeo lido agora não entra mais neste filme';
    if (a.lendo) return `o vídeo ${n} já está sendo lido`;
    return null;
  }
  if (de === 'catalogo' || de === 'direcao') {
    if (p.rodando) return `a mesa está trabalhando neste projeto agora (${ROTULO_FILA[p.etapaAgora] ?? 'a montagem'}); espere terminar`;
    return p.falhou?.de === de ? null : de === 'catalogo' ? 'o catálogo não falhou' : 'a direção não falhou';
  }
  const m = maisNova(p);
  const V = versao ?? m?.id;
  const v = p.versoes.find((x) => x.id === V);
  if (!v) return `a versão ${V ?? 'v1'} não existe`;
  if (v.id !== m.id) return `a ${V} não é a mais nova; a mais nova é a ${m.id}`;
  if (p.dados.aprovadas?.[V]) return `a ${V} já foi aprovada`;
  if (v.estado === 'reprovada') return `a ${V} foi reprovada por você; a direção nova já cuida dela`;
  if (p.rodando) return `a mesa está trabalhando neste projeto agora (${ROTULO_FILA[p.etapaAgora] ?? 'a montagem'}); espere terminar`;
  if (de === 'montagem') return p.falhou?.de === 'montagem' && p.falhou.versao === V ? null : `a montagem da ${V} não falhou; montar de novo daria o mesmo filme`;
  if (de === 'conferencia') {
    if (p.falhou?.de === 'conferencia' && p.falhou.versao === V) return null;
    return p.estado === 'reprovado_qa' && v.estado === 'reprovada_qa' && p.regrasMudaram ? null : `nada mudou desde a última conferência da ${V}; o resultado seria o mesmo`;
  }
  if (de === 'entrega') return p.falhou?.de === 'entrega' && p.falhou.versao === V ? null : `a entrega da ${V} não falhou`;
  return 'isso não dá para refazer';
}
function opcoesF(p) {
  const out = [];
  const m = maisNova(p);
  if (m) for (const de of ['montagem', 'conferencia', 'entrega']) if (!porqueF(p, de, { versao: m.id })) out.push(opcaoF(p, de, { v: m.id }));
  for (const a of p.arquivos) if (a.estado === 'falhou' && !porqueF(p, 'leitura', { arquivo_id: a.id })) out.push(opcaoF(p, 'leitura', { aid: a.id }));
  for (const de of ['catalogo', 'direcao']) if (!porqueF(p, de)) out.push(opcaoF(p, de));
  let sugerida = null;
  if (p.estado === 'reprovado_qa') { const i = out.findIndex((o) => o.de === 'conferencia'); sugerida = i >= 0 ? i : null; }
  else if (p.falhou) { const i = out.findIndex((o) => o.de === p.falhou.de && (o.de !== 'leitura' || o.arquivo_id === p.falhou.arquivo_id)); sugerida = i >= 0 ? i : null; }
  return { opcoes: out, sugerida };
}
const TEXTO_FEITO = {
  montagem: (o) => `Feito. A montagem da ${o.versao} recomeçou; acompanhe na mesa.`,
  conferencia: (o) => `Feito. A conferência da ${o.versao} recomeçou.`,
  entrega: (o) => `Feito. A ${o.versao} está sendo conferida e entregue de novo.`,
  leitura: (o) => `Feito. O vídeo ${o.n_video} está sendo lido de novo.`,
};
/** Executa o refazer (a guarda já passou): grava o estado, como o motor real, e roda o resto da cadeia em segundo plano. */
function executarF(p, de, { versao, arquivo_id } = {}) {
  const falhou = p.falhou;
  p.falhou = null;
  p.regrasMudaram = false;
  if (de === 'leitura') {
    const a = p.arquivos.find((x) => x.id === arquivo_id);
    const n = nVideo(p, a.id);
    a.estado = 'ingerido'; a.lendo = true;
    const msg = `Lendo o vídeo ${n} de novo, a seu pedido.`;
    if (p.estado === 'erro') mudarEstado(p, 'lendo', msg); else emitir(p.id, 'aviso', { mensagem: msg });
    (async () => {
      emitir(p.id, 'etapa_inicio', { etapa: 'analise', alvo: a.id, mensagem: `Transcrevendo as falas de ${a.nome}` });
      const ma = mesaInicio(p, 'analise', a.id);
      await ma.trecho(0, 1, PASSO / 2);
      a.estado = 'analisado'; a.lendo = false;
      ma.fim();
      emitir(p.id, 'etapa_fim', { etapa: 'analise', alvo: a.id, progresso: 1, mensagem: `${a.nome}: falas, momentos e rostos lidos` });
      tentarDirigir(p);
    })();
    return { alvo: a.id, estado: p.estado };
  }
  if (de === 'catalogo' || de === 'direcao') {
    p.estado = 'lendo';
    if (!tentarDirigir(p)) { p.falhou = falhou; return null; }
    return { alvo: '-', estado: p.estado };
  }
  const v = p.versoes.find((x) => x.id === (versao ?? maisNova(p).id));
  p.rodando = true;
  p.dados.correcoes_auto = 2;
  if (de === 'montagem') {
    v.estado = 'montando';
    mudarEstado(p, 'montando', `Montando a ${v.id} de novo, a seu pedido.`);
  } else {
    mudarEstado(p, 'conferindo', de === 'entrega' ? `Conferindo e entregando a ${v.id} de novo, a seu pedido.` : `Conferindo a ${v.id} de novo, a seu pedido.`);
  }
  fimDaVersao(p, v, de === 'montagem', de === 'entrega' ? `Conferindo e entregando a ${v.id} de novo, a seu pedido.` : `Conferindo a ${v.id} de novo, a seu pedido.`)
    .finally(() => { p.rodando = false; });
  return { alvo: v.id, estado: p.estado };
}
// a etapa que está rodando agora (para a frase "a mesa está trabalhando… (a montagem)" e a recusa do apagar)
const ETAPA_DO_EST = { lendo: 'analise', dirigindo: 'direcao', montando: 'montagem', conferindo: 'qa' };
function marcarEtapa(p) { p.etapaAgora = ETAPA_DO_EST[p.estado] ?? 'entrega'; return p.etapaAgora; }

async function rotaRefazer(req, res, p, M) {
  if (M === 'GET') return json(res, 200, opcoesF(p));
  if (M !== 'POST') return falha(res, 405, 'método não permitido');
  const c = await lerCorpo(req);
  const des = ['montagem', 'conferencia', 'entrega', 'leitura', 'catalogo', 'direcao'];
  if (!c || !des.includes(c.de) || (c.versao != null && !/^v[0-9]{1,3}$/.test(c.versao)) || (c.arquivo_id != null && !/^[A-Za-z0-9_-]{1,40}$/.test(c.arquivo_id))) {
    return falha(res, 422, 'pedido inválido');
  }
  if (c.de === 'leitura' && !c.arquivo_id) return falha(res, 422, 'diga qual vídeo');
  marcarEtapa(p);
  const porque = porqueF(p, c.de, c);
  if (porque) return falha(res, 409, `não deu: ${porque}`);
  const r = executarF(p, c.de, c);
  if (!r) return falha(res, 409, 'não deu: a mesa está trabalhando neste projeto agora; espere terminar');
  return json(res, 202, { feito: true, de: c.de, alvo: r.alvo, estado: r.estado });
}

// ---------- apagar projeto (R13/R14) e tirar da página de entregas (R15) ----------
const FICA = ['O livro de gastos (o que já foi gasto continua contado).',
  'As regras que nasceram dos seus ajustes neste projeto, com o texto do ajuste (apague no Caderno, se quiser).',
  'As cópias nos backups: no Cloudflare somem em até 30 dias; as do Dropbox ficam.'];
const FRASE_JOB = { analise: 'o editor está lendo um vídeo', catalogo: 'a direção está trabalhando', direcao: 'a direção está trabalhando',
  montagem: 'a montagem está rodando', qa: 'a conferência está rodando', entrega: 'a entrega está rodando' };
const NA_PAGINA = ['no_ar', 'pendente', 'enviando'];
function naPaginaF(p) {
  return Object.entries(p.dados.entregas ?? {}).filter(([, e]) => [...NA_PAGINA, 'retirando'].includes(e.estado))
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([v, e]) => ({ versao: v, estado: e.estado, ...(e.estado === 'retirando' && e.proxima ? { proxima: String(e.proxima).slice(0, 5) } : {}) }));
}
function recusaApagarF(p) {
  if (CONVERSA.rodando.has(p.id)) return 'a conversa está respondendo agora neste projeto; toque em Parar a resposta ou espere terminar';
  if (p.rodando || p.arquivos.some((a) => a.lendo || a.estado === 'recebido' || a.estado === 'ingerido')) {
    const et = p.arquivos.some((a) => a.lendo || a.estado === 'ingerido' || a.estado === 'recebido') && !p.rodando ? 'analise' : marcarEtapa(p);
    return `${FRASE_JOB[et] ?? 'a mesa está trabalhando'} agora; espere terminar para apagar`;
  }
  if (ENT.ligado) {
    for (const e of naPaginaF(p)) {
      if (NA_PAGINA.includes(e.estado)) return `a ${e.versao} está na página de entregas; tire de lá primeiro (botão Tirar da página) e apague depois`;
      return `a ${e.versao} está saindo da página de entregas; espere terminar${e.proxima ? ` (tento de novo sozinho às ${e.proxima})` : ''}`;
    }
  }
  return null;
}
function previaF(p) {
  const porque = recusaApagarF(p);
  const msgs = eventos.filter((e) => e.projeto === p.id && (e.tipo === 'fala_dono' || e.tipo === 'fala_editor')).length;
  const out = { pode: !porque, nome: p.nome, vai_apagar: { videos: p.arquivos.length, bytes: p.arquivos.reduce((t, a) => t + (a.bytes || 0), 0), versoes: p.versoes.length,
    mensagens_conversa: msgs, links_cliente_ativos: LINKS.filter((l) => l.projeto === p.id && !l.revogado && l.expira > agora()).length }, na_pagina: [], fica: [...FICA] };
  if (porque) out.porque = porque;
  const semVer = LINKS.filter((l) => l.projeto === p.id && l.resposta && !l.tratado).length;
  if (semVer) out.vai_apagar.respostas_cliente_sem_ver = semVer;
  const pagina = naPaginaF(p);
  if (ENT.ligado) out.na_pagina = pagina;
  else if (pagina.length) out.restos_previstos = { pagina_desligada: pagina.map((e) => e.versao) };
  return out;
}
const mesmoNomeF = (a, b) => String(a ?? '').split(/\s+/).filter(Boolean).join(' ').toLowerCase() === String(b ?? '').split(/\s+/).filter(Boolean).join(' ').toLowerCase();
async function rotaApagar(req, res, p, M) {
  if (M === 'GET') return json(res, 200, previaF(p));
  if (M !== 'POST') return falha(res, 405, 'método não permitido');
  const c = await lerCorpo(req);
  const nome = typeof c?.nome === 'string' ? c.nome : '';
  if (!nome || nome.length > 200) return falha(res, 422, 'nome entre 1 e 200 caracteres');
  const porque = recusaApagarF(p);
  if (porque) return falha(res, 409, porque);
  if (!mesmoNomeF(nome, p.nome)) return falha(res, 422, 'o nome não confere; digite o nome do projeto como aparece no topo');
  // banco primeiro (aqui: os mapas do processo), depois os arquivos, só dentro das pastas deste pid
  projetos.delete(p.id);
  for (let i = eventos.length - 1; i >= 0; i--) if (eventos[i].projeto === p.id) eventos.splice(i, 1);
  for (let i = LINKS.length - 1; i >= 0; i--) if (LINKS[i].projeto === p.id) LINKS.splice(i, 1);
  for (const m of [CONVERSA.espera, CONVERSA.rodando, CONVERSA.rascunho, CONVERSA.interrompido]) m.delete(p.id);
  if (RE_PID.test(p.id)) {
    for (const base of ['entrada', 'derivados', 'projetos', 'saidas']) {
      const alvo = path.join(ARM, base, p.id);
      if (path.dirname(alvo) === path.join(ARM, base)) fs.rmSync(alvo, { recursive: true, force: true });
    }
  }
  return json(res, 200, { apagado: true, arquivos: 'apagando' });
}
function rotaRetirar(res, p, v) {
  if (!/^v[0-9]{1,3}$/.test(v ?? '') || !p.versoes.some((x) => x.id === v)) return falha(res, 404, 'versão não encontrada');
  if (!ENT.ligado) return falha(res, 503, 'a página de entregas está desligada neste servidor');
  const e = p.dados.entregas?.[v];
  if (e?.estado === 'retirando') return json(res, 202, { estado: 'retirando' });
  if (!NA_PAGINA.includes(e?.estado)) return falha(res, 409, 'esta versão não está na página de entregas');
  retirarEntregas(p, v);
  return json(res, 202, { estado: 'retirando' });
}

// ---------- regras da casa no Caderno (R16 a R19) ----------
const MEM = { regras: [], checagens: [], vocabulario: [], apagados: new Set() };
const idVoc = (de) => 'v_' + createHash('sha1').update(semAcento(String(de ?? '')).toLowerCase().trim()).digest('hex').slice(0, 8);
const RE_ORIGEM = /^reprovação do dono · (p_[a-z0-9]+)\/(v[0-9]{1,3}) · (\d{4}-\d{2}-\d{2})$/;
const RE_APAGAVEL = { regra: /^r_dono_[0-9a-f]{8}$/, checagem: /^c_dono_[0-9a-f]{8}$/, vocabulario: /^v_[0-9a-f]{8}$/ };
const TIPOS_CHECAGEM_DONO = ['legenda_proibida', 'fecho_contem', 'duracao_max', 'duracao_min', 'vazio_max_s', 'revisao_humana'];
function deOndeF(origem) {
  const m = RE_ORIGEM.exec(String(origem ?? ''));
  if (!m) return null;
  const nome = projetos.get(m[1])?.nome;
  return { projeto: m[1], versao: m[2], data: m[3], ...(nome ? { nome } : {}) };
}
function aoApagarF(tipo, it) {
  if (tipo === 'regra') return 'Deixa de valer nos próximos filmes. Nenhum filme é refeito.';
  if (tipo === 'checagem') return TIPOS_CHECAGEM_DONO.includes(it.tipo) ? 'O editor para de conferir isto nos próximos filmes. Nenhum filme é refeito.'
    : 'Some só o seu pedido; a conferência fixa do editor continua. Nenhum filme é refeito.';
  return `A legenda deixa de trocar “${it.de}” por “${it.para}” nos próximos filmes. Nenhum filme é refeito.`;
}
function itemDono(tipo, it) {
  const onde = deOndeF(it.origem);
  return { ...it, apagavel: true, ...(onde ? { de_onde: onde } : {}), ao_apagar: aoApagarF(tipo, it) };
}
function memoriaOnda3(base) {
  const fora = MEM.apagados;
  return {
    ...base,
    regras: [...MEM.regras.filter((r) => !fora.has(r.id)).map((r) => itemDono('regra', r)), ...base.regras.map((r) => ({ ...r, apagavel: false }))],
    checagens: [...MEM.checagens.filter((c) => !fora.has(c.id)).map((c) => itemDono('checagem', c)), ...base.checagens.map((c) => ({ ...c, apagavel: false }))],
    vocabulario: [...MEM.vocabulario.filter((v) => !fora.has(v.id)).map((v) => itemDono('vocabulario', v)), ...base.vocabulario.map((v) => ({ ...v, id: idVoc(v.de), apagavel: false }))],
  };
}
async function rotaApagarMemoria(res, partes) {
  const [, , qual, ident, acao] = partes;
  const tipo = { regras: 'regra', checagens: 'checagem', vocabulario: 'vocabulario' }[qual];
  if (!tipo || acao !== 'apagar' || partes.length !== 5) return falha(res, 404, 'rota não encontrada');
  if (!RE_APAGAVEL[tipo].test(ident ?? '')) return falha(res, 404, 'só dá para apagar o que nasceu de um ajuste seu');
  const lista = MEM[{ regra: 'regras', checagem: 'checagens', vocabulario: 'vocabulario' }[tipo]];
  const it = lista.find((x) => x.id === ident);
  if (!it || MEM.apagados.has(ident)) return falha(res, 404, { regra: 'essa regra não existe mais', checagem: 'essa conferência não existe mais', vocabulario: 'essa palavra não existe mais' }[tipo]);
  if (tipo === 'checagem' && [...projetos.values()].some((p) => p.rodando && ['qa', 'entrega'].includes(marcarEtapa(p)))) {
    return falha(res, 409, 'uma conferência ou entrega está rodando agora; apague quando ela terminar');
  }
  MEM.apagados.add(ident);
  const texto = tipo === 'regra' ? it.texto : tipo === 'checagem' ? it.descricao : `${it.de} → ${it.para}`;
  return json(res, 200, { apagado: { tipo, id: ident, texto } });
}
function semearMemoriaF(c) {
  const de = c.projeto && projetos.has(c.projeto) ? c.projeto : 'p_aceite0000';
  const hoje = new Date().toISOString().slice(0, 10);
  MEM.apagados.clear();
  MEM.regras = [
    { id: 'r_dono_1a2b3c4d', texto: 'Nunca abrir com tela preta: o primeiro quadro já mostra o produto.', origem: `reprovação do dono · ${de}/v2 · ${hoje}` },
    { id: 'r_dono_5e6f7a8b', texto: 'Legenda nunca cobre o rosto de quem fala.', origem: 'reprovação do dono · p_jaapagado01/v1 · 2026-11-12' },
  ];
  MEM.checagens = [{ id: 'c_dono_1a2b3c4d', tipo: 'legenda_proibida', descricao: 'A legenda não pode ter “clique no link”.', gravidade: 'bloqueia', origem: `reprovação do dono · ${de}/v2 · ${hoje}` }];
  MEM.vocabulario = [{ id: idVoc('criete'), de: 'criete', para: 'creat', origem: `reprovação do dono · ${de}/v2 · ${hoje}` }];
  return { regras: MEM.regras.length, checagens: MEM.checagens.length, vocabulario: MEM.vocabulario.length, vocabulario_id: MEM.vocabulario[0].id };
}

// ---------- cenários do aceite (/v1/_falso/cenario) ----------
function cenarioF(p, c) {
  const qual = String(c.cenario ?? '');
  const garantirVersao = (estado) => {
    let v = maisNova(p);
    // nova: true deixa a versão entregue como está e cria a seguinte (o fluxo do ajuste: V1 entregue, V2 segurada)
    if (!v || v.estado === 'reprovada' || p.dados.aprovadas?.[v.id] || (c.nova === true && v.estado === 'entregue')) {
      v = { id: `v${p.versoes.length + 1}`, estado, video: null, qa: null, link: null, reprovacao: null, criado: agora() };
      p.versoes.push(v);
    }
    v.estado = estado;
    return v;
  };
  if (qual === 'erro_montagem' || qual === 'erro_entrega') {
    const de = qual === 'erro_montagem' ? 'montagem' : 'entrega';
    const v = garantirVersao(qual === 'erro_montagem' ? 'erro' : 'aprovada_qa');
    p.falhou = { de, versao: v.id };
    p.estado = 'erro';
    emitir(p.id, 'etapa_erro', { etapa: de, alvo: v.id, mensagem: de === 'montagem' ? `A montagem da ${v.id.toUpperCase()} parou: o render caiu no meio.` : `A entrega da ${v.id.toUpperCase()} parou.`, dados: { detalhe: 'RuntimeError: ffmpeg saiu com código 137', vai_tentar: false } });
    emitir(p.id, 'estado', { estado: 'erro', mensagem: `A ${de} da ${v.id} parou com erro.` });
    return { ok: true, versao: v.id };
  }
  if (qual === 'reprovado_qa') {
    const v = garantirVersao('reprovada_qa');
    if (c.segurada !== false) {                // onda 4: a segurada tem o filme montado e o relatório que reprovou
      const chave = `saidas/${p.id}/${v.id}/final.mp4`;
      const destino = path.join(ARM, chave);
      if (!fs.existsSync(destino)) { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.copyFileSync(AMOSTRA, destino); }
      v.video = chave;
      v.qa = JSON.stringify(QA_SEGURADA(p.id, v.id));
    } else { v.video = null; }
    p.falhou = null;
    p.regrasMudaram = Boolean(c.mudou);
    p.estado = 'reprovado_qa';
    emitir(p.id, 'estado', { estado: 'reprovado_qa', mensagem: `A conferência segurou a ${v.id}.` });
    return { ok: true, versao: v.id };
  }
  if (qual === 'regras_mudaram') { p.regrasMudaram = true; emitir(p.id, 'estado', { mensagem: 'As regras da casa mudaram.' }); return { ok: true }; }
  if (qual === 'video_falhou') {
    const a = p.arquivos[Number.isInteger(c.n) ? c.n - 1 : p.arquivos.length - 1];
    if (!a) return { ok: false };
    a.estado = 'falhou';
    emitir(p.id, 'etapa_erro', { etapa: 'analise', alvo: a.id, mensagem: `A leitura do vídeo ${nVideo(p, a.id)} parou.`, dados: { detalhe: 'ValueError: moov atom not found', vai_tentar: false } });
    if (c.erro) { p.estado = 'erro'; p.falhou = { de: 'leitura', arquivo_id: a.id }; emitir(p.id, 'estado', { estado: 'erro', mensagem: `O vídeo ${nVideo(p, a.id)} não pôde ser lido.` }); }
    else emitir(p.id, 'aviso', { alvo: a.id, mensagem: `O vídeo ${nVideo(p, a.id)} não pôde ser lido e ficou de fora. O resto do material segue.` });
    return { ok: true, arquivo_id: a.id };
  }
  if (qual === 'ocupar') { p.rodando = Boolean(c.ligado); return { ok: true }; }
  return { ok: false };
}

// ---------- conversa: as trilhas da casa (falso), os cartões novos e o que acontece no toque ----------
const TRILHAS_F = [{ id: 'noite-clara', titulo: 'Noite Clara', bpm: 96, dur_s: 64, clima: 'calmo' }, { id: 'pulso-de-feira', titulo: 'Pulso de Feira', bpm: 104, dur_s: 58, clima: 'animado' }];
const trilhaDa = (v) => TRILHAS_F.find((t) => t.id === (v?.trilha ?? 'noite-clara')) ?? TRILHAS_F[0];
function porqueTrilhaF(p, V, trilha) {
  const m = maisNova(p);
  const v = p.versoes.find((x) => x.id === V);
  if (!v) return `a versão ${V} não existe`;
  if (v.id !== m.id) return `a ${V} não é a mais nova; a mais nova é a ${m.id}`;
  if (p.dados.aprovadas?.[V]) return `a ${V} já foi aprovada`;
  if (p.rodando) return `a mesa está trabalhando neste projeto agora (${ROTULO_FILA[marcarEtapa(p)] ?? 'a montagem'}); espere terminar`;
  if (v.estado !== 'entregue') return `a ${V} ainda não foi entregue (está ${v.estado})`;
  if (!TRILHAS_F.some((t) => t.id === trilha)) return 'essa música não está na biblioteca (ou não tem licença registrada)';
  if (trilhaDa(v).id === trilha) return `a ${V} já usa essa música`;
  return null;
}
function cartaoTrilhaF(p, V, trilha) {
  const nova = TRILHAS_F.find((t) => t.id === trilha);
  const atual = trilhaDa(p.versoes.find((x) => x.id === V));
  const faz = `Trocar a música da ${V} por “${nova.titulo}” (${nova.bpm} bpm), sem nova direção.`;
  return { acao: 'trilha', versao: V, titulo: `Trocar a música da ${V}`, texto_exato: faz, faz,
    mudancas: [{ campo: 'Música', antes: atual.titulo, depois: nova.titulo }], nao_muda: 'Os mesmos trechos, falas, legendas, cor e fecho.',
    atencao: 'Os cortes andam até uma batida para casar com a música nova, então a duração pode mudar um pouco.',
    refaz: ['encaixe', 'montagem', 'qa', 'entrega'], comeca_agora: true, custo_usd_est: 0.12, custo_ate: false,
    partes: [{ rotulo: 'Olhar o filme novo com IA (conferência)', usd: 0.12 }], minutos_est: 10, vira_regra: false, botao: 'Trocar a música',
    volta: `A ${V} continua guardada e pode ser aprovada. A música nova sai na v${p.versoes.length + 1}. Se a conferência reprovar, o editor para e espera você.` };
}
function cartaoRefazerF(o) {
  const c = { acao: 'refazer', de: o.de, titulo: o.titulo, texto_exato: o.faz, faz: o.faz, refaz: o.refaz, comeca_agora: true, custo_usd_est: o.custo_usd_est,
    custo_ate: o.custo_ate, minutos_est: o.minutos_est, vira_regra: false, volta: o.volta, botao: o.botao };
  for (const k of ['versao', 'arquivo_id', 'n_video', 'atencao', 'partes']) if (o[k] !== undefined) c[k] = o[k];
  return c;
}
function cartaoNotaF(texto, versao, tempo) {
  const onde = versao && typeof tempo === 'number' ? ` em ${Math.floor(tempo / 60)}:${String(Math.floor(tempo % 60)).padStart(2, '0')} da ${versao}` : versao ? ` da ${versao}` : '';
  return { acao: 'nota', ...(versao ? { versao } : {}), ...(typeof tempo === 'number' ? { tempo_s: Math.round(tempo * 10) / 10 } : {}), titulo: 'Guardar uma nota', texto_exato: texto,
    faz: `Guardar esta nota no projeto${onde}. Não refaz nada e não gasta.`, refaz: [], comeca_agora: false, custo_usd_est: 0, minutos_est: 0, vira_regra: false,
    volta: 'A nota fica na lista de notas do projeto (cabem até 50 por projeto).', botao: 'Guardar a nota' };
}
function abrirCartaoF(pid, ctx, prefixo, dados, entrada) {
  const tid = novaFerramenta(prefixo);
  const d = { turno: ctx.turno, tool_use_id: tid, ...dados, entrada_hash: hashC(tid, entrada) };
  CONVERSA.espera.set(pid, { tipo: 'confirmacao', tool_use_id: tid, turno: ctx.turno, desde: agora(), dados: d, entrada });
  emitirC(pid, 'confirmacao', d);
}
/** Os roteiros novos do cérebro falso ("tenta de novo", "troca a música", "anota …", "onde …"). true = tratou o turno. */
async function turnoOnda3(pid, ctx, texto, contexto) {
  const p = projetos.get(pid);
  const t = texto.toLowerCase();
  if (/tenta(r)? de novo/.test(t)) {
    const o = opcoesF(p).opcoes.find((x) => x.pela_conversa);
    if (!o) { await escreverC(pid, ctx, 'Não há etapa que falhou para refazer agora. Se quiser mudar o filme, peça um ajuste.'); fimC(pid, ctx, 'end_turn'); return true; }
    await escreverC(pid, ctx, `${o.titulo}: preparei o cartão. Não chama a direção; confira o custo antes de tocar.`, 8);
    abrirCartaoF(pid, ctx, 'ref', cartaoRefazerF(o), { de: o.de, versao: o.versao ?? null, arquivo_id: o.arquivo_id ?? null });
    fimC(pid, ctx, 'pausa');
    return true;
  }
  if (/troca(r)? (a|de) m[uú]sica/.test(t)) {
    const v = maisNova(p);
    const emUso = trilhaDa(v);
    if (!(await ferramentaC(pid, ctx, 'ver_trilhas', {}, `Viu ${TRILHAS_F.length} trilhas`, 1500))) return true;
    const nova = TRILHAS_F.find((x) => x.id !== emUso.id);
    const porque = v ? porqueTrilhaF(p, v.id, nova.id) : 'ainda não há versão pronta';
    if (porque) { await escreverC(pid, ctx, `Ainda não dá para trocar a música: ${porque}.`); fimC(pid, ctx, 'end_turn'); return true; }
    await escreverC(pid, ctx, `Escolhi “${nova.titulo}”, a trilha da casa que não está tocando. Só a música muda; confira no cartão.`, 8);
    abrirCartaoF(pid, ctx, 'mus', cartaoTrilhaF(p, v.id, nova.id), { versao: v.id, trilha: nova.id });
    fimC(pid, ctx, 'pausa');
    return true;
  }
  if (/^anota\b/.test(t)) {
    const nota = texto.replace(/^anota\s*(a[ií]\s*)?[:,-]?\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!nota) { await escreverC(pid, ctx, 'O que você quer que eu anote?'); fimC(pid, ctx, 'end_turn'); return true; }
    if ((p.dados.notas ?? []).length >= 50) { await escreverC(pid, ctx, 'Não dá para anotar: o projeto já tem 50 notas.'); fimC(pid, ctx, 'end_turn'); return true; }
    const versao = typeof contexto?.versao === 'string' ? contexto.versao : undefined;
    const tempo = typeof contexto?.t_player === 'number' ? contexto.t_player : undefined;
    await escreverC(pid, ctx, 'Montei a nota. Ela só é guardada se você tocar no cartão.', 6);
    abrirCartaoF(pid, ctx, 'not', cartaoNotaF(nota, versao, tempo), { texto: nota, versao: versao ?? null, tempo_s: tempo ?? null });
    fimC(pid, ctx, 'pausa');
    return true;
  }
  if (/^onde\b/.test(t)) {
    const v = maisNova(p);
    if (!(await ferramentaC(pid, ctx, 'onde_esta', { versao: v?.id ?? null, busca: texto.slice(5, 40) }, v ? 'Achou 2 pontos' : 'Não achou a versão', 600))) return true;
    await continuarC(pid, ctx, v ? `Na ${v.id.toUpperCase()} isso aparece em **0:04** e em **0:11**. Toque no ponto para abrir no player.` : 'Ainda não há filme para procurar.');
    return true;
  }
  return false;
}
/** R6 para os cartões novos. Devolve [status, corpo] já respondido ao fio (evento resposta). */
function confirmarOnda3(p, esp, ev) {
  const pid = p.id;
  const acao = esp.dados.acao;
  const negar = (porque) => { emitirC(pid, 'resposta', { ...ev, resultado: 'nao_deu', detalhe: `não deu: ${porque}` }); return [409, { detail: `não deu: ${porque}` }]; };
  if (acao === 'refazer') {
    const e = esp.entrada;
    const porque = porqueF(p, e.de, { versao: e.versao ?? undefined, arquivo_id: e.arquivo_id ?? undefined });
    if (porque) return negar(porque);
    const o = opcaoF(p, e.de, { v: e.versao ?? undefined, aid: e.arquivo_id ?? undefined });
    executarF(p, e.de, { versao: e.versao ?? undefined, arquivo_id: e.arquivo_id ?? undefined });
    emitirC(pid, 'resposta', { ...ev, resultado: 'feito', detalhe: TEXTO_FEITO[e.de](o) });
    return [200, { feito: true, resultado: { refazendo: e.de } }];
  }
  if (acao === 'trilha') {
    const { versao, trilha } = esp.entrada;
    const porque = porqueTrilhaF(p, versao, trilha);
    if (porque) return negar(porque);
    p.rodando = true;
    p.dados.correcoes_auto = 2;
    mudarEstado(p, 'dirigindo', `Trocando a música da ${versao}, sem nova direção.`);
    (async () => {
      await etapa(p, 'direcao', null, ['Trocando só a música, sem nova direção…', 'Encaixando os cortes na batida da música nova']);
      const nova = { id: `v${p.versoes.length + 1}`, estado: 'montando', video: null, qa: null, link: null, reprovacao: null, criado: agora(), trilha };
      p.versoes.push(nova);
      mudarEstado(p, 'montando', `Música trocada (${nova.id}). Custo da direção: US$ 0,00.`);
      await fimDaVersao(p, nova, true);
    })().finally(() => { p.rodando = false; });
    emitirC(pid, 'resposta', { ...ev, resultado: 'feito', detalhe: 'Feito. A música está sendo trocada; a versão nova aparece na mesa.' });
    return [200, { feito: true, resultado: { trocando_musica: true } }];
  }
  // nota
  if ((p.dados.notas ?? []).length >= 50) return negar('o projeto já tem 50 notas');
  const { texto, versao, tempo_s } = esp.entrada;
  if (versao && !p.versoes.some((x) => x.id === versao)) return negar(`a versão ${versao} não existe`);
  const n = { id: 'n_' + randomBytes(3).toString('hex'), texto, ...(versao ? { versao } : {}), ...(typeof tempo_s === 'number' ? { t: tempo_s } : {}), em: agora(), por: 'conversa' };
  (p.dados.notas ??= []).push(n);
  emitirC(pid, 'resposta', { ...ev, resultado: 'feito', detalhe: 'Nota guardada.' });
  return [200, { feito: true, resultado: { nota: n.id } }];
}


// ---------- onda 4: marca do cliente (logo e mascote) e versão segurada pela conferência ----------
// Mesmas rotas, status e frases do motor real (motor/api/marcas.py, motor/api/versoes.py, motor/api/motivos_qa.py). A conferência
// da imagem aqui é só pelo cabeçalho (o motor real regrava a imagem com o Pillow); grava em $EDITOR_DADOS/armazenamento/marcas.
const RE_CLIENTE_F = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const POSES_F = ['espiada', 'placa', 'moto', 'carro', 'aceno'];
const TIPOS_IMG = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITE_IMG = 8 * 1024 * 1024;
const slugMarca = (t) => { const x = slug(String(t ?? '')).slice(0, 40).replace(/-+$/, ''); return RE_CLIENTE_F.test(x) ? x : null; };
const MARCAS_DIR = path.join(ARM, 'marcas');
function lerMarcaF(s) {
  const f = path.join(MARCAS_DIR, s, 'marca.json');
  let m = { slug: s, nome: nomeCliente(s), logo: null, mascote: {} };
  try { m = { ...m, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { /* sem ficha */ }
  if (m.logo && !fs.existsSync(path.join(MARCAS_DIR, s, 'logo.png'))) m.logo = null;
  return m;
}
function gravarMarcaF(m) {
  fs.mkdirSync(path.join(MARCAS_DIR, m.slug), { recursive: true });
  fs.writeFileSync(path.join(MARCAS_DIR, m.slug, 'marca.json'), JSON.stringify(m));
}
function lerBruto(req, limite) {
  return new Promise((ok) => {
    let t = 0; const partes = []; let estourou = false;
    req.on('data', (c) => { t += c.length; if (t > limite) { estourou = true; partes.length = 0; } else if (!estourou) partes.push(c); });
    req.on('end', () => ok(estourou ? null : Buffer.concat(partes)));
    req.on('error', () => ok(null));
  });
}
// cabeçalho da imagem: [largura, altura, alfa, animada] ou null (não é PNG, JPEG nem WEBP)
function medirImagem(b) {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString('latin1', 12, 16) === 'IHDR') {
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20), tipo = b[25];
    return [w, h, tipo === 4 || tipo === 6 || b.includes(Buffer.from('tRNS')), b.includes(Buffer.from('acTL'))];
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5), false, false];
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const k = b.toString('latin1', 12, 16);
    if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), Boolean(b[20] & 0x10), Boolean(b[20] & 0x02)];
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff), Boolean((v >> 28) & 1), false]; }
    if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff, false, false];
  }
  return null;
}
function listaMarcasF() {
  let dirs = [];
  try { dirs = fs.readdirSync(MARCAS_DIR).filter((d) => slugMarca(d) === d).sort(); } catch { /* nenhuma */ }
  const out = [];
  for (const s of dirs) {
    const m = lerMarcaF(s);
    const poses = POSES_F.filter((x) => m.mascote?.[x] && fs.existsSync(path.join(MARCAS_DIR, s, 'mascote', `${x}.png`)));
    if (!m.logo && !poses.length) continue;
    const datas = [m.logo?.enviado_em, ...poses.map((x) => m.mascote[x].enviado_em)].filter(Boolean).sort();
    out.push({ slug: s, nome: m.nome, logo: Boolean(m.logo), atualizado: datas.pop() ?? null, mascote: poses,
      medidas: m.logo ? { w: m.logo.w, h: m.logo.h, alfa: m.logo.alfa } : null });
  }
  return out;
}
function servirPng(res, f) {
  if (!fs.existsSync(f)) return falha(res, 404, 'imagem não cadastrada');
  const b = fs.readFileSync(f);
  res.writeHead(200, { 'content-type': 'image/png', 'content-length': b.length, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-cache' });
  res.end(b);
}
async function rotaMarcas(req, res, partes) {
  const M = req.method;
  const [, , cliente, alvo, pose, fim] = partes;
  if (!cliente) return M === 'GET' ? json(res, 200, { marcas: listaMarcasF(), fixos: CLIENTES_FIXOS }) : falha(res, 405, 'método não permitido');
  const s = slugMarca(cliente);
  if (!s) return falha(res, 422, 'nome de cliente inválido');
  const ehLogo = alvo === 'logo';
  if (!ehLogo && alvo !== 'mascote') return falha(res, 404, 'rota não encontrada');
  if (!ehLogo && !POSES_F.includes(pose ?? '')) return falha(res, 404, 'pose do mascote não existe');
  const apagar = ehLogo ? pose === 'apagar' : fim === 'apagar';
  const arq = ehLogo ? path.join(MARCAS_DIR, s, 'logo.png') : path.join(MARCAS_DIR, s, 'mascote', `${pose}.png`);
  if (M === 'GET' && !apagar && (ehLogo ? !pose : !fim)) return servirPng(res, arq);
  if (M !== 'POST') return falha(res, 405, 'método não permitido');
  const m = lerMarcaF(s);
  if (apagar) {
    fs.rmSync(arq, { force: true });
    if (ehLogo) m.logo = null; else delete m.mascote[pose];
    gravarMarcaF(m);
    return json(res, 200, ehLogo ? { slug: s, logo: false } : { slug: s, pose, apagada: true });
  }
  if (ehLogo ? pose : fim) return falha(res, 404, 'rota não encontrada');
  const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!TIPOS_IMG.includes(tipo)) return falha(res, 415, 'tipo de arquivo não aceito: mande a imagem em PNG, JPEG ou WEBP');
  if (Number(req.headers['content-length'] ?? 0) > LIMITE_IMG) return falha(res, 413, 'imagem grande demais: mande com até 8 MB');
  const b = await lerBruto(req, LIMITE_IMG);
  if (b === null) return falha(res, 413, 'imagem grande demais: mande com até 8 MB');
  const med = b.length ? medirImagem(b) : null;
  if (!med) return falha(res, 422, 'não é uma imagem válida');
  let [w, h, alfa, animada] = med;
  if (w * h > 16_000_000) return falha(res, 422, 'imagem grande demais: mande com até 16 milhões de pixels (4000 × 4000)');
  if (animada) return falha(res, 422, 'imagem animada não serve como logo');
  if (Math.max(w, h) < 512) return falha(res, 422, 'imagem pequena demais: mande com pelo menos 512 px no lado maior');
  if (!ehLogo && !alfa) return falha(res, 422, 'o mascote precisa de fundo transparente');
  if (Math.max(w, h) > 2048) { const k = 2048 / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, b);              // o motor real regrava em PNG; o falso guarda como chegou (só serve à tela)
  const ficha = { sha256: createHash('sha256').update(b).digest('hex'), w, h, alfa, enviado_em: agora() };
  if (ehLogo) m.logo = ficha; else m.mascote = { ...(m.mascote ?? {}), [pose]: ficha };
  gravarMarcaF(m);
  return json(res, 200, ehLogo ? { slug: s, logo: true, w, h, alfa } : { slug: s, pose, w, h, alfa });
}

const MOTIVOS_F = {
  fala_cortada: ['Fala cortada', 'Uma fala foi cortada antes de terminar'],
  voz_externa: ['Voz de fora', 'Dá para ouvir a voz de alguém que não devia estar no filme'],
  cobertura_sintonia: ['Boca fora de sincronia', 'Aparece alguém falando fora de sincronia com a voz'],
  frase_repetida: ['Frase em laço', 'Uma frase se repete no fundo, como em laço'],
  tom_sala_sem_voz: ['Fundo com conversa', 'O som de fundo tem gente conversando'],
  legenda_x_fala: ['Legenda diferente da fala', 'A legenda não bate com o que foi dito'],
};
// o caso real de 26/11 (diálogo do Super Kal), num filme de amostra de 5 s
const QA_SEGURADA = (pid, v) => ({
  versao: '1', projeto: pid, video: `saidas/${pid}/${v}/final.mp4`, aprovado: false, tempo_s: 52,
  checagens: [
    { id: 'duracao', ok: true, bloqueia: true, valor: { video_s: 5, edl_s: 5 } },
    { id: 'lufs', ok: true, bloqueia: true, valor: -14.1 },
    { id: 'fala_cortada', ok: false, bloqueia: true, detalhe: '2 de 9 falas cortadas no fim', valor: { problemas: [{ id: 'V3', onde: 'fim', t: 1.2, s: 81.3 }, { id: 'V7', onde: 'fim', t: 3.6, s: 9.9 }] } },
    { id: 'voz_externa', ok: false, bloqueia: true, detalhe: 'conversa no som direto do plano P2', valor: { achados: [{ id: 'P2', t: [2.4, 3.1] }] } },
    { id: 'cobertura_sintonia', ok: false, bloqueia: true, detalhe: 'segunda câmera com rosto sobre a fala', valor: { coberturas: { P4: { trechos: [{ plano: 'P4', t0: 4.1, t1: 4.9 }] } } } },
    { id: 'tom_sala_sem_voz', ok: false, bloqueia: true, detalhe: 'tom de sala com gente conversando' },
    { id: 'legenda_sobre_rosto', ok: false, bloqueia: false, detalhe: 'aviso', valor: [{ t: 0.5 }] },
  ],
});
function quandoF(valor, dur) {
  const ts = [];
  const andar = (x, prof = 0) => {
    if (prof > 6 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.slice(0, 60).forEach((y) => andar(y, prof + 1)); return; }
    for (const k of ['t', 'pior_t']) { const t = x[k]; if (typeof t === 'number') ts.push(t); else if (Array.isArray(t) && typeof t[0] === 'number') ts.push(t[0]); }
    if (typeof x.t0 === 'number' && typeof x.t1 === 'number') ts.push(x.t0);
    for (const [k, y] of Object.entries(x)) if (!['t', 'pior_t', 't0', 't1', 's', 's0', 's1'].includes(k) && y && typeof y === 'object') andar(y, prof + 1);
  };
  andar(valor);
  const out = [];
  for (const t of ts.sort((a, b) => a - b)) {
    if (t < 0 || (dur && t > dur + 0.5)) continue;
    const r = Math.round(t * 10) / 10;
    if (!out.length || r - out[out.length - 1] >= 1) out.push(r);
    if (out.length >= 6) break;
  }
  return out.length ? out : null;
}
function seguradaF(p, v) { return v.estado === 'reprovada_qa' && Boolean(v.video) && fs.existsSync(path.join(ARM, v.video)); }
function rotaSegurada(req, res, p, vid, resto) {
  const v = p.versoes.find((x) => x.id === vid);
  if (!v) return falha(res, 404, 'versão não encontrada');
  if (resto && resto !== 'video') return falha(res, 404, 'rota não encontrada');
  if (v.estado !== 'reprovada_qa') return falha(res, 409, 'esta versão não está segurada pela conferência');
  if (!seguradaF(p, v)) return falha(res, 410, 'o vídeo desta versão não existe mais');
  if (resto === 'video') {
    const f = path.join(ARM, v.video);
    const tam = fs.statSync(f).size;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let ini = 0, fim = tam - 1, status = 200;
    if (m && (m[1] || m[2])) {
      if (m[1]) { ini = Number(m[1]); fim = m[2] ? Math.min(Number(m[2]), tam - 1) : tam - 1; } else ini = Math.max(0, tam - Number(m[2]));
      if (ini > fim || ini >= tam) { res.writeHead(416, { 'content-range': `bytes */${tam}` }); return res.end(); }
      status = 206;
    }
    const h = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': fim - ini + 1, 'content-disposition': 'inline',
      'cache-control': 'no-store, private', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' };
    if (status === 206) h['content-range'] = `bytes ${ini}-${fim}/${tam}`;
    res.writeHead(status, h);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(f, { start: ini, end: fim }).pipe(res);
  }
  if (req.method === 'HEAD') return falha(res, 405, 'método não permitido');
  let qa = null;
  try { qa = typeof v.qa === 'string' ? JSON.parse(v.qa) : v.qa; } catch { qa = null; }
  const dur = qa?.checagens?.find((c) => c.id === 'duracao')?.valor?.video_s ?? null;
  const motivos = (qa?.checagens ?? []).filter((c) => !c.ok && c.bloqueia !== false).map((c) => {
    const [titulo, frase] = MOTIVOS_F[c.id] ?? ['Conferência técnica', `Uma conferência técnica não passou (${c.id})`];
    return { id: c.id, titulo, frase, quando: quandoF(c.valor, dur) };
  });
  return json(res, 200, { versao: v.id, estado: 'reprovada_qa', nao_entregue: true, video: `/v1/projetos/${p.id}/versoes/${v.id}/segurada/video`,
    duracao: dur, motivos, regra: 'Só para assistir aqui. Não foi entregue: não baixa, não compartilha e não vai para o cliente.' });
}
