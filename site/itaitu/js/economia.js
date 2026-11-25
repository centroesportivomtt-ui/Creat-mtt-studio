// economia.js · modo economia, contraste "sol" e texto grande. Frontend A.
// Economia = mapa 2D sem terreno, pixel 1x, sem céu, sem animação e sem som; o MapLibre já só desenha
// quando algo muda, e com a tela escondida ele para. As horas continuam na tela (são texto).
// Guarda a escolha em localStorage (itaitu:economia, itaitu:contraste, itaitu:texto) e emite itaitu:economia.

import { T } from './textos.js';
import { lerLocal, gravarLocal } from './util.js';

let ctx = null;
const raiz = () => document.documentElement;

export function economiaLigada() { return raiz().dataset.economia === '1'; }

// Lido antes do mapa nascer: o mapa já abre em 2D se a economia estava ligada.
export function aplicarPreferencias() {
  if (lerLocal('itaitu:economia') === '1') raiz().dataset.economia = '1';
  if (lerLocal('itaitu:contraste') === 'sol') raiz().dataset.contraste = 'sol';
  if (lerLocal('itaitu:texto') === 'grande') raiz().dataset.texto = 'grande';
}

export function montarEconomia(contexto) {
  ctx = contexto;
  ligarAlternador('alt-economia', economiaLigada, (sim) => definirEconomia(sim));
  ligarAlternador('alt-contraste', () => raiz().dataset.contraste === 'sol', (sim) => {
    if (sim) raiz().dataset.contraste = 'sol'; else delete raiz().dataset.contraste;
    gravarLocal('itaitu:contraste', sim ? 'sol' : null);
  });
  ligarAlternador('alt-texto', () => raiz().dataset.texto === 'grande', (sim) => {
    if (sim) raiz().dataset.texto = 'grande'; else delete raiz().dataset.texto;
    gravarLocal('itaitu:texto', sim ? 'grande' : null);
    ctx.layout?.();
  });
  sugerirPelaBateria();
}

function ligarAlternador(id, ler, escrever) {
  const b = document.getElementById(id);
  if (!b) return;
  const pintar = () => b.setAttribute('aria-pressed', ler() ? 'true' : 'false');
  b.addEventListener('click', () => { escrever(!ler()); pintar(); });
  document.addEventListener('itaitu:economia', pintar);
  pintar();
}

export function definirEconomia(sim) {
  if (sim) raiz().dataset.economia = '1'; else delete raiz().dataset.economia;
  gravarLocal('itaitu:economia', sim ? '1' : null);
  ctx?.emit('itaitu:economia', { ligado: !!sim });
  ctx?.avisar?.(sim ? T.economia.ligado : T.economia.desligado);
}

// Bateria baixa: sugere (nunca liga sozinho) o modo economia, uma vez.
async function sugerirPelaBateria() {
  try {
    if (!navigator.getBattery || economiaLigada()) return;
    const b = await navigator.getBattery();
    const checar = () => {
      if (!economiaLigada() && !b.charging && b.level <= 0.2 && !sugerirPelaBateria.feito) {
        sugerirPelaBateria.feito = true;
        ctx.avisar?.(`${T.economia.botao}: ${T.economia.descricao}`, { acao: { texto: T.economia.botao, fazer: () => definirEconomia(true) } });
      }
    };
    b.addEventListener('levelchange', checar);
    checar();
  } catch (_) {}
}
