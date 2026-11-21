// hora/regua.js · régua do dia (Pixel, frontend B). ARQUITETURA 6.4, DESIGN 6.
// Um <input type="range"> nativo: o polegar arrasta, o teclado anda (setas 5 min, PageUp/PageDown 1 h,
// Home/End nascer/escurecer) e o leitor de tela lê aria-valuetext ("16:05, a sombra da serra cobre o
// Véu da Noiva"). Cada mudança emite itaitu:hora e é anunciada em #hora-live: a sombra nunca é só visual.

import { T, t, comArtigo } from '../textos.js';
import { hhmm } from '../motor/nucleo.js';
import { el } from '../util.js';
import { posicaoNaRegua, luzNoMinuto, valorDaRegua } from './regras.js';

const curvaDia = (() => {             // --curva-dia: cubic-bezier(.45, 0, .55, 1)
  const x1 = 0.45, y1 = 0, x2 = 0.55, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 6; i++) { const d = (3 * ax * s + 2 * bx) * s + cx; if (Math.abs(d) < 1e-6) break; s -= (((ax * s + bx) * s + cx) * s - x) / d; }
    return ((ay * s + by) * s + cy) * s;
  };
})();

function duracaoToken(nome, padrao) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const n = parseFloat(v);
    if (!v || !Number.isFinite(n) || n <= 0) return padrao;
    return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
  } catch (_) { return padrao; }
}

export function montarRegua(H) {
  const raiz = document.getElementById('hora-regua');
  if (!raiz) return null;

  const hora = el('output', { class: 'regua__hora', 'aria-hidden': 'true' }, '');
  const legenda = el('span', { class: 'regua__legenda', 'aria-hidden': 'true' }, '');
  const controle = el('input', {
    class: 'regua__controle', type: 'range', id: 'hora-regua-controle', step: '5',
    'aria-label': T.regua.controle, 'aria-describedby': 'hora-regua-dica',
  });
  const trilho = el('div', { class: 'regua__trilho', 'aria-hidden': 'true' });
  const janela = el('span', { class: 'regua__janela' });
  const solAgora = el('span', { class: 'regua__sol' });
  const marcas = el('span', { class: 'hora-regua__marcas' });
  const eventosTrilho = el('span', { class: 'hora-regua__eventos' });
  trilho.append(janela, eventosTrilho, marcas, solAgora);
  const polegar = el('span', { class: 'polegar-fantasma', 'aria-hidden': 'true' });
  const nascer = el('span', {}, '');
  const fimDia = el('span', {}, '');
  const agoraBtn = el('button', { class: 'hora-regua__agora', type: 'button', hidden: true }, T.regua.agora);
  const eventos = el('div', { class: 'regua__eventos' }, nascer, agoraBtn, fimDia);
  const dica = el('p', { id: 'hora-regua-dica', class: 'sr-only' }, T.regua.dica);
  const caixa = el('div', { class: 'regua', role: 'group', 'aria-label': T.regua.rotulo },
    hora, legenda, controle, trilho, polegar, eventos, dica);
  raiz.replaceChildren(caixa);

  let lim = { min: 310, max: 1090 };
  let ultimoAnunciado = null;
  let ultimaHoraCheia = null;
  let arrastando = false;
  let travadoPelaDemo = false;

  const pos = (m) => `${posicaoNaRegua(m, lim.min, lim.max).toFixed(2)}%`;

  function renderizar() {
    const data = H.dataRegua;
    const d = H.dia(data);
    lim = { min: d.min, max: d.max };
    controle.min = String(lim.min);
    controle.max = String(lim.max);
    trilho.style.setProperty('--por', pos(d.porMin));
    // eventos do dia: nascer, pôr, escurece (riscos e texto)
    eventosTrilho.replaceChildren(
      el('span', { class: 'regua__evento', 'data-evento': 'por', style: `--pos:${pos(d.porMin)}` }),
      el('span', { class: 'regua__evento', 'data-evento': 'escurece', style: `--pos:${pos(lim.max)}` }));
    const amanha = data === H.amanha;
    nascer.textContent = `${amanha ? `${T.hora.amanha} · ` : ''}${t('regua.evento_nascer', { hora: hhmm(lim.min) })}`;
    fimDia.textContent = `${t('regua.evento_por', { hora: hhmm(Math.floor(d.porMin / 5) * 5) })} · ${t('regua.evento_escurece', { hora: hhmm(lim.max) })}`;
    // agora (risco fino): só quando a régua mostra hoje e o agora cabe nela
    const agora = H.agoraMin();
    const mostraAgora = data === H.hoje && agora >= lim.min && agora <= lim.max;
    solAgora.hidden = !mostraAgora;
    if (mostraAgora) solAgora.style.setProperty('--pos', pos(agora));
    // marcas dos poços: a hora em que a serra apaga o sol de cada um
    const lista = H.comHora().map((p) => ({ p, e: H.exibDe(p, data) })).filter((x) => x.e && x.e.apaga != null && x.e.apaga >= lim.min && x.e.apaga <= lim.max);
    marcas.replaceChildren(...lista.map(({ p, e }) => el('span', { class: 'regua__marca', 'data-ponto': p.id, 'data-luz': 'sol', style: `--pos:${pos(e.apaga)}` })));
    // janela de sol do destino da faixa
    const alvo = H.destinoDaFaixa();
    const ea = alvo && H.exibDe(alvo, data);
    if (ea && ea.apaga != null) {
      const ini = Math.max(lim.min, ea.nasce ?? lim.min);
      janela.hidden = false;
      janela.style.setProperty('--ini', pos(ini));
      janela.style.setProperty('--fim', pos(Math.min(ea.apaga, lim.max)));
    } else janela.hidden = true;
    agoraBtn.hidden = !H.deslocada;
    mostrar(H.minutoRegua ?? lim.min, data, { silencioso: true });
  }

  // põe a régua num minuto (sem emitir nada: quem chama emite)
  function mostrar(minuto, data = H.dataRegua, { silencioso = false } = {}) {
    if (data !== H.dataRegua) return;
    const v = Math.max(lim.min, Math.min(lim.max, Math.round(minuto)));
    controle.value = String(valorDaRegua(v, H.dia(data).nascerMin, H.dia(data).escureceBrutoMin));
    const exibido = Number(controle.value);
    hora.textContent = hhmm(exibido);
    const texto = H.textoDaRegua(exibido, data);
    controle.setAttribute('aria-valuetext', texto);
    // legenda e marcas: sol ou sombra no minuto mostrado (a cor nunca vem sozinha: a legenda diz a palavra)
    const alvo = H.destinoDaFaixa();
    const ea = alvo && H.exibDe(alvo, data);
    const luz = ea ? luzNoMinuto(v, ea) : null;
    if (alvo && luz) {
      legenda.dataset.luz = luz === 'sol' ? 'sol' : 'sombra';
      legenda.textContent = luz === 'sol' ? t('hora.aria_sol', { lista: comArtigo('no', alvo.poco) })
        : luz === 'noite' ? T.hora.aria_noite
          : luz === 'sem-sol' ? T.hora.sem_sol
            : t('hora.aria_sombra', { lista: comArtigo('o', alvo.poco) });
    } else { legenda.textContent = ''; delete legenda.dataset.luz; }
    for (const m of marcas.children) {
      const p = H.porId.get(m.dataset.ponto);
      const e = p && H.exibDe(p, data);
      m.dataset.luz = e && luzNoMinuto(v, e) === 'sol' ? 'sol' : 'sombra';
    }
    if (!silencioso) agoraBtn.hidden = !H.deslocada;
  }
  // ---------------------------------------------------------------- entrada do usuário
  function aoMudar(origem = 'regua') {
    if (travadoPelaDemo) return;
    const v = Number(controle.value);
    H.deslocada = true;
    // tic ao cruzar uma hora cheia
    const hc = Math.floor(v / 60);
    if (ultimaHoraCheia != null && hc !== ultimaHoraCheia) H.tic(hc * 60);
    ultimaHoraCheia = hc;
    // tóin quando o sol do destino passa do apaga (dourado vira azul), com pan pela posição do marcador
    const alvo = H.destinoDaFaixa();
    const ea = alvo && H.exibDe(alvo, H.dataRegua);
    if (ea && ea.apaga != null && ultimoAnunciado != null) {
      const antes = ultimoAnunciado < ea.apaga, agora = v < ea.apaga;
      if (antes !== agora) {
        const p = posicaoNaRegua(ea.apaga, lim.min, lim.max) / 50 - 1;
        H.tocarSom('araponga', { pan: Math.max(-1, Math.min(1, p)) * 0.6 });
      }
    }
    ultimoAnunciado = v;
    H.irPara(v, { data: H.dataRegua, origem, rapido: arrastando });
    H.anunciar(H.textoLive(v, H.dataRegua));
  }
  controle.addEventListener('input', () => aoMudar('regua'));
  controle.addEventListener('change', () => { arrastando = false; caixa.dataset.arrastando = '0'; H.sombra?.mostrar(Number(controle.value), H.dataRegua, {}); });
  controle.addEventListener('pointerdown', () => { if (polegar.dataset.ativo === '1') pararPolegar(); arrastando = true; caixa.dataset.arrastando = '1'; ultimoAnunciado = Number(controle.value); ultimaHoraCheia = Math.floor(Number(controle.value) / 60); });
  const soltar = () => { if (!arrastando) return; arrastando = false; caixa.dataset.arrastando = '0'; H.sombra?.mostrar(Number(controle.value), H.dataRegua, {}); };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  controle.addEventListener('focus', () => { ultimoAnunciado = Number(controle.value); ultimaHoraCheia = Math.floor(Number(controle.value) / 60); });
  // PageUp/PageDown = 1 h (o navegador andaria 10% da régua); Home/End nativos já vão ao nascer e ao escurecer
  controle.addEventListener('keydown', (e) => {
    if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
    e.preventDefault();
    const v = Number(controle.value) + (e.key === 'PageUp' ? 60 : -60);
    controle.value = String(Math.max(lim.min, Math.min(lim.max, v)));
    aoMudar('regua');
  });
  agoraBtn.addEventListener('click', () => { H.voltarAgora(); controle.focus(); H.anunciar(H.textoLive(Number(controle.value), H.dataRegua), { ja: true }); });

  // ---------------------------------------------------------------- polegar fantasma (abertura e demo)
  // de -> para em --dur-polegar: 0–15% aperta, 15–85% arrasta com a curva do dia, 85–100% solta
  function arrastarSolDemo(de, para, marcadorId) {
    if (H.reduz()) { H.irPara(para, { data: H.hoje, origem: 'abertura' }); return Promise.resolve(); }
    const dur = duracaoToken('--dur-polegar', 1000);
    polegar.style.setProperty('--de', pos(de));
    polegar.style.setProperty('--para', pos(para));
    polegar.dataset.ativo = '0';
    void polegar.offsetWidth;            // reinicia a animação do CSS
    polegar.dataset.ativo = '1';
    caixa.dataset.arrastando = '1';
    return new Promise((ok) => {
      const t0 = performance.now();
      const passo = (agora) => {
        // parado por fora (pararPolegar: toque na abertura, saída da demo): não escreve mais na régua
        if (polegar.dataset.ativo !== '1') { ok({ marcadorId, parado: true }); return; }   // pararPolegar já soltou a caixa
        const f = Math.min(1, (agora - t0) / dur);
        const m = f <= 0.15 ? de : f >= 0.85 ? para : de + (para - de) * curvaDia((f - 0.15) / 0.7);
        H.irPara(m, { data: H.hoje, origem: 'abertura', rapido: true });
        if (f < 1) requestAnimationFrame(passo);
        else { polegar.dataset.ativo = '0'; caixa.dataset.arrastando = '0'; ok({ marcadorId }); }
      };
      requestAnimationFrame(passo);
    });
  }
  function pararPolegar() { polegar.dataset.ativo = '0'; caixa.dataset.arrastando = '0'; }

  return {
    renderizar, mostrar, arrastarSolDemo, pararPolegar,
    elemento: caixa, controle,
    travar(sim) { travadoPelaDemo = !!sim; },
  };
}
