// Núcleo do kit de motion da creat.MTT.
// Contrato (vale para todo modelo):
//   1. Cada quadro depende só do tempo t. Nada de Date.now(), Math.random() sem semente, timers ou fetch durante o seek.
//   2. Toda animação vive numa timeline GSAP PAUSADA (ctx.tl) ou numa função pura de t registrada em ctx.aCada().
//   3. O renderizador chama window.__mk.seek(t) e tira o print. Preview e render final são idênticos.
import { gsap } from "gsap";

export const EASE = {
  chegada: "expo.out",        // elemento chegando: cauda longa
  chegadaForte: "power4.out", // palavra batendo
  camera: "power2.inOut",     // câmera, inundação de cor
  saida: "power3.in",         // saída e mergulho
  mola: "back.out(1.4)",      // só posição/escala, nunca opacidade ou cor
  linear: "none",
};

export const DUR = {
  chegada: 0.6,
  saida: 0.3,        // saída 40% a 50% mais curta que a entrada
  palavra: 0.13,     // palavra entrando com blur 6->0
  entrePalavras: 0.067,
  letra: 1 / 30,     // stagger de letra = 1 quadro
};

// Zona segura única da casa (1080x1920), a mesma das skills motion-design e estrategia-social:
// texto entre y 285 e 1480 (1920 - 440) e entre x 60 e 960 (1080 - 120, coluna de botões do Instagram).
// margem = recuo padrão de layout (84 px). O HUD decorativo é isento da zona, mas nunca pode colidir com texto
// (regra "sem-colisao" do checar).
export const ZONA = { topo: 285, base: 440, direita: 120, esquerda: 60, margem: 84 };

// gerador com semente (mulberry32): mesmo número, mesma sequência
export function semente(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = (nome) => gsap.parseEase(nome);
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const prog = (t, de, dur) => clamp((t - de) / dur);

const medidor = document.createElement("canvas").getContext("2d");
export function medir(texto, fonte, px) {
  medidor.font = `${px}px ${fonte}`;
  return medidor.measureText(texto).width;
}
// tamanho de fonte para a linha ocupar `largura` px (entre min e max)
export function ajustar(texto, fonte, largura, max = 260, min = 60) {
  const w = medir(texto, fonte, 100);
  return Math.max(min, Math.min(max, Math.floor((largura / w) * 100)));
}

// "FOI *EDITADO*." -> [{t:"FOI"}, {t:"EDITADO", destaque:true, ponto:true}]
export function palavras(linha) {
  return linha.trim().split(/\s+/).filter(Boolean).map((bruta) => {
    let t = bruta, ponto = false, destaque = false;
    if (/\.\*?$/.test(t) && !/\.\.$/.test(t)) { ponto = true; t = t.replace(/\.(\*?)$/, "$1"); }
    if (/^\*.*\*$/.test(t)) { destaque = true; t = t.slice(1, -1); }
    return { t, destaque, ponto };
  });
}

export function el(tag, cls, pai, css) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) Object.assign(e.style, css);
  if (pai) pai.appendChild(e);
  return e;
}

export function cantos(pai, { arm = 34, esp = 6, cor, quais = ["no", "se"], folga = 14 } = {}) {
  const r = {};
  for (const q of quais) {
    const c = el("div", `mk-canto ${q}`, pai, { width: arm + "px", height: arm + "px" });
    if (cor) c.style.borderColor = cor;
    c.style.borderWidth = "0";
    if (q.includes("n")) c.style.borderTopWidth = esp + "px", c.style.top = -folga + "px";
    if (q.includes("s")) c.style.borderBottomWidth = esp + "px", c.style.bottom = -folga + "px";
    if (q.includes("o")) c.style.borderLeftWidth = esp + "px", c.style.left = -folga + "px";
    if (q.includes("e")) c.style.borderRightWidth = esp + "px", c.style.right = -folga + "px";
    r[q] = c;
  }
  return r;
}

export function aba(pai, s, css = {}) {
  const a = el("div", "mk-aba", pai, css);
  a.style.setProperty("--s", s + "px");
  el("div", "c", a).textContent = "c";
  el("div", "d", a);
  return a;
}

// filtro SVG de blur direcional (blur de movimento só no eixo do movimento)
let nFiltro = 0;
let defs = null;
export function blurDirecional() {
  if (!defs) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    defs = document.createElementNS(svg.namespaceURI, "defs");
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  const id = "mkmb" + nFiltro++;
  const f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  f.setAttribute("id", id);
  for (const [k, v] of Object.entries({ x: "-60%", y: "-10%", width: "220%", height: "120%", "color-interpolation-filters": "sRGB" })) f.setAttribute(k, v);
  const g = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  g.setAttribute("stdDeviation", "0 0");
  f.appendChild(g);
  defs.appendChild(f);
  return { url: `url(#${id})`, no: g, aplicar(px, eixo = "x") { g.setAttribute("stdDeviation", eixo === "x" ? `${px} 0` : `0 ${px}`); } };
}

// Monta a composição e devolve o objeto que o renderizador usa.
export async function criarPalco(comp, modelos, { alfa = false } = {}) {
  const W = comp.formato?.w ?? 1080, H = comp.formato?.h ?? 1920, fps = comp.formato?.fps ?? 30;
  const palco = document.getElementById("palco");
  palco.style.width = W + "px"; palco.style.height = H + "px";
  palco.style.background = alfa ? "transparent" : (comp.cor ?? "#0B0B0C");
  document.body.style.background = "transparent";

  const tl = gsap.timeline({ paused: true });
  const porQuadro = [];
  const cues = [];
  const qa = [];
  const camadas = {};
  const faixas = [];

  const ctx = {
    W, H, fps, alfa, tl, palco, camadas, gsap, EASE, DUR, ZONA,
    semente, ease, clamp, prog, medir, ajustar, palavras, el, cantos, aba, blurDirecional,
    aCada(fn) { porQuadro.push(fn); },
    cue(t, som, ganho = 0) { cues.push({ t: +t.toFixed(4), som, ganho }); },
    exigir(regra) { qa.push(regra); },
  };

  let z = 0;
  for (const c of comp.camadas) {
    const montar = modelos[c.modelo];
    if (!montar) throw new Error(`modelo desconhecido: ${c.modelo}`);
    if (alfa && (c.modelo === "fundo" || c.fundo)) continue; // camada de fundo fica fora do overlay
    const div = el("div", `mk-camada mk-${c.modelo}`, palco, { zIndex: String(++z) });
    div.dataset.id = c.id ?? `${c.modelo}${z}`;
    const camada = { ...c, id: div.dataset.id, el: div, de: c.de ?? 0, ate: c.ate ?? comp.duracao, props: c.props ?? {} };
    camadas[camada.id] = camada;
    faixas.push(camada);
  }
  for (const camada of faixas) await modelos[camada.modelo](ctx, camada);

  const duracao = comp.duracao ?? Math.max(...faixas.map((c) => c.ate));
  return {
    W, H, fps, duracao, cues, qa, zona: ZONA,
    seek(t) {
      for (const c of faixas) {
        const vis = t >= c.de - 1e-6 && t < c.ate - 1e-6;
        c.el.style.display = vis ? "" : "none";
      }
      tl.time(Math.min(t, tl.duration() || t), false);
      for (const fn of porQuadro) fn(t);
    },
  };
}
