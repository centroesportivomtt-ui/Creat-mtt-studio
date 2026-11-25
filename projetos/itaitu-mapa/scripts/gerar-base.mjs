#!/usr/bin/env node
// Gera o mapa-base vetorial de Itaitu a partir do recorte do OSM (API 0.6, JSON).
//   entrada: projetos/itaitu-mapa/dados/osm/recorte-api06.json
//   saída:   site/itaitu/dados/base.geojson
// Node 22, só módulos nativos. Reexecutável.
//
// Cada feature tem a propriedade 'camada':
//   ruas    linhas, com 'classe' (tertiary, unclassified, residential, track, path, service, primary, footway...)
//   rios    linhas de waterway (stream, river...) com 'tipo' e 'nome'; polígonos de água com tipo 'agua'
//   predios polígonos de building
//   parque  polígono do Parque Estadual das Sete Passagens
//   area    polígonos de uso do solo/lazer (tipo: residencial, cemiterio, pedreira, mata, campo, praca, escola...)
//           e pontos de localidade (tipo 'lugar', com 'nome' e 'lugar' = hamlet/village/locality/farm)
// Coordenadas com 6 casas; linhas simplificadas por Douglas-Peucker (~2 m).
// © OpenStreetMap contributors (ODbL).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const ENTRADA = path.join(RAIZ, 'projetos/itaitu-mapa/dados/osm/recorte-api06.json');
const SAIDA = path.join(RAIZ, 'site/itaitu/dados/base.geojson');
const TOL = 0.00002; // graus (~2 m)
const BBOX = [-40.62, -11.44, -40.38, -11.24]; // bbox do app com folga

const CLASSES_RUA = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'track', 'path', 'service', 'footway', 'living_street', 'steps']);
const AREAS = {
  landuse: { residential: 'residencial', cemetery: 'cemiterio', quarry: 'pedreira', farmland: 'campo', grass: 'campo', meadow: 'campo', forest: 'mata' },
  natural: { wood: 'mata', scrub: 'mata', grassland: 'campo', bare_rock: 'rocha' },
  leisure: { park: 'praca', pitch: 'quadra', sports_centre: 'esporte', sports_hall: 'esporte', swimming_pool: 'piscina' },
  amenity: { school: 'escola', place_of_worship: 'igreja' },
};

const osm = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
const nos = new Map();
const ways = [];
for (const e of osm.elements) {
  if (e.type === 'node') nos.set(e.id, [e.lon, e.lat]);
  else if (e.type === 'way') ways.push(e);
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const manter = new Uint8Array(pts.length); manter[0] = manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol * tol && idx > 0) { manter[idx] = 1; pilha.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => manter[i]);
}
function coords(w) {
  const c = [];
  for (const id of w.nodes) { const p = nos.get(id); if (p) c.push(p); }
  return c;
}
const dentro = (c) => c.some(([x, y]) => x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3]);
const fechado = (w) => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
function linha(c) { return { type: 'LineString', coordinates: dp(c, TOL).map(([x, y]) => [r6(x), r6(y)]) }; }
function poligono(c, tol = TOL) {
  let s = dp(c, tol).map(([x, y]) => [r6(x), r6(y)]);
  if (s.length < 4) s = c.map(([x, y]) => [r6(x), r6(y)]);
  const [fx, fy] = s[0], [lx, ly] = s[s.length - 1];
  if (fx !== lx || fy !== ly) s.push([fx, fy]);
  return { type: 'Polygon', coordinates: [s] };
}
function props(camada, extra, t) {
  const p = { camada, ...extra };
  if (t.name) p.nome = t.name;
  return p;
}

const feats = [];
const conta = {};
const add = (f) => { feats.push(f); conta[f.properties.camada] = (conta[f.properties.camada] || 0) + 1; };

for (const w of ways) {
  const t = w.tags || {};
  const c = coords(w);
  if (c.length < 2 || !dentro(c)) continue;
  const id = `w${w.id}`;

  if (/Sete Passagens/i.test(t.name || '') && fechado(w)) {
    add({ type: 'Feature', id, properties: props('parque', { tipo: 'parque_estadual', protecao: 'Parque Estadual (Bahia)' }, t), geometry: poligono(c, TOL * 2) });
    continue;
  }
  if (t.highway && CLASSES_RUA.has(t.highway)) {
    const extra = { classe: t.highway };
    if (t.surface) extra.piso = t.surface;
    if (t.tracktype) extra.tracktype = t.tracktype;
    add({ type: 'Feature', id, properties: props('ruas', extra, t), geometry: linha(c) });
    continue;
  }
  if (t.waterway && ['stream', 'river', 'canal', 'drain', 'ditch'].includes(t.waterway)) {
    add({ type: 'Feature', id, properties: props('rios', { tipo: t.waterway }, t), geometry: linha(c) });
    continue;
  }
  if (t.natural === 'water' && fechado(w)) {
    add({ type: 'Feature', id, properties: props('rios', { tipo: 'agua' }, t), geometry: poligono(c) });
    continue;
  }
  if (t.building && fechado(w)) {
    add({ type: 'Feature', id, properties: props('predios', { tipo: t.building === 'yes' ? 'predio' : t.building }, t), geometry: poligono(c, 0.000005) });
    continue;
  }
  if (fechado(w)) {
    let tipo = null;
    for (const [k, mapa] of Object.entries(AREAS)) if (t[k] && mapa[t[k]]) { tipo = mapa[t[k]]; break; }
    if (tipo) add({ type: 'Feature', id, properties: props('area', { tipo }, t), geometry: poligono(c) });
  }
}

// Localidades (nomes para rótulo)
for (const e of osm.elements) {
  if (e.type !== 'node' || !e.tags || !e.tags.place || !e.tags.name) continue;
  if (!['hamlet', 'village', 'locality', 'farm', 'isolated_dwelling', 'neighbourhood'].includes(e.tags.place)) continue;
  if (!dentro([[e.lon, e.lat]])) continue;
  add({ type: 'Feature', id: `n${e.id}`, properties: { camada: 'area', tipo: 'lugar', lugar: e.tags.place, nome: e.tags.name }, geometry: { type: 'Point', coordinates: [r6(e.lon), r6(e.lat)] } });
}

const saida = {
  type: 'FeatureCollection',
  atribuicao: '© OpenStreetMap contributors (ODbL)',
  fonte: 'Recorte da API 0.6 do OpenStreetMap (projetos/itaitu-mapa/dados/osm/recorte-api06.json)',
  gerado_em: new Date().toISOString().slice(0, 10),
  camadas: conta,
  features: feats,
};
fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
const texto = JSON.stringify(saida);
fs.writeFileSync(SAIDA, texto + '\n');
console.log(`base.geojson: ${feats.length} features, ${(texto.length / 1024).toFixed(0)} KB`, conta);
