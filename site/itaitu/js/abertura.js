// abertura.js · os 5 primeiros segundos da Hora da Serra. Órbita (motion-3d), Creat Nuvem, 20/11/2026.
// ARQUITETURA 9.1. O mapa nunca espera o show: tudo roda num laço de requestAnimationFrame por cima de
// um mapa que já está operável; nenhum setTimeout de cenografia segura a interação.
//
//   0,0–0,5 s  mapa parado na luz do minuto (marca no topo, régua com o sol em agora)
//   0,5–3,0 s  o resto do dia passa (setMinuto de agora até minutoFim, curva do dia);
//              cada etiqueta acende quando a sombra chega ao lugar; câmera quase parada (deriva de 1,5°)
//   3,0–3,3 s  o dia volta para agora (curva de saída); as etiquetas ficam
//   3,0 s      mostrarFaixa() ("saia até")
//   4,0–5,0 s  o polegar arrasta o sol até depois da hora em que a serra apaga o sol do alvo:
//              o marcador passa de dourado a azul; tocarSom('araponga') na passagem
//   5,0–5,3 s  o dia volta para agora
//
// Portões: uma vez por abertura da página e não repete antes de 30 min (localStorage 'itaitu:abertura');
// pula em movimento reduzido, economia, amanhã (a serra já tirou o sol do vale) ou depois de escurecer.
// Mede os 20 primeiros quadros do dia correndo: média abaixo de 30 fps cancela e resolve { parado: true };
// com aparelho muito lento a decisão sai antes do 20º quadro (orçamento de 667 ms).
// Qualquer pointerdown, keydown, wheel ou touchstart interrompe: volta a agora, acende todas as
// etiquetas, mostra a faixa e resolve { interrompido: true }.

const CHAVE = 'itaitu:abertura';
const JANELA_MS = 30 * 60 * 1000;
const QUADROS_MEDIDOS = 20;
const LIMITE_MS_QUADRO = 1000 / 30;
const TETO_ARRASTE_MS = 1500;   // espera máxima pelo arrastarSolDemo do B depois do fim da coreografia

let tocando = false;
let jaTocouNestaPagina = false;

export function aberturaTocando() { return tocando; }

// ---------------------------------------------------------------- curvas (as mesmas dos tokens.css)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (sx(t) - x) / d; }
    return sy(Math.max(0, Math.min(1, t)));
  };
}
const curvaDia = bezier(0.45, 0, 0.55, 1);      // --curva-dia
const curvaSaida = bezier(0.2, 0.8, 0.2, 1);    // --curva-saida

// durações vêm dos tokens (uma fonte de verdade); fora do navegador ou sem token, o padrão do contrato
function token(nome, padrao) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const n = parseFloat(v);
    if (!v || !Number.isFinite(n) || n <= 0) return padrao;
    return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
  } catch (_) { return padrao; }
}

// ---------------------------------------------------------------- portões
function lerUltima() { try { return Number(localStorage.getItem(CHAVE)) || 0; } catch (_) { return 0; } }
function gravarUltima() { try { localStorage.setItem(CHAVE, String(Date.now())); } catch (_) {} }

function prefereReduzido() {
  try { if (window.Itaitu?.reduzMovimento) return !!window.Itaitu.reduzMovimento(); } catch (_) {}
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function economia() {
  try { if (window.Itaitu?.economia) return !!window.Itaitu.economia(); } catch (_) {}
  return document.documentElement.dataset.economia === '1';
}
function forcado(opcoes) {
  if (opcoes.forcar) return true;
  try { return new URLSearchParams(location.search).get('abertura') === '1'; } catch (_) { return false; }
}

function motivoParaPular(o) {
  if (economia()) return 'economia';
  if (prefereReduzido()) return 'movimento-reduzido';
  if (o.amanha) return 'amanha';
  if (!(Number.isFinite(o.minutoAgora) && Number.isFinite(o.minutoFim)) || o.minutoFim <= o.minutoAgora) return 'sem-dia';
  if (forcado(o)) return null;
  if (jaTocouNestaPagina) return 'ja-tocou';
  if (Date.now() - lerUltima() < JANELA_MS) return 'recente';
  if (document.hidden) return 'aba-oculta';
  return null;
}

// ---------------------------------------------------------------- tocarAbertura
// opcoes = {
//   minutoAgora, minutoFim,                      // fim = escurece exibido
//   etiquetas: [{ pontoId, minuto }],             // minuto = hora em que a serra apaga o sol do ponto
//   alvo?: { id, minuto },                        // marcador do arraste; padrão: 1ª etiqueta ainda com sol
//   setMinuto(m), acenderEtiqueta(pontoId, minuto), mostrarFaixa(),
//   arrastarSolDemo?(deMin, paraMin, marcadorId) -> Promise   // o B anima régua e polegar fantasma
//   tocarSom?(nome),                              // o B só toca se o áudio já foi liberado por um toque
//   amanha?, forcar?, deriva? (padrão true), map?
// }
// -> Promise<{ concluida, interrompida, pulada, parado, interrompido, motivo?, fps? }>
export function tocarAbertura(opcoes = {}) {
  const o = { etiquetas: [], deriva: true, ...opcoes };
  const chamar = (nome, ...args) => { try { return o[nome]?.(...args); } catch (e) { console.info(`[abertura] ${nome} falhou`, e && e.message); return undefined; } };
  const etiquetas = (o.etiquetas || []).filter((e) => e && e.pontoId != null && Number.isFinite(e.minuto));
  const acesas = new Set();
  const acender = (e) => { if (acesas.has(e.pontoId)) return; acesas.add(e.pontoId); chamar('acenderEtiqueta', e.pontoId, e.minuto); };
  let ultimoMin = null;
  const setMin = (m) => { const r = Math.round(m); if (r === ultimoMin) return; ultimoMin = r; chamar('setMinuto', r); };
  let faixa = false;
  const mostrarFaixa = () => { if (faixa) return; faixa = true; chamar('mostrarFaixa'); };
  const estadoFinal = () => { setMin(o.minutoAgora); for (const e of etiquetas) acender(e); mostrarFaixa(); };

  const resultado = (extra) => ({ concluida: false, interrompida: false, pulada: false, parado: false, interrompido: false, ...extra });

  const motivo = motivoParaPular(o);
  if (motivo) {
    // tudo aparece parado: horas e frase na tela, sem o dia correr
    for (const e of etiquetas) acender(e);
    mostrarFaixa();
    return Promise.resolve(resultado({ pulada: true, motivo }));
  }

  jaTocouNestaPagina = true;
  gravarUltima();
  tocando = true;

  const T_ESPERA = 500;
  const T_DIA = token('--dur-dia', 2500);
  const T_VOLTA = token('--dur-volta', 300);
  const T_POLEGAR = token('--dur-polegar', 1000);
  const T0_DIA = T_ESPERA, T1_DIA = T0_DIA + T_DIA;               // 0,5 → 3,0 s
  const T1_VOLTA = T1_DIA + T_VOLTA;                                 // 3,3 s
  const T0_ARRASTE = T1_DIA + 1000;                                  // 4,0 s
  const T1_ARRASTE = T0_ARRASTE + T_POLEGAR;                         // 5,0 s
  const T1_FIM = T1_ARRASTE + T_VOLTA;                               // 5,3 s

  const agora = o.minutoAgora, fimDia = o.minutoFim;
  const alvo = o.alvo && Number.isFinite(o.alvo.minuto) ? { pontoId: o.alvo.id ?? o.alvo.pontoId, minuto: o.alvo.minuto }
    : etiquetas.find((e) => e.minuto > agora) || null;
  const paraArraste = alvo ? Math.min(alvo.minuto + 10, fimDia) : null;
  // no keyframe do polegar (regua.css): 0–15% aperta, 15–85% arrasta com a curva do dia, 85–100% solta
  const minutoNoArraste = (f) => {
    if (f <= 0.15) return agora;
    if (f >= 0.85) return paraArraste;
    return agora + (paraArraste - agora) * curvaDia((f - 0.15) / 0.7);
  };
  // instante (fração do arraste) em que o sol cruza o apaga do alvo, para o som cair na passagem
  const fracPassagem = (() => {
    if (!alvo) return null;
    for (let f = 0.15; f <= 0.85; f += 0.005) if (minutoNoArraste(f) >= alvo.minuto) return f;
    return 0.85;
  })();

  // começa: as que já perderam o sol antes de agora nascem acesas
  for (const e of etiquetas) if (e.minuto <= agora) acender(e);
  setMin(agora);

  const map = o.map || window.Itaitu?.map || null;

  return new Promise((resolver) => {
    let raf = 0;
    let t0 = 0;
    let feito = false;
    const quadros = [];
    let ultimoT = 0;
    let fps = null;
    let fase = 'espera';
    let arrasteExterno = null;      // Promise do B
    let somTocado = false;
    let derivaFeita = false;

    const ev = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    const aoTocar = () => terminar('interrompido');
    const aoOcultar = () => { if (document.hidden) terminar('interrompido'); };
    const aoEconomia = (e) => { if (e.detail?.ligado) terminar('interrompido'); };
    for (const n of ev) window.addEventListener(n, aoTocar, { capture: true, passive: true });
    document.addEventListener('visibilitychange', aoOcultar);
    document.addEventListener('itaitu:economia', aoEconomia);

    function limpar() {
      cancelAnimationFrame(raf);
      for (const n of ev) window.removeEventListener(n, aoTocar, { capture: true });
      document.removeEventListener('visibilitychange', aoOcultar);
      document.removeEventListener('itaitu:economia', aoEconomia);
      tocando = false;
    }

    function terminar(como) {
      if (feito) return;
      feito = true;
      limpar();
      estadoFinal();
      if (como === 'concluida') resolver(resultado({ concluida: true, fps }));
      else if (como === 'parado') resolver(resultado({ parado: true, motivo: 'fps', fps }));
      else resolver(resultado({ interrompida: true, interrompido: true, fase, fps }));
    }

    function quadro(t) {
      if (feito) return;
      if (!t0) t0 = t;
      const dt = t - t0;

      // Portão de 30 fps: mede os 20 primeiros quadros do dia correndo (na espera o mapa está parado e
      // desenha de graça; o custo aparece quando a luz e a sombra começam a mudar). O intervalo que entra
      // no dia conta, então um aparelho que pula a fase do dia num quadro só também é pego.
      // Se a soma passa do orçamento de 20 quadros a 30 fps (667 ms) antes do 20º, a média não tem como
      // ficar acima de 30 fps: cai no modo parado na hora, sem o dia correr aos trancos.
      if (ultimoT && dt >= T0_DIA && quadros.length < QUADROS_MEDIDOS) {
        quadros.push(t - ultimoT);
        const soma = quadros.reduce((s, x) => s + x, 0);
        if (quadros.length === QUADROS_MEDIDOS || soma > QUADROS_MEDIDOS * LIMITE_MS_QUADRO) {
          fps = Math.round(quadros.length / soma * 10000) / 10;
          if (soma / quadros.length > LIMITE_MS_QUADRO) { terminar('parado'); return; }
          quadros.length = QUADROS_MEDIDOS;   // medição encerrada
        }
      }
      ultimoT = t;
      if (dt >= T1_DIA) for (const e of etiquetas) acender(e);   // quadro lento pode pular a fase da volta
      if (dt < T0_DIA) {
        fase = 'espera';
      } else if (dt < T1_DIA) {
        fase = 'dia';
        if (!derivaFeita && o.deriva && map) {
          derivaFeita = true;
          // câmera quase parada: 1,5° de deriva no rumo, só para dizer que a cena está viva
          try { map.easeTo({ bearing: map.getBearing() + 1.5, duration: T_DIA, easing: curvaDia, essential: true }); } catch (_) {}
        }
        const f = curvaDia((dt - T0_DIA) / T_DIA);
        const m = agora + (fimDia - agora) * f;
        setMin(m);
        for (const e of etiquetas) if (e.minuto <= m) acender(e);
      } else if (dt < T1_VOLTA) {
        fase = 'volta';
        mostrarFaixa();
        const f = curvaSaida((dt - T1_DIA) / T_VOLTA);
        setMin(fimDia + (agora - fimDia) * f);
      } else if (dt < T0_ARRASTE) {
        fase = 'faixa';
        setMin(agora);
        mostrarFaixa();
        if (!alvo) { terminar('concluida'); return; }        // sem alvo: termina em 4 s
      } else if (dt < T1_ARRASTE) {
        fase = 'arraste';
        const f = (dt - T0_ARRASTE) / T_POLEGAR;
        if (typeof o.arrastarSolDemo === 'function') {
          if (!arrasteExterno) arrasteExterno = Promise.resolve(chamar('arrastarSolDemo', agora, paraArraste, alvo.pontoId)).catch(() => {});
        } else {
          setMin(minutoNoArraste(f));
        }
        if (!somTocado && f >= fracPassagem) { somTocado = true; chamar('tocarSom', 'araponga'); }
      } else if (dt < T1_FIM) {
        fase = 'volta-final';
        if (!somTocado) { somTocado = true; chamar('tocarSom', 'araponga'); }
        if (!arrasteExterno) {
          const f = curvaSaida((dt - T1_ARRASTE) / T_VOLTA);
          setMin(paraArraste + (agora - paraArraste) * f);
        }
      } else {
        if (arrasteExterno) {
          // o B ainda pode estar terminando o polegar: espera ele, depois volta para agora
          const p = arrasteExterno;
          arrasteExterno = null;
          fase = 'espera-arraste';
          limparToqueSemTerminar();
          // teto de 1,5 s: se a Promise do B nunca resolver (animationend de elemento escondido), a abertura fecha mesmo assim
          Promise.race([p, new Promise((ok) => setTimeout(ok, TETO_ARRASTE_MS))]).then(() => terminar('concluida'));
          return;
        }
        terminar('concluida');
        return;
      }
      raf = requestAnimationFrame(quadro);
    }

    // depois que o B anima o arraste, a abertura só espera; o toque continua interrompendo via terminar()
    function limparToqueSemTerminar() { cancelAnimationFrame(raf); }

    raf = requestAnimationFrame(quadro);
  });
}

// para teste e para o botão "ver de novo" (se um dia existir): esquece a última abertura
export function esquecerAbertura() {
  jaTocouNestaPagina = false;
  try { localStorage.removeItem(CHAVE); } catch (_) {}
}
