// nucleo.js · motor da Hora da Serra (Prisma, Creat Nuvem)
// PURO: sem DOM, sem fetch, sem dependência. Roda no navegador (página e worker) e no Node 22.
// Modelo fixo = protótipo projetos/itaitu-mapa/prototipos/hora_da_serra.py (ARQUITETURA 4.1):
//   sol pela NOAA (equação do tempo + declinação), refração de Bennett, limbo superior +0,267°;
//   horizonte em 720 direções, olho a 1,7 m, passo 15 m até 3 km e 30 m depois, até a borda da grade,
//   curvatura da Terra com refração d²/(2R)·(1 − 0,13); varredura do dia de 04:30 a 19:30, de 1 em 1 min.

// ---------------------------------------------------------------- relógio (ARQUITETURA 3)
export const FUSO_MIN = -180;                 // America/Bahia, UTC−3, sem horário de verão
const MIN_MS = 60000;
const DIA_MS = 86400000;

export function minutoDoDia(utcMs, fusoMin = FUSO_MIN) {
  const local = utcMs + fusoMin * MIN_MS;
  return Math.floor((((local % DIA_MS) + DIA_MS) % DIA_MS) / MIN_MS);
}
export function dataLocal(utcMs, fusoMin = FUSO_MIN) {
  return new Date(utcMs + fusoMin * MIN_MS).toISOString().slice(0, 10);
}
export function utcDe(data, minuto, fusoMin = FUSO_MIN) {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d) + (minuto - fusoMin) * MIN_MS;
}
export function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
export function hhmm(minuto) {
  const m = ((Math.round(minuto) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
export function arredondar5(min, modo = 'baixo') {
  if (min == null || !Number.isFinite(min)) return null;
  if (modo === 'cima') return Math.ceil(min / 5) * 5;
  if (modo === 'perto') return Math.round(min / 5) * 5;
  return Math.floor(min / 5) * 5;
}

// ---------------------------------------------------------------- relevo e grade
// Terrarium: altitude = R*256 + G + B/256 − 32768 (metros)
export function decodificarTerrarium(rgba) {
  const n = rgba.length >> 2;
  const out = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256 - 32768;
  return out;
}

const TAM = 256;
const CIRC = 40075016.686;                    // circunferência do equador (Web Mercator)

// Grade = { w, h, z, x0, y0, dados } + métodos não enumeráveis (o objeto segue clonável por postMessage)
function equiparGrade(g) {
  Object.defineProperties(g, {
    paraPixel: { value: (lon, lat) => lonLatParaPixel(g, lon, lat), enumerable: false },
    paraLonLat: { value: (px, py) => pixelParaLonLat(g, px, py), enumerable: false },
    amostrar: { value: (lon, lat) => amostrar(g, lon, lat), enumerable: false },
  });
  return g;
}
export function reequiparGrade(g) { return equiparGrade(g); }

// tiles: [{ x, y, z?, rgba?: Uint8(Clamped)Array 256*256*4, dados?: Float32Array 256*256 }]
// Falta de tile vira altitude NaN (amostrar devolve null ali).
export function gradeDeTiles(z, tiles) {
  if (!tiles || !tiles.length) throw new Error('grade sem tiles');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
  const w = (x1 - x0 + 1) * TAM, h = (y1 - y0 + 1) * TAM;
  const dados = new Float32Array(w * h).fill(NaN);
  for (const t of tiles) {
    const alt = t.dados || decodificarTerrarium(t.rgba);
    const ox = (t.x - x0) * TAM, oy = (t.y - y0) * TAM;
    for (let r = 0; r < TAM; r++) dados.set(alt.subarray(r * TAM, (r + 1) * TAM), (oy + r) * w + ox);
  }
  return equiparGrade({ w, h, z, x0, y0, dados });
}
// Atalho para quem já decodificou: montarGrade([{ z, x, y, rgba | dados }])
export function montarGrade(arrayDeTiles) {
  return gradeDeTiles(arrayDeTiles[0].z ?? 12, arrayDeTiles);
}

export function lonLatParaPixel(g, lon, lat) {
  const n = 2 ** g.z, lr = lat * Math.PI / 180;
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
  return [(xt - g.x0) * TAM, (yt - g.y0) * TAM];
}
export function pixelParaLonLat(g, px, py) {
  const n = 2 ** g.z;
  const xt = px / TAM + g.x0, yt = py / TAM + g.y0;
  return [xt / n * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n))) * 180 / Math.PI];
}
// metros por pixel da grade na latitude dada
export function metrosPorPixel(g, lat) {
  return CIRC * Math.cos(lat * Math.PI / 180) / (TAM * 2 ** g.z);
}
// bilinear em coordenada de pixel; null fora da grade ou sem dado
export function amostrarPx(g, px, py) {
  if (!(px >= 0 && py >= 0 && px < g.w - 1 && py < g.h - 1)) return null;
  const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, i = y0 * g.w + x0, d = g.dados;
  const v = d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + g.w] * (1 - fx) * fy + d[i + g.w + 1] * fx * fy;
  return Number.isNaN(v) ? null : v;
}
export function amostrar(g, lon, lat) {
  const [px, py] = lonLatParaPixel(g, lon, lat);
  return amostrarPx(g, px, py);
}
export function cantosDaGrade(g) {           // NO, NE, SE, SO (ordem do CanvasSource/ImageSource)
  return [pixelParaLonLat(g, 0, 0), pixelParaLonLat(g, g.w, 0), pixelParaLonLat(g, g.w, g.h), pixelParaLonLat(g, 0, g.h)];
}

// ---------------------------------------------------------------- sol (NOAA)
export const SEMIDIAMETRO = 0.267;           // graus: limbo superior
const RAD = Math.PI / 180;

// elevação APARENTE (centro do disco, com refração de Bennett), azimute 0 = norte, horário
export function posicaoDoSol(dateUtcMs, lat, lon) {
  const jd = dateUtcMs / DIA_MS + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;   // longitude média
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);                            // anomalia média
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);                        // excentricidade
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const om = (125.04 - 1934.136 * T) * RAD;
  const lam = (L0 + C - 0.00569 - 0.00478 * Math.sin(om)) * RAD;                       // longitude aparente
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(om)) * RAD;                                   // obliquidade corrigida
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));                                // declinação
  const yv = Math.tan(eps / 2) ** 2, L0r = L0 * RAD;
  const eqt = 4 / RAD * (yv * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * yv * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * yv * yv * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));            // equação do tempo (min)
  const minutosUtc = (((dateUtcMs % DIA_MS) + DIA_MS) % DIA_MS) / MIN_MS;
  const ha = ((minutosUtc + eqt + 4 * lon) / 4 - 180) * RAD;                           // ângulo horário
  const la = lat * RAD;
  const cz = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
  const geo = 90 - Math.acos(Math.max(-1, Math.min(1, cz))) / RAD;                     // elevação geométrica
  const az = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) / RAD + 180) % 360 + 360) % 360;
  const ref = geo > -1 ? 1 / Math.tan((geo + 7.31 / (geo + 4.4)) * RAD) / 60 : 0;      // Bennett (graus)
  return { elevacao: geo + ref, azimute: az, elevacaoGeo: geo, topo: geo + ref + SEMIDIAMETRO, declinacao: dec / RAD, eqTempoMin: eqt };
}

// ---------------------------------------------------------------- horizonte
const R_TERRA = 6371000;
export const MODELO = Object.freeze({ olho: 1.7, direcoes: 720, passo: 15, troca: 3000, alcance: 30000, refracao: 0.13, ini: 270, fim: 1170 });

const maximos = new WeakMap();
function alturaMaxima(g) {
  let m = maximos.get(g);
  if (m === undefined) { m = -Infinity; for (const v of g.dados) if (v > m) m = v; maximos.set(g, m); }
  return m;
}

// ângulo do horizonte (graus) em cada direção; índice i = azimute i*360/direcoes
export function horizonte(g, lon, lat, opcoes = {}) {
  if (typeof opcoes === 'number') opcoes = { direcoes: opcoes };
  const { olho, direcoes, passo, troca, alcance, refracao } = { ...MODELO, ...opcoes };
  const mpp = metrosPorPixel(g, lat);
  const [px0, py0] = lonLatParaPixel(g, lon, lat);
  const chao = amostrarPx(g, px0, py0);
  if (chao == null) return null;
  const h0 = chao + olho, k = (1 - refracao) / (2 * R_TERRA);
  const out = new Float32Array(direcoes);
  const W1 = g.w - 1, H1 = g.h - 1, w = g.w, d = g.dados;
  const teto = alturaMaxima(g) - h0;                     // nada mais longe passa disto: corte exato da busca
  for (let i = 0; i < direcoes; i++) {
    const az = i * 360 / direcoes * RAD, s = Math.sin(az) / mpp, c = -Math.cos(az) / mpp;
    let melhor = -Math.PI / 2, dist = passo;
    while (dist <= alcance) {
      const px = px0 + s * dist, py = py0 + c * dist;
      if (!(px >= 0 && py >= 0 && px < W1 && py < H1)) break;                         // borda da grade
      const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, j = y0 * w + x0;     // bilinear em linha
      const hh = d[j] * (1 - fx) * (1 - fy) + d[j + 1] * fx * (1 - fy) + d[j + w] * (1 - fx) * fy + d[j + w + 1] * fx * fy;
      if (hh !== hh) break;                                                             // NaN: sem tile
      const ang = Math.atan2(hh - dist * dist * k - h0, dist);                          // curvatura + refração
      if (ang > melhor) melhor = ang;
      if (Math.atan2(teto, dist) <= melhor) break;          // nem o pico mais alto da grade venceria daqui em diante
      dist += dist < troca ? passo : passo * 2;
    }
    out[i] = melhor / RAD;
  }
  return out;
}

// ---------------------------------------------------------------- nascer, pôr e escurecer (horizonte livre)
// Varre o dia de 1 em 1 min: nascer/pôr = limbo superior aparente em 0°; escurece = elevação geométrica < −6° (crepúsculo civil)
export function nascerEPor(data, lat, lon) {
  let nascerMin = null, porMin = null, amanhecerBrutoMin = null, escureceBrutoMin = null, antTopo = null, antGeo = null;
  for (let m = 0; m < 1440; m++) {
    const s = posicaoDoSol(utcDe(data, m), lat, lon);
    if (antTopo != null) {
      if (antTopo <= 0 && s.topo > 0 && nascerMin == null) nascerMin = m;
      if (antTopo > 0 && s.topo <= 0) porMin = m - 1;
      if (antGeo < -6 && s.elevacaoGeo >= -6 && amanhecerBrutoMin == null) amanhecerBrutoMin = m;
      if (antGeo >= -6 && s.elevacaoGeo < -6) escureceBrutoMin = m;
    }
    antTopo = s.topo; antGeo = s.elevacaoGeo;
  }
  return {
    nascerMin, porMin, amanhecerBrutoMin, escureceBrutoMin,
    escureceMin: arredondar5(escureceBrutoMin, 'baixo'),            // estimativa exibida: para baixo
  };
}

// ---------------------------------------------------------------- horas de sol num ponto
// ponto = { lon, lat, sol_ajuste_min? }   data = 'AAAA-MM-DD' (hora local UTC−3)
// opcoes.perfil reaproveita um horizonte já calculado.
export function horasDeSol(g, ponto, data, opcoes = {}) {
  const { lon, lat } = ponto;
  const perfil = opcoes.perfil || horizonte(g, lon, lat, opcoes);
  const livre = nascerEPor(data, lat, lon);
  const base = { ...livre, altitudeM: amostrar(g, lon, lat), ajusteMin: 0, intervalos: [], nascePoco: null, nascePocoMin: null, apagaBrutoMin: null, apagaMin: null };
  if (!perfil) return { ...base, erro: 'fora da grade' };
  const n = perfil.length, ini = opcoes.ini ?? MODELO.ini, fim = opcoes.fim ?? MODELO.fim;
  const intervalos = [];
  let aberto = null, ant = false;
  for (let m = ini; m <= fim; m++) {
    const s = posicaoDoSol(utcDe(data, m), lat, lon);
    const hz = perfil[Math.round(s.azimute * n / 360) % n];
    const luz = s.topo > hz;                                  // limbo superior acima da serra
    if (luz && !ant) aberto = m;
    if (!luz && ant) intervalos.push([aberto, m - 1]);
    ant = luz;
  }
  if (ant) intervalos.push([aberto, fim]);
  const tarde = intervalos.filter((iv) => iv[1] > 720);
  const apagaBrutoMin = tarde.length ? tarde[tarde.length - 1][1] : null;
  const aj = Number.isInteger(ponto.sol_ajuste_min) && Math.abs(ponto.sol_ajuste_min) <= 30 ? ponto.sol_ajuste_min : 0;
  const nasce = intervalos.length ? intervalos[0][0] : null;
  return {
    ...base,
    ajusteMin: aj,
    intervalos,
    nascePoco: nasce, nascePocoMin: nasce,                     // bruto (quem exibe arredonda para cima)
    apagaBrutoMin,                                             // só relevo, minuto exato
    apagaMin: apagaBrutoMin == null ? null : arredondar5(apagaBrutoMin + aj, 'baixo'),
    horizonte: opcoes.comPerfil ? perfil : undefined,
  };
}

// ---------------------------------------------------------------- PNG (para Node e para o worker sem OffscreenCanvas)
// inflar(bytesZlib) -> Uint8Array (síncrono no Node com zlib.inflateSync; no navegador, ver worker.js)
export function lerPNG(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error('não é PNG');
  let p = 8, w = 0, h = 0, prof = 0, tipo = 0, entrelacado = 0;
  const partes = [];
  while (p < u8.length) {
    const len = dv.getUint32(p), t = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (t === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); prof = u8[p + 16]; tipo = u8[p + 17]; entrelacado = u8[p + 20]; }
    else if (t === 'IDAT') partes.push(u8.subarray(p + 8, p + 8 + len));
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (prof !== 8 || (tipo !== 2 && tipo !== 6) || entrelacado) throw new Error('PNG fora do formato do relevo');
  let tot = 0; for (const c of partes) tot += c.length;
  const zlib = new Uint8Array(tot); let o = 0; for (const c of partes) { zlib.set(c, o); o += c.length; }
  return { w, h, canais: tipo === 6 ? 4 : 3, zlib };
}
export function desfiltrarPNG({ w, h, canais }, cru) {
  const bpl = w * canais, out = new Uint8ClampedArray(w * h * 4), lin = new Uint8Array(bpl), ant = new Uint8Array(bpl);
  for (let y = 0; y < h; y++) {
    const f = cru[y * (bpl + 1)], src = y * (bpl + 1) + 1;
    for (let i = 0; i < bpl; i++) {
      const a = i >= canais ? lin[i - canais] : 0, b = ant[i], c = i >= canais ? ant[i - canais] : 0, x = cru[src + i];
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      lin[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4, s = x * canais;
      out[d] = lin[s]; out[d + 1] = lin[s + 1]; out[d + 2] = lin[s + 2]; out[d + 3] = canais === 4 ? lin[s + 3] : 255;
    }
    ant.set(lin);
  }
  return out;
}
export function decodificarPNG(bytes, inflar) {
  const info = lerPNG(bytes);
  return { largura: info.w, altura: info.h, rgba: desfiltrarPNG(info, inflar(info.zlib)) };
}

// ---------------------------------------------------------------- utilidades
// semente estável a partir de números (traçado + minuto): FNV-1a sobre os valores quantizados
export function semente(...valores) {
  let h = 2166136261 >>> 0;
  for (const v of valores.flat(Infinity)) {
    let q = Math.round(Number(v) * 1e5) | 0;
    for (let k = 0; k < 4; k++) { h ^= q & 255; h = Math.imul(h, 16777619) >>> 0; q >>= 8; }
  }
  return h >>> 0;
}
// gerador pseudoaleatório reproduzível (mulberry32)
export function aleatorio(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
