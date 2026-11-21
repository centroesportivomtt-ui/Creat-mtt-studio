// hora/cartao.js · o cartão da trilha, 1080 x 1920, feito no celular e offline (Pixel, frontend B).
// ARQUITETURA 9.6 e DESIGN 7 (medidas exatas). O relevo vem do motor (Motor.relevoCartao) com a luz do
// MINUTO DA CHEGADA, desenhado direto da altitude: nada é copiado da tela WebGL. Nenhum cartão sai igual.
// Chegada = instante do 1º ponto gravado a até 60 m do destino; senão o fim da gravação. É fato: exata.
// "N min de sol no poço" = apaga EXIBIDO − max(chegada, sol chega ao poço). Chegou depois: frase de sombra,
// nunca "0 min". Destino sem hora de sol: o cartão sai honesto, sem frase de sol.
// Compartilhar: Web Share com arquivo (navigator.canShare({ files })); senão, baixar o PNG.

import { T, t, fraseCartao, legendasDoCartao, textoDaCasa, numeroBR, duracaoTexto } from '../textos.js';
import { hhmm, minutoDoDia, dataLocal, nascerEPor, utcDe } from '../motor/nucleo.js';
import { el, distanciaM, comprimentoM, baixarArquivo, icone } from '../util.js';
import { horasExibidas, minutosDeSolNoPoco, incertezaMin } from './regras.js';

const L = 1080, A = 1920;
const TINTA = '#FFF4DC', APOIO = '#E8D3AC', MADEIRA = '#3A2618', FUNDA = '#2B1B10';
const SOL = '#F5B83D', SOMBRA_POCO = '#4A6FD8', SOMBRA_TXT = '#93AEF5', PREGO = '#B8A48A';
const FAM = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
const CHEGADA_RAIO_M = 60;

const fonte = (peso, px) => `${peso} ${px}px ${FAM}`;

// números tabulares no canvas (DESIGN 7): cada dígito numa célula de 0,632 em
function numeroTabular(c, texto, x, y, px) {
  let a = x;
  for (const ch of texto) {
    const w = c.measureText(ch).width;
    if (/\d/.test(ch)) { c.fillText(ch, a + (0.632 * px - w) / 2, y); a += 0.632 * px; }
    else { c.fillText(ch, a, y); a += w; }
  }
  return a - x;
}
function larguraTabular(c, texto, px) {
  let a = 0;
  for (const ch of texto) a += /\d/.test(ch) ? 0.632 * px : c.measureText(ch).width;
  return a;
}

// quebra em até n linhas pela largura
function quebrar(c, texto, larguraMax, n) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (c.measureText(teste).width <= larguraMax || !atual) atual = teste;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas.length <= n ? linhas : null;
}

// gerador reproduzível (veio da madeira): mesma trilha, mesmo veio; outra trilha, outro
function sementeDe(...v) { let h = 2166136261 >>> 0; for (const x of v.join('|')) { h ^= x.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function aleatorio(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- dados da trilha
function coordsDe(trilha) {
  if (!trilha) return [];
  if (Array.isArray(trilha)) return trilha.map((c) => (Array.isArray(c) ? { lon: c[0], lat: c[1], t: c[3] ?? null } : c)).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (trilha.type === 'Feature') return coordsDe(trilha.geometry?.coordinates);
  if (Array.isArray(trilha.pontos)) return trilha.pontos.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (Array.isArray(trilha.coordinates)) return coordsDe(trilha.coordinates);
  return [];
}

export function chegadaDaTrilha(pontos, destinoCoord, fimMs) {
  if (destinoCoord) {
    for (const p of pontos) {
      if (Number.isFinite(p.t) && distanciaM([p.lon, p.lat], destinoCoord) <= CHEGADA_RAIO_M) return p.t;
    }
  }
  return Number.isFinite(fimMs) ? fimMs : (pontos.length && Number.isFinite(pontos[pontos.length - 1].t) ? pontos[pontos.length - 1].t : Date.now());
}

// ---------------------------------------------------------------- desenho
async function carregarFontes() {
  try {
    await Promise.all([document.fonts.load(fonte(700, 112)), document.fonts.load(fonte(400, 32))]);
  } catch (_) { /* sem fonte: o canvas usa a do sistema */ }
}

function relevoReserva(c) {
  // sem motor: um fundo de serra pintado (verde, ocre e quartzito), o traço por cima. Honesto e legível.
  const g = c.createLinearGradient(0, 0, 0, 1080);
  g.addColorStop(0, '#5E6A45'); g.addColorStop(0.55, '#3F5F38'); g.addColorStop(1, '#2E4A2C');
  c.fillStyle = g; c.fillRect(0, 0, L, A);
}

function projetarNaCaixa(pontos, caixa = [96, 440, 984, 960]) {
  if (!pontos.length) return [];
  const RAD = Math.PI / 180;
  const xy = pontos.map((p) => [p.lon, Math.log(Math.tan(Math.PI / 4 + p.lat * RAD / 2)) / RAD]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of xy) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cw = caixa[2] - caixa[0], ch = caixa[3] - caixa[1];
  const k = Math.min(cw / Math.max(x1 - x0, 1e-9), ch / Math.max(y1 - y0, 1e-9)) * 0.86;
  const ox = caixa[0] + (cw - (x1 - x0) * k) / 2, oy = caixa[1] + (ch - (y1 - y0) * k) / 2;
  return xy.map(([x, y]) => [ox + (x - x0) * k, oy + (y1 - y) * k]);
}

function desenharCartao(c, d) {
  // A. relevo (já em d.imagem, 1080x1920) ou reserva
  if (d.imagem) c.putImageData(d.imagem, 0, 0);
  else relevoReserva(c);

  // B. véu de cima
  let g = c.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, 'rgba(23,18,13,0.78)'); g.addColorStop(1, 'rgba(23,18,13,0)');
  c.fillStyle = g; c.fillRect(0, 0, L, 420);

  c.textBaseline = 'top';
  c.textAlign = 'left';

  // C. marca
  c.fillStyle = d.cor; c.fillRect(72, 262, 10, 92);
  c.strokeStyle = TINTA; c.lineWidth = 2; c.strokeRect(71, 261, 12, 94);
  let topoNome = 262, pxNome = 48;
  if (d.logo) {
    c.fillStyle = TINTA; c.fillRect(100, 256, 424, 124);
    const r = Math.min(400 / d.logo.width, 100 / d.logo.height);
    c.drawImage(d.logo, 112, 268, d.logo.width * r, d.logo.height * r);
    topoNome = 392; pxNome = 30;
  }
  const nome1 = d.parceiro || d.nomeApp;
  const nome2 = d.parceiro ? d.nomeApp : t('cartao.slogan_padrao', {}, 'mapa das cachoeiras sem internet');
  for (; pxNome >= 36 || (d.logo && pxNome >= 24); pxNome -= 2) { c.font = fonte(700, pxNome); if (c.measureText(nome1).width <= 836) break; }
  c.fillStyle = TINTA; c.fillText(nome1, 100, topoNome, 836);
  if (!d.logo) { c.font = fonte(400, 30); c.fillStyle = APOIO; c.fillText(nome2, 100, 322, 836); }

  // D. luz real do minuto da chegada
  c.save();
  c.shadowColor = 'rgba(23,18,13,.9)'; c.shadowBlur = 8;
  c.font = fonte(400, 30); c.fillStyle = TINTA;
  c.fillText(t('cartao.luz_real', { data: d.dataCurta, hora: d.chegadaHHMM }), 72, d.logo ? 432 : 384);
  c.restore();

  // E. traço
  const tr = d.tracadoPx;
  if (tr.length >= 2) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); tr.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = TINTA; c.lineWidth = 18; c.stroke();
    c.strokeStyle = d.cor; c.lineWidth = 10; c.stroke();
    const [xi, yi] = tr[0];
    c.beginPath(); c.arc(xi, yi, 14, 0, Math.PI * 2); c.fillStyle = TINTA; c.fill(); c.lineWidth = 5; c.strokeStyle = MADEIRA; c.stroke();
    const [xf, yf] = tr[tr.length - 1];
    c.beginPath(); c.arc(xf, yf, 22, 0, Math.PI * 2); c.fillStyle = d.modo === 'sombra' ? SOMBRA_POCO : d.modo === 'sol' ? SOL : MADEIRA; c.fill();   // sem hora: sem cor de sol
    c.lineWidth = 6; c.strokeStyle = TINTA; c.stroke();
  }

  // F. tábua
  c.fillStyle = FUNDA; c.fillRect(0, 1034, L, 6);
  c.fillStyle = MADEIRA; c.fillRect(0, 1040, L, A - 1040);
  const rnd = aleatorio(d.semente);
  for (let y = 1046, i = 0; y < A; y += 9, i++) {
    c.beginPath();
    c.moveTo(0, y + (rnd() - 0.5) * 3);
    const curva = (rnd() - 0.5) * 7;
    c.bezierCurveTo(L * 0.33, y + curva, L * 0.66, y - curva, L, y + (rnd() - 0.5) * 3);
    c.lineWidth = 1 + (i % 3 === 0 ? 1 : 0);
    c.strokeStyle = i % 2 ? 'rgba(43,27,16,.45)' : 'rgba(74,48,32,.55)';
    c.stroke();
  }
  c.fillStyle = 'rgba(255,244,220,.10)'; c.fillRect(0, 1040, L, 4);
  for (const [x, y] of [[40, 1084], [1040, 1084], [40, 1880], [1040, 1880]]) {
    c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fillStyle = PREGO; c.fill(); c.lineWidth = 2; c.strokeStyle = FUNDA; c.stroke();
  }

  // H. destino (até 2 linhas, 64 px; mais que isso, 56 px)
  c.fillStyle = TINTA;
  let px = 64; c.font = fonte(700, px);
  let linhas = quebrar(c, d.destino, 600, 2);
  if (!linhas) { px = 56; c.font = fonte(700, px); linhas = quebrar(c, d.destino, 600, 3) || [d.destino]; }
  linhas.forEach((ln, i) => c.fillText(ln, 72, 1100 + i * (px + 6), 600));

  // I. frase
  c.font = fonte(400, 32); c.fillStyle = APOIO;
  c.fillText(T.cartao.chegada_rotulo, 72, 1272);
  c.font = fonte(700, 112); c.fillStyle = TINTA;
  numeroTabular(c, d.chegadaHHMM, 72, 1312, 112);
  if (d.modo !== 'sem-hora') {
    c.font = fonte(400, 32); c.fillStyle = APOIO;
    c.fillText(d.modo === 'sombra' ? t('cartao.apagou_rotulo', {}, 'a serra apagou o sol') : T.cartao.apaga_rotulo, 560, 1272);
    c.font = fonte(700, 112); c.fillStyle = d.modo === 'sombra' ? SOMBRA_TXT : TINTA;
    numeroTabular(c, d.apagaHHMM, 560, 1312, 112);
    c.font = fonte(700, 56);
    c.fillStyle = d.modo === 'sombra' ? SOMBRA_TXT : SOL;
    c.fillText(d.modo === 'sombra' ? T.cartao.linha_sombra : t('cartao.linha_sol', { min: d.minSol }), 72, 1452, 936);
    c.font = fonte(400, 30); c.fillStyle = APOIO;
    c.fillText(d.nota, 72, 1522, 936);
  } else if (d.semHoraTexto) {
    c.font = fonte(400, 32); c.fillStyle = APOIO;
    const ls = quebrar(c, d.semHoraTexto, 936, 3) || [d.semHoraTexto];
    ls.forEach((ln, i) => c.fillText(ln, 72, 1452 + i * 42, 936));
  }

  // J. números
  const cols = [[72, T.cartao.rotulo_trilha, d.kmTexto], [384, T.cartao.rotulo_tempo, d.tempoTexto], [696, T.cartao.rotulo_desnivel, d.desnivelTexto]];
  for (const [x, rot, val] of cols) {
    if (!val) continue;
    c.font = fonte(400, 30); c.fillStyle = APOIO; c.fillText(rot, x, 1576);
    c.font = fonte(700, 56); c.fillStyle = TINTA; c.fillText(val, x, 1612, 300);
  }

  // K. pé (fora da zona segura)
  c.fillStyle = 'rgba(255,244,220,.2)'; c.fillRect(72, 1720, 936, 2);
  c.font = fonte(400, 30); c.fillStyle = APOIO;
  c.fillText(t('cartao.pe', { nome_app: d.nomeApp }), 72, 1752, 620);
  c.textAlign = 'right'; c.fillText(T.cartao.credito, 1008, 1752); c.textAlign = 'left';

  // G. selo Hora da Serra (por cima da emenda do relevo com a tábua)
  const cx = 852, cy = 1052;
  c.beginPath(); c.arc(cx, cy, 156, 0, Math.PI * 2); c.fillStyle = FUNDA; c.fill();
  c.beginPath(); c.arc(cx, cy, 150, 0, Math.PI * 2); c.lineWidth = 6; c.strokeStyle = TINTA; c.stroke();
  const ax = 852, ay = 1072, ar = 112;
  c.lineCap = 'butt';
  c.beginPath(); c.arc(ax, ay, ar, Math.PI, 2 * Math.PI); c.lineWidth = 16; c.strokeStyle = 'rgba(255,244,220,.28)'; c.stroke();
  const ang = (m) => Math.PI + Math.PI * Math.max(0, Math.min(1, (m - d.nascer) / Math.max(1, d.por - d.nascer)));
  if (d.janela) {
    c.beginPath(); c.arc(ax, ay, ar, ang(d.janela[0]), ang(d.janela[1])); c.strokeStyle = SOL; c.lineWidth = 16; c.stroke();
  }
  if (Number.isFinite(d.chegadaMin)) {
    const a = ang(d.chegadaMin);
    const x = ax + ar * Math.cos(a), y = ay + ar * Math.sin(a);
    c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fillStyle = d.modo === 'sombra' ? SOMBRA_POCO : TINTA; c.fill();
    c.lineWidth = 4; c.strokeStyle = MADEIRA; c.stroke();
  }
  c.textAlign = 'center';
  c.font = fonte(700, 30); c.fillStyle = TINTA; c.fillText(T.cartao.selo.toUpperCase(), cx, 1086);
  if (d.janela) {
    const txt = t('cartao.selo_janela', { ini: hhmm(d.janela[0]), fim: hhmm(d.janela[1]) });
    c.fillStyle = SOL; c.textAlign = 'left';
    numeroTabular(c, txt, cx - larguraTabular(c, txt, 30) / 2, 1124, 30);
  } else {
    c.font = fonte(400, 30); c.fillStyle = APOIO; c.fillText(T.cartao.selo_sem_hora, cx, 1124);
  }
  c.textAlign = 'left';
}

// ---------------------------------------------------------------- gerarCartao (9.6)
// { trilhaId | trilha, destinoId, chegadaMs, marca, km?, desnivel_m?, duracao_s?, fimMs? } -> { blob, frase, legendas, nome, dados }
export async function gerarCartao(H, opcoes = {}) {
  const ctx = H.ctx;
  let registro = null;
  if (opcoes.trilhaId && !opcoes.trilha) {
    try { const banco = await import('../banco.js'); registro = await banco.obter('trilhas', opcoes.trilhaId); } catch (e) { console.info('[cartao] trilha não lida', e && e.message); }
  }
  const trilha = opcoes.trilha || registro;
  const pontos = coordsDe(trilha);
  const destinoId = opcoes.destinoId ?? registro?.destino_id ?? null;
  const p = destinoId ? H.porId.get(destinoId) : null;
  const marca = opcoes.marca || ctx.marca || {};
  const chegadaMs = Number.isFinite(opcoes.chegadaMs) ? opcoes.chegadaMs : chegadaDaTrilha(pontos, p?.coord, opcoes.fimMs ?? registro?.fim_em);
  const fuso = ctx.recorte?.fuso_min ?? -180;
  const data = dataLocal(chegadaMs, fuso);
  const chegadaMin = minutoDoDia(chegadaMs, fuso);
  const chegadaHHMM = hhmm(chegadaMin);

  // horas do destino na data da chegada
  let exib = null;
  if (p && p.temHora && p.coord && H.motor) {
    try {
      const r = await H.motor.horas({ pontos: [{ id: p.id, lon: p.coord[0], lat: p.coord[1], ...(Number.isInteger(p.props.sol_ajuste_min) ? { sol_ajuste_min: p.props.sol_ajuste_min } : {}) }], data });
      if (r.pontos[p.id]) exib = horasExibidas(r.pontos[p.id], p.props, null);
    } catch (e) { console.info('[cartao] horas', e && e.message); }
  }
  let modo = 'sem-hora', minSol = null;
  if (exib && exib.apaga != null) {
    minSol = minutosDeSolNoPoco(exib.apaga, chegadaMin, exib.nasce);
    modo = chegadaMin >= exib.apaga || minSol <= 0 ? 'sombra' : 'sol';
  }
  const apagaHHMM = exib?.apaga != null ? hhmm(exib.apaga) : '';
  const frase = fraseCartao({ chegadaHHMM, apagaHHMM, minutosDeSol: modo === 'sol' ? minSol : modo === 'sombra' ? 0 : null });
  const semHoraTexto = modo !== 'sem-hora' ? '' : !p ? '' : p.estado === 'aproximada' ? T.tabuas.aproximada_detalhe
    : p.estado === 'sem-coordenada' ? T.tabuas.sem_coordenada : exib && exib.apaga == null ? T.hora.sem_sol : '';

  // relevo pelo motor, com a luz do minuto da chegada
  const coords = pontos.map((q) => [q.lon, q.lat]);
  let imagem = null, tracadoPx = [];
  if (H.motor && coords.length >= 2) {
    try {
      const r = await H.motor.relevoCartao({ trilha: coords, minuto: chegadaMin, data, largura: L, altura: A });
      imagem = r.imagem; tracadoPx = r.tracadoPx || [];
    } catch (e) { console.info('[cartao] relevo', e && e.message); }
  }
  if (!tracadoPx.length) tracadoPx = projetarNaCaixa(pontos);

  // números: km, tempo, desnível (do registro ou calculados)
  const km = Number.isFinite(opcoes.km) ? opcoes.km : Number.isFinite(registro?.km) ? registro.km : coords.length >= 2 ? comprimentoM(coords) / 1000 : null;
  const desnivel = Number.isFinite(opcoes.desnivel_m) ? opcoes.desnivel_m : Number.isFinite(registro?.desnivel_m) ? registro.desnivel_m : null;
  const duracaoS = Number.isFinite(opcoes.duracao_s) ? opcoes.duracao_s : Number.isFinite(registro?.duracao_s) ? registro.duracao_s : null;

  const centro = p?.coord || ctx.recorte?.centro || [-40.495, -11.34];
  const np = nascerEPor(data, centro[1], centro[0]);
  const janela = exib && exib.apaga != null ? [Math.max(exib.nasce ?? np.nascerMin, np.nascerMin), exib.apaga] : null;

  let logo = null;
  if (marca.logo && /^\.\/arte\/parceiros\/[a-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/i.test(marca.logo)) {
    try { const img = new Image(); img.src = marca.logo; await img.decode(); logo = img; } catch (_) { logo = null; }
  }
  await carregarFontes();

  const cor = (getComputedStyle(document.documentElement).getPropertyValue('--cor-marca').trim()
    || getComputedStyle(document.documentElement).getPropertyValue('--cor-parceiro').trim() || marca.cor || '#C9283E');
  const [, mm, dd] = data.split('-');
  const d = {
    imagem, tracadoPx, cor, logo,
    parceiro: (marca.parceiro || '').trim(), nomeApp: (marca.nome_app || T.app.nome).trim(),
    dataCurta: `${dd}/${mm}`, chegadaHHMM, chegadaMin, apagaHHMM, modo, minSol,
    nota: p ? `${t('hora.nota', { min: incertezaMin(p.props) })}` : '',
    semHoraTexto,
    destino: p?.nome || T.cartao.sem_destino,
    kmTexto: km != null ? t('cartao.valor_km', { km: numeroBR(km, 1) }) : '',
    tempoTexto: duracaoS != null ? duracaoTexto(duracaoS / 60) : '',
    desnivelTexto: desnivel != null ? t('cartao.valor_desnivel', { m: Math.round(desnivel) }) : '',
    nascer: np.nascerMin, por: np.porMin, janela,
    semente: sementeDe(coords.length, coords[0]?.join(','), chegadaMs),
  };

  const canvas = document.createElement('canvas');
  canvas.width = L; canvas.height = A;
  const c = canvas.getContext('2d');
  desenharCartao(c, d);
  const blob = await new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/png'));
  const slug = (p?.id || 'trilha').replace(/^cachoeira-|^poco-/, '');
  const nome = `trilhas-de-itaitu-${slug}-${data}.png`;
  const legendas = legendasDoCartao({
    cachoeira: p ? p.poco : '', km, subidaM: desnivel, instagram: marca.instagram, parceiro: marca.parceiro,
    apagaHHMM: modo === 'sol' ? apagaHHMM : modo === 'sombra' ? apagaHHMM : '', minutosDeSol: modo === 'sol' ? minSol : null,
    chegadaHHMM, nasceHHMM: exib?.nasce != null ? hhmm(exib.nasce) : '',
  });
  return { blob, frase, legendas, nome, largura: canvas.width, altura: canvas.height, dados: { modo, minSol, chegadaHHMM, apagaHHMM, data, destinoId } };
}

export async function compartilharCartao(blob, nomeArquivo, texto) {
  try {
    const arquivo = new File([blob], nomeArquivo, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: texto || '' });
      return 'compartilhado';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
  }
  baixarArquivo(blob, nomeArquivo);
  return 'baixado';
}

// ---------------------------------------------------------------- diálogo #hora-cartao
export function montarCartao(H) {
  const ctx = H.ctx;
  const dlg = document.getElementById('hora-cartao');
  let urlAtual = null;
  let atual = null;

  // na demonstração (?demo=1) o cartão abre SEM modal: com showModal() o backdrop cobria "Pausar" e
  // "Sair da demonstração" e deixava os dois inertes nos últimos 15 s. O cartão fica logo abaixo do painel.
  const naDemo = () => !!H.emDemo || ctx.params.get('demo') === '1';
  function posicionarNaDemo() {
    const painel = document.getElementById('hora-demo-controle');
    const fundo = painel && !painel.hidden ? painel.getBoundingClientRect().bottom : 0;
    if (fundo > 0) dlg.style.setProperty('--hora-cartao-topo', `${Math.ceil(fundo + 8)}px`);
    else dlg.style.removeProperty('--hora-cartao-topo');
  }
  function abrirDialogo() {
    if (!dlg) return;
    if (naDemo()) {
      posicionarNaDemo();
      if (dlg.open) return;
      try { dlg.show(); } catch (_) { dlg.setAttribute('open', ''); }
      return;
    }
    if (!dlg.open) { try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); } }
  }
  function fechar() { if (dlg?.open) dlg.close(); }

  function mostrarGerando() {
    if (!dlg) return;
    dlg.replaceChildren(el('div', { class: 'hora-cartao' },
      el('div', { class: 'hora-cartao__cabeca' }, el('h2', { id: 'hora-cartao-titulo', tabindex: '-1' }, T.cartao.titulo), botaoFechar()),
      el('p', { class: 'hora-cartao__status', role: 'status' }, T.cartao.gerando)));
    dlg.setAttribute('aria-labelledby', 'hora-cartao-titulo');
    abrirDialogo();
  }
  function botaoFechar() {
    return el('button', { class: 'folha__fechar', type: 'button', 'aria-label': T.cartao.fechar, onclick: fechar }, icone('i-fechar'));
  }

  function mostrar(r) {
    if (!dlg) return;
    if (urlAtual) URL.revokeObjectURL(urlAtual);
    urlAtual = URL.createObjectURL(r.blob);
    atual = r;
    const marcada = r.legendas[0];
    const status = el('p', { class: 'hora-cartao__status', role: 'status' }, '');
    const legenda = marcada ? el('p', { class: 'hora-cartao__legenda' }, marcada.texto) : null;
    const copiar = marcada ? el('button', { class: 'botao botao--linha', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(marcada.copiar); status.textContent = textoDaCasa('cartao.legenda_copiada', ctx.marca); }
      catch (_) { status.textContent = marcada.copiar; }
    } }, t('cartao.copiar_legenda', {}, 'Copiar legenda')) : null;
    const demo = ctx.params.get('vitrine') === '1';      // na vitrine do app particular, nada sai do aparelho
    dlg.replaceChildren(el('div', { class: 'hora-cartao' },
      el('div', { class: 'hora-cartao__cabeca' }, el('h2', { id: 'hora-cartao-titulo', tabindex: '-1' }, T.cartao.titulo), botaoFechar()),
      el('img', { class: 'hora-cartao__img', src: urlAtual, alt: `${T.cartao.alt} ${r.frase}`, width: String(r.largura), height: String(r.altura) }),
      el('p', { class: 'hora-cartao__frase' }, r.frase),
      el('div', { class: 'linha-botoes' },
        el('button', { class: 'botao botao--marca', type: 'button', disabled: demo ? true : null, onclick: async () => {
          const res = await compartilharCartao(r.blob, r.nome, r.frase);
          status.textContent = res === 'compartilhado' ? textoDaCasa('cartao.compartilhado', ctx.marca) : res === 'baixado' ? `${T.cartao.baixar}: ${r.nome}` : '';
        } }, icone('i-compartilhar'), el('span', {}, T.cartao.compartilhar)),
        el('button', { class: 'botao botao--linha', type: 'button', disabled: demo ? true : null, onclick: () => { baixarArquivo(r.blob, r.nome); status.textContent = `${T.cartao.baixar}: ${r.nome}`; } }, T.cartao.baixar)),
      demo ? el('p', { class: 'nota' }, T.demo.vitrine) : null,
      navigator.onLine === false ? el('p', { class: 'nota' }, T.cartao.sem_sinal) : null,
      legenda, copiar, status));
    abrirDialogo();
    // na demo o foco fica com quem apresenta (Pausar e Sair); o cartão é anunciado pelo #hora-live
    if (!naDemo()) requestAnimationFrame(() => document.getElementById('hora-cartao-titulo')?.focus());
  }

  async function gerar(opcoes) {
    mostrarGerando();
    try {
      const r = await gerarCartao(H, opcoes);
      mostrar(r);
      return r;
    } catch (e) {
      console.info('[cartao] falhou', e && e.message);
      dlg?.querySelector('.hora-cartao__status')?.replaceChildren(T.erros.generico || 'Não deu para gerar o cartão agora.');
      return null;
    }
  }

  document.addEventListener('itaitu:trilha-gravada', (e) => {
    const d = e.detail || {};
    if (!d.id) return;
    gerar({ trilhaId: d.id, destinoId: d.destino_id ?? null, km: d.km, desnivel_m: d.desnivel_m, duracao_s: d.duracao_s, fimMs: d.fimMs });
  });
  dlg?.addEventListener('close', () => { if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null; } });

  return { gerar, fechar, get atual() { return atual; }, utcDe };
}
