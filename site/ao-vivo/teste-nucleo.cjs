// Testes do núcleo da Sede ao vivo: node site/ao-vivo/teste-nucleo.cjs
const assert = require('assert');
const N = require('./nucleo.js');
const T0 = Date.parse('2026-11-09T10:00:00Z');
const ev = (s, ag, tipo, evento, extra = {}) => ({ ts: new Date(T0 + s * 1000).toISOString(), sessao: 'S', sessao_nome: 'Projeto X', agente: ag, tipo, evento, ...extra });
const base = [
  ev(0, null, null, 'SessionStart'), ev(1, null, null, 'UserPromptSubmit'),
  ev(2, 'a1', 'frontend', 'SubagentStart'), ev(3, 'a1', 'frontend', 'PreToolUse', { ferramenta: 'Edit', resumo: 'index.html' }),
  ev(4, 'a2', 'Explore', 'SubagentStart'), ev(5, 'a2', 'Explore', 'SubagentStop'),
];
let E = N.estado(base, T0 + 10e3);
const fe = E.agentes.find(a => a.tipo === 'frontend');
assert.equal(fe.status, 'trabalhando'); assert.equal(fe.acao, 'editando › index.html'); assert.equal(fe.pessoa.nick, 'Pixel');
assert.equal(E.agentes.find(a => a.tipo === 'Explore').status, 'feito');
assert.equal(E.agentes.find(a => a.tipo === 'Explore').pessoa.nick, 'Explorador');
assert.equal(E.sessoes[0].status, 'trabalhando');
// passa o tempo sem sinal: parado
E = N.estado(base, T0 + 11 * 60e3);
assert.equal(E.agentes.find(a => a.tipo === 'frontend').status, 'parado');
// fim da vez da conversa principal: esperando você
E = N.estado([...base, ev(6, 'a1', 'frontend', 'SubagentStop'), ev(7, null, null, 'Stop')], T0 + 20e3);
assert.equal(E.agentes.find(a => a.principal).status, 'pausa'); assert.equal(E.sessoes[0].status, 'esperando');
// nova ação depois do Stop volta a trabalhar
E = N.estado([...base, ev(7, null, null, 'Stop'), ev(9, null, null, 'UserPromptSubmit'), ev(10, null, null, 'PreToolUse', { ferramenta: 'Bash', resumo: 'npm test' })], T0 + 20e3);
assert.equal(E.agentes.find(a => a.principal).status, 'trabalhando');
// ordem de chegada embaralhada não muda o resultado
E = N.estado(base.slice().reverse(), T0 + 10e3);
assert.equal(E.agentes.find(a => a.tipo === 'frontend').status, 'trabalhando');
assert.equal(E.log[0].tipo, 'done');
// ação atrasada (gancho assíncrono) depois da entrega não reabre o subagente
E = N.estado([...base, ev(6, 'a1', 'frontend', 'SubagentStop'), ev(5.5, 'a1', 'frontend', 'PreToolUse', { ferramenta: 'Read' }), ev(8, 'a1', 'frontend', 'PreToolUse', { ferramenta: 'Read' })], T0 + 20e3);
assert.equal(E.agentes.find(a => a.tipo === 'frontend').status, 'feito');
// fim da sessão fecha todos os agentes dela
E = N.estado([...base, ev(9, null, null, 'SessionEnd')], T0 + 20e3);
assert.ok(E.agentes.every(a => a.status !== 'trabalhando'));
assert.equal(E.sessoes[0].status, 'encerrada');
// fim de subagente sem identificação não cria agente fantasma
E = N.estado([...base, ev(7, null, null, 'Stop'), ev(8, null, null, 'SubagentStop')], T0 + 20e3);
assert.ok(!E.agentes.some(a => a.pessoa.nick === 'Agente'));
assert.equal(E.agentes.find(a => a.principal).status, 'pausa');
console.log('núcleo: 18 verificações ok');
