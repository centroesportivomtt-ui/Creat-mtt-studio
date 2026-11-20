// regras.js · regras da Hora da Serra (Pixel, frontend B, 20/11/2026). ARQUITETURA 6.2 e 6.3.
// PURO: sem DOM, sem fetch, sem estado. Roda no navegador e no Node 22 (o backend importa para teste).
//
// Toda ESTIMATIVA exibida é múltiplo de 5, arredondada para o lado seguro:
//   apaga (sol no poço até)  baixo      nasce (sol chega ao poço)  cima
//   escurece                 baixo      saia até                   baixo
//   volte com luz até        baixo      saindo agora (min de sol)  baixo
// As contas usam os valores JÁ exibidos (6.2): saia até = apaga exibido − 60 − carro − trilha.
// FATO (chegada do GPS, início e fim de gravação) aparece exato e não passa por aqui.

import { arredondar5 } from '../motor/nucleo.js';

export const SOL_DESEJADO_MIN = 60;     // "1 hora de sol no poço"
export const MARGEM_VOLTA_MIN = 30;     // folga da volta antes de escurecer

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------- horas de um ponto
// horas  = Horas do motor (nucleo.horasDeSol): { apagaMin, nascePocoMin, escureceMin, escureceBrutoMin, ... }
// props  = propriedades enriquecidas do ponto (_carro_min, _trilha_min, confianca, ...)
// agoraMin = minuto do dia (0..1439) para decidir a situação; null = planejar outro dia (amanhã)
// situacao: 'sem-sol' | 'sem-tempo' (sem tempo de placa) | 'planejar' (agora <= saia até)
//   | 'saia-agora' (passou do saia até, ainda chega com sol) | 'sem-tempo-hoje' (sol ainda no poço,
//   não dá para chegar com sol) | 'sol-foi' (agora >= apaga)
export function horasExibidas(horas, props = {}, agoraMin = null) {
  const h = horas || {};
  const apaga = arredondar5(num(h.apagaMin), 'baixo');
  const nasce = arredondar5(num(h.nascePocoMin), 'cima');
  const escBruto = num(h.escureceMin) ?? num(h.escureceBrutoMin);
  const escurece = arredondar5(escBruto, 'baixo');
  const carro = num(props._carro_min);
  const trilha = num(props._trilha_min);
  const temTempo = carro != null && trilha != null;

  const saiaAte = apaga != null && temTempo ? arredondar5(apaga - SOL_DESEJADO_MIN - carro - trilha, 'baixo') : null;
  const volteComLuzAte = escurece != null && trilha != null ? arredondar5(escurece - trilha - MARGEM_VOLTA_MIN, 'baixo') : null;

  let situacao;
  let saindoAgoraMin = null;
  const agora = num(agoraMin);
  if (apaga == null) situacao = 'sem-sol';
  else if (!temTempo) situacao = 'sem-tempo';
  else if (agora == null || agora <= saiaAte) situacao = 'planejar';
  else {
    const chegada = agora + carro + trilha;
    // quem chega antes de o sol entrar no poço só conta sol a partir do nasce
    const inicio = nasce != null ? Math.max(chegada, nasce) : chegada;
    const sobra = arredondar5(apaga - inicio, 'baixo');
    if (chegada < apaga && sobra > 0) { situacao = 'saia-agora'; saindoAgoraMin = sobra; }
    // o sol ainda está no poço, mas não dá mais tempo de chegar com sol: a tábua fica em hoje
    else if (agora < apaga) situacao = 'sem-tempo-hoje';
    // a serra já tirou o sol do poço (agora >= apaga)
    else situacao = 'sol-foi';
  }
  return { apaga, nasce, escurece, saiaAte, volteComLuzAte, saindoAgoraMin, situacao };
}

// ---------------------------------------------------------------- dia e frase da tábua
// Qual dia a tábua mostra. Só vira amanhã quando o sol já saiu do poço ('sol-foi') ou quando
// todos os poços já perderam o sol (amanhaGeral). 'sem-tempo-hoje' fica em hoje: o sol ainda
// está lá, e o mapa e a régua mostram isso.
export function diaDaTabua(exibHoje, amanhaGeral, temAmanha = true) {
  if (!exibHoje) return 'hoje';
  if (amanhaGeral) return 'amanha';
  return exibHoje.situacao === 'sol-foi' && temAmanha ? 'amanha' : 'hoje';
}

// Chave do texto (textos.js) que diz a situação embaixo das horas da tábua; null = nada a dizer.
// mostra = diaDaTabua(...). 'hora.sol_foi' só quando o sol já foi de fato.
export function chaveDaSituacao(exibHoje, mostra, amanhaGeral) {
  if (!exibHoje) return null;
  if (mostra === 'amanha') return amanhaGeral ? null : 'hora.sol_foi';
  switch (exibHoje.situacao) {
    case 'saia-agora': return exibHoje.saindoAgoraMin != null ? 'hora.saindo_agora' : null;
    case 'sem-tempo-hoje': return 'hora.frase_sem_tempo_hoje_apaga';
    case 'sem-sol': return 'hora.sem_sol';
    case 'sem-tempo': return 'hora.sem_tempo';
    default: return null;
  }
}

// ---------------------------------------------------------------- amanhã
// horasPorId: { [id]: Horas | exibidas } ou lista. Só contam pontos com apaga != null
// (quem chama passa só os pontos com _hora_de_sol). Lista vazia ou só 'sem-sol' -> false.
export function deveMostrarAmanha(horasPorId, agoraMin) {
  const lista = Array.isArray(horasPorId) ? horasPorId : Object.values(horasPorId || {});
  const apagas = [];
  for (const h of lista) {
    if (!h) continue;
    const a = num(h.apaga) ?? arredondar5(num(h.apagaMin), 'baixo');
    if (a != null) apagas.push(a);
  }
  const agora = num(agoraMin);
  if (!apagas.length || agora == null) return false;
  return apagas.every((a) => agora > a);
}

// ---------------------------------------------------------------- cartão
// minutos de sol no poço = apaga EXIBIDO − chegada exata (fato do GPS), nunca negativo.
// Com nasceMin (sol chega ao poço, exibido), quem chegou antes do sol só conta a partir dele.
export function minutosDeSolNoPoco(apagaExibido, chegadaMin, nasceMin = null) {
  const a = num(apagaExibido), c = num(chegadaMin);
  if (a == null || c == null) return 0;
  const n = num(nasceMin);
  const inicio = n != null ? Math.max(c, n) : c;
  return Math.max(0, Math.floor(a - inicio));
}

// ---------------------------------------------------------------- honestidade (6.3)
export function incertezaMin(props = {}) {
  return props && props.confianca === 'alta' ? 10 : 15;
}

// ---------------------------------------------------------------- régua (6.4)
export function limitesDaRegua(nascerMin, escureceMin) {
  return { min: arredondar5(nascerMin, 'cima'), max: arredondar5(escureceMin, 'baixo') };
}
export function valorDaRegua(minuto, nascerMin, escureceMin) {
  const { min, max } = limitesDaRegua(nascerMin, escureceMin);
  const v = arredondar5(num(minuto) ?? min, 'baixo');
  return Math.max(min, Math.min(max, v));
}
// posição (0..100) do minuto no trilho da régua
export function posicaoNaRegua(minuto, min, max) {
  if (!(max > min)) return 0;
  return Math.max(0, Math.min(100, ((minuto - min) / (max - min)) * 100));
}

// ---------------------------------------------------------------- luz num minuto
// 'sol' entre o sol chegar e a serra apagar (valores exibidos); 'sombra' fora disso;
// 'sem-sol' sem sol direto no dia; 'noite' depois de escurecer.
export function luzNoMinuto(minuto, exibidas) {
  const e = exibidas || {};
  const m = num(minuto);
  if (m == null) return 'sombra';
  if (e.escurece != null && m >= e.escurece) return 'noite';
  if (e.apaga == null) return 'sem-sol';
  const ini = e.nasce ?? -Infinity;
  return m >= ini && m < e.apaga ? 'sol' : 'sombra';
}

// ---------------------------------------------------------------- alvo (abertura, faixa, régua)
// O primeiro ponto, na ordem _ordem, com hora de sol e apaga > agoraExibido (ainda tem sol).
// lista: [{ id, ordem, exibidas }]
export function escolherAlvo(lista, agoraExibido) {
  const ordenada = [...(lista || [])].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const agora = num(agoraExibido);
  return ordenada.find((p) => p.exibidas && p.exibidas.apaga != null && (agora == null || p.exibidas.apaga > agora)) || null;
}

// "faltam X min para escurecer" (gravação): inteiro, nunca negativo; null se já escureceu
export function faltamParaEscurecer(agoraMin, escureceExibido) {
  const a = num(agoraMin), e = num(escureceExibido);
  if (a == null || e == null) return null;
  const f = Math.floor(e - a);
  return f > 0 ? f : null;
}

// Qual aviso de "faltam X min para escurecer" dar agora, durante a gravação. Só o MENOR limiar já
// alcançado, e só se ele ainda não foi avisado; quem chama marca como avisados ele e todos os maiores.
// Abriu com 20 min: avisa o de 30 uma vez (nunca o de 60 e, 30 s depois, o de 30). Abriu com 8: só o de 15.
export function limiarParaAvisar(faltam, avisados, limiares = [60, 30, 15]) {
  const f = num(faltam);
  if (f == null) return null;
  const alcancados = (limiares || []).filter((l) => f <= l);
  if (!alcancados.length) return null;
  const menor = Math.min(...alcancados);
  return avisados && avisados.has(menor) ? null : menor;
}
