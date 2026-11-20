// hora/index.js · Hora da Serra ao vivo (Pixel, frontend B, 20/11/2026). ARQUITETURA 2, 4.3, 6, 9.
// montar(ctx) é chamado pelo app.js depois do 'load' do mapa. Nada aqui segura a tela:
//   1. régua, tábuas e horários aparecem na hora, com o nascer e o escurecer calculados aqui (nucleo.js);
//   2. o motor (worker) abre, calcula as horas de hoje e de amanhã de cada poço confirmado;
//   3. a sombra da serra entra no mapa (CanvasSource) e as etiquetas de hora nos poços;
//   4. os 5 primeiros segundos (abertura.js) ou, com ?demo=1, a demonstração de 60 s.
// Se o motor falhar, o mapa e as tábuas seguem, com "horas de sol indisponíveis neste aparelho".

import { T, t, nomeCurto, ariaRegua } from '../textos.js';
import { minutoDoDia, dataLocal, somarDias, nascerEPor, hhmm, utcDe } from '../motor/nucleo.js';
import { horasExibidas, deveMostrarAmanha, limitesDaRegua, valorDaRegua, escolherAlvo, luzNoMinuto, incertezaMin, diaDaTabua } from './regras.js';

const COR_SOMBRA = [30, 47, 92, 140];          // DESIGN 3.3: #1E2F5C a 0,55
const PASSO_RELOGIO_MIN = 5;
const PASSO_ECONOMIA_MIN = 15;

let H = null;            // estado único do recurso
let montando = null;

const $ = (id) => document.getElementById(id);

// nome do poço sem "Cachoeira das": "Véu da Noiva", "Arapongas" (para a régua e o leitor de tela)
export function nomeDoPoco(p) {
  const n = String(p?.nome || '').trim();
  const sem = n.replace(/^(cachoeira|po[cç]o)\s+(d[aoe]s?\s+)?/i, '').trim();
  return sem || n;
}

export function estadoHora() { return H; }

export function montar(ctx) {
  if (!montando) montando = montarDeVerdade(ctx).catch((e) => { console.info('[hora] não montou', e && e.message); });
  return montando;
}

async function montarDeVerdade(ctx) {
  const map = ctx.map;
  H = criarEstado(ctx);
  window.Itaitu.hora = H.publico;
  ligarSom(H);

  // 1. o que não depende do motor
  const [{ montarRegua }, { montarTabuas }, { montarHorarios }] = await Promise.all([
    import('./regua.js'), import('./tabuas.js'), import('./horarios.js'),
  ]);
  H.regua = montarRegua(H);
  H.tabuas = montarTabuas(H);
  H.horarios = montarHorarios(H);
  H.situar();
  H.redesenhar();
  ctx.layout?.();

  // cartão (ouve itaitu:trilha-gravada). Montado ANTES do motor: sem motor ele sai com o relevo de
  // reserva (fundo pintado e traçado projetado) e a frase sem hora de sol, mas sai (QA, 20/11).
  try { const { montarCartao } = await import('./cartao.js'); H.cartao = montarCartao(H); } catch (e) { console.info('[hora] cartão indisponível', e && e.message); }

  // 2. motor
  try {
    const { abrirMotor } = await import('../motor/cliente.js');
    H.motor = await abrirMotor({ urlBase: new URL('./', document.baseURI).href, recorte: ctx.recorte, corSombra: COR_SOMBRA });
    ctx.motor = H.motor;
    ctx.emit('itaitu:motor', { ok: true });
  } catch (e) {
    console.info('[hora] motor indisponível', e && e.message);
    H.motorFalhou = true;
    ctx.motor = null;
    ctx.emit('itaitu:motor', { ok: false });
    H.redesenhar();
    H.ligarRelogio();
    return H.publico;
  }

  await H.calcularHoras();

  // 3. sombra e etiquetas
  try {
    const { criarSombra } = await import('./sombra-canvas.js');
    H.sombra = await criarSombra(H);
  } catch (e) { console.info('[hora] sombra indisponível', e && e.message); }

  H.ligarRelogio();
  ctx.layout?.();

  // 4. abertura ou demonstração
  if (ctx.params.get('demo') === '1') {
    try { const { rodarDemo } = await import('./demo.js'); rodarDemo(ctx, H); } catch (e) { console.info('[hora] demo indisponível', e && e.message); }
  } else {
    await H.abrir();
  }
  return H.publico;
}

// ---------------------------------------------------------------- estado
function criarEstado(ctx) {
  const h = {
    ctx, map: ctx.map, motor: null, motorFalhou: false,
    pontos: [], porId: new Map(),
    dias: new Map(),                       // data -> { nascerMin, porMin, escureceMin, min, max }
    hoje: null, amanha: null,
    amanhaGeral: false,
    calculado: false,
    regua: null, tabuas: null, horarios: null, sombra: null, cartao: null,
    dataRegua: null, minutoRegua: null, deslocada: false,
    foco: null,
    abertura: null,                        // resultado da abertura (fps, parado...)
    emDemo: false,
    audio: false,
  };

  h.agoraMs = () => ctx.agora().getTime();
  h.agoraMin = () => minutoDoDia(h.agoraMs(), ctx.recorte?.fuso_min ?? -180);
  h.dataHoje = () => dataLocal(h.agoraMs(), ctx.recorte?.fuso_min ?? -180);
  h.economia = () => !!ctx.economia?.();
  h.reduz = () => !!ctx.reduzMovimento?.();

  // nascer, pôr e escurecer do vale (horizonte livre, no centro do recorte): calculado aqui, sem motor
  h.dia = (data) => {
    if (!h.dias.has(data)) {
      const [lon, lat] = ctx.recorte?.centro || [-40.495, -11.34];
      const np = nascerEPor(data, lat, lon);
      const lim = limitesDaRegua(np.nascerMin, np.escureceBrutoMin);
      h.dias.set(data, { ...np, ...lim });
    }
    return h.dias.get(data);
  };

  // pontos do arquivo (os dados decidem: _estado, _hora_de_sol, _ordem)
  for (const f of ctx.dados?.pontos?.features || []) {
    const p = f.properties || {};
    const agua = p.tipo === 'cachoeira' || p.tipo === 'poco';
    const r = {
      id: p.id, f, props: p, ordem: p._ordem ?? 99, agua,
      nome: p.nome, poco: nomeDoPoco(p), curto: nomeCurto(p.id, p.nome),
      estado: p._estado, temHora: !!p._hora_de_sol, coord: f.geometry ? f.geometry.coordinates.slice(0, 2) : null,
      incerteza: incertezaMin(p),
      horas: { hoje: null, amanha: null }, exib: { hoje: null, amanha: null }, mostra: 'hoje',
    };
    h.pontos.push(r);
    h.porId.set(r.id, r);
  }
  h.pontos.sort((a, b) => a.ordem - b.ordem);
  h.comHora = () => h.pontos.filter((p) => p.temHora && p.horas.hoje);

  h.datasDoDia = () => {
    const hoje = h.dataHoje();
    if (hoje !== h.hoje) { h.hoje = hoje; h.amanha = somarDias(hoje, 1); }
    return { hoje: h.hoje, amanha: h.amanha };
  };
  h.datasDoDia();

  // horas de hoje e de amanhã de cada ponto com hora de sol (motor)
  h.calcularHoras = async () => {
    if (!h.motor) return;
    const { hoje, amanha } = h.datasDoDia();
    const pontos = h.pontos.filter((p) => p.temHora && p.coord).map((p) => ({ id: p.id, lon: p.coord[0], lat: p.coord[1], ...(Number.isInteger(p.props.sol_ajuste_min) ? { sol_ajuste_min: p.props.sol_ajuste_min } : {}) }));
    if (!pontos.length) { h.calculado = true; h.situar(); h.redesenhar(); return; }
    try {
      const [a, b] = await Promise.all([h.motor.horas({ pontos, data: hoje }), h.motor.horas({ pontos, data: amanha })]);
      for (const p of h.pontos) {
        if (!p.temHora) continue;
        p.horas.hoje = a.pontos[p.id] || null;
        p.horas.amanha = b.pontos[p.id] || null;
      }
      h.msHoras = a.ms;
      h.calculado = true;
    } catch (e) {
      console.info('[hora] horas não calcularam', e && e.message);
      h.motorFalhou = true;
    }
    h.situar();
    h.redesenhar();
  };

  // situação de cada ponto com o relógio de agora; decide hoje ou amanhã
  h.situar = () => {
    const agora = h.agoraMin();
    for (const p of h.pontos) {
      if (!p.horas.hoje) { p.exib.hoje = null; p.exib.amanha = null; continue; }
      p.exib.hoje = horasExibidas(p.horas.hoje, p.props, agora);
      p.exib.amanha = p.horas.amanha ? horasExibidas(p.horas.amanha, p.props, null) : null;
      // para o voo da câmera olhar o paredão certo (voos.js lê _apaga_min)
      p.props._apaga_min = p.exib.hoje.apaga ?? p.props._apaga_min;
    }
    const comHora = h.comHora();
    h.amanhaGeral = deveMostrarAmanha(comHora.map((p) => p.exib.hoje), agora);
    // 'sem-tempo-hoje' (o sol ainda está no poço, mas não dá para chegar) fica em hoje: só 'sol-foi' vira amanhã
    for (const p of comHora) p.mostra = diaDaTabua(p.exib.hoje, h.amanhaGeral, !!p.exib.amanha);
    // a régua mostra hoje; depois de escurecer, mostra o dia de amanhã
    const dHoje = h.dia(h.hoje);
    h.dataRegua = agora > dHoje.max ? h.amanha : h.hoje;
    if (!h.deslocada || h.minutoRegua == null) h.minutoRegua = h.minutoInicialDaRegua(agora, h.dataRegua);
  };

  // onde a régua fica parada quando ninguém mexe nela. Hoje: no agora. Amanhã (já escureceu hoje):
  // no "saia até" do destino da faixa, ou no nascer de amanhã. Antes, o agora da noite (22:30) saturava
  // no fim da régua de amanhã e ela abria em "amanhã, 18:10, já escureceu" (QA, 20/11).
  h.minutoInicialDaRegua = (agora, data) => {
    const d = h.dia(data);
    if (data === h.hoje) return valorDaRegua(agora, d.nascerMin, d.escureceBrutoMin);
    const alvo = h.destinoDaFaixa();
    const e = alvo && h.exibDe(alvo, data);
    return valorDaRegua(e?.saiaAte ?? d.min, d.nascerMin, d.escureceBrutoMin);
  };

  // horas exibidas de um ponto na data pedida
  h.exibDe = (p, data) => (data === h.amanha ? p.exib.amanha : p.exib.hoje);
  h.exibMostrada = (p) => (p.mostra === 'amanha' ? p.exib.amanha : p.exib.hoje);

  // destino da faixa e da janela da régua: o escolhido; senão o 1º na ordem que ainda dá para ter sol
  h.destinoDaFaixa = () => {
    const f = h.foco && h.porId.get(h.foco);
    if (f && f.temHora && f.exib.hoje) return f;
    const comHora = h.comHora();
    return comHora.find((p) => p.mostra === 'hoje' && ['planejar', 'saia-agora'].includes(p.exib.hoje.situacao))
      || comHora.find((p) => p.mostra === 'amanha' && p.exib.amanha?.saiaAte != null)
      || comHora[0] || null;
  };
  // alvo do arraste da abertura (9.1): 1º na ordem com apaga > agora exibido
  h.alvoDaAbertura = () => {
    const dHoje = h.dia(h.hoje);
    const agoraEx = valorDaRegua(h.agoraMin(), dHoje.nascerMin, dHoje.escureceBrutoMin);
    const lista = h.comHora().map((p) => ({ id: p.id, ordem: p.ordem, exibidas: p.exib.hoje }));
    return escolherAlvo(lista, agoraEx);
  };

  // luz de cada ponto no minuto da régua, para a palavra que acompanha a sombra
  h.estadosNoMinuto = (minuto, data) => h.comHora().map((p) => {
    const e = h.exibDe(p, data);
    return { p, luz: e ? luzNoMinuto(minuto, e) : null };
  }).filter((x) => x.luz);

  h.textoDaRegua = (minuto, data) => {
    const hora = hhmm(minuto);
    const alvo = h.destinoDaFaixa();
    const amanha = data === h.amanha;
    const pre = amanha ? `${T.hora.amanha}, ` : '';
    if (!alvo) return `${pre}${hora}`;
    const e = h.exibDe(alvo, data);
    const luz = e ? luzNoMinuto(minuto, e) : null;
    if (luz === 'sol') return pre + t('hora.sol_em', { hora, nome: alvo.poco });
    if (luz === 'noite') return `${pre}${hora}, ${T.hora.aria_noite}`;
    if (luz === 'sem-sol') return `${pre}${hora}, ${t('hora.frase_sem_sol', { nome: alvo.poco })}`;
    return pre + t('hora.sombra_cobre', { hora, nome: alvo.poco });
  };
  h.textoLive = (minuto, data) => {
    const lista = h.estadosNoMinuto(minuto, data).map(({ p, luz }) => ({ nomeCurto: p.poco, estado: luz }));
    const base = ariaRegua(hhmm(minuto), lista);
    return data === h.amanha ? `${T.hora.amanha}, ${base}` : base;
  };

  // anúncio no #hora-live (a sombra sempre com a palavra)
  let liveT = 0;
  h.anunciar = (texto, { ja = false } = {}) => {
    const l = $('hora-live');
    if (!l || !texto) return;
    clearTimeout(liveT);
    // limpa e escreve em dois tempos (o leitor de tela repete a mesma frase); timer, não rAF: com o mapa 3D pesado o quadro atrasa
    liveT = setTimeout(() => {
      if (l.textContent !== texto) { l.textContent = texto; return; }
      l.textContent = '';
      liveT = setTimeout(() => { l.textContent = texto; }, 40);
    }, ja ? 0 : 300);
  };

  h.emitirHora = (minutos, data, origem) => ctx.emit('itaitu:hora', { minutos: Math.round(minutos), data, origem });

  // minuto mostrado no mapa (régua, sombra, etiquetas, luz). origem: 'regua' | 'relogio' | 'abertura' | 'demo'
  h.irPara = (minuto, { data = h.dataRegua, origem = 'regua', rapido = false, emitir = true, minutoLuz } = {}) => {
    h.minutoRegua = minuto;
    h.dataRegua = data;
    h.regua?.mostrar(minuto, data);
    h.sombra?.mostrar(minuto, data, { rapido });
    h.sombra?.atualizarEtiquetas(minuto, data);
    if (emitir) h.emitirHora(minutoLuz ?? minuto, data, origem);
  };

  h.redesenhar = () => {
    h.regua?.renderizar();
    h.tabuas?.renderizar();
    h.horarios?.renderizar();
    h.sombra?.renderizarEtiquetas?.();
  };

  h.focar = (id) => {
    if (!h.porId.has(id)) return;
    h.foco = id;
    h.regua?.renderizar();
    h.tabuas?.marcarAtual(id);
    h.tabuas?.renderizarFaixa();
  };

  // relógio: a cada 15 s confere o minuto; sombra a cada 5 min (15 na economia); pausa com a aba oculta
  let relogio = 0, ultimoMin = null, ultimaSombra = null;
  h.ligarRelogio = () => {
    if (relogio) return;
    const passo = () => {
      if (document.hidden || h.emDemo || window.Itaitu?.hora?.aberturaTocando) return;
      const agora = h.agoraMin();
      if (agora === ultimoMin) return;
      ultimoMin = agora;
      const antes = h.hoje;
      h.datasDoDia();
      if (h.hoje !== antes) { h.dias.clear(); h.calcularHoras(); }
      h.situar();
      h.regua?.renderizar();
      h.tabuas?.atualizarSeMudou();
      h.horarios?.tique(agora);
      if (h.deslocada) return;
      const passoSombra = h.economia() ? PASSO_ECONOMIA_MIN : PASSO_RELOGIO_MIN;
      const bloco = Math.floor(agora / passoSombra);
      const precisaSombra = bloco !== ultimaSombra;
      ultimaSombra = bloco;
      // a régua mostra a hora atual arredondada; a luz e a sombra seguem o minuto real
      h.regua?.mostrar(h.minutoRegua, h.dataRegua);
      if (precisaSombra) {
        const m = h.economia() ? bloco * passoSombra : agora;
        h.sombra?.mostrar(m, h.dataLuz(), {});
        h.sombra?.atualizarEtiquetas(h.minutoRegua, h.dataRegua);
      }
      h.emitirHora(agora, h.dataLuz(), 'relogio');
    };
    ultimoMin = h.agoraMin();
    ultimaSombra = Math.floor(ultimoMin / (h.economia() ? PASSO_ECONOMIA_MIN : PASSO_RELOGIO_MIN));
    relogio = setInterval(passo, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { ultimoMin = null; passo(); } });
    document.addEventListener('itaitu:economia', () => { ultimaSombra = null; ultimoMin = null; passo(); h.redesenhar(); });
  };
  // a luz real é sempre a de hoje (o mapa à noite fica escuro, mesmo com a régua em amanhã)
  h.dataLuz = () => h.hoje;

  h.voltarAgora = () => {
    h.deslocada = false;
    h.situar();
    const agora = h.agoraMin();
    h.irPara(h.minutoRegua, { data: h.dataRegua, origem: 'relogio', emitir: false });
    h.sombra?.mostrar(h.economia() ? Math.floor(agora / PASSO_ECONOMIA_MIN) * PASSO_ECONOMIA_MIN : agora, h.hoje, {});
    h.emitirHora(agora, h.hoje, 'relogio');
    h.regua?.renderizar();
  };

  // ---------------------------------------------------------------- abertura (9.1)
  h.abrir = async () => {
    const { tocarAbertura, aberturaTocando } = await import('../abertura.js');
    const agora = h.agoraMin();
    const dHoje = h.dia(h.hoje);
    const agoraEx = valorDaRegua(agora, dHoje.nascerMin, dHoje.escureceBrutoMin);
    const comHora = h.comHora();
    const etiquetas = comHora.filter((p) => p.exib.hoje?.apaga != null).map((p) => ({ pontoId: p.id, minuto: p.exib.hoje.apaga }));
    const alvo = h.alvoDaAbertura();
    const fim = dHoje.max;
    const parado = () => { h.sombra?.acenderTodas(); h.tabuas?.mostrarFaixa(); h.anunciar(h.amanhaGeral ? T.hora.amanha_aviso : T.abertura.anuncio_parado); };

    // dia pré-calculado (escala 0,5), do agora até o escurecer; a abertura não espera mais de 3 s por ele
    const vaiCorrer = !h.reduz() && !h.economia() && !h.amanhaGeral && agora < fim && h.sombra;
    if (vaiCorrer) {
      const pDia = h.sombra.preCalcularDia(h.hoje, agoraEx, fim);
      await Promise.race([pDia, new Promise((ok) => setTimeout(ok, 3000))]);
    }
    h.publico.aberturaTocando = true;
    let r;
    try {
      r = await tocarAbertura({
        minutoAgora: agoraEx, minutoFim: fim, etiquetas,
        alvo: alvo ? { id: alvo.id, minuto: alvo.exibidas.apaga } : undefined,
        amanha: h.amanhaGeral,
        map: h.map,
        setMinuto: (m) => { h.sombra?.modoAnimado(true); h.irPara(m, { data: h.hoje, origem: 'abertura', rapido: true }); },
        acenderEtiqueta: (id) => h.sombra?.acender(id),
        mostrarFaixa: () => h.tabuas?.mostrarFaixa(),
        arrastarSolDemo: (de, para, id) => h.regua?.arrastarSolDemo(de, para, id),
        tocarSom: (nome) => h.tocarSom(nome),
      });
    } catch (e) {
      console.info('[hora] abertura falhou', e && e.message);
      r = { parado: true, motivo: 'erro' };
    }
    // o polegar fantasma roda no próprio requestAnimationFrame: um toque que interrompe a abertura
    // tem de parar ele também, senão a régua e a sombra seguem andando depois da volta ao agora (QA, 20/11)
    h.regua?.pararPolegar?.();
    h.publico.aberturaTocando = aberturaTocando();
    h.sombra?.modoAnimado(false);
    h.abertura = r;
    // de volta ao agora, com a sombra exata (escala 1)
    h.deslocada = false;
    h.situar();
    h.irPara(h.minutoRegua, { data: h.dataRegua, origem: 'abertura', emitir: false });
    h.emitirHora(h.agoraMin(), h.hoje, 'relogio');
    if (r.parado || r.pulada) parado();
    else h.anunciar(T.abertura.dica_arraste);
    return r;
  };

  // ---------------------------------------------------------------- som (só depois do primeiro toque)
  h.tocarSom = (nome, opcoes) => {
    if (!h.audio || h.reduz() || !h.Som) return false;
    try { return h.Som.tocar(nome, opcoes); } catch (_) { return false; }
  };
  h.tic = (minuto) => {
    if (!h.audio || h.reduz() || !h.Som) return;
    try { h.Som.tic({ hora: minuto / 60 }); } catch (_) {}
  };

  // a parte que os outros (qa, demo, app particular) podem ler
  h.publico = {
    get calculado() { return h.calculado; },
    get amanha() { return h.amanhaGeral; },
    get abertura() { return h.abertura; },
    aberturaTocando: false,
    get minuto() { return h.minutoRegua; },
    get data() { return h.dataRegua; },
    horas: () => Object.fromEntries(h.comHora().map((p) => [p.id, { bruto: p.horas.hoje?.apagaBrutoMin ?? null, hoje: p.exib.hoje, amanha: p.exib.amanha, mostra: p.mostra, incerteza: p.incerteza }])),
    irPara: (m, data) => { h.deslocada = true; h.irPara(m, { data: data || h.dataRegua, origem: 'regua' }); },
    voltarAgora: () => h.voltarAgora(),
    gerarCartao: (o) => h.cartao?.gerar(o),
    utcDe,
  };
  return h;
}

// ---------------------------------------------------------------- som
function ligarSom(h) {
  import('../som.js').then((Som) => {
    h.Som = Som;
    const liberar = () => {
      if (h.audio) return;
      if (h.reduz()) return;
      try {
        Promise.resolve(Som.liberar()).then((ok) => {
          h.audio = !!ok;
          if (ok) { try { Som.ambiencia(h.minutoRegua ?? h.agoraMin()); } catch (_) {} }
        }).catch(() => {});
      } catch (_) {}
    };
    document.addEventListener('pointerdown', liberar, { capture: true, passive: true });
    document.addEventListener('keydown', liberar, { capture: true });
  }).catch((e) => console.info('[hora] som indisponível', e && e.message));
}
