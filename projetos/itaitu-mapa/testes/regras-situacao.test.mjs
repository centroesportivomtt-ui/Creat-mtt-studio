// regras-situacao.test.mjs · situações da tábua ao longo do dia (Pixel, frontend B, 20/11/2026).
// Cobre horasExibidas com relógio (planejar, saia-agora, sem-tempo-hoje, sol-foi), diaDaTabua e chaveDaSituacao.
// O caso que motivou: Véu apaga 16:05, carro 3 + trilha 30; às 15:50 o sol ainda está no poço, mas não dá
// para chegar com ele. A tábua não pode virar "amanhã" nem dizer que a serra já tirou o sol.
// Rodar:  node --test 'projetos/itaitu-mapa/testes/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../../site/itaitu/', import.meta.url));
const R = await import(new URL('js/hora/regras.js', `file://${RAIZ}`).href);
const textos = await import(new URL('js/textos.js', `file://${RAIZ}`).href);

const m = (hhmm) => { const [h, mm] = hhmm.split(':').map(Number); return h * 60 + mm; };
const horas = (apaga, escurece = '18:10', nasce = '06:10') => ({ apagaMin: m(apaga), escureceMin: m(escurece), nascePocoMin: m(nasce) });
const veu = { confianca: 'alta', _carro_min: 3, _trilha_min: 30 };
const exVeu = (agora) => R.horasExibidas(horas('16:05'), veu, agora == null ? null : m(agora));

test('situação do Véu ao longo da tarde: planejar, saia-agora, sem-tempo-hoje, sol-foi', () => {
  // saia até 14:30 (16:05 − 60 − 3 − 30 = 14:32, arredondado para baixo)
  assert.equal(exVeu('13:00').situacao, 'planejar');
  assert.equal(exVeu('14:30').situacao, 'planejar', 'no minuto do saia até ainda é planejar');
  const s = exVeu('15:20');
  assert.equal(s.situacao, 'saia-agora');
  assert.equal(s.saindoAgoraMin, 10, '15:20 + 33 = 15:53; até 16:05 sobram 12, exibido 10');
  assert.equal(s.saindoAgoraMin % 5, 0);
  // o caso do revisor: o sol ainda está no poço, mas a chegada (16:23) é depois do apaga
  const st = exVeu('15:50');
  assert.equal(st.situacao, 'sem-tempo-hoje');
  assert.equal(st.saindoAgoraMin, null);
  assert.ok(st.apaga > m('15:50'), 'apaga ainda no futuro');
  // chegada antes do apaga, mas sobra < 5 min exibidos: também sem tempo hoje
  assert.equal(exVeu('15:30').situacao, 'sem-tempo-hoje', '15:30 + 33 = 16:03; sobra 2 min, exibido 0');
  assert.equal(exVeu('16:04').situacao, 'sem-tempo-hoje');
  // agora >= apaga: o sol foi de fato
  assert.equal(exVeu('16:05').situacao, 'sol-foi');
  assert.equal(exVeu('17:00').situacao, 'sol-foi');
  // sem relógio (amanhã) é sempre planejar
  assert.equal(exVeu(null).situacao, 'planejar');
});

test('quem chega antes de o sol entrar no poço só conta sol a partir do nasce', () => {
  // apaga 10:00, sol chega ao poço 09:40, carro + trilha 33: saia até 08:25
  const e = R.horasExibidas(horas('10:00', '18:10', '09:40'), veu, m('08:30'));
  assert.equal(e.situacao, 'saia-agora');
  assert.equal(e.saindoAgoraMin, 20, 'chegada 09:03, mas o sol só chega 09:40: 20 min');
});

test('sem sol e sem tempo de placa não dependem do relógio', () => {
  assert.equal(R.horasExibidas({ apagaMin: null, escureceMin: m('18:10') }, veu, m('15:50')).situacao, 'sem-sol');
  assert.equal(R.horasExibidas(horas('16:35'), { confianca: 'media', _carro_min: null, _trilha_min: null }, m('15:50')).situacao, 'sem-tempo');
});

test('diaDaTabua: só sol-foi vira amanhã; sem-tempo-hoje fica em hoje', () => {
  assert.equal(R.diaDaTabua(exVeu('13:00'), false), 'hoje');
  assert.equal(R.diaDaTabua(exVeu('15:20'), false), 'hoje');
  assert.equal(R.diaDaTabua(exVeu('15:50'), false), 'hoje', 'às 15:50 o mapa e a régua ainda mostram sol até 16:05');
  assert.equal(R.diaDaTabua(exVeu('16:10'), false), 'amanha');
  assert.equal(R.diaDaTabua(exVeu('16:10'), false, false), 'hoje', 'sem horas de amanhã, fica em hoje');
  assert.equal(R.diaDaTabua(exVeu('15:50'), true), 'amanha', 'todos os poços sem sol: tudo amanhã');
  assert.equal(R.diaDaTabua(null, false), 'hoje');
});

test('chaveDaSituacao: "a serra já tirou o sol" só quando o sol já foi', () => {
  const chave = (agora, geral = false) => { const e = exVeu(agora); return R.chaveDaSituacao(e, R.diaDaTabua(e, geral), geral); };
  assert.equal(chave('13:00'), null);
  assert.equal(chave('15:20'), 'hora.saindo_agora');
  assert.equal(chave('15:50'), 'hora.frase_sem_tempo_hoje_apaga');
  assert.equal(chave('16:10'), 'hora.sol_foi');
  assert.equal(chave('16:10', true), null, 'com tudo em amanhã, o aviso geral dos horários já explica');
  const semSol = R.horasExibidas({ apagaMin: null }, veu, m('15:50'));
  assert.equal(R.chaveDaSituacao(semSol, 'hoje', false), 'hora.sem_sol');
  // a frase existe em textos.js e sai com a hora do apaga
  const st = exVeu('15:50');
  const frase = textos.t('hora.frase_sem_tempo_hoje_apaga', { nome: 'Véu da Noiva', hora: '16:05' });
  assert.equal(st.apaga, m('16:05'));
  assert.match(frase, /^Hoje não dá mais tempo de chegar ao Véu da Noiva com sol: a serra apaga o sol às 16:05\.$/);
  for (const k of ['hora.saindo_agora', 'hora.sol_foi', 'hora.sem_sol', 'hora.sem_tempo', 'faixa.saindo_agora_destino']) {
    assert.notEqual(textos.t(k, { min: 10, nome: 'Véu da Noiva' }), k, `chave ${k} sem texto`);
  }
  // a faixa parte o texto do Verbo: o número na coluna grande, o resto no destino
  assert.ok(textos.t('faixa.saindo_agora_destino', { min: '10', nome: 'Véu da Noiva' }).startsWith('10'));
});

// QA 20/11: começando a gravação já dentro de um limiar, os avisos repetiam (20 min: o de 60 e, 30 s
// depois, o de 30; 8 min: três avisos iguais). O laço do horarios.js faz o mesmo que esta simulação.
test('limiarParaAvisar: um aviso só por limiar, mesmo começando dentro dele', () => {
  const LIM = [60, 30, 15];
  const simular = (faltamLista) => {
    const avisados = new Set();
    const ditos = [];
    for (const f of faltamLista) {
      const l = R.limiarParaAvisar(f, avisados, LIM);
      if (l != null) { for (const k of LIM) if (k >= l) avisados.add(k); ditos.push(l); }
    }
    return ditos;
  };
  assert.deepEqual(simular([20, 19.5, 19, 18.5]), [30]);
  assert.deepEqual(simular([8, 7.5, 7, 6.5]), [15]);
  assert.deepEqual(simular([90, 61, 60, 59.5, 31, 30, 29, 16, 15, 14]), [60, 30, 15]);
  assert.deepEqual(simular([45, 44.5, 20, 14]), [60, 30, 15]);
  assert.equal(R.limiarParaAvisar(null, new Set(), LIM), null);
  assert.equal(R.limiarParaAvisar(120, new Set(), LIM), null);
});

// QA 20/11: a régua à noite abria no fim do dia de amanhã. Quem decide o ponto de partida é o index.js;
// aqui fica a parte pura: valorDaRegua do agora da noite satura no máximo, o "saia até" não.
test('régua de amanhã: o saia até cabe na régua e o agora da noite não serve de partida', () => {
  const lim = R.limitesDaRegua(m('05:20'), m('18:12'));
  assert.equal(R.valorDaRegua(m('22:30'), m('05:20'), m('18:12')), lim.max);
  assert.equal(R.valorDaRegua(m('14:30'), m('05:20'), m('18:12')), m('14:30'));
  assert.equal(R.luzNoMinuto(m('14:30'), exVeu(null)), 'sol');
});
