// hora/horarios.js · nascer, pôr e escurecer do dia, e "faltam X min para escurecer" na gravação (Pixel, B).
// Calculado offline pelo nucleo.js (horizonte livre, crepúsculo civil), sem motor e sem internet.
// escurece e "volte com luz" não dependem do relevo: não levam a nota de ±.

import { T, t } from '../textos.js';
import { hhmm, arredondar5 } from '../motor/nucleo.js';
import { el } from '../util.js';
import { faltamParaEscurecer, limiarParaAvisar } from './regras.js';

const LIMIARES = [60, 30, 15];             // avisos na gravação (min antes de escurecer)

export function montarHorarios(H) {
  const alvo = document.getElementById('hora-horarios');
  const ctx = H.ctx;
  let gravando = false;
  let avisados = new Set();
  let escureceuAvisado = false;
  let timer = 0;

  const linha = el('p', { class: 'hora-horarios__linha' });
  const amanha = el('p', { class: 'aviso-honesto hora-horarios__amanha', hidden: true }, T.hora.amanha_aviso);
  const alerta = el('p', { class: 'hora-horarios__alerta', role: 'status', hidden: true });
  const nublado = el('p', { class: 'nota hora-horarios__nublado' });
  const como = el('details', { class: 'hora-horarios__como' },
    el('summary', {}, t('hora.como_titulo', {}, 'Como a hora é calculada')),
    el('p', {}, T.hora.como_relevo),
    el('p', {}, T.hora.como_saia),
    el('p', {}, T.hora.como_volte),
    el('p', {}, T.hora.como_arredonda),
    el('p', {}, T.hora.como_incerteza));
  const indisponivel = el('p', { class: 'aviso-honesto', hidden: true }, T.hora.indisponivel);
  if (alvo) alvo.replaceChildren(el('div', { class: 'hora-horarios' }, linha, amanha, alerta, indisponivel, nublado, como));

  function renderizar() {
    if (!alvo) return;
    const d = H.dia(H.hoje);
    const nascer = arredondar5(d.nascerMin, 'cima');
    const por = arredondar5(d.porMin, 'baixo');
    const esc = d.max;
    linha.replaceChildren(
      el('span', {}, `${T.hora.nascer} `, el('b', { class: 'num' }, hhmm(nascer))), ' · ',
      el('span', {}, `${T.hora.por} `, el('b', { class: 'num' }, hhmm(por))), ' · ',
      el('span', {}, `${T.hora.escurece} `, el('b', { class: 'num' }, hhmm(esc))));
    nublado.textContent = t('hora.nublado_com_hora', { escurece: hhmm(esc) });
    amanha.hidden = !H.amanhaGeral;
    indisponivel.hidden = !H.motorFalhou;
    tique(H.agoraMin());
  }

  // a cada minuto (o relógio do index.js chama) e a cada 30 s durante a gravação
  function tique(agora = H.agoraMin()) {
    if (!gravando) { alerta.hidden = true; return; }
    const esc = H.dia(H.hoje).max;
    const faltam = faltamParaEscurecer(agora, esc);
    if (faltam == null) {
      alerta.hidden = false;
      alerta.textContent = T.hora.escureceu;
      if (!escureceuAvisado) { escureceuAvisado = true; ctx.avisar?.(T.hora.escureceu); H.anunciar(T.hora.escureceu, { ja: true }); }
      return;
    }
    const texto = faltam <= 60 ? `${t('hora.faltam_escurecer', { min: faltam })} ${T.hora.volte_agora}` : t('hora.faltam_escurecer', { min: faltam });
    alerta.hidden = faltam > 120;
    alerta.textContent = texto;
    // um aviso só, o do menor limiar alcançado; os maiores ficam marcados junto (regras.limiarParaAvisar)
    const l = limiarParaAvisar(faltam, avisados, LIMIARES);
    if (l != null) {
      for (const k of LIMIARES) if (k >= l) avisados.add(k);
      ctx.avisar?.(texto);
      H.anunciar(texto, { ja: true });
    }
  }

  document.addEventListener('itaitu:gravacao', (e) => {
    const estado = e.detail?.estado;
    const antes = gravando;
    gravando = estado === 'gravando' || estado === 'pausada';
    clearInterval(timer);
    if (gravando) {
      if (!antes) { avisados = new Set(); escureceuAvisado = false; }
      timer = setInterval(() => tique(), 30000);
      tique();
    } else alerta.hidden = true;
  });

  return { renderizar, tique, get gravando() { return gravando; } };
}
