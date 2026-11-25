// referencia.mjs · cálculo de referência da Hora da Serra (Forja, backend, 20/11/2026).
//
// Porte fiel, linha a linha, de projetos/itaitu-mapa/prototipos/hora_da_serra.py (funções ll2px, amostra,
// horizonte, sol e dia), escrito à parte do motor do app. NÃO importa site/itaitu/js/motor/nucleo.js:
// é a segunda opinião que o teste usa para conferir o app. Diferenças de propósito em relação ao motor,
// para que um erro de um não passe escondido no outro:
//   - altitudes em Float64 (o motor guarda Float32);
//   - decodificador de PNG próprio (testes/png.mjs);
//   - horizonte sem o corte antecipado pelo pico mais alto (varre até a borda, como o Python);
//   - índice do horizonte com o round() do Python (meio vai para o par), como no protótipo;
//   - dia juliano pela diferença até J2000, como o Python.
// Única extensão: crepusculoCivil(), que o protótipo não tem (o "escurece" das regras 6.2).
// Node 22, só módulos nativos.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lerPNG } from './png.mjs';

export const Z = 12;
const R = 6371000.0;
const TAM = 256;
const MS_MIN = 60000;
const BAHIA_MIN = -180;                          // UTC−3, sem horário de verão
const rad = (g) => g * Math.PI / 180;
const graus = (r) => r * 180 / Math.PI;

// round() do Python 3: meio exato vai para o par
export function roundPython(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// ------------------------------------------------------------------ relevo
// pasta = .../tiles/dem/12  (estrutura x/y.png). Lê o retângulo inteiro que existe na pasta.
export function carregarRelevo(pasta) {
  if (!existsSync(pasta)) throw new Error(`pasta de relevo não existe: ${pasta}`);
  const xs = readdirSync(pasta).filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  if (!xs.length) throw new Error(`sem tiles em ${pasta}`);
  const ys = readdirSync(join(pasta, String(xs[0]))).filter((n) => /^\d+\.png$/.test(n)).map((n) => Number(n.slice(0, -4))).sort((a, b) => a - b);
  const X0 = xs[0], X1 = xs[xs.length - 1], Y0 = ys[0], Y1 = ys[ys.length - 1];
  const W = (X1 - X0 + 1) * TAM, H = (Y1 - Y0 + 1) * TAM;
  const elev = new Float64Array(W * H);
  for (let x = X0; x <= X1; x++) {
    for (let y = Y0; y <= Y1; y++) {
      const arq = join(pasta, String(x), `${y}.png`);
      if (!existsSync(arq)) throw new Error(`grade incompleta: falta ${arq}`);
      const { largura, altura, rgba } = lerPNG(arq);
      if (largura !== TAM || altura !== TAM) throw new Error(`tile fora de 256x256: ${arq}`);
      const ox = (x - X0) * TAM, oy = (y - Y0) * TAM;
      for (let r = 0; r < TAM; r++) {
        for (let c = 0; c < TAM; c++) {
          const k = (r * TAM + c) * 4;
          elev[(oy + r) * W + ox + c] = rgba[k] * 256 + rgba[k + 1] + rgba[k + 2] / 256 - 32768;
        }
      }
    }
  }
  return { Z, X0, X1, Y0, Y1, W, H, elev };
}

export function ll2px(rel, lon, lat) {
  const n = 2 ** rel.Z;
  const xt = (lon + 180) / 360 * n;
  const lr = rad(lat);
  const yt = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
  return [(xt - rel.X0) * TAM, (yt - rel.Y0) * TAM];
}

export function amostra(rel, px, py) {
  if (px < 0 || py < 0 || px >= rel.W - 1 || py >= rel.H - 1) return null;
  const x0 = Math.trunc(px), y0 = Math.trunc(py), fx = px - x0, fy = py - y0;
  const e = rel.elev, W = rel.W;
  const a = e[y0 * W + x0], b = e[y0 * W + x0 + 1], c = e[(y0 + 1) * W + x0], d = e[(y0 + 1) * W + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

// ------------------------------------------------------------------ horizonte (720 direções, passo 0,5°)
export function horizonte(rel, lon, lat, { olho = 1.7, passo = 15.0, alcance = 30000.0 } = {}) {
  const mpp = 40075016.686 * Math.cos(rad(lat)) / (TAM * 2 ** rel.Z);
  const [px0, py0] = ll2px(rel, lon, lat);
  const chao = amostra(rel, px0, py0);
  if (chao == null) return null;
  const h0 = chao + olho;
  const perfil = [];
  for (let i = 0; i < 720; i++) {
    const az = i * 0.5;
    const s = Math.sin(rad(az)), c = Math.cos(rad(az));
    let melhor = -90.0, distMelhor = 0, d = passo;
    while (d <= alcance) {
      const h = amostra(rel, px0 + s * d / mpp, py0 - c * d / mpp);
      if (h == null) break;
      const hEf = h - d * d / (2 * R) * (1 - 0.13);
      const ang = graus(Math.atan2(hEf - h0, d));
      if (ang > melhor) { melhor = ang; distMelhor = d; }
      d += d < 3000 ? passo : passo * 2;
    }
    perfil.push([az, melhor, distMelhor]);
  }
  return { altitude: h0 - olho, perfil };
}

// ------------------------------------------------------------------ sol (NOAA, refração de Bennett)
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export function sol(utcMs, lat, lon) {
  const jd = (utcMs - J2000_MS) / 86400000 + 2451545.0;
  const T = (jd - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;   // % do Python é sempre positivo
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = rad(M);
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const om = rad(125.04 - 1934.136 * T);
  const lam = rad(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = rad(eps0 + 0.00256 * Math.cos(om));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const yv = Math.tan(eps / 2) ** 2;
  const L0r = rad(L0);
  const eqt = 4 * graus(yv * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * yv * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * yv * yv * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const dt = new Date(utcMs);
  const minutos = dt.getUTCHours() * 60 + dt.getUTCMinutes() + dt.getUTCSeconds() / 60;
  const tst = minutos + eqt + 4 * lon;
  const ha = rad(tst / 4 - 180);
  const la = rad(lat);
  const cz = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
  const z = Math.acos(Math.max(-1, Math.min(1, cz)));
  const el = 90 - graus(z);
  const az = ((graus(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(dec) * Math.cos(la))) + 180) % 360 + 360) % 360;
  const ref = el > -1 ? 1 / Math.tan(rad(el + 7.31 / (el + 4.4))) / 60 : 0;
  return { aparente: el + ref, azimute: az, geometrica: el };
}

// ------------------------------------------------------------------ relógio local da Bahia
export function utcLocal(data, minuto) {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d) + (minuto - BAHIA_MIN) * MS_MIN;
}
export const hm = (min) => (min == null ? '-' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);

// ------------------------------------------------------------------ o dia de um ponto (04:30 a 19:30, 1 em 1 min)
// Devolve minutos do dia (hora local). apagaMin segue a regra da ARQUITETURA 4.1 (fim do último intervalo de sol
// direto que termina depois de 12:00); someNaSerraMin é o "sol_some_atras_da_serra" do protótipo (último minuto de luz).
export function dia(lon, lat, perfil, data) {
  const out = [];
  for (let m = 4 * 60 + 30; m <= 19 * 60 + 30; m++) {
    const s = sol(utcLocal(data, m), lat, lon);
    const hz = perfil[roundPython(s.azimute * 2) % 720][1];
    const topo = s.aparente + 0.267;
    out.push({ m, ap: s.aparente, az: s.azimute, hz, acima: topo > 0, luz: topo > hz });
  }
  const acima = out.filter((o) => o.acima);
  const luz = out.filter((o) => o.luz);
  const intervalos = [];
  let ini = null, ant = false;
  for (const o of out) {
    if (o.luz && !ant) ini = o.m;
    if (!o.luz && ant) intervalos.push([ini, o.m - 1]);
    ant = o.luz;
  }
  if (ant) intervalos.push([ini, out[out.length - 1].m]);
  const tarde = intervalos.filter((iv) => iv[1] > 720);
  const ultimo = luz.length ? luz[luz.length - 1] : null;
  return {
    nascerOficialMin: acima.length ? acima[0].m : null,
    porOficialMin: acima.length ? acima[acima.length - 1].m : null,
    solApareceNaSerraMin: luz.length ? luz[0].m : null,
    someNaSerraMin: ultimo ? ultimo.m : null,
    azimuteAoSumir: ultimo ? ultimo.az : null,
    serraNoAzimute: ultimo ? ultimo.hz : null,
    intervalos,
    apagaMin: tarde.length ? tarde[tarde.length - 1][1] : null,
  };
}

// Extensão (não está no protótipo): fim do crepúsculo civil, elevação geométrica abaixo de −6°, minuto local.
export function crepusculoCivil(data, lat, lon) {
  let ant = null, escurece = null;
  for (let m = 0; m < 1440; m++) {
    const g = sol(utcLocal(data, m), lat, lon).geometrica;
    if (ant != null && ant >= -6 && g < -6) escurece = m;
    ant = g;
  }
  return escurece;
}

// Atalho: horas de um ponto numa data.
export function horasDoPonto(rel, lon, lat, data) {
  const h = horizonte(rel, lon, lat);
  if (!h) return null;
  return { altitude: h.altitude, ...dia(lon, lat, h.perfil, data), escureceMin: crepusculoCivil(data, lat, lon) };
}
