// mapa.js · cria o mapa MapLibre, os controles, os nomes (marcadores HTML) e o toque longo. Frontend A.
// ARQUITETURA 2.2 (toque longo) e 5 (fontes e camadas). Nada de texto desenhado pelo MapLibre.

import { T, t, nomeCurto } from './textos.js';
import { criarEstilo, EXAGERO, LUZ_RELEVO, ceuDe, luzInicial } from './estilo.js';
import { comGeometria } from './dados.js';
import { el, icone, formatarDecimal, formatarGMS, formatarDistancia, distanciaM } from './util.js';
import * as banco from './banco.js';

const ML = () => window.maplibregl;
let map = null;
let ctx = null;
const estado = { tresD: true, satelite: false, economia: false, ultimoZoomLugar: null };
let marcadoresLugar = [];
let lugaresNoMapa = false;
let marcadoresPonto = [];
let balao = null;
let focoAntesDoBalao = null;

export function obterMapa() { return map; }

export function criarMapa(contexto, { container, recorte, atribuicoes, economia, utcMs, corMarca }) {
  ctx = contexto;
  estado.economia = !!economia;
  estado.tresD = !economia;
  const estilo = criarEstilo({ recorte, atribuicoes, utcMs, economia, corMarca });
  const [o, s, l, n] = recorte.bbox;
  const folga = 0.06;
  map = new (ML().Map)({
    container,
    style: estilo,
    center: recorte.centro,
    zoom: recorte.zoom ?? 13,
    pitch: economia ? 0 : (recorte.pitch ?? 60),
    bearing: economia ? 0 : (recorte.bearing ?? 0),
    maxPitch: 75,
    minZoom: 10,
    maxZoom: 17.5,
    maxBounds: [[o - folga, s - folga], [l + folga, n + folga]],
    attributionControl: false,
    renderWorldCopies: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    locale: {
      'NavigationControl.ZoomIn': T.mapa.aproximar,
      'NavigationControl.ZoomOut': T.mapa.afastar,
      'NavigationControl.ResetBearing': T.mapa.norte_rotulo,
      'AttributionControl.ToggleAttribution': T.mapa.creditos,
      'AttributionControl.MapFeedback': T.mapa.creditos,
      'Popup.Close': T.mapa.fechar,
      'Map.Title': T.acessibilidade.mapa,
    },
  });
  map.addControl(new (ML().AttributionControl)({ compact: true }), 'bottom-left');
  // créditos recolhidos atrás do botão "i": aberta, a caixa cobria um quarto do mapa no celular (a atribuição segue a um toque e no painel Informações)
  const recolherCreditos = () => {
    const c = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    if (c) { c.classList.remove('maplibregl-compact-show'); c.removeAttribute('open'); }
  };
  map.once('load', recolherCreditos);
  setTimeout(recolherCreditos, 0);
  if (economia) { map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); }

  const canvas = map.getCanvas();
  canvas.setAttribute('aria-label', T.acessibilidade.mapa);
  canvas.setAttribute('role', 'region');

  map.on('zoom', atualizarZoomClasses);
  map.on('rotate', atualizarNorte);
  map.on('pitch', atualizarBotao3D);
  map.on('load', atualizarZoomClasses);
  ligarToqueLongo();
  ligarCliquesNasCamadas();
  document.addEventListener('itaitu:ponto-marcado', () => atualizarMarcados());
  document.addEventListener('itaitu:economia', (e) => aplicarEconomia(!!e.detail?.ligado));
  return map;
}

// ---------------------------------------------------------------- dados nas fontes
export function porDados(dados) {
  if (!map) return;
  map.getSource('base')?.setData(dados.base);
  map.getSource('pontos')?.setData(comGeometria(dados.pontos));
  atualizarTrilhas();
  atualizarMarcados();
  criarRotulosPontos(dados.pontos);
  criarRotulosLugares(dados.base);
}

export function corDaMarca(cor) {
  if (!map || !map.getLayer('trilhas-linhas')) return;
  map.setPaintProperty('trilhas-linhas', 'line-color', ['match', ['get', 'modo'], 'carro', '#3A2618', cor]);
}

// trilhas = arquivo + gravadas + GPX importadas (store 'trilhas')
export async function atualizarTrilhas() {
  if (!map) return;
  const doArquivo = ctx?.dados?.trilhas?.features || [];
  let locais = [];
  try {
    locais = (await banco.listar('trilhas')).filter((r) => !r.em_andamento && Array.isArray(r.pontos) && r.pontos.length > 1)
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: r.pontos.map((p) => [p.lon, p.lat]) },
        properties: { id: r.id, nome: r.nome, destino_id: r.destino_id || null, modo: 'pe', origem: r.origem, aproximado: false, km: r.km },
      }));
  } catch (e) { console.info('[mapa] trilhas locais indisponíveis', e && e.message); }
  map.getSource('trilhas')?.setData({ type: 'FeatureCollection', features: [...doArquivo, ...locais] });
}

export async function atualizarMarcados() {
  if (!map) return;
  try {
    const lista = await banco.listar('marcados');
    map.getSource('marcados')?.setData({ type: 'FeatureCollection', features: lista.filter((f) => f && f.geometry) });
  } catch (e) { console.info('[mapa] marcados indisponíveis', e && e.message); }
}

// ---------------------------------------------------------------- nomes no mapa (marcadores HTML)
function escolher(id) {
  ctx.emit('itaitu:destino-escolhido', { id, origem: 'mapa' });
}

function criarRotulosPontos(pontos) {
  for (const m of marcadoresPonto) m.remove();
  marcadoresPonto = [];
  for (const f of pontos.features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const agua = p.tipo === 'cachoeira' || p.tipo === 'poco';
    const curto = agua ? nomeCurto(p.id, p.nome) : p.nome;
    const b = el('button', {
      class: 'rotulo-ponto', type: 'button', 'data-estado': p._estado, 'data-agua': agua ? '1' : '0', 'data-ponto': p.id,
      'aria-label': p._estado === 'aproximada' ? `${p.nome}, ${T.destinos.aproximada}` : p.nome,
    }, el('span', { class: 'rotulo-ponto__nome' }, curto),
    p._estado === 'aproximada' ? el('span', { class: 'rotulo-ponto__aviso' }, T.destinos.aproximada) : null);
    b.addEventListener('click', (e) => { e.stopPropagation(); escolher(p.id); });
    const m = new (ML().Marker)({ element: b, anchor: 'top', offset: [0, 10] }).setLngLat(f.geometry.coordinates).addTo(map);
    marcadoresPonto.push(m);
  }
}

function criarRotulosLugares(base) {
  for (const m of marcadoresLugar) m.remove();
  marcadoresLugar = [];
  lugaresNoMapa = false;
  for (const f of base.features) {
    const p = f.properties;
    if (p.camada !== 'area' || p.tipo !== 'lugar' || !p.nome || f.geometry?.type !== 'Point') continue;
    const s = el('span', { class: 'rotulo-lugar', 'data-lugar': p.lugar || '', role: 'presentation', 'aria-hidden': 'true' }, p.nome);
    marcadoresLugar.push(new (ML().Marker)({ element: s, anchor: 'center' }).setLngLat(f.geometry.coordinates));
  }
  atualizarZoomClasses();
}

function atualizarZoomClasses() {
  if (!map) return;
  const z = map.getZoom();
  const c = map.getContainer();
  c.classList.toggle('mapa--perto', z >= 14);
  const querLugares = z >= 12.5;
  if (querLugares !== lugaresNoMapa) {
    lugaresNoMapa = querLugares;
    for (const m of marcadoresLugar) { if (querLugares) m.addTo(map); else m.remove(); }
  }
}

function ligarCliquesNasCamadas() {
  for (const camada of ['pontos-confirmados', 'pontos-aproximados']) {
    map.on('click', camada, (e) => { const id = e.features?.[0]?.properties?.id; if (id) escolher(id); });
    map.on('mouseenter', camada, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', camada, () => { map.getCanvas().style.cursor = ''; });
  }
}

// ---------------------------------------------------------------- controles
function botao(id) { return document.getElementById(id); }

function rotular(b, textoVisivel, rotulo) {
  if (!b) return;
  const s = b.querySelector('.controle__texto');
  if (s) s.textContent = textoVisivel;
  b.setAttribute('aria-label', rotulo || textoVisivel);
  b.title = rotulo || textoVisivel;
}

export function ligarControles() {
  botao('ctl-3d')?.addEventListener('click', () => definir3D(!estado.tresD));
  botao('ctl-camada')?.addEventListener('click', () => definirSatelite(!estado.satelite));
  botao('ctl-norte')?.addEventListener('click', () => {
    if (!map) return;
    const opc = { bearing: 0 };
    if (ctx.reduzMovimento()) map.jumpTo(opc); else map.easeTo({ ...opc, duration: 600 });
  });
  botao('ctl-centro')?.addEventListener('click', (e) => {
    if (!map) return;
    focoAntesDoBalao = e.currentTarget;
    abrirBalao(map.getCenter(), 'centro');
  });
  atualizarBotao3D();
  atualizarBotaoCamada();
}

export function definir3D(sim) {
  if (!map) return;
  if (sim && estado.economia) { ctx.avisar?.(T.economia.descricao); return; }
  estado.tresD = sim;
  if (sim) {
    map.setTerrain({ source: 'dem', exaggeration: EXAGERO });
    const alvo = { pitch: 60 };
    if (ctx.reduzMovimento()) map.jumpTo(alvo); else map.easeTo({ ...alvo, duration: 700 });
  } else {
    map.setTerrain(null);
    if (ctx.reduzMovimento() || estado.economia) map.jumpTo({ pitch: 0 }); else map.easeTo({ pitch: 0, duration: 500 });
  }
  atualizarBotao3D();
}

export function definirSatelite(sim) {
  if (!map || !map.getLayer('satelite')) return;
  estado.satelite = sim;
  map.setLayoutProperty('satelite', 'visibility', sim ? 'visible' : 'none');
  map.setLayoutProperty('relevo-cor', 'visibility', sim ? 'none' : 'visible');
  const luz = sim ? LUZ_RELEVO.satelite : LUZ_RELEVO.mapa;
  map.setPaintProperty('relevo-sombra', 'hillshade-exaggeration', luz.exagero);
  map.setPaintProperty('relevo-sombra', 'hillshade-highlight-color', luz.luz);
  map.setPaintProperty('relevo-sombra', 'hillshade-shadow-color', luz.escuro);
  atualizarBotaoCamada();
  if (sim) ctx.avisar?.(T.mapa.satelite_nota);
}

function atualizarBotao3D() {
  const b = botao('ctl-3d');
  if (!b || !map) return;
  // o botão diz o que vai acontecer ao tocar
  if (estado.tresD) rotular(b, T.mapa.modo_2d, T.mapa.modo_2d_rotulo);
  else rotular(b, T.mapa.modo_3d, T.mapa.modo_3d_rotulo);
  b.setAttribute('aria-pressed', estado.tresD ? 'true' : 'false');
  b.setAttribute('aria-disabled', estado.economia ? 'true' : 'false');
  const ic = b.querySelector('use');
  if (ic) ic.setAttribute('href', `./icones/ui.svg#${estado.tresD ? 'i-2d' : 'i-3d'}`);
}

function atualizarBotaoCamada() {
  const b = botao('ctl-camada');
  if (!b) return;
  if (estado.satelite) rotular(b, T.mapa.relevo, T.mapa.relevo_rotulo);
  else rotular(b, T.mapa.satelite, T.mapa.satelite_rotulo);
  b.setAttribute('aria-pressed', estado.satelite ? 'true' : 'false');
}

function atualizarNorte() {
  const b = botao('ctl-norte');
  if (!b || !map) return;
  const svg = b.querySelector('svg');
  if (svg) svg.style.transform = `rotate(${-map.getBearing()}deg)`;
}

function aplicarEconomia(ligado) {
  if (!map) return;
  estado.economia = ligado;
  if (ligado) {
    estado.tresD = false;
    map.setTerrain(null);
    map.jumpTo({ pitch: 0, bearing: 0 });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
  } else {
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
  }
  const luz = luzInicial(ctx.agora().getTime(), ctx.recorte.centro);
  try { map.setSky(ceuDe(luz.ceu, { economia: ligado })); } catch (_) {}
  atualizarBotao3D();
}

// Margens da parte visível do mapa (topo, rodapé e painel lateral). Não usa map.setPadding: as margens
// mudam a todo momento (painéis, faixa, régua) e o padding fica gravado na câmera para todo mundo
// (luz, sombra e etiquetas do B). Os voos usam 'offset' e o fitBounds usa 'padding' só naquela chamada.
let margens = { top: 0, bottom: 0, left: 0, right: 0 };
export function ajustarMargens(m) { margens = { ...margens, ...m }; }
export function margensVisiveis() { return { ...margens }; }
export function deslocamento() { return [Math.round((margens.left - margens.right) / 2), Math.round((margens.top - margens.bottom) / 2)]; }

// ---------------------------------------------------------------- toque longo e balão da coordenada
function travado() {
  return document.documentElement.dataset.trava === '1' || ctx.params.get('demo') === '1';
}

function ligarToqueLongo() {
  const cont = map.getCanvasContainer();
  const ativos = new Set();
  let timer = null, inicio = null;
  const cancelar = () => { clearTimeout(timer); timer = null; inicio = null; };
  cont.addEventListener('pointerdown', (e) => {
    ativos.add(e.pointerId);
    if (e.pointerType === 'mouse' || ativos.size > 1 || travado()) { cancelar(); return; }
    inicio = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!inicio) return;
      const r = cont.getBoundingClientRect();
      const ll = map.unproject([inicio.x - r.left, inicio.y - r.top]);
      cancelar();
      focoAntesDoBalao = null;
      abrirBalao(ll, 'toque');
    }, 550);
  });
  cont.addEventListener('pointermove', (e) => {
    if (!inicio) return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) >= 10) cancelar();
  });
  const fim = (e) => { ativos.delete(e.pointerId); cancelar(); };
  cont.addEventListener('pointerup', fim);
  cont.addEventListener('pointercancel', fim);
  map.on('movestart', (e) => { if (e.originalEvent) cancelar(); });
  map.on('contextmenu', (e) => {
    if (travado()) return;
    e.preventDefault?.();
    focoAntesDoBalao = null;
    abrirBalao(e.lngLat, 'toque');
  });
}

export async function abrirBalao(lngLat, origem = 'toque') {
  if (!map) return;
  const lon = lngLat.lng, lat = lngLat.lat;
  balao?.remove();
  const dec = formatarDecimal(lon, lat);
  const gms = formatarGMS(lon, lat);
  const decEl = el('p', { class: 'balao__decimal num', translate: 'no' }, dec);
  const altEl = el('p', { class: 'balao__extra', hidden: true });
  const distEl = el('p', { class: 'balao__extra', hidden: true });
  const fechar = el('button', { class: 'balao__fechar', type: 'button', 'aria-label': T.mapa.fechar }, icone('i-fechar'));
  const copiar = el('button', { class: 'botao botao--linha', type: 'button' }, T.mapa.toque_copiar);
  const marcar = el('button', { class: 'botao botao--linha', type: 'button' }, icone('i-ponto'), el('span', {}, T.mapa.marcar));
  const corpo = el('div', { class: 'balao', role: 'dialog', 'aria-label': origem === 'centro' ? T.mapa.coord_centro : dec },
    fechar,
    origem === 'centro' ? el('p', { class: 'balao__titulo' }, T.mapa.coord_centro) : null,
    decEl,
    el('p', { class: 'balao__gms num', translate: 'no' }, gms),
    altEl, distEl,
    el('div', { class: 'balao__acoes' }, copiar, marcar));

  balao = new (ML().Popup)({ closeButton: false, closeOnClick: true, maxWidth: '340px', className: 'balao-coord', focusAfterOpen: true, anchor: 'bottom' })
    .setLngLat([lon, lat]).setDOMContent(corpo).addTo(map);
  const meu = balao;
  meu.on('close', () => {
    if (balao === meu) balao = null;
    if (focoAntesDoBalao && document.contains(focoAntesDoBalao)) focoAntesDoBalao.focus();
  });
  fechar.addEventListener('click', () => meu.remove());
  corpo.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); meu.remove(); } });
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${dec} (${gms})`);
      ctx.avisar?.(T.mapa.copiada);
    } catch (_) {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(decEl);
      sel.removeAllRanges(); sel.addRange(r);
      ctx.avisar?.(T.mapa.copiar_manual);
    }
  });
  marcar.addEventListener('click', async () => {
    meu.remove();
    const g = await import('./gravador.js');
    g.marcarPonto({ lon, lat, alt: altEl.dataset.alt ? Number(altEl.dataset.alt) : null, precisao_m: null, origem: 'toque' });
  });

  ctx.emit('itaitu:toque-longo', { lon, lat, origem });

  // distância até o GPS, se ligado
  try {
    const gps = await import('./gps.js');
    const pos = gps.ultimaPosicao();
    if (pos) { distEl.textContent = t('mapa.distancia_voce', { dist: formatarDistancia(distanciaM([pos.lon, pos.lat], [lon, lat])) }); distEl.hidden = false; }
  } catch (_) {}
  // altitude do relevo (motor do B, ou a grade z12 lida aqui mesmo)
  try {
    const rota = await import('./rota.js');
    const [alt] = await rota.altitudesDoRelevo([[lon, lat]]);
    if (alt != null && balao === meu) { altEl.textContent = t('mapa.altitude', { m: Math.round(alt) }); altEl.dataset.alt = String(Math.round(alt)); altEl.hidden = false; }
  } catch (_) {}
}

// ---------------------------------------------------------------- câmera
export function irPara(lonLat, { zoom = 15, pitch } = {}) {
  if (!map) return;
  const alvo = { center: lonLat, zoom: Math.max(map.getZoom(), zoom), offset: deslocamento() };
  if (estado.tresD && pitch != null) alvo.pitch = pitch;
  if (ctx.reduzMovimento()) map.jumpTo(alvo);
  else map.flyTo({ ...alvo, duration: 2000, essential: false });
}

export function estadoMapa() { return { ...estado }; }
