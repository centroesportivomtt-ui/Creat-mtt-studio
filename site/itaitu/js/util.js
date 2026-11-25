// util.js · Trilhas de Itaitu (frontend A, Pixel, 20/11/2026)
// PURO ao importar: nada de DOM, rede ou armazenamento na carga do módulo. O Node importa para teste.
// Funções de DOM e de armazenamento (el, lerLocal, gravarLocal) só tocam no navegador quando chamadas.
// ARQUITETURA 2.2 e 6.1: tempoMaisLentoMin, formatarDecimal, formatarGMS e distanciaM são únicas no app;
// ninguém formata coordenada nem lê tempo da placa por conta própria.

const R_TERRA = 6371000;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------- tempo da placa (6.1)
// Lista fechada de formatos. O que não se encaixa devolve null, nunca um número chutado.
const H = '(?:h|hr|hora|horas)';
const MIN = '(?:min|mins|minuto|minutos)';
const RE_H = new RegExp(`^(\\d+)\\s*${H}$`);
const RE_HM = new RegExp(`^(\\d+)\\s*${H}\\s*(\\d+)(?:\\s*${MIN})?$`);
const RE_M = new RegExp(`^(\\d+)\\s*${MIN}$`);
const RE_N = /^(\d+)$/;

function parteEmMin(parte) {
  let m = RE_H.exec(parte);
  if (m) return { min: Number(m[1]) * 60, unidade: 'h' };
  m = RE_HM.exec(parte);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 60) return null;
    return { min: Number(m[1]) * 60 + mm, unidade: 'h' };
  }
  m = RE_M.exec(parte);
  if (m) return { min: Number(m[1]), unidade: 'min' };
  m = RE_N.exec(parte);
  if (m) return { n: Number(m[1]), unidade: null };
  return null;
}

export function tempoMaisLentoMin(texto) {
  if (texto == null) return null;
  let s = String(texto).toLowerCase();
  s = s.replace(/≈|~/g, ' ').replace(/cerca de/g, ' ').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const partes = s.split('-').map((p) => p.trim());
  if (partes.length > 2 || partes.some((p) => !p)) return null;
  const lidas = partes.map(parteEmMin);
  if (lidas.some((p) => p == null)) return null;
  const valores = [];
  for (let i = 0; i < lidas.length; i++) {
    const p = lidas[i];
    if (p.unidade) { valores.push(p.min); continue; }
    // N sozinho só vale na 1ª parte de uma faixa: herda a unidade da 2ª
    if (i !== 0 || lidas.length !== 2 || !lidas[1].unidade) return null;
    valores.push(lidas[1].unidade === 'h' ? p.n * 60 : p.n);
  }
  const maior = Math.max(...valores);
  return Number.isInteger(maior) && maior > 0 ? maior : null;
}

// ---------------------------------------------------------------- coordenadas (2.2)
export function formatarDecimal(lon, lat) {
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function gms(valor) {
  // décimos de segundo inteiros: o arredondamento nunca dá 60,0″
  const t = Math.round(Math.abs(valor) * 36000);
  const g = Math.floor(t / 36000);
  const m = Math.floor((t % 36000) / 600);
  const s = (t % 600) / 10;
  return `${g}°${String(m).padStart(2, '0')}′${s.toFixed(1).replace('.', ',').padStart(4, '0')}″`;
}

export function formatarGMS(lon, lat) {
  return `${gms(lat)} ${lat < 0 ? 'S' : 'N'} · ${gms(lon)} ${lon < 0 ? 'O' : 'L'}`;
}

export function distanciaM([lon1, lat1], [lon2, lat2]) {
  const f1 = lat1 * RAD, f2 = lat2 * RAD;
  const df = (lat2 - lat1) * RAD, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(a)));
}

// rumo inicial de a para b, graus 0 = norte, sentido horário
export function rumoGraus([lon1, lat1], [lon2, lat2]) {
  const f1 = lat1 * RAD, f2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) % 360 + 360) % 360;
}

// '350 m', '1,2 km', '12 km'
export function formatarDistancia(m) {
  if (m == null || !Number.isFinite(m)) return '';
  if (m < 950) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return `${(km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace('.', ',')} km`;
}

export function comprimentoM(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += distanciaM(coords[i - 1], coords[i]);
  return s;
}

// Projeta p na linha (aproximação plana local, boa para trilha de poucos km).
// Devolve { distM: distância de p à linha, aoLongoM: metros do início até a projeção, totalM }.
export function projetarNaLinha(coords, p) {
  if (!coords || coords.length < 2) return null;
  const lat0 = p[1] * RAD;
  const kx = R_TERRA * RAD * Math.cos(lat0), ky = R_TERRA * RAD;
  const xy = (c) => [(c[0] - p[0]) * kx, (c[1] - p[1]) * ky];
  let melhor = { distM: Infinity, aoLongoM: 0 };
  let acumulado = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = xy(coords[i - 1]), b = xy(coords[i]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const seg = Math.hypot(dx, dy);
    let t = seg > 0 ? -(a[0] * dx + a[1] * dy) / (seg * seg) : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (d < melhor.distM) melhor = { distM: d, aoLongoM: acumulado + t * seg, indice: i - 1, t };
    acumulado += seg;
  }
  melhor.totalM = acumulado;
  return melhor;
}

// Subida e descida com histerese (ARQUITETURA 2.2): só variações de 3 m ou mais contam.
export function subidaDescida(alts, histerese = 3) {
  let sobe = 0, desce = 0, ref = null;
  for (const a of alts) {
    if (a == null || !Number.isFinite(a)) continue;
    if (ref == null) { ref = a; continue; }
    const d = a - ref;
    if (d >= histerese) { sobe += d; ref = a; }
    else if (d <= -histerese) { desce -= d; ref = a; }
  }
  return { subida_m: Math.round(sobe), descida_m: Math.round(desce) };
}

// ---------------------------------------------------------------- textos e links
export function escaparHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function escaparXML(s) {
  return escaparHTML(s);
}

// Links só https:, tel:, sms: e os padrões de wa.me e Instagram (ARQUITETURA 10).
export function linkSeguro(url, tipo = 'https') {
  if (typeof url !== 'string') return '';
  const u = url.trim();
  if (tipo === 'whatsapp') return /^https:\/\/wa\.me\/\d{8,15}(\?text=[^\s]*)?$/.test(u) ? u : '';
  if (tipo === 'instagram') return /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/.test(u) ? u : '';
  if (tipo === 'tel') return /^tel:\+?\d{2,15}$/.test(u) ? u : '';
  if (tipo === 'sms') return /^sms:/.test(u) ? u : '';
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && !p.username && !p.password ? p.href : '';
  } catch (_) { return ''; }
}

// Normaliza para busca: minúsculas, sem acento, sem pontuação extra.
export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Lê coordenada digitada: '-11.3331, -40.5035', '-11,3331 -40,5035' (lat primeiro) ou
// '11°19′59,2″ S 40°30′12,9″ O' (GMS, com S/N e O/W/L/E). Devolve [lon, lat] ou null.
export function lerCoordenada(texto) {
  if (!texto) return null;
  const s = String(texto).trim().replace(/[′’']/g, "'").replace(/[″”"]/g, '"');
  const dms = /(\d{1,3})\s*°\s*(\d{1,2})?\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([NSns])\W*?(\d{1,3})\s*°\s*(\d{1,2})?\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([OWLEowle])/.exec(s);
  if (dms) {
    const val = (g, m, se) => Number(g) + Number(m || 0) / 60 + Number(String(se || 0).replace(',', '.')) / 3600;
    let lat = val(dms[1], dms[2], dms[3]);
    let lon = val(dms[5], dms[6], dms[7]);
    if (/s/i.test(dms[4])) lat = -lat;
    if (/[ow]/i.test(dms[8])) lon = -lon;
    return validaLonLat(lon, lat);
  }
  // dois números decimais (vírgula decimal aceita quando o separador é espaço ou ponto e vírgula)
  let m = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (!m) m = /^(-?\d{1,3}(?:,\d+)?)\s*[;\s]\s*(-?\d{1,3}(?:,\d+)?)$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.')), lon = Number(m[2].replace(',', '.'));
  return validaLonLat(lon, lat);
}

function validaLonLat(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

export function dentroDoBbox([lon, lat], bbox, margem = 0) {
  return lon >= bbox[0] - margem && lon <= bbox[2] + margem && lat >= bbox[1] - margem && lat <= bbox[3] + margem;
}

// Duração em segundos para texto curto: '34 min', '1 h 05 min'
export function duracaoCurta(seg) {
  const min = Math.max(0, Math.round(seg / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export function dataArquivo(ms) {
  const d = new Date(ms - 3 * 3600000);   // America/Bahia, UTC−3
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- navegador (só quando chamadas)
export function lerLocal(chave, padrao = null) {
  try {
    const v = globalThis.localStorage?.getItem(chave);
    return v == null ? padrao : v;
  } catch (_) { return padrao; }
}

export function gravarLocal(chave, valor) {
  try {
    if (valor == null) globalThis.localStorage?.removeItem(chave);
    else globalThis.localStorage?.setItem(chave, String(valor));
  } catch (_) { /* modo privado ou armazenamento bloqueado: segue sem lembrar */ }
}

// ---------------------------------------------------------------- ganchos de teste e vitrine (QA, 20/11)
// ?agora= (relógio simulado) e ?sw=0 (desliga o service worker) só valem no computador de quem testa.
// No endereço público são ignorados: um link com relógio falso mudaria "saia até" sem aviso nenhum,
// e ?sw=0 tiraria o offline de quem abrisse. Os testes (conferir-app, comparar-com-app) rodam em 127.0.0.1.
export function ganchoDeTeste() {
  const h = String(globalThis.location?.hostname || '');
  return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

// ?vitrine=1 só vale dentro do iframe #vitrine-frame do marcos.html, na mesma origem.
// Aberto direto (link copiado, favorito, mensagem), o parâmetro é ignorado e nada fica desligado.
export function emVitrine(params) {
  if (params?.get?.('vitrine') !== '1') return false;
  try {
    if (globalThis.top === globalThis.self) return false;
    const f = globalThis.frameElement;               // null quando o pai é de outra origem
    return !!f && f.id === 'vitrine-frame' && /marcos(\.html)?$/.test(globalThis.parent.location.pathname);
  } catch (_) { return false; }
}

// el('button', { class: 'x', type: 'button', onclick }, 'texto', filho)
// Texto entra sempre como nó de texto (nunca innerHTML).
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'texto') n.textContent = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

const SVG = 'http://www.w3.org/2000/svg';
// Ícone do sprite do designer, sempre aria-hidden (o texto do botão diz a ação).
export function icone(id, classe = 'icone') {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', classe);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.setAttribute('width', '24');
  s.setAttribute('height', '24');
  const u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', `./icones/ui.svg#${id}`);
  s.append(u);
  return s;
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
