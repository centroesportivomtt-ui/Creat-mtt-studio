// cliente.js · API de Promises do motor da Hora da Serra no fio principal (Prisma, Creat Nuvem)
//
//   const motor = await abrirMotor({ urlBase, recorte, corSombra })      // ARQUITETURA 4.3
//   // ou o atalho de instância única: await Motor.iniciar({...}); Motor.horas(...)
//   motor.horas({ pontos:[{id, lon, lat, sol_ajuste_min?}], data })  -> { data, pontos:{[id]: Horas}, ms }
//   motor.sombra({ minuto, data, escala = 1 })                        -> { minuto, bitmap, cantos, mascara, largura, altura, ms }
//   motor.dia({ data, deMin, ateMin, passoMin = 10, escala = 0.5, primeiro?, aoQuadro? })
//                                                                     -> { cantos, quadros:[{minuto, bitmap}], msMedio }
//   motor.relevoCartao({ trilha, minuto, data, largura = 1080, altura = 1920 })
//                                                                     -> { imagem: ImageData, tracadoPx, bbox, semente, ms }
//   motor.altitudes({ coordenadas })                                  -> { alt: (number|null)[] }
//   motor.quadroMaisProximo(minuto)   quadro pré-calculado do dia mais perto do minuto (para arrastar a régua)
//   motor.encerrar()
//
// Cancelamento: um sombra() novo substitui o que ainda esperava a vez (a promessa antiga rejeita com
// AbortError); um dia() novo cancela o anterior. Todos aceitam { signal } (AbortController).
// Sem Worker (ou sem módulo em Worker), o mesmo processador roda no fio principal.

const BASE_PADRAO = new URL('../../', import.meta.url).href;      // site/itaitu/

function erroCancelado() {
  try { return new DOMException('cancelado', 'AbortError'); } catch (_) { const e = new Error('cancelado'); e.name = 'AbortError'; return e; }
}

// decodificação no fio principal (canvas comum), sem gestão de cor
async function decodificarNaPagina(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  let fonte;
  if (typeof createImageBitmap === 'function') fonte = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  else {
    fonte = new Image();
    const u = URL.createObjectURL(blob);
    try { fonte.src = u; await fonte.decode(); } finally { URL.revokeObjectURL(u); }
  }
  const cv = document.createElement('canvas');
  cv.width = fonte.width; cv.height = fonte.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(fonte, 0, 0);
  if (fonte.close) fonte.close();
  return cx.getImageData(0, 0, cv.width, cv.height).data;
}

export async function abrirMotor(opcoes = {}) {
  const urlBase = opcoes.urlBase || BASE_PADRAO;
  let n = 0, worker = null, proc = null, modo = 'worker';
  const pendentes = new Map();                    // id -> { resolve, reject, aoParcial }

  function receber(m) {
    if (!m) return;
    if (m.tipo === 'aviso') { if (typeof console !== 'undefined') console.info('[motor]', m.texto); if (m.codigo === 'sem-offscreencanvas') modo = 'worker-sem-offscreen'; return; }
    if (m.tipo === 'pedirTiles') {                 // o worker não decodifica PNG: decodifica aqui e devolve
      const [[x, y]] = m.lista;
      decodificarNaPagina(m.url || `${urlBase}tiles/dem/${m.z}/${x}/${y}.png`).catch(() => null).then((rgba) => {
        worker.postMessage({ tipo: 'tiles', pedido: m.pedido, tiles: [{ x, y, rgba }] }, rgba ? [rgba.buffer] : []);
      });
      return;
    }
    const p = pendentes.get(m.id);
    if (!p) return;                                // resposta de algo já cancelado
    if (m.parcial) { if (p.aoParcial) p.aoParcial(m.quadro); return; }
    pendentes.delete(m.id);
    if (m.ok) p.resolve(m.resultado);
    else if (m.codigo === 'cancelado') p.reject(erroCancelado());
    else { const e = new Error(m.erro || 'erro do motor'); e.codigo = m.codigo; p.reject(e); }
  }

  async function ligarPrincipal() {
    const { criarProcessador } = await import('./worker.js');
    proc = criarProcessador({ obterRgba: (url) => decodificarNaPagina(url) });
    modo = 'principal';
  }

  if (!opcoes.semWorker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (ev) => receber(ev.data);
      worker.onerror = (ev) => {                   // módulo em Worker não suportado ou falha de carga
        if (ev && ev.preventDefault) ev.preventDefault();
        for (const [, p] of pendentes) p.reject(new Error('worker falhou'));
        pendentes.clear();
      };
    } catch (_) { worker = null; }
  }
  if (!worker) await ligarPrincipal();

  function pedir(tipo, args = {}, { signal, aoParcial } = {}) {
    const id = ++n;
    const msg = { ...args, id, tipo };
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(erroCancelado()); return; }
      pendentes.set(id, { resolve, reject, aoParcial });
      if (signal) signal.addEventListener('abort', () => cancelar(id), { once: true });
      if (worker) worker.postMessage(msg);
      else Promise.resolve().then(() => proc.tratar(msg, (r) => receber(r)));
    });
  }
  function cancelar(id) {
    const p = pendentes.get(id);
    if (!p) return;
    pendentes.delete(id);
    p.reject(erroCancelado());
    const m = { tipo: 'cancelar', alvo: id };
    if (worker) worker.postMessage(m); else proc.tratar(m, () => {});
  }

  // init: se o worker não sobe (navegador sem Worker de módulo), cai para o fio principal
  const iniciar = (args) => pedir('init', args);
  let info;
  const argsInit = { urlBase, recorte: opcoes.recorte, corSombra: opcoes.corSombra };
  try { info = await Promise.race([iniciar(argsInit), new Promise((_, rej) => setTimeout(() => rej(new Error('init demorou')), opcoes.tempoInitMs ?? 20000))]); }
  catch (e) {
    if (!worker) throw e;
    if (typeof console !== 'undefined') console.info('[motor] worker indisponível, motor no fio principal:', e.message);
    worker.terminate(); worker = null; pendentes.clear();
    await ligarPrincipal();
    info = await iniciar(argsInit);
  }

  // sombra: no máximo um em voo e um na fila; o mais novo vence
  let emVoo = null, naFila = null;
  function proximaSombra() {
    if (emVoo || !naFila) return;
    const f = naFila; naFila = null;
    emVoo = pedir('sombra', f.args, { signal: f.signal });
    emVoo.then(f.resolve, f.reject).finally(() => { emVoo = null; proximaSombra(); });
  }
  function sombra(args = {}, { signal } = {}) {
    return new Promise((resolve, reject) => {
      if (naFila) naFila.reject(erroCancelado());
      naFila = { args, signal, resolve, reject };
      proximaSombra();
    });
  }

  // dia: um por vez; guarda os quadros para quadroMaisProximo()
  let diaAtual = null, quadrosDoDia = [];
  function dia(args = {}, { signal } = {}) {
    if (diaAtual) cancelar(diaAtual.id);
    const { aoQuadro, ...resto } = args;
    const quadros = [];
    quadrosDoDia = quadros;
    const id = n + 1;
    const pr = pedir('dia', resto, {
      signal,
      aoParcial: (q) => { quadros.push(q); quadros.sort((a, b) => a.minuto - b.minuto); if (aoQuadro) aoQuadro(q); },
    }).then((r) => ({ ...r, quadros }));
    diaAtual = { id };
    pr.finally(() => { if (diaAtual && diaAtual.id === id) diaAtual = null; }).catch(() => {});
    return pr;
  }
  function quadroMaisProximo(minuto) {
    let melhor = null, d = Infinity;
    for (const q of quadrosDoDia) { const k = Math.abs(q.minuto - minuto); if (k < d) { d = k; melhor = q; } }
    return melhor;
  }

  async function relevoCartao(args = {}, extra) {
    const r = await pedir('relevoCartao', args, extra);
    const rgba = r.rgba instanceof Uint8ClampedArray ? r.rgba : new Uint8ClampedArray(r.rgba.buffer || r.rgba);
    const imagem = typeof ImageData !== 'undefined' ? new ImageData(rgba, r.largura, r.altura) : { data: rgba, width: r.largura, height: r.altura };
    delete r.rgba;
    return { ...r, imagem };
  }

  return {
    get modo() { return modo; },
    info,
    horas: (args, extra) => pedir('horas', args, extra),
    sombra,
    dia,
    quadroMaisProximo,
    relevoCartao,
    altitudes: (args, extra) => pedir('altitudes', args, extra),
    cancelar,
    encerrar() {
      for (const [, p] of pendentes) p.reject(erroCancelado());
      pendentes.clear();
      if (worker) worker.terminate();
      worker = null; proc = null;
    },
  };
}

// Atalho de instância única (pedido na T7): Motor.iniciar() uma vez, depois Motor.horas() etc.
let unico = null;
const exigir = () => { if (!unico) throw new Error('Motor.iniciar() primeiro'); return unico; };
export const Motor = {
  async iniciar(opcoes) { if (!unico) unico = await abrirMotor(opcoes); return unico; },
  horas: (a, e) => exigir().horas(a, e),
  sombra: (a, e) => exigir().sombra(a, e),
  dia: (a, e) => exigir().dia(a, e),
  relevoCartao: (a, e) => exigir().relevoCartao(a, e),
  altitudes: (a, e) => exigir().altitudes(a, e),
  quadroMaisProximo: (m) => exigir().quadroMaisProximo(m),
  get modo() { return unico ? unico.modo : null; },
  encerrar() { if (unico) unico.encerrar(); unico = null; },
};
export default Motor;
