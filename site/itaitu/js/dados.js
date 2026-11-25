// dados.js · carrega e valida os dados do app (ARQUITETURA 6.1 e 7.4). Frontend A.
// Os arquivos de pontos e trilhas são do time de dados e mudam durante a construção:
// nada aqui supõe lista fixa. Feature inválida sai com console.info, nunca com erro na tela.

import { tempoMaisLentoMin } from './util.js';

const TIPOS = new Set(['cachoeira', 'poco', 'vila', 'praca', 'igreja', 'hospedagem', 'infra', 'pico', 'area', 'mirante', 'estacionamento', 'entrada-trilha']);
const CAMADAS_BASE = new Set(['ruas', 'rios', 'predios', 'parque', 'area']);
const ORDEM_ESTADO = { confirmada: 0, aproximada: 1, 'sem-coordenada': 2 };
const vazia = () => ({ type: 'FeatureCollection', features: [] });

async function lerJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.info('[dados] não carregou', url, r.status); return null; }
    return await r.json();
  } catch (e) {
    console.info('[dados] não carregou', url, e && e.message);
    return null;
  }
}

const numero = (v) => typeof v === 'number' && Number.isFinite(v);
function coordValida(c) { return Array.isArray(c) && c.length >= 2 && numero(c[0]) && numero(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90; }

// 6.1: _estado, _carro_min, _trilha_min, _hora_de_sol, _ordem
export function enriquecer(fc) {
  const ok = [];
  const ids = new Set();
  for (const f of (fc && Array.isArray(fc.features) ? fc.features : [])) {
    const p = f && f.properties;
    if (!p || typeof p.id !== 'string' || !p.id || typeof p.nome !== 'string' || ids.has(p.id)) { console.info('[dados] ponto ignorado (sem id/nome ou repetido)', p && p.id); continue; }
    let geometry = f.geometry ?? null;
    if (geometry && !(geometry.type === 'Point' && coordValida(geometry.coordinates))) { console.info('[dados] geometria inválida vira sem coordenada', p.id); geometry = null; }
    ids.add(p.id);
    const props = { ...p };
    if (!TIPOS.has(props.tipo)) console.info('[dados] tipo fora do contrato', p.id, props.tipo);
    props._estado = geometry == null ? 'sem-coordenada'
      : (['alta', 'media'].includes(props.confianca) && props.aproximado !== true ? 'confirmada' : 'aproximada');
    props._carro_min = tempoMaisLentoMin(props.carro_tempo);
    props._trilha_min = tempoMaisLentoMin(props.trilha_tempo);
    props._hora_de_sol = props._estado === 'confirmada' && (props.tipo === 'cachoeira' || props.tipo === 'poco');
    ok.push({ type: 'Feature', id: undefined, geometry, properties: props, _i: ok.length });
  }
  const placa = ok.filter((f) => f.properties.grupo === 'placa');
  const outros = ok.filter((f) => f.properties.grupo !== 'placa').sort((a, b) =>
    (ORDEM_ESTADO[a.properties._estado] - ORDEM_ESTADO[b.properties._estado]) ||
    a.properties.nome.localeCompare(b.properties.nome, 'pt-BR'));
  const ordenados = [...placa, ...outros];
  ordenados.forEach((f, i) => { f.properties._ordem = i; delete f._i; delete f.id; });
  return { type: 'FeatureCollection', features: ordenados };
}

function validarTrilhas(fc) {
  const ok = [];
  for (const f of (fc && Array.isArray(fc.features) ? fc.features : [])) {
    const g = f && f.geometry, p = f && f.properties;
    if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2 || !g.coordinates.every(coordValida) || !p || !p.id) {
      console.info('[dados] trilha ignorada', p && p.id);
      continue;
    }
    ok.push({ type: 'Feature', geometry: g, properties: { ...p, origem: 'arquivo' } });
  }
  return { type: 'FeatureCollection', features: ok };
}

function validarBase(fc) {
  const ok = [];
  let fora = 0;
  for (const f of (fc && Array.isArray(fc.features) ? fc.features : [])) {
    if (!f || !f.geometry || !f.properties) continue;
    if (!CAMADAS_BASE.has(f.properties.camada)) { fora++; continue; }
    ok.push(f);
  }
  if (fora) console.info(`[dados] base.geojson: ${fora} feature(s) com camada fora do contrato, ignoradas pelo estilo`);
  return { type: 'FeatureCollection', features: ok };
}

// Só para o MapLibre: sem geometria nula (6.1, contrato de dados).
export function comGeometria(fc) {
  return { type: 'FeatureCollection', features: fc.features.filter((f) => f.geometry) };
}

// marcos.html: sobrepõe pontos-local (IndexedDB) antes de enriquecer (6.1, último parágrafo).
async function sobreporLocais(fc) {
  try {
    const { listar } = await import('./banco.js');
    const locais = await listar('pontos-local');
    if (!locais.length) return fc;
    const porId = new Map(locais.filter((f) => f && f.properties && f.properties.id).map((f) => [f.properties.id, f]));
    const feats = fc.features.map((f) => porId.has(f.properties?.id) ? porId.get(f.properties.id) : f);
    for (const [id, f] of porId) if (!fc.features.some((x) => x.properties?.id === id)) feats.push(f);
    return { type: 'FeatureCollection', features: feats };
  } catch (e) {
    console.info('[dados] pontos-local indisponíveis', e && e.message);
    return fc;
  }
}

export async function carregarDados({ app = 'publico' } = {}) {
  const [pontosBrutos, trilhas, base, info] = await Promise.all([
    lerJSON('./dados/pontos.geojson'),
    lerJSON('./dados/trilhas.geojson'),
    lerJSON('./dados/base.geojson'),
    lerJSON('./dados/info.json'),
  ]);
  const fonte = app === 'marcos' ? await sobreporLocais(pontosBrutos || vazia()) : (pontosBrutos || vazia());
  return {
    pontos: enriquecer(fonte),
    trilhas: validarTrilhas(trilhas || vazia()),
    base: validarBase(base || vazia()),
    info: info && typeof info === 'object' ? info : {},
    falhou: !pontosBrutos,
  };
}

export function pontoPorId(dados, id) {
  return dados?.pontos?.features.find((f) => f.properties.id === id) || null;
}

// Trilha 'pe' de um destino (a primeira, na ordem do arquivo). Gravadas/GPX não entram aqui.
export function trilhaDoDestino(dados, id, modo = 'pe') {
  return dados?.trilhas?.features.find((f) => f.properties.destino_id === id && f.properties.modo === modo) || null;
}
