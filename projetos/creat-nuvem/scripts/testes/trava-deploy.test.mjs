/*
 * Porta Aberta · testes da trava de publicação (scripts/trava-deploy.cjs, pacote 1D).
 * Roda com: npm test
 * Cobre: pegar, renovar, confirmar, soltar, TTL (vencida = livre), recusa com trava alheia, parada geral,
 * teto de 3 deploys por hora, portões do site, ensaio_ok para cliente real e a linha de comando.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'trava-deploy.cjs');
const T = require(SCRIPT);

const AGORA = Date.parse('2026-11-10T15:00:00.000Z');
const min = (n) => new Date(AGORA + n * 60000).toISOString();
const mapa = (linhas) => T.linhasDe(linhas);
const EU = 'executor:2026-11-10T12:00';
const OUTRO = 'carimbo:2026-11-10T06:30';
const PORTOES_OK = { portao_conteudo: true, csp: true, testar_site: true, conferir_boot: true };

/* aplica "gravar" na lista como o MCP faria (update se a chave existe, create se não) */
function aplicar(linhas, gravar) {
  const out = linhas.map((l) => Object.assign({}, l));
  for (const g of gravar) {
    const i = out.findIndex((l) => l.chave === g.chave);
    if (i === -1) out.push(Object.assign({}, g)); else out[i] = Object.assign({}, out[i], g);
  }
  return out;
}

test('pegar com a trava livre devolve a linha com TTL de 20 min e o dono', () => {
  const r = T.pegar({ mapa: mapa([]), dono: EU, agora: AGORA });
  assert.equal(r.ok, true);
  assert.deepEqual(r.gravar, [{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }]);
});

test('pegar, gravar, reler e confirmar fica com a trava; soltar libera', () => {
  let linhas = [];
  linhas = aplicar(linhas, T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).gravar);
  const c = T.confirmar({ mapa: mapa(linhas), dono: EU, agora: AGORA + 60000 });
  assert.equal(c.ok, true);
  assert.equal(c.resta_min, 19);
  const s = T.soltar({ mapa: mapa(linhas), dono: EU, agora: AGORA + 120000 });
  assert.equal(s.ok, true);
  linhas = aplicar(linhas, s.gravar);
  assert.equal(T.lerTrava(mapa(linhas), AGORA + 120000).livre, true);
  // depois de solta, outro dono pega
  assert.equal(T.pegar({ mapa: mapa(linhas), dono: OUTRO, agora: AGORA + 180000 }).ok, true);
});

test('trava alheia vigente: pegar, confirmar e soltar recusam e dizem quem é o dono', () => {
  const linhas = [{ chave: 'trava_deploy', valor: OUTRO, expira_em: min(10) }];
  const p = T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA });
  assert.equal(p.ok, false); assert.equal(p.motivo, 'trava_alheia'); assert.equal(p.dono_atual, OUTRO);
  assert.equal(p.gravar, undefined);
  assert.equal(T.confirmar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).motivo, 'trava_alheia');
  assert.equal(T.soltar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).motivo, 'trava_alheia');
});

test('TTL: trava alheia vencida conta como livre; vence exatamente no expira_em', () => {
  const linhas = [{ chave: 'trava_deploy', valor: OUTRO, expira_em: min(0) }];
  assert.equal(T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).ok, true);
  assert.equal(T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA - 1000 }).ok, false);
  // a própria trava também vence: confirmar depois do TTL falha
  const minha = [{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }];
  assert.equal(T.confirmar({ mapa: mapa(minha), dono: EU, agora: AGORA + 21 * 60000 }).ok, false);
});

test('trava sem expira_em nunca é tida como vencida (falha fechada)', () => {
  const linhas = [{ chave: 'trava_deploy', valor: OUTRO }];
  const p = T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA });
  assert.equal(p.ok, false); assert.equal(p.sem_validade, true);
});

test('o mesmo dono renova a própria trava; corrida: só quem relê o próprio nome confirma', () => {
  const minha = [{ chave: 'trava_deploy', valor: EU, expira_em: min(3) }];
  const r = T.pegar({ mapa: mapa(minha), dono: EU, agora: AGORA });
  assert.equal(r.ok, true); assert.equal(r.renovada, true); assert.equal(r.gravar[0].expira_em, min(20));
  // dois gravam quase juntos; a última gravação vence
  let linhas = aplicar([], T.pegar({ mapa: mapa([]), dono: EU, agora: AGORA }).gravar);
  linhas = aplicar(linhas, [{ chave: 'trava_deploy', valor: OUTRO, expira_em: min(20) }]);
  assert.equal(T.confirmar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).ok, false);
  assert.equal(T.confirmar({ mapa: mapa(linhas), dono: OUTRO, agora: AGORA }).ok, true);
});

test('parada geral (Operacao.pausado) recusa pegar e publicar; remoção só com --apesar-da-pausa', () => {
  const linhas = [{ chave: 'pausado', valor: 'sim' }, { chave: 'trava_deploy', valor: EU, expira_em: min(20) }];
  assert.equal(T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).motivo, 'pausado');
  assert.equal(T.podePublicar({ mapa: mapa(linhas), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK }).motivo, 'pausado');
  assert.equal(T.podePublicar({ mapa: mapa(linhas), dono: EU, agora: AGORA, tipo: 'remocao' }).motivo, 'pausado');
  assert.equal(T.podePublicar({ mapa: mapa(linhas), dono: EU, agora: AGORA, tipo: 'remocao', apesarDaPausa: true }).ok, true);
  // pausa com valor "nao" ou vencida não pausa
  assert.equal(T.pausado(mapa([{ chave: 'pausado', valor: 'nao' }]), AGORA), false);
  assert.equal(T.pausado(mapa([{ chave: 'pausado', valor: 'sim', expira_em: min(-1) }]), AGORA), false);
});

test('sem trava própria não publica; trava com menos de 5 min pede renovação', () => {
  assert.equal(T.podePublicar({ mapa: mapa([]), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK }).motivo, 'trava_nao_gravada');
  const quase = [{ chave: 'trava_deploy', valor: EU, expira_em: min(4) }];
  assert.equal(T.podePublicar({ mapa: mapa(quase), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK }).motivo, 'trava_quase_vencida');
});

test('teto de 3 deploys por hora, contando todos os donos, com janela móvel', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const tres = { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-50), min(-30), min(-5)]) };
  const r = T.podePublicar({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK });
  assert.equal(r.ok, false); assert.equal(r.motivo, 'teto_por_hora'); assert.equal(r.libera_em, min(10));
  // 11 minutos depois o mais antigo saiu da janela
  const trava2 = { chave: 'trava_deploy', valor: EU, expira_em: min(31) };
  assert.equal(T.podePublicar({ mapa: mapa([trava2, tres]), dono: EU, agora: AGORA + 11 * 60000, tipo: 'rascunho', portoes: PORTOES_OK }).ok, true);
  // registrar-deploy acrescenta e descarta o que tem mais de 60 min
  const g = T.registrarDeploy({ mapa: mapa([trava, { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-90), min(-10)]) }]), dono: EU, agora: AGORA });
  assert.equal(g.ok, true);
  assert.deepEqual(JSON.parse(g.gravar[0].valor), [min(-10), min(0)]);
  assert.equal(g.gravar[0].expira_em, min(60));
});

test('portões do site e ensaio_ok para cliente real', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const semCsp = Object.assign({}, PORTOES_OK, { csp: false });
  const r = T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'final', portoes: semCsp });
  assert.equal(r.motivo, 'portao'); assert.deepEqual(r.faltam, ['csp']);
  const real = T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'rascunho', clienteReal: true, portoes: PORTOES_OK });
  assert.deepEqual(real.faltam, ['ensaio_ok']);
  const comEnsaio = [trava, { chave: 'ensaio_ok', valor: '2026-11-11T20:00:00Z' }];
  assert.equal(T.podePublicar({ mapa: mapa(comEnsaio), dono: EU, agora: AGORA, tipo: 'rascunho', clienteReal: true, portoes: PORTOES_OK }).ok, true);
  // valor que não é data não vale como ensaio
  assert.equal(T.podePublicar({ mapa: mapa([trava, { chave: 'ensaio_ok', valor: 'sim' }]), dono: EU, agora: AGORA, tipo: 'final', clienteReal: true, portoes: PORTOES_OK }).ok, false);
  // vitrine exige qa e segurança
  assert.ok(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'vitrine', portoes: {} }).faltam.includes('seguranca'));
});

test('linhas duplicadas de trava_deploy bloqueiam a confirmação', () => {
  const linhas = [{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }, { chave: 'trava_deploy', valor: EU, expira_em: min(19) }];
  assert.equal(T.confirmar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).motivo, 'trava_duplicada');
});

test('linha de comando: códigos 0, 3 e 1, saída JSON e aceita {records:[...]} do MCP', () => {
  const dir = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'trava-'));
  try {
    const livre = path.join(dir, 'livre.json');
    fs.writeFileSync(livre, JSON.stringify({ records: [] }));
    const alheia = path.join(dir, 'alheia.json');
    fs.writeFileSync(alheia, JSON.stringify([{ chave: 'trava_deploy', valor: OUTRO, expira_em: min(10) }]));
    const rodar = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--agora', new Date(AGORA).toISOString()], { encoding: 'utf8' });
    const ok = rodar('pegar', '--dono', EU, '--estado', livre);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).gravar[0].valor, EU);
    const rec = rodar('pegar', '--dono', EU, '--estado', alheia);
    assert.equal(rec.status, 3);
    assert.equal(JSON.parse(rec.stdout).motivo, 'trava_alheia');
    assert.equal(rodar('pegar', '--dono', 'com espaço', '--estado', livre).status, 1);
    assert.equal(rodar('pegar', '--dono', EU).status, 1);
    assert.equal(rodar('pegar', '--dono', EU, '--estado', livre, '--ttl-min', '45').status, 1);
    assert.equal(rodar('voar', '--dono', EU, '--estado', livre).status, 1);
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', livre, '--tipo', 'qualquer').status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pegar e soltar trazem o update condicional do MCP (troca atômica na entidade Operacao)', () => {
  const p = T.pegar({ mapa: mapa([]), dono: EU, agora: AGORA });
  assert.equal(p.mcp.ferramenta, 'mcp__Base44__update_entities');
  assert.equal(p.mcp.entityName, 'Operacao');
  assert.equal(p.mcp.query.chave, 'trava_deploy');
  assert.deepEqual(p.mcp.query.$or, [{ valor: '' }, { valor: null }, { valor: EU }, { expira_em: { $lte: new Date(AGORA).toISOString() } }]);
  assert.deepEqual(p.mcp.data, { $set: { valor: EU, expira_em: min(20) } });
  const s = T.soltar({ mapa: mapa([{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }]), dono: EU, agora: AGORA });
  assert.deepEqual(s.mcp.query, { chave: 'trava_deploy', valor: EU });
});

test('tipo dados exige atualizar_vagas verde; remoção não exige portão de site', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  assert.deepEqual(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'dados', portoes: {} }).faltam, ['atualizar_vagas']);
  assert.equal(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'dados', portoes: { atualizar_vagas: true } }).ok, true);
  assert.equal(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'remocao' }).ok, true);
});
