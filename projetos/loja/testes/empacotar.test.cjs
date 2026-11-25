'use strict';
// node --test projetos/loja/testes/empacotar.test.cjs
// O zip da agência leva só os 15 agentes: os papéis internos do executor do Porta Aberta (leitor, redator e
// publicador) moram na mesma pasta da casa, mas são de outra estrutura e nunca entram no produto da loja.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../empacotar.cjs');

function montar(id) {
  const p = E.PRODUTOS_DEF.find((x) => x.id === id);
  const m = E.montador(p.zip);
  p.montar(m);
  return { p, m, entradas: m.entradas() };
}

test('agência: só os 15 agentes, nenhum papel interno do executor, nenhum gancho', () => {
  const { p, m, entradas } = montar('agencia');
  assert.deepEqual(m.faltas, []);
  const agentes = entradas.filter((e) => e.nome.includes('/.claude/agents/')).map((e) => e.nome.split('/').pop()).sort();
  assert.deepEqual(agentes, E.AGENTES_15.slice().sort());
  for (const n of ['leitor-pedido.md', 'redator-pedido.md', 'publicador-pedido.md']) assert.ok(!entradas.some((e) => e.nome.endsWith('/' + n)), n);
  assert.ok(!entradas.some((e) => e.nome.includes('/.claude/hooks/')), 'sem .claude/hooks/');
  assert.deepEqual(E.conferirAgencia(entradas, p.zip), []);
});

test('agência: o CLAUDE.md do zip não cita os papéis internos; o da casa continua com a nota', () => {
  const { entradas } = montar('agencia');
  const md = entradas.find((e) => e.nome.endsWith('/CLAUDE.md')).dados.toString('utf8');
  assert.doesNotMatch(md, /(leitor|redator|publicador)-pedido/);
  assert.match(md, /\| `devops` \| Trilho \|/, 'a tabela da equipe continua');
  const casa = require('fs').readFileSync(require('path').resolve(__dirname, '..', '..', '..', 'CLAUDE.md'), 'utf8');
  assert.match(casa, /leitor-pedido/);
});

test('agência: a conferência acusa um papel interno ou um gancho que escape para o zip', () => {
  const { p, entradas } = montar('agencia');
  const mais = entradas.concat([{ nome: `${p.zip}/.claude/agents/leitor-pedido.md`, dados: Buffer.from('name: leitor-pedido') }, { nome: `${p.zip}/.claude/hooks/papeis.cjs`, dados: Buffer.from('x') }]);
  const erros = E.conferirAgencia(mais, p.zip);
  assert.ok(erros.some((x) => /agentes no zip diferentes/.test(x)), erros.join('\n'));
  assert.ok(erros.some((x) => /gancho do executor/.test(x)), erros.join('\n'));
  assert.ok(erros.some((x) => /papel interno do executor citado/.test(x)), erros.join('\n'));
});
