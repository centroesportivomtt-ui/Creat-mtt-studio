/*
 * Porta Aberta · testes da trava de publicação (scripts/trava-deploy.cjs, pacote 1D).
 * Roda com: npm test
 * Cobre: pegar, renovar, confirmar, soltar, TTL (vencida = livre), recusa com trava alheia, parada geral,
 * teto de 3 deploys por hora, portões do site, ensaio_ok exigido por padrão (o ensaio só com --ensaio e o
 * pedido aberto pelo coordenador), pausa com linhas repetidas nas duas ordens, a linha de comando e a
 * decisão D4 (10/11/2026): remoção fora do teto e registrada à parte; rollback sem esperar o teto; e o fecho 2 do F2:
 * remoção só com --pedido, Operacao remocao_pedido:<id> e o portão so_remocao; rollback só com checkpoint_anterior;
 * teto próprio de 6 por hora para os dois; --apesar-da-pausa só com Operacao pausa_excecao do mesmo pedido.
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
const ENSAIO_OK = { chave: 'ensaio_ok', valor: '2026-11-09T20:00:00Z' };
const PEDIDO_TESTE = 'PA-TESTERLS01';
// fecho 2 do F2: a remoção só vale com o pedido de remoção gravado e com o diff que só apaga; o rollback, com o checkpoint já publicado
const REMOCAO_PEDIDO = { chave: `remocao_pedido:${PEDIDO_TESTE}`, valor: '2026-11-10T14:00:00Z', expira_em: '2026-11-17T14:00:00.000Z' };
const PORTAO_REMOCAO = { so_remocao: true };
const PORTAO_ROLLBACK = { checkpoint_anterior: true };
const PAUSA_EXCECAO = { chave: 'pausa_excecao', valor: PEDIDO_TESTE, expira_em: '2026-11-10T16:00:00.000Z' };
const remocao = (extra) => Object.assign({ tipo: 'remocao', pedido: PEDIDO_TESTE, portoes: PORTAO_REMOCAO }, extra || {});

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
  const comRemocao = linhas.concat([REMOCAO_PEDIDO]);
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa(comRemocao), dono: EU, agora: AGORA }, remocao())).motivo, 'pausado');
  // fecho 2: a chave --apesar-da-pausa sozinha não basta; precisa da exceção do coordenador para o mesmo pedido
  const so = T.podePublicar(Object.assign({ mapa: mapa(comRemocao), dono: EU, agora: AGORA }, remocao({ apesarDaPausa: true })));
  assert.equal(so.motivo, 'pausado'); assert.equal(so.falta, 'pausa_excecao');
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa(comRemocao.concat([PAUSA_EXCECAO])), dono: EU, agora: AGORA }, remocao({ apesarDaPausa: true }))).ok, true);
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
  assert.equal(T.podePublicar({ mapa: mapa([trava2, tres, ENSAIO_OK]), dono: EU, agora: AGORA + 11 * 60000, tipo: 'rascunho', portoes: PORTOES_OK }).ok, true);
  // registrar-deploy acrescenta e descarta o que tem mais de 60 min
  const g = T.registrarDeploy({ mapa: mapa([trava, { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-90), min(-10)]) }]), dono: EU, agora: AGORA });
  assert.equal(g.ok, true);
  assert.deepEqual(JSON.parse(g.gravar[0].valor), [min(-10), min(0)]);
  assert.equal(g.gravar[0].expira_em, min(60));
});

test('portões do site; ensaio_ok exigido por PADRÃO em rascunho e final (sem opt-in)', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const semCsp = Object.assign({}, PORTOES_OK, { csp: false });
  const r = T.podePublicar({ mapa: mapa([trava, ENSAIO_OK]), dono: EU, agora: AGORA, tipo: 'final', portoes: semCsp });
  assert.equal(r.motivo, 'portao'); assert.deepEqual(r.faltam, ['csp']);
  // sem flag nenhuma, rascunho e final sem ensaio_ok são recusados (antes saía ok:true)
  for (const tipo of ['rascunho', 'final']) {
    const sem = T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo, portoes: PORTOES_OK });
    assert.equal(sem.ok, false); assert.deepEqual(sem.faltam, ['ensaio_ok']);
    assert.equal(T.podePublicar({ mapa: mapa([trava, ENSAIO_OK]), dono: EU, agora: AGORA, tipo, portoes: PORTOES_OK }).ok, true);
  }
  // valor que não é data, ou ensaio_ok vencido, não vale
  assert.equal(T.podePublicar({ mapa: mapa([trava, { chave: 'ensaio_ok', valor: 'sim' }]), dono: EU, agora: AGORA, tipo: 'final', portoes: PORTOES_OK }).ok, false);
  assert.equal(T.podePublicar({ mapa: mapa([trava, { chave: 'ensaio_ok', valor: '2026-11-09T20:00:00Z', expira_em: min(-1) }]), dono: EU, agora: AGORA, tipo: 'final', portoes: PORTOES_OK }).ok, false);
  // remoção e dados não dependem do ensaio (a remoção tem os portões dela: pedido de remoção e so_remocao)
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([trava, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).ok, true);
  // vitrine exige qa e segurança
  assert.ok(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'vitrine', portoes: {} }).faltam.includes('seguranca'));
});

test('--ensaio só dispensa ensaio_ok com Operacao.ensaio_pedido vigente, com validade e do mesmo pedido', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const aberto = { chave: 'ensaio_pedido', valor: PEDIDO_TESTE, expira_em: min(240) };
  const pp = (linhas, extra) => T.podePublicar(Object.assign({ mapa: mapa(linhas), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK, ensaio: true, pedido: PEDIDO_TESTE }, extra));
  const ok = pp([trava, aberto]);
  assert.equal(ok.ok, true); assert.equal(ok.ensaio, true);
  assert.equal(pp([trava, aberto], { tipo: 'final' }).ok, true);
  assert.deepEqual(pp([trava]).faltam, ['ensaio_nao_aberto']);
  assert.deepEqual(pp([trava, Object.assign({}, aberto, { expira_em: undefined })]).faltam, ['ensaio_nao_aberto']);
  assert.deepEqual(pp([trava, Object.assign({}, aberto, { expira_em: min(-1) })]).faltam, ['ensaio_nao_aberto']);
  assert.deepEqual(pp([trava, aberto], { pedido: 'PA-OUTRO00001' }).faltam, ['ensaio_outro_pedido']);
  assert.deepEqual(pp([trava, aberto], { pedido: undefined }).faltam, ['ensaio_sem_pedido']);
  assert.deepEqual(pp([trava, aberto, Object.assign({}, aberto)]).faltam, ['ensaio_duplicado']);
});

test('pausa com linhas repetidas: basta UMA ligada, nas duas ordens, com espaço e maiúscula', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const ligada = { chave: 'pausado', valor: ' PAUSADO' };
  const vazia = { chave: 'pausado', valor: '' };
  for (const linhas of [[trava, ligada, vazia], [trava, vazia, ligada], [{ chave: 'trava_deploy', valor: '' }, ligada, vazia]]) {
    assert.equal(T.pausado(mapa(linhas), AGORA), true);
    assert.equal(T.pegar({ mapa: mapa(linhas), dono: EU, agora: AGORA }).motivo, 'pausado');
    assert.equal(T.podePublicar({ mapa: mapa(linhas.concat([ENSAIO_OK])), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK }).motivo, 'pausado');
  }
  // a mesma coisa com updated_date que faria a linha vazia "vencer" no mapa
  const datadas = [Object.assign({}, ligada, { updated_date: '2026-11-10T10:00:00Z' }), Object.assign({}, vazia, { updated_date: '2026-11-10T14:00:00Z' })];
  assert.equal(T.pausado(mapa(datadas), AGORA), true);
  assert.equal(T.pausado(mapa([{ chave: 'pausado', valor: 'Sim ' }]), AGORA), true);
  // duas linhas desligadas, ou a ligada vencida: não pausa
  assert.equal(T.pausado(mapa([vazia, { chave: 'pausado', valor: 'nao' }]), AGORA), false);
  assert.equal(T.pausado(mapa([Object.assign({}, ligada, { expira_em: min(-1) }), vazia]), AGORA), false);
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
    // padrão fechado pela linha de comando: trava própria e 4 portões verdes, sem flag nenhuma = recusa por ensaio_ok
    const minha = path.join(dir, 'minha.json');
    fs.writeFileSync(minha, JSON.stringify([{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }]));
    const portoes = path.join(dir, 'portoes.json');
    fs.writeFileSync(portoes, JSON.stringify(PORTOES_OK));
    const semFlag = rodar('pode-publicar', '--dono', EU, '--estado', minha, '--tipo', 'rascunho', '--portoes', portoes);
    assert.equal(semFlag.status, 3);
    assert.deepEqual(JSON.parse(semFlag.stdout).faltam, ['ensaio_ok']);
    // --cliente-real virou nada: o resultado é o mesmo
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', minha, '--tipo', 'rascunho', '--portoes', portoes, '--cliente-real').status, 3);
    // chave booleana com valor solto é recusada (antes "--cliente-real sim" engolia o valor e a flag deixava de valer)
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', minha, '--tipo', 'rascunho', '--portoes', portoes, '--cliente-real', 'sim').status, 1);
    assert.equal(rodar('pode-publicar', '--ensaio', 'sim', '--dono', EU, '--estado', minha, '--tipo', 'rascunho', '--portoes', portoes, '--pedido', PEDIDO_TESTE).status, 1);
    // --ensaio sem --pedido: entrada inválida; com o pedido aberto pelo coordenador: liberado
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', minha, '--tipo', 'rascunho', '--portoes', portoes, '--ensaio').status, 1);
    const ensaio = path.join(dir, 'ensaio.json');
    fs.writeFileSync(ensaio, JSON.stringify([{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }, { chave: 'ensaio_pedido', valor: PEDIDO_TESTE, expira_em: min(240) }]));
    const comEnsaio = rodar('pode-publicar', '--dono', EU, '--estado', ensaio, '--tipo', 'rascunho', '--portoes', portoes, '--ensaio', '--pedido', PEDIDO_TESTE);
    assert.equal(comEnsaio.status, 0, comEnsaio.stdout);
    // pausa duplicada pela linha de comando (o caso reproduzido pela conferência): pegar recusa
    const dup = path.join(dir, 'dup.json');
    fs.writeFileSync(dup, JSON.stringify([{ chave: 'trava_deploy', valor: '' }, { chave: 'pausado', valor: ' PAUSADO' }, { chave: 'pausado', valor: '' }]));
    const p = rodar('pegar', '--dono', 'executor:2026-11-10T11:41', '--estado', dup);
    assert.equal(p.status, 3); assert.equal(JSON.parse(p.stdout).motivo, 'pausado');
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

test('tipo dados exige atualizar_vagas verde; remoção não exige portão de site, mas exige o dela', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  assert.deepEqual(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'dados', portoes: {} }).faltam, ['atualizar_vagas']);
  assert.equal(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'dados', portoes: { atualizar_vagas: true } }).ok, true);
  assert.deepEqual(T.podePublicar({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'remocao' }).faltam, ['pedido', 'so_remocao']);
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([trava, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).ok, true);
});

/* ---------- D4 (decidida pelo coordenador em 10/11/2026): remoção fora do teto; rollback não espera ---------- */
test('D4: --tipo remocao não espera o teto de 3 por hora, mas continua exigindo a trava própria', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const tres = { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-50), min(-30), min(-5)]) };
  // rascunho com o teto cheio espera; remoção com o mesmo estado passa
  assert.equal(T.podePublicar({ mapa: mapa([trava, tres, ENSAIO_OK]), dono: EU, agora: AGORA, tipo: 'rascunho', portoes: PORTOES_OK }).motivo, 'teto_por_hora');
  const r = T.podePublicar(Object.assign({ mapa: mapa([trava, tres, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao()));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.fora_do_teto, true); assert.equal(r.teto_ignorado, true); assert.equal(r.deploys_na_hora, 3); assert.equal(r.teto_fora, 6);
  // sem trava, com trava alheia ou quase vencida: recusa, como qualquer deploy
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([tres, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).motivo, 'trava_nao_gravada');
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([{ chave: 'trava_deploy', valor: OUTRO, expira_em: min(20) }, tres, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).motivo, 'trava_alheia');
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([{ chave: 'trava_deploy', valor: EU, expira_em: min(3) }, tres, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).motivo, 'trava_quase_vencida');
  // pausa: continua só com --apesar-da-pausa e a exceção do coordenador
  const pausa = { chave: 'pausado', valor: 'sim' };
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([trava, tres, pausa, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao())).motivo, 'pausado');
  assert.equal(T.podePublicar(Object.assign({ mapa: mapa([trava, tres, pausa, REMOCAO_PEDIDO, PAUSA_EXCECAO]), dono: EU, agora: AGORA }, remocao({ apesarDaPausa: true }))).ok, true);
});

test('fecho 2: o tipo remocao não é só uma etiqueta: exige --pedido, Operacao remocao_pedido:<id> vigente e o portão so_remocao', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const tres = { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-50), min(-30), min(-5)]) };
  // o ataque da conferência: teto cheio, sem ensaio_ok, sem portão, sem pedido, com a etiqueta remocao
  const r = T.podePublicar({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'remocao' });
  assert.equal(r.ok, false); assert.equal(r.motivo, 'portao'); assert.deepEqual(r.faltam, ['pedido', 'so_remocao']);
  // pedido no formato, mas sem a linha de remoção gravada por quem marcou a desistência
  assert.deepEqual(T.podePublicar(Object.assign({ mapa: mapa([trava]), dono: EU, agora: AGORA }, remocao())).faltam, ['remocao_pedido']);
  // linha sem validade, vencida, repetida ou de outro pedido: não vale
  for (const l of [[{ chave: REMOCAO_PEDIDO.chave, valor: 'x' }], [Object.assign({}, REMOCAO_PEDIDO, { expira_em: min(-1) })], [REMOCAO_PEDIDO, REMOCAO_PEDIDO], [{ chave: 'remocao_pedido:PA-OUTROPED01', valor: 'x', expira_em: min(60) }]])
    assert.deepEqual(T.podePublicar(Object.assign({ mapa: mapa([trava, ...l]), dono: EU, agora: AGORA }, remocao())).faltam, ['remocao_pedido'], JSON.stringify(l));
  // o diff que não só apaga (so_remocao falso ou ausente) não sai como remoção
  assert.deepEqual(T.podePublicar(Object.assign({ mapa: mapa([trava, REMOCAO_PEDIDO]), dono: EU, agora: AGORA }, remocao({ portoes: { so_remocao: false } }))).faltam, ['so_remocao']);
  // rollback exige o checkpoint já publicado
  assert.deepEqual(T.podePublicar({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'rollback' }).faltam, ['checkpoint_anterior']);
  assert.equal(T.podePublicar({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK }).ok, true);
  // registrar-deploy --tipo remocao: sem pedido ou sem a linha, não registra (e nada vai para a outra lista)
  assert.equal(T.registrarDeploy({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'remocao' }).motivo, 'pedido');
  assert.equal(T.registrarDeploy({ mapa: mapa([trava]), dono: EU, agora: AGORA, tipo: 'remocao', pedido: 'PA-XXXXXXXXXX' }).motivo, 'remocao_pedido');
});

test('fecho 2: remoção e rollback somados têm teto próprio de 6 por hora; cada um vira uma linha (registro falso não apaga o verdadeiro)', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  let linhas = [trava, REMOCAO_PEDIDO];
  for (let i = 0; i < 6; i++) {
    const t = AGORA + i * 60000;
    const p = T.podePublicar(Object.assign({ mapa: mapa(linhas), dono: EU, agora: t }, i % 2 ? { tipo: 'rollback', portoes: PORTAO_ROLLBACK, pedido: PEDIDO_TESTE } : remocao()));
    assert.equal(p.ok, true, `${i}: ${JSON.stringify(p)}`); assert.equal(p.deploys_fora_na_hora, i);
    const g = T.registrarDeploy({ mapa: mapa(linhas), dono: EU, agora: t, tipo: i % 2 ? 'rollback' : 'remocao', pedido: PEDIDO_TESTE });
    assert.equal(g.ok, true, JSON.stringify(g));
    linhas = aplicar(linhas, g.gravar);
  }
  const cheio = T.podePublicar(Object.assign({ mapa: mapa(linhas), dono: EU, agora: AGORA + 6 * 60000 }, remocao()));
  assert.equal(cheio.ok, false); assert.equal(cheio.motivo, 'teto_fora_por_hora'); assert.equal(cheio.deploys_fora_na_hora, 6); assert.equal(cheio.libera_em, min(60));
  assert.equal(T.podePublicar({ mapa: mapa(linhas), dono: EU, agora: AGORA + 6 * 60000, tipo: 'rollback', portoes: PORTAO_ROLLBACK }).motivo, 'teto_fora_por_hora');
  // uma hora depois da primeira, abre uma vaga (com a trava renovada)
  const renovada = aplicar(linhas, [{ chave: 'trava_deploy', valor: EU, expira_em: min(81) }]);
  const depois = T.podePublicar(Object.assign({ mapa: mapa(renovada), dono: EU, agora: AGORA + 61 * 60000 }, remocao()));
  assert.equal(depois.ok, true, JSON.stringify(depois)); assert.equal(depois.deploys_fora_na_hora, 4, "saíram os de 0 e 1 min (a janela é aberta no começo)");
  // as 6 linhas existem, cada uma com chave própria, e ficam 400 dias
  const fora = linhas.filter((l) => l.chave.startsWith('deploy_fora:'));
  assert.equal(fora.length, 6);
  assert.equal(new Set(fora.map((l) => l.chave)).size, 6);
  assert.deepEqual(JSON.parse(fora[0].valor), { em: min(0), tipo: 'remocao', pedido: PEDIDO_TESTE, dono: EU });
  assert.equal(Date.parse(fora[0].expira_em), AGORA + 400 * 24 * 3600 * 1000);
  // a lista antiga deploys_remocao continua contando no teto próprio (só lida); linha ilegível conta como recente
  const antiga = { chave: 'deploys_remocao', valor: JSON.stringify([{ em: min(-10), pedido: PEDIDO_TESTE }]) };
  assert.equal(T.deploysFora(mapa([antiga, { chave: 'deploy_fora:remocao:x:y', valor: '{quebrado' }]), AGORA).length, 2);
});

test('D4: registrar-deploy --tipo remocao não conta no teto comum e grava a remoção à parte, para auditoria', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const dois = { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-30), min(-5)]) };
  const g = T.registrarDeploy({ mapa: mapa([trava, dois, REMOCAO_PEDIDO]), dono: EU, agora: AGORA, tipo: 'remocao', pedido: PEDIDO_TESTE });
  assert.equal(g.ok, true);
  assert.deepEqual(g.gravar.map((x) => x.chave), [`deploy_fora:remocao:${PEDIDO_TESTE}:${min(0)}`], 'deploys_ultima_hora não muda');
  // depois da remoção, o próximo deploy comum ainda vê só os 2 de antes: a remoção não tomou vaga
  const linhas = aplicar([trava, dois, ENSAIO_OK, REMOCAO_PEDIDO], g.gravar);
  const r = T.podePublicar({ mapa: mapa(linhas), dono: EU, agora: AGORA + 60000, tipo: 'rascunho', portoes: PORTOES_OK });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.deploys_na_hora, 2);
  // sem --tipo, ou com outro tipo, segue contando no teto como antes
  assert.deepEqual(T.registrarDeploy({ mapa: mapa([trava, dois]), dono: EU, agora: AGORA, tipo: 'final' }).gravar.map((x) => x.chave), ['deploys_ultima_hora']);
  assert.throws(() => T.podePublicar(Object.assign({ mapa: mapa([trava, REMOCAO_PEDIDO, { chave: 'deploys_remocao', valor: '{quebrado' }]), dono: EU, agora: AGORA }, remocao())), /deploys_remocao/);
  // sem trava própria não registra
  assert.equal(T.registrarDeploy({ mapa: mapa([dois, REMOCAO_PEDIDO]), dono: EU, agora: AGORA, tipo: 'remocao', pedido: PEDIDO_TESTE }).ok, false);
});

test('D4: rollback (P8) não espera o teto comum, conta na hora e fica registrado; pausa só com --apesar-da-pausa e a exceção', () => {
  const trava = { chave: 'trava_deploy', valor: EU, expira_em: min(20) };
  const tres = { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-50), min(-30), min(-5)]) };
  const r = T.podePublicar({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.teto_ignorado, true);
  const g = T.registrarDeploy({ mapa: mapa([trava, tres]), dono: EU, agora: AGORA, tipo: 'rollback' });
  assert.deepEqual(g.gravar.map((x) => x.chave), ['deploys_ultima_hora', `deploy_fora:rollback:sem-pedido:${min(0)}`]);
  assert.equal(JSON.parse(g.gravar[0].valor).length, 4, 'o rollback entra na conta: os deploys seguintes esperam');
  const pausa = { chave: 'pausado', valor: 'sim' };
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK }).motivo, 'pausado');
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK, apesarDaPausa: true }).falta, 'pausa_excecao_sem_pedido');
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa, PAUSA_EXCECAO]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK, apesarDaPausa: true, pedido: 'PA-OUTROPED01' }).falta, 'pausa_excecao_outro_pedido');
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa, Object.assign({}, PAUSA_EXCECAO, { expira_em: min(-1) })]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK, apesarDaPausa: true, pedido: PEDIDO_TESTE }).falta, 'pausa_excecao');
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa, PAUSA_EXCECAO]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK, apesarDaPausa: true, pedido: PEDIDO_TESTE }).ok, true);
  // a exceção nunca vale para os tipos comuns
  assert.equal(T.podePublicar({ mapa: mapa([trava, pausa, PAUSA_EXCECAO, ENSAIO_OK]), dono: EU, agora: AGORA, tipo: 'final', portoes: PORTOES_OK, apesarDaPausa: true, pedido: PEDIDO_TESTE }).motivo, 'pausado');
  assert.equal(T.podePublicar({ mapa: mapa([]), dono: EU, agora: AGORA, tipo: 'rollback', portoes: PORTAO_ROLLBACK }).motivo, 'trava_nao_gravada');
});

test('D4 e fecho 2 pela linha de comando: o ataque da conferência (remocao sem pedido) sai 3; a remoção autorizada com teto cheio sai 0; registrar-deploy sem pedido sai 3', () => {
  const dir = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'trava-d4-'));
  try {
    const linhas = [{ chave: 'trava_deploy', valor: EU, expira_em: min(20) }, { chave: 'deploys_ultima_hora', valor: JSON.stringify([min(-50), min(-30), min(-5)]) }];
    const cheio = path.join(dir, 'cheio.json');
    fs.writeFileSync(cheio, JSON.stringify({ records: linhas }));
    const autorizado = path.join(dir, 'autorizado.json');
    fs.writeFileSync(autorizado, JSON.stringify({ records: linhas.concat([REMOCAO_PEDIDO, { chave: 'pausado', valor: 'sim' }]) }));
    const semPausa = path.join(dir, 'sem-pausa.json');
    fs.writeFileSync(semPausa, JSON.stringify({ records: linhas.concat([REMOCAO_PEDIDO]) }));
    const pr = path.join(dir, 'portoes-remocao.json'); fs.writeFileSync(pr, JSON.stringify(PORTAO_REMOCAO));
    const pb = path.join(dir, 'portoes-rollback.json'); fs.writeFileSync(pb, JSON.stringify(PORTAO_ROLLBACK));
    const rodar = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--agora', new Date(AGORA).toISOString()], { encoding: 'utf8' });
    const rasc = rodar('pode-publicar', '--dono', EU, '--estado', cheio, '--tipo', 'final');
    assert.equal(rasc.status, 3); assert.equal(JSON.parse(rasc.stdout).motivo, 'teto_por_hora');
    // o ataque: --tipo remocao sem --pedido e sem --portoes
    const ataque = rodar('pode-publicar', '--dono', EU, '--estado', cheio, '--tipo', 'remocao');
    assert.equal(ataque.status, 3, ataque.stdout); assert.deepEqual(JSON.parse(ataque.stdout).faltam, ['pedido', 'so_remocao']);
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', cheio, '--tipo', 'rollback').status, 3, 'rollback sem checkpoint_anterior');
    const rem = rodar('pode-publicar', '--dono', EU, '--estado', semPausa, '--tipo', 'remocao', '--pedido', PEDIDO_TESTE, '--portoes', pr);
    assert.equal(rem.status, 0, rem.stdout); assert.equal(JSON.parse(rem.stdout).fora_do_teto, true);
    assert.equal(rodar('pode-publicar', '--dono', EU, '--estado', cheio, '--tipo', 'rollback', '--portoes', pb).status, 0);
    // pausa ligada: --apesar-da-pausa sem pausa_excecao sai 3
    const pausa = rodar('pode-publicar', '--dono', EU, '--estado', autorizado, '--tipo', 'remocao', '--pedido', PEDIDO_TESTE, '--portoes', pr, '--apesar-da-pausa');
    assert.equal(pausa.status, 3, pausa.stdout); assert.equal(JSON.parse(pausa.stdout).falta, 'pausa_excecao');
    // registrar-deploy --tipo remocao: sem pedido sai 3; com pedido inexistente sai 3; autorizado grava a linha própria
    assert.equal(rodar('registrar-deploy', '--dono', EU, '--estado', cheio, '--tipo', 'remocao').status, 3);
    assert.equal(rodar('registrar-deploy', '--dono', EU, '--estado', cheio, '--tipo', 'remocao', '--pedido', 'PA-XXXXXXXXXX').status, 3);
    const reg = rodar('registrar-deploy', '--dono', EU, '--estado', semPausa, '--tipo', 'remocao', '--pedido', PEDIDO_TESTE);
    assert.equal(reg.status, 0, reg.stdout);
    assert.deepEqual(JSON.parse(reg.stdout).gravar.map((x) => x.chave), [`deploy_fora:remocao:${PEDIDO_TESTE}:${min(0)}`]);
    assert.equal(rodar('registrar-deploy', '--dono', EU, '--estado', cheio, '--tipo', 'qualquer').status, 1);
    assert.deepEqual(JSON.parse(rodar('registrar-deploy', '--dono', EU, '--estado', cheio).stdout).gravar.map((x) => x.chave), ['deploys_ultima_hora'], 'sem --tipo, como antes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
