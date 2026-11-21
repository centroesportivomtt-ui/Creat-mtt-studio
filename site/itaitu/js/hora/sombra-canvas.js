// hora/sombra-canvas.js · a sombra da serra no mapa e as etiquetas de hora (Pixel, frontend B).
// ARQUITETURA 4.3 e 5: CanvasSource 'sombra-serra' (animate: false) com os 4 cantos devolvidos pelo motor,
// camada raster 'sombra-serra-camada' abaixo de 'camada-vetorial-base'. Atualizar sem animação é desenhar no
// canvas e chamar play(); pause() (o pause do 5.24 sobe a textura). No dia correndo: play() no início, pause() no fim.
// Só recalcula quando a régua anda ou o relógio pede (5 min; 15 na economia); com a aba oculta, nada.
// Etiquetas: maplibregl.Marker de HTML com anchor 'bottom' (a ponta da plaquinha no poço).

import { T, t } from '../textos.js';
import { hhmm } from '../motor/nucleo.js';
import { el } from '../util.js';
import { luzNoMinuto } from './regras.js';

const FONTE = 'sombra-serra';
const CAMADA = 'sombra-serra-camada';
const ANCORA = 'camada-vetorial-base';
const PASSO_ECONOMIA = 15;

export async function criarSombra(H) {
  const map = H.map, motor = H.motor;
  if (!map || !motor) throw new Error('sem mapa ou motor');

  let canvas = null, c2d = null, cantos = null;
  let animado = false;
  let ultimo = null;                  // { minuto, data, escala }
  let pedido = 0;
  let ultimoRapido = false;
  const diaPronto = new Map();        // data -> Promise do dia pré-calculado

  const primeiroMin = H.economia() ? Math.floor(H.agoraMin() / PASSO_ECONOMIA) * PASSO_ECONOMIA : H.agoraMin();
  const r0 = await motor.sombra({ minuto: primeiroMin, data: H.hoje, escala: 1, comMascara: false });
  cantos = r0.cantos;
  canvas = document.createElement('canvas');
  canvas.width = r0.largura || r0.bitmap.width;
  canvas.height = r0.altura || r0.bitmap.height;
  c2d = canvas.getContext('2d');
  desenhar(r0.bitmap, true);
  r0.bitmap?.close?.();                // o 1º quadro já está no canvas: libera o ImageBitmap
  ultimo = { minuto: primeiroMin, data: H.hoje, escala: 1 };

  const fonteExiste = () => !!map.getSource(FONTE);
  function porNoMapa() {
    if (fonteExiste()) return;
    map.addSource(FONTE, { type: 'canvas', canvas, coordinates: cantos, animate: false });
    const antes = map.getLayer(ANCORA) ? ANCORA : undefined;
    map.addLayer({
      id: CAMADA, type: 'raster', source: FONTE,
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    }, antes);
    subirTextura();
  }
  porNoMapa();
  // troca de estilo (Satélite/Mapa não troca, mas um setStyle futuro tiraria a fonte): repõe
  map.on('styledata', () => { if (!fonteExiste()) { try { porNoMapa(); } catch (_) {} } });

  function subirTextura() {
    const s = map.getSource(FONTE);
    if (!s) return;
    if (typeof s.play !== 'function' || typeof s.pause !== 'function') {
      // a fonte ainda está carregando: sobe quando terminar
      map.once('sourcedata', () => subirTextura());
      return;
    }
    if (animado) { s.play(); return; }
    s.play(); s.pause();
  }

  function desenhar(bitmap, semSubir) {
    if (!bitmap || !c2d) return;
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.imageSmoothingEnabled = true;
    c2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (!semSubir) subirTextura();
  }

  // ---------------------------------------------------------------- sombra de um minuto
  // rapido: usa o quadro pré-calculado mais perto (dia correndo, arraste) e pede o exato em escala menor.
  function mostrar(minuto, data, { rapido = false } = {}) {
    if (document.hidden && !rapido) return;
    let m = Math.round(minuto);
    if (H.economia()) m = Math.floor(m / PASSO_ECONOMIA) * PASSO_ECONOMIA;
    const escala = rapido ? 0.5 : 1;
    if (ultimo && ultimo.minuto === m && ultimo.data === data && ultimo.escala >= escala) return;
    if (rapido) {
      const q = motor.quadroMaisProximo?.(m);
      if (q && q.bitmap && (q.data == null || q.data === data) && Math.abs(q.minuto - m) <= 10) {
        desenhar(q.bitmap);
        ultimo = { minuto: q.minuto, data, escala: 0.5 };
        if (animado) return;              // no dia correndo os quadros bastam
      }
    }
    const meu = ++pedido;
    ultimoRapido = rapido;
    motor.sombra({ minuto: m, data, escala, comMascara: false }).then((r) => {
      // resposta velha só desenha durante o arraste (mostra progresso); nunca por cima de um pedido exato
      if (meu !== pedido && !(rapido && ultimoRapido)) { r.bitmap?.close?.(); return; }
      desenhar(r.bitmap);
      r.bitmap?.close?.();
      ultimo = { minuto: m, data, escala };
    }).catch((e) => { if (e && e.name !== 'AbortError') console.info('[sombra]', e.message); });
  }

  // dia pré-calculado para a abertura e o demo (escala 0,5, de 10 em 10 min, do agora para frente)
  function preCalcularDia(data, deMin, ateMin) {
    const k = `${data}|${deMin}|${ateMin}`;
    if (!diaPronto.has(k)) {
      const p = motor.dia({ data, deMin, ateMin, passoMin: 10, escala: 0.5, primeiro: deMin })
        .catch((e) => { if (e && e.name !== 'AbortError') console.info('[sombra] dia', e.message); return null; });
      diaPronto.clear();
      diaPronto.set(k, p);
    }
    return diaPronto.get(k);
  }

  function modoAnimado(sim) {
    if (sim === animado) return;
    animado = sim;
    const s = map.getSource(FONTE);
    if (!s || typeof s.play !== 'function') return;
    if (sim) s.play(); else { s.play(); s.pause(); }
  }

  // ---------------------------------------------------------------- etiquetas de hora
  const etiquetas = new Map();        // id -> { marker, caixa, num }
  function renderizarEtiquetas() {
    const ML = window.maplibregl;
    if (!ML) return;
    const data = H.dataRegua;
    const vivos = new Set();
    for (const p of H.comHora()) {
      const e = H.exibDe(p, data);
      if (!p.coord || !e || e.apaga == null) continue;
      vivos.add(p.id);
      let et = etiquetas.get(p.id);
      if (!et) {
        const nome = el('span', { class: 'etiqueta-hora__nome' }, p.curto);
        const num = el('span', { class: 'etiqueta-hora__num' }, '');
        const selo = el('span', { class: 'etiqueta-hora__nome hora-etiqueta__amanha', hidden: true }, T.hora.amanha);
        const caixa = el('div', { class: 'etiqueta-hora', 'data-acesa': '0', 'data-luz': 'sol' }, nome, selo, num);
        const embrulho = el('div', { class: 'hora-etiqueta', role: 'img', 'data-ponto': p.id }, caixa);
        const marker = new ML.Marker({ element: embrulho, anchor: 'bottom', offset: [0, -8] }).setLngLat(p.coord).addTo(map);
        et = { marker, caixa, num, selo, embrulho };
        etiquetas.set(p.id, et);
      }
      // a etiqueta segue o dia da régua (o mesmo da sombra no mapa); depois de escurecer é amanhã, e diz isso
      et.num.textContent = hhmm(e.apaga);
      et.selo.hidden = data !== H.amanha;
      et.apaga = e.apaga;
      et.p = p;
    }
    for (const [id, et] of etiquetas) if (!vivos.has(id)) { et.marker.remove(); etiquetas.delete(id); }
    atualizarEtiquetas(H.minutoRegua, data);
  }

  function atualizarEtiquetas(minuto, data = H.dataRegua) {
    for (const [, et] of etiquetas) {
      const e = H.exibDe(et.p, data);
      const luz = e ? luzNoMinuto(minuto, e) : 'sombra';
      et.caixa.dataset.luz = luz === 'sol' ? 'sol' : 'sombra';
      // a palavra acompanha a cor: o nome acessível diz sol ou sombra (e "amanhã" quando a régua está em amanhã)
      const pre = data === H.amanha ? `${T.hora.amanha}, ` : '';
      et.embrulho.setAttribute('aria-label', pre + (luz === 'sol'
        ? t('regua.marca_sol', { nome: et.p.poco, hora: hhmm(et.apaga) })
        : t('regua.marca_sombra', { nome: et.p.poco, hora: hhmm(et.apaga) })));
    }
  }

  function acender(id) {
    const et = etiquetas.get(id);
    if (et && et.caixa.dataset.acesa !== '1') et.caixa.dataset.acesa = '1';
  }
  function acenderTodas() { for (const [id] of etiquetas) acender(id); }
  function apagarTodas() { for (const [, et] of etiquetas) et.caixa.dataset.acesa = '0'; }

  renderizarEtiquetas();
  // sem abertura (movimento reduzido, economia, amanhã) as horas já nascem acesas
  if (H.reduz() || H.economia() || H.amanhaGeral) acenderTodas();

  return {
    mostrar, preCalcularDia, modoAnimado,
    renderizarEtiquetas, atualizarEtiquetas, acender, acenderTodas, apagarTodas,
    get ultimo() { return ultimo; },
    canvas,
    textoSemMotor: T.hora.indisponivel,
  };
}
