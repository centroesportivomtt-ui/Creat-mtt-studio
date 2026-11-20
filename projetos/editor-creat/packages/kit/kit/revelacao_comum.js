// Peças comuns da linguagem "Em Revelação" (laboratório fotográfico): cores, fontes, frente radial do FX `revela`,
// grão, papel com fibra, lápis dermatográfico, datilografia, carimbo e o deslocamento da transição `salto`.
// Tudo é função pura de t (registrada com ctx.aCada) ou elemento estático: mesmo t, mesmo quadro.
import { gsap } from "gsap";

export const COR = {
  breu: "#120D0A",        // quarto escuro
  luz: "#9E1B12",         // luz de segurança
  papel: "#EFE6D4",       // papel fotográfico
  ouro: "#E3B341",        // só na revelação
  carimbo: "#2B3A67",     // tinta de carimbo
  creme: "#FFF6E6",       // texto sobre vídeo
  laranja: "#C8742F",     // base laranja do negativo
  lapisVideo: "#E0442F",  // lápis sobre vídeo
  lapisPapel: "#9E1B12",  // lápis sobre papel
  fita: "#D9C9A3",        // fita crepe
};

export const FONTE = {
  voz: '"Instrument Serif", Georgia, serif',         // voz e emoção
  arquivo: '"Special Elite", "Courier New", monospace', // arquivo, máquina de escrever
  lapis: '"Caveat Brush", cursive',                   // marcas à mão
};

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const curva = (nome) => gsap.parseEase(nome);

// ---------------------------------------------------------------- métrica de texto
const cv = document.createElement("canvas").getContext("2d");
const fonteCanvas = (fam, px, italico) => `${italico ? "italic " : ""}400 ${px}px ${fam}`;
export function largura(texto, fam, px, italico = false, trackingEm = 0) {
  cv.font = fonteCanvas(fam, px, italico);
  return cv.measureText(texto).width + trackingEm * px * [...texto].length;
}
// distância do topo de uma caixa de line-height `lh` (múltiplo do tamanho) até a linha de base
export function baseNoTopo(fam, px, italico = false, lh = 1) {
  cv.font = fonteCanvas(fam, px, italico);
  const m = cv.measureText("Hgçã");
  const A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
  return (lh * px - (A + D)) / 2 + A;
}

// ---------------------------------------------------------------- frente radial (FX `revela`)
// Mesma conta do FX Python `revela` (services/motor/motor/etapas/montagem/fx.py, raio_revela):
//   r(t) = rmax · (0,5 − 0,5·cos(π·prog(t, de, dur)))
// Padrões IGUAIS aos do FX (para os dois lados lerem os mesmos números mesmo quando o EDL omite algum):
//   origem: [540, 960] no "abre" e [540, 1980] no "fecha"; soft 40; amp 70;
//   rmax: distância da origem ao canto mais longe do quadro 1080x1920 + amp + soft (a frente termina sem sobra).
// O início pode vir como `de` (camada) ou `t` (nome usado no EDL do FX).
export const FRENTE_PADRAO = { modo: "abre", soft: 40, amp: 70, origemAbre: [540, 960], origemFecha: [540, 1980], dur: 1.9 };
export function normalizaFrente(f) {
  // sem início (`de` ou `t`) a conta vira NaN e a máscara fica "NaNpx" sem erro: falha cedo
  const ini = f.de ?? f.t;
  if (ini === undefined || ini === null || !Number.isFinite(+ini)) throw new Error("revelacao: frente sem início (`de` ou `t`): " + JSON.stringify(f));
  const modo = f.modo ?? FRENTE_PADRAO.modo;
  const origem = f.origem ?? (modo === "fecha" ? FRENTE_PADRAO.origemFecha : FRENTE_PADRAO.origemAbre);
  const soft = +(f.soft ?? FRENTE_PADRAO.soft), amp = +(f.amp ?? FRENTE_PADRAO.amp);
  const [ox, oy] = origem;
  const rmax = f.rmax !== undefined && f.rmax !== null ? +f.rmax
    : Math.max(...[[0, 0], [1080, 0], [0, 1920], [1080, 1920]].map(([x, y]) => Math.hypot(x - ox, y - oy))) + amp + soft;
  return { de: +ini, dur: Math.max(1e-6, +(f.dur || FRENTE_PADRAO.dur)), modo, origem, rmax, soft, amp };
}
export function raioFrente(t, f) {
  const k = clamp((t - f.de) / f.dur);
  return f.rmax * (0.5 - 0.5 * Math.cos(Math.PI * k));
}
// máscara CSS: no "abre" o texto aparece DENTRO do raio (onde o positivo nasceu);
// no "fecha" (o negativo cresce) o texto só fica FORA do raio. `inverte` troca os dois.
export function mascaraFrente(t, f, inverte = false) {
  const r = raioFrente(t, f), a = Math.max(0, r - f.soft);
  const [ox, oy] = f.origem;
  const dentro = (f.modo === "fecha") === !!inverte;
  return dentro
    ? `radial-gradient(circle at ${ox}px ${oy}px, #000 ${a.toFixed(2)}px, transparent ${r.toFixed(2)}px)`
    : `radial-gradient(circle at ${ox}px ${oy}px, transparent ${a.toFixed(2)}px, #000 ${r.toFixed(2)}px)`;
}

// ---------------------------------------------------------------- deslocamento do `salto`
// Mesma conta do FX Python `salto` (fx.py, _salto), janela `dur` (0,20 s) centrada no corte:
//   k = (1 − |t − corte| / (dur/2))^1,6   ·   s = H·0,5·k
//   antes do corte: o plano que sai sobe s (ySai = −s) e o seguinte ocupa a faixa de baixo (yEntra = H − s); emenda em H − s
//   depois do corte: o que entra chega de baixo (yEntra = s) e o anterior ocupa a faixa de cima (ySai = s − H); emenda em s
//   linha preta de 24 px CENTRADA na emenda; borrão vertical de caixa com 40·k px (aqui: gaussiano σ = 0,29·40·k, equivalente)
export function salto(t, corte, dur, H, forca = 1) {
  const meia = dur / 2;
  if (t < corte - meia || t >= corte + meia) return { ativo: false, ySai: 0, yEntra: 0, emenda: null, blur: 0, k: 0 };
  const k = Math.pow(Math.max(0, 1 - Math.abs(t - corte) / meia), 1.6);
  const s = Math.round(H * 0.5 * k);
  const blur = 0.29 * 40 * k * forca;
  if (t < corte) return { ativo: true, fase: 1, ySai: -s, yEntra: H - s, emenda: H - s, blur, k };
  return { ativo: true, fase: 2, ySai: s - H, yEntra: s, emenda: s, blur, k };
}

// ---------------------------------------------------------------- texturas com semente (geradas uma vez)
let LADRILHOS = null;
function ladrilhosGrao(semente) {
  if (LADRILHOS) return LADRILHOS;
  LADRILHOS = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"); const im = x.createImageData(256, 256); const r = semente(911 + k);
    // grão com sinal: branco ou preto com alfa = |n − 0,5|·2 — funciona sobre transparente (overlay com alfa)
    for (let i = 0; i < im.data.length; i += 4) {
      const n = r(); const v = n > 0.5 ? 255 : 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.round(Math.abs(n - 0.5) * 2 * 255);
    }
    x.putImageData(im, 0, 0); LADRILHOS.push(`url(${c.toDataURL()})`);
  }
  return LADRILHOS;
}
// grão de filme em ladrilhos trocados por quadro (como no `fundo`), opacidade `op`
export function grao(ctx, pai, op, { de = -Infinity, ate = Infinity } = {}) {
  const lad = ladrilhosGrao(ctx.semente);
  const g = ctx.el("div", "mk-grao", pai, { position: "absolute", inset: "0", opacity: String(op), pointerEvents: "none" });
  const r = ctx.semente(77);
  const offs = Array.from({ length: 64 }, () => [Math.floor(r() * 256), Math.floor(r() * 256)]);
  ctx.aCada((t) => {
    g.style.display = t >= de && t < ate ? "" : "none";
    const q = Math.round(t * ctx.fps);
    g.style.backgroundImage = lad[q % 4];
    const [ox, oy] = offs[q % 64];
    g.style.backgroundPosition = `${ox}px ${oy}px`;
  });
  return g;
}

let FIBRA = null;
function texturaFibra(semente) {
  if (FIBRA) return FIBRA;
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const x = c.getContext("2d"); const r = semente(4242);
  // manchas largas (papel não é liso) + fibras curtas curvas
  for (let i = 0; i < 260; i++) {
    const g = x.createRadialGradient(r() * 512, r() * 512, 0, r() * 512, r() * 512, 20 + r() * 70);
    g.addColorStop(0, `rgba(90,70,40,${0.15 + r() * 0.25})`); g.addColorStop(1, "rgba(90,70,40,0)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  }
  x.lineCap = "round";
  for (let i = 0; i < 1400; i++) {
    const x0 = r() * 512, y0 = r() * 512, a = r() * Math.PI * 2, l = 4 + r() * 22;
    x.strokeStyle = r() < 0.5 ? `rgba(70,52,30,${0.4 + r() * 0.6})` : `rgba(255,252,240,${0.5 + r() * 0.5})`;
    x.lineWidth = 0.6 + r() * 1.2;
    x.beginPath(); x.moveTo(x0, y0);
    x.quadraticCurveTo(x0 + Math.cos(a + 0.6) * l * 0.5, y0 + Math.sin(a + 0.6) * l * 0.5, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
    x.stroke();
  }
  FIBRA = `url(${c.toDataURL()})`;
  return FIBRA;
}
// folha de papel fotográfico: cor + fibra a 6% + (opcional) vinheta da luz de segurança
export function papel(ctx, pai, { vinheta = false, cor = COR.papel, fibra = 0.06 } = {}) {
  const f = ctx.el("div", "mk-papel-fundo", pai, { position: "absolute", inset: "0", background: cor });
  ctx.el("div", "", f, { position: "absolute", inset: "0", backgroundImage: texturaFibra(ctx.semente), backgroundSize: "512px 512px", opacity: String(fibra) });
  if (vinheta) ctx.el("div", "", f, { position: "absolute", inset: "0", background: "radial-gradient(ellipse 78% 72% at 50% 48%, rgba(158,27,18,0) 52%, rgba(158,27,18,0.35) 100%)" });
  return f;
}

const TINTAS = new Map();
// máscara de tinta gasta (alfa): manchas de baixa frequência + falhas pontuais + riscos finos
export function tintaGasta(semente, n = 5) {
  if (TINTAS.has(n)) return TINTAS.get(n);
  const W = 640, H = 220;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); const im = x.createImageData(W, H); const r = semente(500 + n);
  const G = 22, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2;
  const nos = Array.from({ length: gw * gh }, () => r());
  const sm = (a) => a * a * (3 - 2 * a);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const gx = i / G, gy = j / G, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
    const v = (nos[y0 * gw + x0] * (1 - fx) + nos[y0 * gw + x0 + 1] * fx) * (1 - fy) + (nos[(y0 + 1) * gw + x0] * (1 - fx) + nos[(y0 + 1) * gw + x0 + 1] * fx) * fy;
    let a = clamp(0.35 + v * 1.1);
    if (r() < 0.07) a *= 0.15;            // falha de tinta
    const k = (j * W + i) * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = 0; im.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(im, 0, 0);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i++) { // riscos de desgaste
    x.strokeStyle = `rgba(0,0,0,${0.5 + r() * 0.5})`; x.lineWidth = 1 + r() * 2;
    const y = r() * H; x.beginPath(); x.moveTo(r() * W, y); x.lineTo(r() * W, y + (r() - 0.5) * 30); x.stroke();
  }
  const url = `url(${c.toDataURL()})`;
  TINTAS.set(n, url);
  return url;
}

// ---------------------------------------------------------------- lápis dermatográfico
let FILTRO = null;
// filtro SVG de cera: borda irregular (deslocamento por ruído) + falhas de grão. Sementes fixas: determinístico.
export function filtroLapis() {
  if (FILTRO) return FILTRO;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.style.position = "absolute";
  svg.innerHTML = `<defs><filter id="mk-lapis" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1680" height="2520" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3.4 -0.8" result="ga"/>
    <feComposite in="d" in2="ga" operator="in"/></filter></defs>`;
  document.body.appendChild(svg);
  FILTRO = "url(#mk-lapis)";
  return FILTRO;
}

// ruído suave 1D com semente, em [-1, 1]
function suave(r) {
  const nos = Array.from({ length: 512 }, () => r() * 2 - 1);
  return (s) => { const i = Math.floor(s), f = s - i, a = nos[((i % 512) + 512) % 512], b = nos[(((i + 1) % 512) + 512) % 512]; const w = (1 - Math.cos(Math.PI * f)) / 2; return a * (1 - w) + b * w; };
}
// aplica jitter normal de ±amp px ao longo da polilinha
function tremer(pts, r, amp = 1.5) {
  const f = suave(r); let s = 0;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const o = amp * f(s / 38);
    return [p[0] - (dy / L) * o, p[1] + (dx / L) * o];
  });
}
const caminho = (pts) => "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");

function formaElipse(cx, cy, rx, ry, r) {
  const N = 150, voltas = 1.12, th0 = -2.25, incl = (-5 * Math.PI) / 180, f = suave(r);
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, th = th0 + u * voltas * 2 * Math.PI;
    const k = 1 + 0.045 * u + 0.02 * f(u * 6);                 // espiral leve: a volta final passa por fora
    const x = Math.cos(th) * rx * k, y = Math.sin(th) * ry * k;
    out.push([cx + x * Math.cos(incl) - y * Math.sin(incl), cy + x * Math.sin(incl) + y * Math.cos(incl)]);
  }
  return out;
}
function formaCurva(p0, p1, curvatura, N = 60) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const nx = -(p1[1] - p0[1]) / L, ny = (p1[0] - p0[0]) / L;
  const c = [(p0[0] + p1[0]) / 2 + nx * curvatura * L, (p0[1] + p1[1]) / 2 + ny * curvatura * L];
  const out = [];
  for (let i = 0; i <= N; i++) { const u = i / N; out.push([(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1]]); }
  return out;
}

// "some": tempo absoluto em que a marca começa a apagar (0,2 s); valor menor que `de` conta depois do fim do traço.
function tempoSome(s) {
  if (s.some === undefined || s.some === null) return Infinity;
  return s.some < s.de ? s.de + s.dur + s.some : s.some;
}

// Uma marca de lápis. s = {tipo, de, dur, pts, r, texto, tam, cor, espessura, giro, some, passes}
//   elipse:   pts [[x0,y0],[x1,y1]] (caixa) ou [[cx,cy]] + r
//   circulo:  pts [[cx,cy]] + r, ou caixa [[x0,y0],[x1,y1]]
//   seta:     pts [[de],[para]]; a ponta é desenhada no último quarto do tempo
//   risco:    pts [[x0,y0],[x1,y1]]; passes 1 ou 2 (vai e volta)
//   sublinha: pts [[x0,y],[x1,y]]
//   palavra:  pts [[x, base]] + texto (Caveat Brush, tam 60), revelado letra a letra por máscara; halo: text-shadow opcional
export function lapis(ctx, pai, s0, corPadrao = COR.lapisVideo, semente = 1) {
  const s = { dur: 0.4, ...s0 };
  const cor = s.cor ?? corPadrao;
  const filtro = filtroLapis();
  const fim = tempoSome(s), dSome = s.someDur ?? 0.2;
  const e = curva("power1.inOut");
  const r = ctx.semente(semente * 97 + Math.round(s.de * 100));
  ctx.cue(s.de, "lapis", -22);
  const opSome = (t) => (t < fim ? 1 : 1 - clamp((t - fim) / dSome));

  if (s.tipo === "palavra") return palavraLapis(ctx, pai, s, cor, filtro, opSome);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "mk-lapis");
  svg.setAttribute("width", ctx.W); svg.setAttribute("height", ctx.H);
  svg.setAttribute("viewBox", `0 0 ${ctx.W} ${ctx.H}`);
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible", pointerEvents: "none" });
  pai.appendChild(svg);
  const g = document.createElementNS(NS, "g");
  g.setAttribute("filter", filtro);
  svg.appendChild(g);
  const tracos = []; // {d, ini, fim} em fração da duração
  const pts = s.pts ?? [];
  if (s.tipo === "elipse" || s.tipo === "circulo") {
    let cx, cy, rx, ry;
    if (pts.length >= 2) { cx = (pts[0][0] + pts[1][0]) / 2; cy = (pts[0][1] + pts[1][1]) / 2; rx = Math.abs(pts[1][0] - pts[0][0]) / 2; ry = Math.abs(pts[1][1] - pts[0][1]) / 2; }
    else { [cx, cy] = pts[0]; rx = ry = s.r ?? 80; }
    if (s.tipo === "circulo" && pts.length < 2) ry = rx;
    tracos.push({ d: caminho(tremer(formaElipse(cx, cy, rx, ry, r), r)), ini: 0, fim: 1 });
  } else if (s.tipo === "seta") {
    const [p0, p1] = pts;
    const corpo = formaCurva(p0, p1, s.curvatura ?? 0.12);
    tracos.push({ d: caminho(tremer(corpo, r)), ini: 0, fim: 0.75 });
    const a = corpo[corpo.length - 4], ang = Math.atan2(p1[1] - a[1], p1[0] - a[0]), L = s.ponta ?? 30;
    const b1 = [p1[0] - L * Math.cos(ang - 0.5), p1[1] - L * Math.sin(ang - 0.5)], b2 = [p1[0] - L * Math.cos(ang + 0.5), p1[1] - L * Math.sin(ang + 0.5)];
    tracos.push({ d: caminho(tremer([b1, ...formaCurva(b1, p1, 0.03, 8).slice(1), ...formaCurva(p1, b2, -0.03, 8).slice(1)], r, 0.8)), ini: 0.75, fim: 1 });
  } else if (s.tipo === "risco") {
    const [p0, p1] = pts;
    const passes = s.passes ?? 1;
    const ida = formaCurva(p0, p1, 0.015);
    if (passes > 1) {
      const volta = formaCurva([p1[0] - 6, p1[1] + 9], [p0[0] + 10, p0[1] + 7], -0.02);
      tracos.push({ d: caminho(tremer([...ida, ...volta], r)), ini: 0, fim: 1 });
    } else tracos.push({ d: caminho(tremer(ida, r)), ini: 0, fim: 1 });
  } else if (s.tipo === "sublinha") {
    const [p0, p1] = pts;
    tracos.push({ d: caminho(tremer(formaCurva(p0, [p1[0], p1[1] - 3], 0.02), r, 1.2)), ini: 0, fim: 1 });
  } else throw new Error("lápis desconhecido: " + s.tipo);

  const nos = tracos.map((tr) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", tr.d); p.setAttribute("pathLength", "1");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", cor);
    p.setAttribute("stroke-width", String(s.espessura ?? 7));
    p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("stroke-dasharray", "1 2");
    g.appendChild(p);
    return { p, ...tr };
  });
  ctx.aCada((t) => {
    const u = (t - s.de) / s.dur;
    for (const n of nos) {
      const k = e(clamp((u - n.ini) / (n.fim - n.ini)));
      n.p.style.visibility = k > 0 ? "visible" : "hidden";
      n.p.setAttribute("stroke-dashoffset", (1 - k).toFixed(4));
    }
    svg.style.opacity = String(opSome(t));
    svg.style.display = t >= s.de && opSome(t) > 0 ? "" : "none";
  });
  return { el: svg, fim: s.de + s.dur };
}

function palavraLapis(ctx, pai, s, cor, filtro, opSome) {
  const fam = FONTE.lapis, px = s.tam ?? 60;
  const [x, y] = s.pts?.[0] ?? [s.x, s.y];
  const caixa = ctx.el("div", "mk-lapis-palavra mk-texto", pai, {
    position: "absolute", left: x + "px", top: y - baseNoTopo(fam, px, false, 1) + "px", font: `400 ${px}px/1 ${fam}`,
    color: cor, whiteSpace: "pre", transform: `rotate(${s.giro ?? -2}deg)`, transformOrigin: "0% 75%", filter: filtro,
    textShadow: s.halo ?? "none",
  });
  const letras = [...s.texto].map((ch) => { const sp = ctx.el("span", "", caixa, { display: "inline-block", whiteSpace: "pre" }); sp.textContent = ch; return sp; });
  // peso de cada letra = largura (espaço vale pouco: o lápis só pula)
  const pesos = letras.map((sp) => (sp.textContent === " " ? 0.25 : 1) * Math.max(1, sp.offsetWidth));
  const total = pesos.reduce((a, b) => a + b, 0);
  let acc = 0;
  const faixas = pesos.map((w) => { const a = acc / total; acc += w; return [a, acc / total]; });
  const e = curva("power1.inOut");
  ctx.aCada((t) => {
    const u = e(clamp((t - s.de) / s.dur));
    letras.forEach((sp, i) => {
      const [a, b] = faixas[i], k = clamp((u - a) / (b - a || 1));
      sp.style.visibility = k > 0 ? "visible" : "hidden";
      sp.style.clipPath = k >= 1 ? "none" : `inset(-30% ${((1 - k) * 100).toFixed(2)}% -40% -25%)`;
    });
    caixa.style.opacity = String(opSome(t));
    caixa.style.display = t >= s.de && opSome(t) > 0 ? "" : "none";
  });
  return { el: caixa, fim: s.de + s.dur };
}

// ---------------------------------------------------------------- datilografia
// s = {de, x, y (topo da 1ª tira), linhas[], cps 28, dur?, tempos?[], ate?, caixa?}
// opções: tira (fundo de papel), cor, tam, rot, base (y é linha de base em vez de topo), semente
// Um caractere a cada 1/cps s, com ±12 ms, ±1 px e tinta entre 0,75 e 1. Cada linha é uma tira que entra
// deslizando 12 px em 0,15 s quando começa a ser datilografada. "**X**" vira negrito falso (contorno da tinta).
export function datilografar(ctx, pai, s, { tira = true, cor = COR.breu, tam = 38, rot = -1.5, base = false, semente = 1, cls = "" } = {}) {
  const r = ctx.semente(semente * 131 + Math.round((s.de ?? 0) * 100));
  const linhas = (s.linhas ?? [s.texto]).map((l) => (s.caixa || !tira ? l : l.toLowerCase()));
  const nChars = linhas.reduce((a, l) => a + l.replace(/\*\*/g, "").length, 0);
  let cps = s.cps ?? 28;
  if (s.dur && !s.tempos) cps = nChars / s.dur;
  const pad = tira ? [14, 22] : [0, 0];
  const lh = 1.15, alt = tam * lh + pad[0] * 2;
  const y0 = base ? s.y - pad[0] - baseNoTopo(FONTE.arquivo, tam, false, lh) : s.y;
  const eIn = curva("expo.out");
  const out = [];
  let tLinha = s.de;
  linhas.forEach((linha, k) => {
    if (s.tempos?.[k] !== undefined) tLinha = s.tempos[k];
    const giro = rot + (r() - 0.5) * 0.8;
    const e = ctx.el("div", `mk-tira mk-texto ${cls}`, pai, {
      position: "absolute", left: s.x + "px", top: y0 + k * (alt + 8) + "px", padding: `${pad[0]}px ${pad[1]}px`,
      background: tira ? "rgba(239,230,212,0.92)" : "none", boxShadow: tira ? "0 3px 10px rgba(18,13,10,0.35)" : "none",
      font: `400 ${tam}px/${lh} ${FONTE.arquivo}`, color: cor, whiteSpace: "pre", transformOrigin: "0 50%",
    });
    const chars = [];
    let negrito = false, t = tLinha;
    for (const parte of linha.split(/(\*\*)/)) {
      if (parte === "**") { negrito = !negrito; continue; }
      for (const ch of parte) {
        const sp = ctx.el("span", "", e, { display: "inline-block", whiteSpace: "pre",
          transform: `translate(${((r() - 0.5) * 2).toFixed(2)}px, ${((r() - 0.5) * 2).toFixed(2)}px)`, opacity: (0.75 + r() * 0.25).toFixed(3) });
        if (negrito) sp.style.webkitTextStroke = `${(tam * 0.025).toFixed(2)}px currentColor`;
        sp.textContent = ch;
        const tc = t + (r() - 0.5) * 0.024;
        chars.push({ sp, t: tc });
        if (ch.trim()) ctx.cue(tc, "tecla", -20 + (r() - 0.5) * 4);
        t += 1 / cps;
      }
    }
    const fimLinha = t;
    ctx.cue(fimLinha, "campainha", -18);
    const iniLinha = tLinha, ate = s.ate ?? Infinity;
    ctx.aCada((tt) => {
      for (const c of chars) c.sp.style.visibility = tt >= c.t ? "visible" : "hidden";
      const kin = eIn(clamp((tt - iniLinha) / 0.15)), kout = clamp((tt - ate) / 0.15);
      e.style.display = tt >= iniLinha && tt < ate + 0.15 ? "" : "none";
      e.style.opacity = String(Math.min(kin, 1 - kout));
      e.style.transform = `translate(${(-12 * (1 - kin)).toFixed(2)}px, ${(-8 * kout).toFixed(2)}px) rotate(${giro.toFixed(2)}deg)`;
    });
    out.push({ el: e, ini: iniLinha, fim: fimLinha });
    tLinha = fimLinha + 0.15;
  });
  return out;
}

// ---------------------------------------------------------------- carimbo
// s = {de, texto, x, y (CENTRO do carimbo), giro -6, tam 44, cor #2B3A67, op 0.85, ate?}
// Special Elite em caixa alta, tracking .12em, borda dupla de 4 px, tinta gasta por máscara de ruído.
// Escala 1,25 → 1 em 0,08 s (expo.in). A tremida de quadro é do FX `impacto` (cue "carimbo").
// O centro é empurrado para dentro da zona de texto (x 96–940, y 285–1480) se a caixa girada sair dela, e para fora
// dos retângulos `evitar` ([x0,y0,x1,y1], as tiras datilografadas) para nunca cobrir a palavra escrita.
export function carimbo(ctx, pai, s, { semente = 1, evitar = [] } = {}) {
  const tam = s.tam ?? 44, giro = s.giro ?? -6;
  const e = ctx.el("div", "mk-carimbo mk-texto", pai, {
    position: "absolute", left: "0", top: "0", padding: `${tam * 0.32}px ${tam * 0.55}px`, border: "4px solid currentColor",
    font: `400 ${tam}px/1 ${FONTE.arquivo}`, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "pre",
    color: s.cor ?? COR.carimbo, opacity: String(s.op ?? 0.85), WebkitMaskImage: tintaGasta(ctx.semente, semente), maskImage: tintaGasta(ctx.semente, semente),
    WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
  });
  ctx.el("div", "", e, { position: "absolute", inset: "4px", border: "4px solid currentColor", pointerEvents: "none" });
  const tx = ctx.el("span", "", e, { position: "relative", display: "inline-block", marginRight: "-0.12em" });
  tx.textContent = (s.texto ?? "EM REVELAÇÃO").toUpperCase();
  const w = e.offsetWidth, h = e.offsetHeight, a = (Math.abs(giro) * Math.PI) / 180;
  const bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a);
  let cx = clamp(s.x ?? 600, 96 + bw / 2, 940 - bw / 2), cy = clamp(s.y ?? 318, 285 + bh / 2, 1480 - bh / 2);
  // não cobre texto já datilografado: tenta ir para a direita da tira; se não couber, desce para logo abaixo dela
  for (const [x0, y0, x1, y1] of evitar) {
    const bate = cx - bw / 2 < x1 && x0 < cx + bw / 2 && cy - bh / 2 < y1 && y0 < cy + bh / 2;
    if (!bate) continue;
    if (x1 + 10 + bw <= 940) cx = x1 + 10 + bw / 2;
    else cy = clamp(y1 + 8 + bh / 2, 285 + bh / 2, 1480 - bh / 2);
  }
  e.style.left = cx - w / 2 + "px"; e.style.top = cy - h / 2 + "px";
  const ein = curva("expo.in");
  ctx.cue(s.de, "carimbo", -12);
  ctx.aCada((t) => {
    const vis = t >= s.de && t < (s.ate ?? Infinity);
    e.style.display = vis ? "" : "none";
    const k = ein(clamp((t - s.de) / 0.08));
    e.style.transform = `rotate(${giro}deg) scale(${(1.25 - 0.25 * k).toFixed(4)})`;
  });
  return { el: e, cx, cy };
}

// entrada da voz (legenda e títulos): desfoque 14 → 0, tracking 0,06em → 0, opacidade 0 → 1 e brilho quente que se apaga.
// saída "queima": 0,08 s indo a branco com brilho de 30 px, depois 0,10 s até opacidade 0.
// Devolve uma função (t) que aplica o estilo; papel = tinta sem sombra.
export function vozAnimada(no, { de, ate = Infinity, entrada = 0.32, saida = 0.18, cor = COR.creme, papel = false, sombraBase = null } = {}) {
  const ein = curva("power2.out");
  const base = sombraBase ?? [[0, 2, 18, [18, 13, 10, 0.55]], [0, 0, 2, [18, 13, 10, 0.6]]];
  const quente = [[0, 0, 26, [255, 214, 150, 0.9]], [0, 0, 2, [255, 214, 150, 0]]];
  const branco = [[0, 0, 30, [255, 255, 255, 0.95]], [0, 0, 2, [255, 255, 255, 0]]];
  const mix = (A, B, k) => A.map((a, i) => { const b = B[i]; const v = (j) => a[j] + (b[j] - a[j]) * k; const c = a[3].map((x, j) => x + (b[3][j] - x) * k);
    return `${v(0).toFixed(1)}px ${v(1).toFixed(1)}px ${v(2).toFixed(1)}px rgba(${c[0].toFixed(0)},${c[1].toFixed(0)},${c[2].toFixed(0)},${c[3].toFixed(3)})`; }).join(", ");
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const c0 = hex(cor);
  return (t) => {
    const vis = t >= de && t < ate;
    no.style.display = vis ? "" : "none";
    if (!vis) return;
    const k = ein(clamp((t - de) / entrada));
    const s0 = ate - saida;
    const q1 = clamp((t - s0) / Math.min(0.08, saida)), q2 = clamp((t - s0 - 0.08) / Math.max(1e-3, saida - 0.08));
    no.style.filter = k < 1 ? `blur(${(14 * (1 - k)).toFixed(2)}px)` : "none";
    no.style.letterSpacing = `${(0.06 * (1 - k)).toFixed(4)}em`;
    if (papel) {
      no.style.textShadow = "none";
      no.style.color = cor;
      no.style.opacity = String(Math.min(k, 1 - clamp((t - s0) / saida)));
      return;
    }
    if (t >= s0) {
      const c = c0.map((x) => x + (255 - x) * q1);
      no.style.color = `rgb(${c.map((x) => x.toFixed(0)).join(",")})`;
      no.style.textShadow = mix(base, branco, q1);
      no.style.opacity = String(1 - q2);
    } else {
      no.style.color = cor;
      no.style.textShadow = mix(quente, base, k);
      no.style.opacity = String(k);
    }
  };
}
