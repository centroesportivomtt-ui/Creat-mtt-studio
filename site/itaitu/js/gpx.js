// gpx.js · exporta e importa GPX 1.1. Frontend A.
// Exportar: trilha gravada (trk) e pontos marcados (wpt). Importar: trk, rte e wpt; o importado vai
// para o IndexedDB (store 'trilhas', origem 'gpx'), aparece no mapa e serve de rota para o GPS, offline.

import { T } from './textos.js';
import { escaparXML, comprimentoM, subidaDescida } from './util.js';
import * as banco from './banco.js';

const LIMITE_BYTES = 8 * 1024 * 1024;
const LIMITE_PONTOS = 50000;

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = (v, casas) => Number(v).toFixed(casas);

function trkpt(p, tag = 'trkpt') {
  const partes = [`<${tag} lat="${num(p.lat, 7)}" lon="${num(p.lon, 7)}">`];
  if (p.alt != null && Number.isFinite(p.alt)) partes.push(`<ele>${num(p.alt, 1)}</ele>`);
  if (p.t) partes.push(`<time>${iso(p.t)}</time>`);
  if (p.nome) partes.push(`<name>${escaparXML(p.nome)}</name>`);
  if (p.nota) partes.push(`<desc>${escaparXML(p.nota)}</desc>`);
  if (p.tipo) partes.push(`<type>${escaparXML(p.tipo)}</type>`);
  partes.push(`</${tag}>`);
  return partes.join('');
}

// { nome, pontos: [{lon, lat, alt, t}], passagens: [{lon, lat, nota}], waypoints: [{lon, lat, alt, nome, nota, tipo, t}] }
export function gerarGPX({ nome = T.app.nome, pontos = [], passagens = [], waypoints = [], descricao = '' } = {}) {
  const linhas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Trilhas de Itaitu (feito pela Creat)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `<metadata><name>${escaparXML(nome)}</name>${descricao ? `<desc>${escaparXML(descricao)}</desc>` : ''}<time>${iso(Date.now())}</time></metadata>`,
  ];
  for (const w of waypoints) linhas.push(trkpt(w, 'wpt'));
  for (const p of passagens) linhas.push(trkpt({ ...p, nome: p.nota || T.gravador.passagem }, 'wpt'));
  if (pontos.length) {
    linhas.push(`<trk><name>${escaparXML(nome)}</name><trkseg>`);
    for (const p of pontos) linhas.push(trkpt(p));
    linhas.push('</trkseg></trk>');
  }
  linhas.push('</gpx>');
  return linhas.join('\n');
}

export function blobGPX(texto) { return new Blob([texto], { type: 'application/gpx+xml' }); }

function lerPonto(n) {
  const lat = Number(n.getAttribute('lat')), lon = Number(n.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const filho = (tag) => { for (const c of n.children) if (c.localName === tag) return c.textContent.trim(); return null; };
  const ele = filho('ele');
  const tempo = filho('time');
  const tm = tempo ? Date.parse(tempo) : NaN;
  return { lon, lat, alt: ele != null && ele !== '' && Number.isFinite(Number(ele)) ? Number(ele) : null, t: Number.isFinite(tm) ? tm : null, nome: filho('name'), nota: filho('desc') };
}

const porNome = (raiz, nome) => [...raiz.getElementsByTagName('*')].filter((n) => n.localName === nome);

// Devolve { nome, linhas: [[{lon,lat,alt,t}...], ...], waypoints: [...] } ou lança Error com texto da casa.
export function lerGPX(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx') throw new Error(T.erros.gpx);
  const nomeMeta = porNome(doc, 'metadata')[0];
  const nomeTrk = porNome(doc, 'trk')[0] || porNome(doc, 'rte')[0];
  const achaNome = (n) => { if (!n) return null; for (const c of n.children) if (c.localName === 'name') return c.textContent.trim(); return null; };
  const linhas = [];
  let total = 0;
  for (const seg of [...porNome(doc, 'trkseg'), ...porNome(doc, 'rte')]) {
    const tag = seg.localName === 'rte' ? 'rtept' : 'trkpt';
    const pts = porNome(seg, tag).map(lerPonto).filter(Boolean);
    total += pts.length;
    if (total > LIMITE_PONTOS) throw new Error(T.erros.gpx);
    if (pts.length > 1) linhas.push(pts);
  }
  const waypoints = porNome(doc, 'wpt').map(lerPonto).filter(Boolean);
  if (!linhas.length && !waypoints.length) throw new Error(T.erros.gpx_vazio);
  return { nome: achaNome(nomeTrk) || achaNome(nomeMeta) || '', linhas, waypoints };
}

// arquivo (File) -> registro gravado no banco, pronto para o mapa e para a rota
export async function importarArquivo(arquivo) {
  if (!arquivo) throw new Error(T.erros.gpx);
  if (arquivo.size > LIMITE_BYTES) throw new Error(T.erros.gpx);
  const texto = await arquivo.text();
  const g = lerGPX(texto);
  // várias linhas viram uma trilha só, na ordem do arquivo
  const pontos = g.linhas.flat().map((p) => ({ lon: p.lon, lat: p.lat, alt: p.alt, precisao: null, t: p.t }));
  if (pontos.length < 2) throw new Error(T.erros.gpx_vazio);
  const agora = Date.now();
  const nome = (g.nome || arquivo.name.replace(/\.gpx$/i, '') || 'GPX').slice(0, 80);
  const registro = {
    id: `gpx-${agora}`,
    nome,
    destino_id: null,
    criada_em: agora,
    fim_em: agora,
    pontos,
    passagens: g.waypoints.map((w) => ({ lon: w.lon, lat: w.lat, nota: (w.nome || w.nota || '').slice(0, 120) })),
    km: Math.round(comprimentoM(pontos.map((p) => [p.lon, p.lat]))) / 1000,
    desnivel_m: pontos.every((p) => p.alt != null) ? subidaDescida(pontos.map((p) => p.alt)).subida_m : null,
    duracao_s: pontos[0].t && pontos[pontos.length - 1].t ? Math.max(0, Math.round((pontos[pontos.length - 1].t - pontos[0].t) / 1000)) : null,
    origem: 'gpx',
    oficial: false,
  };
  await banco.gravar('trilhas', registro);
  return registro;
}
