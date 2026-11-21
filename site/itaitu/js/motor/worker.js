// worker.js · o motor da Hora da Serra fora do fio principal (Prisma, Creat Nuvem)
// Módulo de Worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }).
// Também exporta criarProcessador(): o cliente usa a mesma lógica no fio principal quando não há Worker.
//
// Página -> worker  { id, tipo, ...args }
//   init         { urlBase, recorte?, corSombra? }          carrega os tiles z12 de recorte.dem, monta a grade
//   horas        { pontos:[{id, lon, lat, sol_ajuste_min?}], data }
//   sombra       { minuto, data, escala = 1, comMascara = true }
//   dia          { data, deMin, ateMin, passoMin = 10, escala = 0.5 }   quadros progressivos
//   relevoCartao { trilha:[[lon,lat]...], minuto, data, largura = 1080, altura = 1920 }
//   altitudes    { coordenadas:[[lon,lat]...] }
//   cancelar     { alvo }                                    cancela o pedido de id = alvo
// Worker -> página  { id, ok: true, resultado } | { id, ok: false, erro, codigo? }
//   quadro do dia  { id, parcial: true, quadro: { minuto, bitmap | rgba, largura, altura } }
//   aviso          { tipo: 'aviso', codigo: 'sem-offscreencanvas', texto }
//   pedido de tile { tipo: 'pedirTiles', pedido, z, lista:[[x,y]...] }  (só quando o worker não decodifica PNG)
// Bitmaps e buffers vão sempre como transferíveis.

import * as N from './nucleo.js';
import { mascaraDeSombra, COR_SOMBRA } from './sombra.js';
import { planejarRecorte, relevoDoCartao, tileDeOutraGrade } from './relevo-cartao.js';

// recorte de Itaitu (ARQUITETURA 7.0); o recorte passado no init manda
export const RECORTE_PADRAO = Object.freeze({
  versao: 1, nome: 'Itaitu', bbox: [-40.60, -11.42, -40.40, -11.26], centro: [-40.4950, -11.3400],
  fuso_min: -180, tiles_z: [8, 14], dem: { z: 12, x0: 1586, x1: 1588, y0: 2176, y1: 2178 },
});

const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const ceder = () => new Promise((r) => setTimeout(r, 0));     // deixa chegar um "cancelar" entre quadros
const tem = (nome) => typeof globalThis[nome] !== 'undefined';

// ---------------------------------------------------------------- decodificadores de PNG Terrarium
// 1) createImageBitmap + OffscreenCanvas, sem gestão de cor (valor do pixel é altitude, não cor)
async function decodificarOffscreen(resp) {
  const bmp = await createImageBitmap(await resp.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  return cx.getImageData(0, 0, cv.width, cv.height).data;
}
// 2) PNG lido à mão + DecompressionStream (sem canvas nenhum)
async function inflarStream(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function decodificarStream(resp) {
  const info = N.lerPNG(new Uint8Array(await resp.arrayBuffer()));
  return N.desfiltrarPNG(info, await inflarStream(info.zlib));
}
export function decodificadorDisponivel() {
  if (tem('OffscreenCanvas') && tem('createImageBitmap')) return 'offscreen';
  if (tem('DecompressionStream')) return 'stream';
  return null;
}

// ---------------------------------------------------------------- processador (o mesmo no worker e no fio principal)
// opcoes.obterRgba(url, z, x, y) -> Promise<Uint8ClampedArray | null>  substitui o decodificador interno
export function criarProcessador(opcoes = {}) {
  let grade = null, recorte = RECORTE_PADRAO, urlBase = '', cor = COR_SOMBRA;
  const perfis = new Map();                 // horizonte por ponto (lon,lat)
  const detalhe = new Map();                // tiles z14 já decodificados: 'z/x/y' -> Float32Array
  const cancelados = new Set();
  let modo = null;

  async function lerTile(z, x, y) {
    const url = `${urlBase}tiles/dem/${z}/${x}/${y}.png`;
    if (opcoes.obterRgba) return opcoes.obterRgba(url, z, x, y);
    const resp = await fetch(url);
    if (!resp.ok) return null;                                  // fora do recorte: 404 limpo
    return modo === 'offscreen' ? decodificarOffscreen(resp) : decodificarStream(resp);
  }

  async function init(msg, enviar) {
    urlBase = msg.urlBase || new URL('../../', import.meta.url).href;
    if (!urlBase.endsWith('/')) urlBase += '/';
    if (msg.corSombra) cor = msg.corSombra;
    // quem abre o motor passa o recorte (dados/recorte.json); sem ele vale o de Itaitu.
    // Não buscamos o arquivo aqui: um 404 viraria erro de console na abertura.
    recorte = msg.recorte && msg.recorte.dem && msg.recorte.centro ? msg.recorte : RECORTE_PADRAO;
    if (!opcoes.obterRgba) {
      modo = decodificadorDisponivel();
      if (modo !== 'offscreen') enviar({ tipo: 'aviso', codigo: 'sem-offscreencanvas', texto: modo ? 'decodificando o relevo sem OffscreenCanvas' : 'o worker não decodifica PNG: o cliente decodifica' });
      if (!modo) { const e = new Error('worker sem decodificador de PNG'); e.codigo = 'decodificar-no-cliente'; throw e; }
    } else modo = 'cliente';
    const { z, x0, x1, y0, y1 } = recorte.dem;
    const pedidos = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) pedidos.push(lerTile(z, x, y).then((rgba) => rgba && { x, y, rgba }));
    const tiles = (await Promise.all(pedidos)).filter(Boolean);
    if (tiles.length !== pedidos.length) throw new Error(`relevo incompleto: ${tiles.length}/${pedidos.length} tiles`);
    grade = N.gradeDeTiles(z, tiles);
    perfis.clear(); detalhe.clear();
    return { modo, w: grade.w, h: grade.h, z: grade.z, cantos: N.cantosDaGrade(grade), centro: recorte.centro, bbox: recorte.bbox };
  }

  function exigirGrade() { if (!grade) { const e = new Error('motor sem init'); e.codigo = 'sem-init'; throw e; } }
  const dataOu = (d) => d || N.dataLocal(Date.now(), recorte.fuso_min ?? N.FUSO_MIN);
  const solNoCentro = (data, minuto) => N.posicaoDoSol(N.utcDe(data, minuto, recorte.fuso_min ?? N.FUSO_MIN), recorte.centro[1], recorte.centro[0]);

  function horas(msg) {
    exigirGrade();
    const data = dataOu(msg.data), t0 = agora(), pontos = {};
    for (const p of msg.pontos || []) {
      if (!p || !Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
      const chave = p.lon.toFixed(7) + ',' + p.lat.toFixed(7);
      let perfil = perfis.get(chave);
      if (perfil === undefined) { perfil = N.horizonte(grade, p.lon, p.lat); perfis.set(chave, perfil); }
      const h = N.horasDeSol(grade, p, data, { perfil });
      delete h.horizonte;
      pontos[p.id ?? chave] = h;
    }
    return { data, pontos, ms: Math.round(agora() - t0) };
  }

  async function quadroDeSombra(data, minuto, escala, comMascara) {
    const t0 = agora();
    const sol = solNoCentro(data, minuto);
    const m = mascaraDeSombra(grade, sol, escala, cor, { latRef: recorte.centro[1] });
    const ms = agora() - t0;
    const q = { minuto, data, escala: m.escala, largura: m.largura, altura: m.altura, sol: { elevacao: sol.elevacao, azimute: sol.azimute }, ms: +ms.toFixed(2) };
    const transfer = [];
    if (tem('createImageBitmap') && tem('ImageData')) {
      q.bitmap = await createImageBitmap(new ImageData(m.rgba, m.largura, m.altura), { premultiplyAlpha: 'default' });
      transfer.push(q.bitmap);
    } else { q.rgba = m.rgba; transfer.push(m.rgba.buffer); }
    if (comMascara) { q.mascara = m.mascara.slice(); transfer.push(q.mascara.buffer); }
    return { q, transfer };
  }

  async function sombra(msg) {
    exigirGrade();
    const { q, transfer } = await quadroDeSombra(dataOu(msg.data), msg.minuto, msg.escala ?? 1, msg.comMascara !== false);
    q.cantos = N.cantosDaGrade(grade);
    return { resultado: q, transfer };
  }

  async function dia(msg, enviar) {
    exigirGrade();
    const data = dataOu(msg.data), passo = Math.max(1, msg.passoMin ?? 10), escala = msg.escala ?? 0.5;
    let de = msg.deMin, ate = msg.ateMin;
    if (de == null || ate == null) { const np = N.nascerEPor(data, recorte.centro[1], recorte.centro[0]); de = de ?? np.nascerMin; ate = ate ?? np.escureceBrutoMin; }
    const minutos = [];
    for (let m = de; m <= ate; m += passo) minutos.push(m);
    if (minutos[minutos.length - 1] !== ate) minutos.push(ate);
    // ordem de entrega: do minuto pedido (msg.primeiro, ex. agora) para frente, depois o que ficou para trás
    if (msg.primeiro != null) { const k = minutos.findIndex((m) => m >= msg.primeiro); if (k > 0) minutos.push(...minutos.splice(0, k)); }
    let feitos = 0, msTotal = 0;
    for (const m of minutos) {
      if (cancelados.has(msg.id)) { const e = new Error('cancelado'); e.codigo = 'cancelado'; throw e; }
      const { q, transfer } = await quadroDeSombra(data, m, escala, !!msg.comMascara);
      msTotal += q.ms; feitos++;
      enviar({ id: msg.id, ok: true, parcial: true, quadro: q }, transfer);
      await ceder();
    }
    return { resultado: { data, cantos: N.cantosDaGrade(grade), total: feitos, passoMin: passo, escala, msMedio: +(msTotal / Math.max(1, feitos)).toFixed(2) } };
  }

  async function tileDetalhe(z, x, y) {
    const k = `${z}/${x}/${y}`;
    if (detalhe.has(k)) return detalhe.get(k);
    let dados = null;
    try { const rgba = await lerTile(z, x, y); if (rgba) dados = N.decodificarTerrarium(rgba); } catch (_) { dados = null; }
    if (!dados) dados = tileDeOutraGrade(grade, z, x, y);       // falta o z14: completa com o z12
    if (detalhe.size > 64) detalhe.delete(detalhe.keys().next().value);
    detalhe.set(k, dados);
    return dados;
  }

  async function relevoCartao(msg) {
    exigirGrade();
    const trilha = (msg.trilha || []).filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (trilha.length < 2) throw new Error('trilha com menos de 2 pontos');
    const largura = msg.largura ?? 1080, altura = msg.altura ?? 1920, data = dataOu(msg.data), t0 = agora();
    const zMax = Math.min(14, (recorte.tiles_z && recorte.tiles_z[1]) || 14);
    let plano = null;
    for (let z = zMax; z >= recorte.dem.z; z--) {                // trilha longa: desce o zoom até caber em 36 tiles
      plano = planejarRecorte(z, trilha, largura, altura, { minuto: msg.minuto, caixa: msg.caixa });
      const t = plano.tiles;
      if ((t.x1 - t.x0 + 3) * (t.y1 - t.y0 + 3) <= 36) break;
    }
    const t = plano.tiles, pedidos = [];
    for (let x = t.x0 - 1; x <= t.x1 + 1; x++) for (let y = t.y0 - 1; y <= t.y1 + 1; y++) pedidos.push(tileDetalhe(plano.z, x, y).then((dados) => ({ x, y, dados })));
    const gd = N.gradeDeTiles(plano.z, await Promise.all(pedidos));
    const meio = trilha[Math.floor(trilha.length / 2)];
    const sol = N.posicaoDoSol(N.utcDe(data, msg.minuto, recorte.fuso_min ?? N.FUSO_MIN), meio[1], meio[0]);
    const r = relevoDoCartao(gd, grade, trilha, sol, largura, altura, { plano });
    return {
      resultado: { rgba: r.rgba, largura, altura, tracadoPx: r.tracadoPx, bbox: r.bbox, semente: r.semente, metrosPorPx: r.metrosPorPx, caixa: r.caixa, z: plano.z, sol: { elevacao: sol.elevacao, azimute: sol.azimute }, ms: Math.round(agora() - t0) },
      transfer: [r.rgba.buffer],
    };
  }

  function altitudes(msg) {
    exigirGrade();
    return { alt: (msg.coordenadas || []).map((c) => (Array.isArray(c) ? N.amostrar(grade, c[0], c[1]) : null)) };
  }

  // trata uma mensagem; enviar(resposta, transfer)
  async function tratar(msg, enviar) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.tipo === 'cancelar') { cancelados.add(msg.alvo); return; }
    const { id, tipo } = msg;
    try {
      if (cancelados.has(id)) { const e = new Error('cancelado'); e.codigo = 'cancelado'; throw e; }
      let saida;
      if (tipo === 'init') saida = { resultado: await init(msg, enviar) };
      else if (tipo === 'horas') saida = { resultado: horas(msg) };
      else if (tipo === 'sombra') saida = await sombra(msg);
      else if (tipo === 'dia') saida = await dia(msg, enviar);
      else if (tipo === 'relevoCartao') saida = await relevoCartao(msg);
      else if (tipo === 'altitudes') saida = { resultado: altitudes(msg) };
      else throw new Error('tipo desconhecido: ' + tipo);
      enviar({ id, ok: true, resultado: saida.resultado }, saida.transfer || []);
    } catch (e) {
      enviar({ id, ok: false, erro: String(e && e.message || e), codigo: e && e.codigo });
    } finally { cancelados.delete(id); }
  }
  return { tratar, get grade() { return grade; } };
}

// ---------------------------------------------------------------- ligação quando roda como Worker
const ehWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (ehWorker) {
  // Sem decodificador próprio, o worker pede os tiles ao cliente (que decodifica no fio principal).
  let pedidoN = 0;
  const esperando = new Map();
  const obterDoCliente = (url, z, x, y) => new Promise((resolve) => {
    const pedido = ++pedidoN;
    esperando.set(pedido, resolve);
    self.postMessage({ tipo: 'pedirTiles', pedido, z, lista: [[x, y]], url });
  });
  const proprio = decodificadorDisponivel();
  const proc = criarProcessador(proprio ? {} : { obterRgba: obterDoCliente });
  if (!proprio) self.postMessage({ tipo: 'aviso', codigo: 'sem-offscreencanvas', texto: 'o worker não decodifica PNG: o cliente decodifica os tiles' });
  const enviar = (m, transfer = []) => self.postMessage(m, transfer);
  self.onmessage = (ev) => {
    const m = ev.data;
    if (m && m.tipo === 'tiles') {                                // resposta do cliente a um pedirTiles
      const r = esperando.get(m.pedido); esperando.delete(m.pedido);
      if (r) r(m.tiles && m.tiles[0] ? m.tiles[0].rgba : null);
      return;
    }
    proc.tratar(m, enviar);
  };
}
