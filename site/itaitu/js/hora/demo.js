// hora/demo.js · demonstração de 60 s com ?demo=1 (Pixel, frontend B). ARQUITETURA 9.5.
//   fase 1   0–8 s   o resto do dia passa sobre o vale (o mesmo motor da abertura)
//   fase 2   8–30 s  voo ao Véu e às Arapongas, com a janela de sol de cada uma na régua
//   fase 3  30–45 s  uma trilha simulada se desenha (1ª trilha 'pe' do 1º confirmado) e o relógio corre
//   fase 4  45–60 s  o cartão sai com a luz daquele minuto e a marca de ?m=
// Funciona com ?agora= e à noite (usa amanhã). Movimento reduzido: passos parados, voos viram saltos.
// Não grava nada no IndexedDB. #hora-demo-controle tem "Pausar" e "Sair da demonstração".

import { T, t, textoDaCasa } from '../textos.js';
import { hhmm, utcDe } from '../motor/nucleo.js';
import { el } from '../util.js';
import { valorDaRegua } from './regras.js';

const FASES = [8000, 22000, 15000, 15000];
const FONTE_TRILHA = 'hora-demo-trilha';

const curva = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function rodarDemo(ctx, H) {
  const caixa = document.getElementById('hora-demo-controle');
  const map = H.map;
  H.emDemo = true;
  document.documentElement.dataset.demo = '1';

  let voos = null;
  const carregarVoos = () => (voos ||= import('../voos.js').catch(() => null));

  // ---------------------------------------------------------------- painel de controle
  const legenda = el('p', { class: 'hora-demo__legenda' }, T.demo.fase1);
  const barra = el('span', { class: 'hora-demo__progresso', 'aria-hidden': 'true' });
  const pausar = el('button', { class: 'botao botao--linha hora-demo__botao', type: 'button' }, T.demo.pausar);
  const sair = el('button', { class: 'botao botao--marca hora-demo__botao', type: 'button' }, T.demo.sair);
  if (caixa) {
    caixa.hidden = false;
    caixa.replaceChildren(el('div', { class: 'hora-demo', role: 'region', 'aria-label': T.demo.selo },
      el('div', { class: 'hora-demo__topo' }, el('span', { class: 'hora-demo__selo' }, T.demo.selo), el('span', { class: 'hora-demo__trilho', 'aria-hidden': 'true' }, barra)),
      legenda,
      el('div', { class: 'hora-demo__botoes' }, pausar, sair)));
  }
  const dizer = (texto) => { legenda.textContent = texto; H.anunciar(texto, { ja: true }); };

  // ---------------------------------------------------------------- dia da demonstração
  const dHoje = H.dia(H.hoje);
  const agora = H.agoraMin();
  const usarAmanha = H.amanhaGeral || agora > dHoje.max - 60;
  const data = usarAmanha ? H.amanha : H.hoje;
  const dDia = H.dia(data);
  const ini = usarAmanha ? valorDaRegua(13 * 60, dDia.nascerMin, dDia.escureceBrutoMin) : valorDaRegua(agora, dDia.nascerMin, dDia.escureceBrutoMin);
  const fim = dDia.max;
  const exibDe = (p) => H.exibDe(p, data);
  const alvos = H.comHora().filter((p) => exibDe(p)?.apaga != null).slice(0, 2);
  const principal = alvos[0] || null;
  const pDia = H.sombra ? H.sombra.preCalcularDia(data, Math.min(ini, principal ? exibDe(principal).apaga - 60 : ini), fim) : Promise.resolve();

  // ---------------------------------------------------------------- controle do tempo (pausar e continuar)
  let fase = 0, tok = { parado: false }, inicioFase = 0, pausado = false, encerrado = false;
  const esperar = (ms, k) => new Promise((ok) => { const t0 = performance.now(); const f = () => { if (k.parado || performance.now() - t0 >= ms) ok(); else setTimeout(f, 50); }; f(); });
  const ateFimDaFase = (k, folga = 0) => esperar(Math.max(0, FASES[fase] - folga - (performance.now() - inicioFase)), k);
  // a câmera nunca passa do tempo da fase: aparelho lento corta o voo no prazo (o relógio da demo manda)
  const noPrazo = async (promessa, k, m, folga = 0) => {
    let acabou = false;
    await Promise.race([Promise.resolve(promessa).catch(() => null).then(() => { acabou = true; }), ateFimDaFase(k, folga)]);
    if (!acabou) m?.pararVoos?.();
  };
  let progresso = 0;
  const pintarProgresso = () => {
    const feito = FASES.slice(0, fase).reduce((a, b) => a + b, 0) + Math.min(FASES[fase] || 0, performance.now() - inicioFase);
    barra.style.setProperty('--feito', `${Math.min(100, (feito / 60000) * 100).toFixed(1)}%`);
    if (!encerrado && !pausado) progresso = requestAnimationFrame(pintarProgresso);
  };

  const ir = (m, rapido = true) => H.irPara(m, { data, origem: 'demo', rapido });
  // varre a régua de a até b em ms (o sol anda, a sombra corre junto)
  const varrer = (a, b, ms, k) => new Promise((ok) => {
    if (H.reduz()) { ir(b, false); ok(); return; }
    H.sombra?.modoAnimado(true);
    const t0 = performance.now();
    const passo = (tt) => {
      if (k.parado) { ok(); return; }
      const f = Math.min(1, (tt - t0) / ms);
      ir(a + (b - a) * curva(f));
      if (f < 1) requestAnimationFrame(passo); else { H.sombra?.modoAnimado(false); ok(); }
    };
    requestAnimationFrame(passo);
  });

  // ---------------------------------------------------------------- fases
  async function fase1(k) {
    dizer(T.demo.fase1);
    H.sombra?.apagarTodas();
    await Promise.race([pDia, esperar(1500, k)]);
    if (k.parado) return;
    if (H.reduz()) { ir(principal ? exibDe(principal).apaga : ini, false); H.sombra?.acenderTodas(); if (principal) H.focar(principal.id); H.tabuas?.mostrarFaixa(); return ateFimDaFase(k); }
    const etiquetas = alvos.map((p) => ({ id: p.id, m: exibDe(p).apaga }));
    const acesas = new Set();
    H.sombra?.modoAnimado(true);
    await new Promise((ok) => {
      const t0 = performance.now();
      const ida = 5200, volta = 900;
      const passo = (tt) => {
        if (k.parado) { ok(); return; }
        const dt = tt - t0;
        let m;
        if (dt < ida) m = ini + (fim - ini) * curva(dt / ida);
        else m = fim + (ini - fim) * curva(Math.min(1, (dt - ida) / volta));
        ir(m);
        for (const e of etiquetas) if (!acesas.has(e.id) && m >= e.m) { acesas.add(e.id); H.sombra?.acender(e.id); }
        if (dt < ida + volta) requestAnimationFrame(passo); else ok();
      };
      requestAnimationFrame(passo);
    });
    H.sombra?.modoAnimado(false);
    H.sombra?.acenderTodas();
    if (principal) H.focar(principal.id);
    H.tabuas?.mostrarFaixa();
    ir(ini, false);
    return ateFimDaFase(k);
  }

  async function fase2(k) {
    const m = await carregarVoos();
    if (!m || !alvos.length) return ateFimDaFase(k);
    const ids = alvos.map((p) => p.id);
    const chegou = (id) => {
      const p = H.porId.get(id);
      const e = p && exibDe(p);
      if (!e) return;
      H.focar(id);
      dizer(t('demo.fase2', { nome: p.poco, hora: hhmm(e.apaga) }));
      // a janela de sol do poço: o sol anda pela régua até a serra apagá-lo
      varrer(Math.max(dDia.min, e.apaga - 70), Math.min(fim, e.apaga + 10), 3200, k);
    };
    await noPrazo(m.voarPresentacao(ids, { pausaMs: 4600, subidaMs: 2000, vooMs: 2800, pousoMs: 2400, aoChegar: chegou }), k, m);
    return ateFimDaFase(k);
  }

  let trilhaDemo = null;
  async function fase3(k) {
    const m = await carregarVoos();
    const tr = principal && (ctx.dados?.trilhas?.features || []).find((f) => f.properties?.destino_id === principal.id && f.properties?.modo === 'pe');
    if (!m || !tr) return ateFimDaFase(k);
    trilhaDemo = tr;
    H.focar(principal.id);
    dizer(T.demo.fase3);
    const cs = tr.geometry.coordinates.map((c) => [c[0], c[1]]);
    const apaga = exibDe(principal).apaga;
    const chegada = apaga - 15;
    const caminhada = Math.max(15, principal.props._trilha_min || 30);
    porTrilha([cs[0]]);
    let ultimoRelogio = 0;
    await noPrazo(m.seguirTrilhaSimulada(cs, {
      duracaoMs: 13000,
      aoQuadro: ({ i, frac, lonLat }) => {
        if (k.parado) return;
        porTrilha([...cs.slice(0, i + 1), lonLat]);
        const tt = performance.now();
        if (tt - ultimoRelogio > 120 || frac >= 1) { ultimoRelogio = tt; ir(chegada - caminhada + caminhada * frac, frac < 1); }
      },
    }), k, m, 1200);
    if (k.parado) return;
    porTrilha(cs);
    ir(chegada, false);
    return ateFimDaFase(k);
  }

  async function fase4(k) {
    dizer(textoDaCasa('demo.fase4', ctx.marca));
    if (principal && H.cartao) {
      const apaga = exibDe(principal).apaga;
      const cs = trilhaDemo ? trilhaDemo.geometry.coordinates.map((c) => [c[0], c[1]]) : (principal.coord ? [principal.coord, [principal.coord[0] + 0.002, principal.coord[1] + 0.002]] : []);
      const props = trilhaDemo?.properties || {};
      await H.cartao.gerar({
        trilha: cs, destinoId: principal.id, chegadaMs: utcDe(data, apaga - 15), marca: ctx.marca,
        km: Number.isFinite(props.km) ? props.km : undefined,
        desnivel_m: Number.isFinite(props.desnivel_m) ? props.desnivel_m : undefined,
        duracao_s: (principal.props._trilha_min || 30) * 60,
      });
    }
    return ateFimDaFase(k);
  }

  // traçado da trilha simulada (fonte e camada só da demonstração; saem no fim)
  function porTrilha(coords) {
    if (!map) return;
    const dados = { type: 'FeatureCollection', features: coords.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] };
    const s = map.getSource(FONTE_TRILHA);
    if (s) { s.setData(dados); return; }
    const cor = getComputedStyle(document.documentElement).getPropertyValue('--cor-marca').trim() || '#C9283E';
    map.addSource(FONTE_TRILHA, { type: 'geojson', data: dados });
    map.addLayer({ id: `${FONTE_TRILHA}-contorno`, type: 'line', source: FONTE_TRILHA, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFF4DC', 'line-width': 9 } });
    map.addLayer({ id: FONTE_TRILHA, type: 'line', source: FONTE_TRILHA, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': cor, 'line-width': 5 } });
  }
  function tirarTrilha() {
    if (!map) return;
    for (const id of [FONTE_TRILHA, `${FONTE_TRILHA}-contorno`]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(FONTE_TRILHA)) map.removeSource(FONTE_TRILHA);
  }

  const PASSOS = [fase1, fase2, fase3, fase4];

  async function rodarDe(n) {
    const k = { parado: false };
    tok = k;
    pausado = false;
    pausar.textContent = T.demo.pausar;
    cancelAnimationFrame(progresso);
    progresso = requestAnimationFrame(pintarProgresso);
    for (fase = n; fase < PASSOS.length; fase++) {
      inicioFase = performance.now();
      try { await PASSOS[fase](k); } catch (e) { console.info('[demo] fase', fase + 1, e && e.message); }
      if (k.parado) return;
    }
    terminar();
  }

  function terminar() {
    encerrado = true;
    cancelAnimationFrame(progresso);
    barra.style.setProperty('--feito', '100%');
    H.cartao?.fechar();
    tirarTrilha();
    H.sombra?.modoAnimado(false);
    H.emDemo = false;
    H.voltarAgora();
    dizer(T.demo.fim);
    pausar.textContent = t('demo.de_novo', {}, 'Ver de novo');
  }

  async function parar() {
    tok.parado = true;
    pausado = true;
    cancelAnimationFrame(progresso);
    H.regua?.pararPolegar?.();
    (await carregarVoos())?.pararVoos?.();
    H.sombra?.modoAnimado(false);
  }

  pausar.addEventListener('click', async () => {
    if (encerrado) { encerrado = false; H.emDemo = true; H.cartao?.fechar(); rodarDe(0); return; }
    if (!pausado) { await parar(); pausar.textContent = T.demo.continuar; H.emDemo = false; dizer(T.demo.pausar); return; }
    H.emDemo = true;
    rodarDe(fase);
  });
  sair.addEventListener('click', async () => {
    await parar();
    encerrado = true;
    H.cartao?.fechar();
    tirarTrilha();
    H.emDemo = false;
    const u = new URL(location.href);
    u.searchParams.delete('demo');
    location.replace(u.href);
  });

  return rodarDe(0);
}
