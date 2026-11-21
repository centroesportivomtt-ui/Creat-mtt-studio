// placa.js · placa da recepção com QR (arte do designer: ../../arte/placa-qr.svg, 1500 x 2000 = 15 x 20 cm).
// Preenche #nome-parceiro e #endereco e desenha o QR como vetor dentro de #qr-area (x 210, y 970, 560 x 560),
// com 4 módulos de margem branca. Sai em SVG (para a gráfica, vetor puro) e em PNG de 3000 x 4000 px
// (508 dpi em 15 x 20 cm). Tudo offline: a arte vem do cache do SW e as fontes estão embutidas nela.

import { t, textoDaCasa } from '../textos.js';
import { caminhoSVG, ZONA } from './qr.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const ESCALA_PNG = 2;

let arteCache = null;
async function arte() {
  if (arteCache) return arteCache;
  const r = await fetch('./arte/placa-qr.svg');
  if (!r.ok) throw new Error(`arte ${r.status}`);
  arteCache = await r.text();
  return arteCache;
}

function encaixarTexto(no, texto, larguraMax, tamanhoMin) {
  no.textContent = texto;
  // a fonte está embutida, mas aqui não há layout: estimativa pela média de 0,56 em da Atkinson Bold
  const fs = Number(no.getAttribute('font-size')) || 84;
  const estimada = texto.length * fs * 0.56;
  if (estimada > larguraMax) no.setAttribute('font-size', String(Math.max(tamanhoMin, Math.floor(fs * larguraMax / estimada))));
}

// { marca, url } -> texto SVG pronto
export async function montarPlacaSVG({ marca, url }) {
  const doc = new DOMParser().parseFromString(await arte(), 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('arte inválida');
  const raiz = doc.documentElement;
  const nome = doc.getElementById('nome-parceiro');
  if (nome) encaixarTexto(nome, marca.parceiro || marca.nome_app, 1000, 44);
  const end = doc.getElementById('endereco');
  if (end) encaixarTexto(end, t('placa.endereco', { url: url.replace(/^https:\/\//, '') }, 'Ou digite: {url}'), 1300, 22);
  const area = doc.getElementById('qr-area');
  if (!area) throw new Error('sem #qr-area');
  const x = Number(area.getAttribute('x')), y = Number(area.getAttribute('y'));
  const w = Number(area.getAttribute('width')), h = Number(area.getAttribute('height'));
  area.setAttribute('stroke', 'none');
  area.setAttribute('fill', '#FFFFFF');
  // tira o texto provisório "QR aqui"
  for (const txt of [...doc.getElementsByTagName('text')]) if (/QR aqui/i.test(txt.textContent)) txt.remove();
  const { n, d } = caminhoSVG(url, 'M');
  const lado = Math.min(w, h);
  const mod = lado / (n + ZONA * 2);
  const g = doc.createElementNS(SVGNS, 'g');
  g.setAttribute('id', 'qr');
  g.setAttribute('transform', `translate(${x + (w - lado) / 2 + ZONA * mod} ${y + (h - lado) / 2 + ZONA * mod}) scale(${mod})`);
  g.setAttribute('shape-rendering', 'crispEdges');
  const p = doc.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', '#000000');
  g.append(p);
  area.after(g);
  raiz.setAttribute('data-qr-url', url);
  raiz.setAttribute('data-qr-modulos', String(n));
  const titulo = doc.getElementById('titulo');
  if (titulo) titulo.textContent = `Placa da recepção: ${textoDaCasa('placa.cortesia', marca) || marca.nome_app}`;
  return new XMLSerializer().serializeToString(doc);
}

// SVG -> PNG (Blob) em alta resolução, com fundo, sem rede
export async function placaPNG(svgTexto, escala = ESCALA_PNG) {
  const blob = new Blob([svgTexto], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1500 * escala;
    c.height = 2000 * escala;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    const png = await new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('png'))), 'image/png'));
    return { png, largura: c.width, altura: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
