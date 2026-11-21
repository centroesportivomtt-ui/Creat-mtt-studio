// estilo.js · estilo MapLibre 100% local (ARQUITETURA 5). Frontend A.
// Sem glyphs (nenhum texto desenhado pelo MapLibre: nomes são marcadores HTML), sem URL externa.
// Relevo PINTADO é o estilo principal (color-relief + hillshade com o sol do minuto); o satélite
// Sentinel-2 2016 só aparece no botão Satélite, porque a foto traz a sombra congelada de outro dia.
// Paleta: DESIGN.md 3.3 (valores dos tokens do designer).

import { posicaoDoSol } from './motor/nucleo.js';
import { escaparHTML } from './util.js';

export const EXAGERO = 1.4;

export const PALETA = Object.freeze({
  relevo: [480, '#2E4A2C', 580, '#3F5F38', 680, '#7E7B47', 800, '#A8925A', 920, '#C9B998', 1050, '#E6DAC3'],
  luz: '#FFE3A6', escuro: '#1F2A44', acento: '#2B1B10',
  agua: '#4F9BD0', tinta: '#FFF4DC', madeira: '#3A2618', mata: '#2E4A2C', predio: '#8A7056',
  ceuDia: '#A9CDE8', ceuTarde: '#F2C58A', ceuNoite: '#1B2338',
});

// Luz do relevo por modo. A luz e a sombra levam transparência: com o sol alto (meio-dia), a cor
// cheia #FFE3A6 do DESIGN 3.3 lavava o relevo pintado e a foto de satélite (conferido em 20/11, 13:00).
export const LUZ_RELEVO = {
  mapa: { exagero: 0.8, luz: 'rgba(255, 227, 166, 0.25)', escuro: 'rgba(31, 42, 68, 0.7)' },
  satelite: { exagero: 0.3, luz: 'rgba(255, 227, 166, 0.12)', escuro: 'rgba(31, 42, 68, 0.5)' },
};
export const SOMBRA_RELEVO = { mapa: LUZ_RELEVO.mapa.exagero, satelite: LUZ_RELEVO.satelite.exagero };

const POLI = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const LINHA = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const de = (c, g) => ['all', ['==', ['get', 'camada'], c], g];
const vazia = () => ({ type: 'FeatureCollection', features: [] });

function mistura(a, b, f) {
  const x = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [x(a), x(b)];
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * f).toString(16).padStart(2, '0')).join('');
}

// Luz e céu do minuto (mesma regra do luz.js do motion-3d, que assume depois do 'load').
export function luzInicial(utcMs, [lon, lat]) {
  const s = posicaoDoSol(utcMs, lat, lon);
  const direcao = Math.round(((s.azimute % 360) + 360) % 360) % 360;
  const altitude = Math.max(0, Math.min(90, s.elevacao));
  let ceu;
  if (s.elevacao >= 15) ceu = PALETA.ceuDia;
  else if (s.elevacao >= 0) ceu = mistura(PALETA.ceuTarde, PALETA.ceuDia, s.elevacao / 15);
  else if (s.elevacao >= -6) ceu = mistura(PALETA.ceuNoite, PALETA.ceuTarde, (s.elevacao + 6) / 6);
  else ceu = PALETA.ceuNoite;
  return { direcao, altitude, ceu, elevacao: s.elevacao };
}

export function ceuDe(cor, { economia = false } = {}) {
  if (economia) return { 'sky-color': cor, 'horizon-color': cor, 'fog-color': cor, 'sky-horizon-blend': 0, 'horizon-fog-blend': 0, 'fog-ground-blend': 1, 'atmosphere-blend': 0 };
  return {
    'sky-color': cor,
    'horizon-color': mistura(cor, '#FFF4DC', 0.35),
    'fog-color': mistura(cor, '#FFF4DC', 0.5),
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 0.2],
  };
}

function atribuicao(item) {
  if (!item) return '';
  const txt = escaparHTML(item.texto || item.nome || '');
  const url = typeof item.url === 'string' && /^https:\/\//.test(item.url) ? escaparHTML(item.url) : '';
  return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>` : txt;
}

// recorte: dados/recorte.json (7.0). atribuicoes: dados/atribuicoes.json (7.4).
export function criarEstilo({ recorte, atribuicoes = [], utcMs = Date.now(), economia = false, satelite = false, corMarca = '#C9283E' }) {
  const base = new URL('./', location.href).href;
  const bounds = recorte.bbox;
  const achar = (nome) => atribuicoes.find((a) => (a.nome || '').toLowerCase().startsWith(nome));
  const luz = luzInicial(utcMs, recorte.centro);
  const demTiles = [base + 'tiles/dem/{z}/{x}/{y}.png'];
  const fonteDem = { type: 'raster-dem', tiles: demTiles, tileSize: 256, encoding: 'terrarium', minzoom: recorte.tiles_z?.[0] ?? 8, maxzoom: 14, bounds };

  return {
    version: 8,
    name: 'Trilhas de Itaitu · relevo pintado',
    sources: {
      dem: { ...fonteDem, attribution: atribuicao(achar('terrain')) },
      'dem-relevo': { ...fonteDem, attribution: atribuicao(achar('terrain')) },
      sat: { type: 'raster', tiles: [base + 'tiles/sat/{z}/{x}/{y}.jpg'], tileSize: 256, minzoom: recorte.tiles_z?.[0] ?? 8, maxzoom: 14, bounds, attribution: atribuicao(achar('sentinel')) },
      base: { type: 'geojson', data: vazia(), attribution: atribuicao(achar('openstreetmap')) },
      pontos: { type: 'geojson', data: vazia() },
      trilhas: { type: 'geojson', data: vazia() },
      'rota-gps': { type: 'geojson', data: vazia() },
      gravacao: { type: 'geojson', data: vazia() },
      marcados: { type: 'geojson', data: vazia() },
    },
    terrain: economia ? undefined : { source: 'dem', exaggeration: EXAGERO },
    sky: ceuDe(luz.ceu, { economia }),
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': PALETA.relevo[3] } },
      { id: 'satelite', type: 'raster', source: 'sat', layout: { visibility: satelite ? 'visible' : 'none' }, paint: { 'raster-fade-duration': 0 } },
      {
        id: 'relevo-cor', type: 'color-relief', source: 'dem-relevo', layout: { visibility: satelite ? 'none' : 'visible' },
        paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...PALETA.relevo], 'color-relief-opacity': 1 },
      },
      {
        id: 'relevo-sombra', type: 'hillshade', source: 'dem-relevo',
        paint: {
          'hillshade-method': 'basic',
          'hillshade-illumination-anchor': 'map',
          'hillshade-illumination-direction': luz.direcao,
          'hillshade-illumination-altitude': luz.altitude,
          'hillshade-exaggeration': (satelite ? LUZ_RELEVO.satelite : LUZ_RELEVO.mapa).exagero,
          'hillshade-highlight-color': (satelite ? LUZ_RELEVO.satelite : LUZ_RELEVO.mapa).luz,
          'hillshade-shadow-color': (satelite ? LUZ_RELEVO.satelite : LUZ_RELEVO.mapa).escuro,
          'hillshade-accent-color': PALETA.acento,
        },
      },
      // âncora da sombra da serra (o B põe 'sombra-serra-camada' antes desta)
      { id: 'camada-vetorial-base', type: 'fill', source: 'base', filter: ['==', ['get', 'camada'], '__ancora__'], paint: { 'fill-opacity': 0 } },
      { id: 'area', type: 'fill', source: 'base', filter: de('area', POLI), paint: { 'fill-color': PALETA.tinta, 'fill-opacity': 0.18 } },
      { id: 'parque', type: 'fill', source: 'base', filter: de('parque', POLI), paint: { 'fill-color': PALETA.mata, 'fill-opacity': 0.1 } },
      { id: 'parque-contorno', type: 'line', source: 'base', filter: de('parque', POLI), paint: { 'line-color': PALETA.mata, 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } },
      { id: 'rios-agua', type: 'fill', source: 'base', filter: de('rios', POLI), paint: { 'fill-color': PALETA.agua, 'fill-opacity': 0.9 } },
      { id: 'rios', type: 'line', source: 'base', filter: de('rios', LINHA), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': PALETA.agua, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 2, 17, 4] } },
      // contorno de 1 px em madeira a partir do z13 (DESIGN.md 3.3); camada extra, só do A
      {
        id: 'ruas-contorno', type: 'line', source: 'base', filter: de('ruas', LINHA), minzoom: 13, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PALETA.madeira, 'line-opacity': 0.55, 'line-width': ['+', 2, ['match', ['get', 'classe'], ['primary', 'tertiary'], 3, ['unclassified', 'residential'], 2.2, 1.2]] },
      },
      {
        id: 'ruas', type: 'line', source: 'base', filter: de('ruas', LINHA), layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PALETA.tinta,
          'line-opacity': ['match', ['get', 'classe'], ['track', 'path'], 0.75, 0.95],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            11, ['match', ['get', 'classe'], ['primary', 'tertiary'], 1.4, 0.6],
            15, ['match', ['get', 'classe'], ['primary', 'tertiary'], 4, ['unclassified', 'residential'], 3, 1.6]],
          'line-dasharray': ['match', ['get', 'classe'], ['track', 'path'], ['literal', [2, 1.5]], ['literal', [1, 0]]],
        },
      },
      { id: 'predios', type: 'fill', source: 'base', filter: de('predios', POLI), minzoom: 13, paint: { 'fill-color': PALETA.predio, 'fill-opacity': 0.85, 'fill-outline-color': PALETA.madeira } },
      // contorno creme do traço da marca (DESIGN.md: a cor da marca sempre com contorno creme); camada extra do A
      {
        id: 'trilhas-contorno', type: 'line', source: 'trilhas', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PALETA.tinta, 'line-width': ['match', ['get', 'modo'], 'carro', 4, 7], 'line-opacity': ['match', ['get', 'modo'], 'carro', 0.5, 0.95] },
      },
      {
        id: 'trilhas-linhas', type: 'line', source: 'trilhas', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'modo'], 'carro', PALETA.madeira, corMarca],
          'line-width': ['match', ['get', 'modo'], 'carro', 2, 4],
          'line-dasharray': ['case', ['==', ['get', 'aproximado'], true], ['literal', [2, 1.5]], ['literal', [1, 0]]],
        },
      },
      {
        id: 'rota-gps', type: 'line', source: 'rota-gps', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'tipo'], 'trilha', PALETA.tinta, PALETA.madeira],
          'line-width': ['match', ['get', 'tipo'], 'trilha', 6, 3],
          'line-opacity': ['match', ['get', 'tipo'], 'trilha', 0.55, 0.95],
          'line-dasharray': ['match', ['get', 'tipo'], 'trilha', ['literal', [1, 0]], ['literal', [1.5, 1.5]]],
        },
      },
      {
        id: 'gravacao', type: 'line', source: 'gravacao', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PALETA.tinta, 'line-width': 5, 'line-opacity': 1 },
      },
      {
        id: 'pontos-marcados', type: 'circle', source: 'marcados',
        paint: {
          'circle-radius': 6, 'circle-color': PALETA.tinta,
          'circle-opacity': ['case', ['==', ['get', 'aproximado'], true], 0.35, 1],
          'circle-stroke-color': PALETA.madeira, 'circle-stroke-width': 2.5,
        },
      },
      {
        id: 'pontos-aproximados', type: 'circle', source: 'pontos', filter: ['==', ['get', '_estado'], 'aproximada'],
        paint: {
          'circle-radius': 6, 'circle-color': ['match', ['get', 'tipo'], ['cachoeira', 'poco'], PALETA.agua, PALETA.tinta],
          'circle-opacity': 0.45, 'circle-stroke-color': PALETA.madeira, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8,
        },
      },
      {
        id: 'pontos-confirmados', type: 'circle', source: 'pontos', filter: ['==', ['get', '_estado'], 'confirmada'],
        paint: {
          'circle-radius': ['match', ['get', 'tipo'], ['cachoeira', 'poco'], 8, 5],
          'circle-color': ['match', ['get', 'tipo'], ['cachoeira', 'poco'], PALETA.agua, PALETA.tinta],
          'circle-stroke-color': PALETA.madeira, 'circle-stroke-width': 3,
        },
      },
    ],
  };
}
