// pacote.test.mjs · aplicar-pacote.mjs em cópias temporárias, nunca nos dados reais (Forja, backend, 20/11/2026).
// Rodar:  node --test 'projetos/itaitu-mapa/testes/*.test.mjs'   (o padrão entre aspas; a pasta sozinha falha no Node 22)
// As coordenadas das fixtures são fictícias e só valem aqui.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = join(RAIZ, 'projetos/itaitu-mapa/scripts/aplicar-pacote.mjs');
const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const REAL = { pontos: join(RAIZ, 'site/itaitu/dados/pontos.geojson'), trilhas: join(RAIZ, 'site/itaitu/dados/trilhas.geojson') };
const BBOX = [-40.60, -11.42, -40.40, -11.26];
const sha = (arq) => createHash('sha256').update(readFileSync(arq)).digest('hex');
const ler = (arq) => JSON.parse(readFileSync(arq, 'utf8'));

let hashReal, pasta;
before(() => {
  hashReal = { pontos: sha(REAL.pontos), trilhas: sha(REAL.trilhas) };
  pasta = mkdtempSync(join(tmpdir(), 'itaitu-pacote-'));
});
after(() => {
  rmSync(pasta, { recursive: true, force: true });
  // a trava principal: nenhum teste tocou nos dados reais
  assert.equal(sha(REAL.pontos), hashReal.pontos, 'pontos.geojson real mudou durante o teste');
  assert.equal(sha(REAL.trilhas), hashReal.trilhas, 'trilhas.geojson real mudou durante o teste');
});

let n = 0;
function copias() {
  const d = join(pasta, String(n++));
  const c = { pontos: `${d}-pontos.geojson`, trilhas: `${d}-trilhas.geojson` };
  copyFileSync(REAL.pontos, c.pontos); copyFileSync(REAL.trilhas, c.trilhas);
  // recorte inexistente: força o bbox padrão de Itaitu, mesmo se o devops criar o recorte.json depois
  c.recorte = `${d}-sem-recorte.json`;
  return c;
}
function rodar(fixture, c, ...extra) {
  const r = spawnSync(process.execPath, [SCRIPT, join(FIX, fixture), `--pontos=${c.pontos}`, `--trilhas=${c.trilhas}`, `--recorte=${c.recorte}`, ...extra], { encoding: 'utf8' });
  return { codigo: r.status, out: r.stdout, err: r.stderr, tudo: r.stdout + r.stderr };
}
const porId = (fc, id) => fc.features.find((f) => f.properties.id === id);

test('a fixture válida passa também no validador do exportador (js/marcos/pacote.js)', async () => {
  const { validarPacote } = await import(new URL('site/itaitu/js/marcos/pacote.js', `file://${RAIZ}`).href);
  const r = validarPacote(ler(join(FIX, 'pacote-valido.json')), BBOX);
  assert.deepEqual(r, { ok: true, erros: [] });
});

test('sem opção o modo é --simular: relatório sai e nada é escrito', () => {
  const c = copias();
  const antes = { p: sha(c.pontos), t: sha(c.trilhas) };
  const r = rodar('pacote-valido.json', c);
  assert.equal(r.codigo, 0, r.tudo);
  assert.match(r.out, /SIMULAR \(nada foi escrito\)/);
  assert.match(r.out, /Pontos novos \(1\)/);
  assert.match(r.out, /Pontos confirmados \(1\)/);
  assert.match(r.out, /Trilhas novas \(2\)/);
  assert.match(r.out, /fincada pela ACAGI/);
  assert.match(r.out, /Recusados \(0\)/);
  assert.equal(sha(c.pontos), antes.p); assert.equal(sha(c.trilhas), antes.t);
  const r2 = rodar('pacote-valido.json', c, '--simular');
  assert.equal(r2.codigo, 0); assert.equal(sha(c.pontos), antes.p);
});

test('--aplicar funde pontos e trilhas, preserva o resto e é idempotente', async () => {
  const c = copias();
  const pAntes = ler(c.pontos), tAntes = ler(c.trilhas);
  const r = rodar('pacote-valido.json', c, '--aplicar');
  assert.equal(r.codigo, 0, r.tudo);
  assert.match(r.out, /Gravado: .*pontos\.geojson.*trilhas\.geojson/);
  const p = ler(c.pontos), t = ler(c.trilhas);

  // mesmo formato dos arquivos do time de dados (indentação de 1 espaço e quebra no fim)
  assert.equal(readFileSync(c.pontos, 'utf8'), JSON.stringify(p, null, 1) + '\n');

  // ponto confirmado: geometria nova, confiança alta, fonte sem nome de pessoa, campos antigos preservados
  const velho = porId(pAntes, 'cachoeira-do-sossego'), novo = porId(p, 'cachoeira-do-sossego');
  assert.equal(velho.geometry, null);
  assert.deepEqual(novo.geometry, { type: 'Point', coordinates: [-40.5012345, -11.3801234] });
  assert.equal(novo.properties.confianca, 'alta');
  assert.equal(novo.properties.aproximado, false);
  assert.equal(novo.properties.fonte, 'GPS no local, 2026-11-20');
  assert.equal(novo.properties.fonte_anterior, velho.properties.fonte);
  assert.deepEqual(novo.properties.campo, { data: '2026-11-20', precisao_m: 6.5, n_amostras: 20, alt_m: 590 });
  assert.equal(novo.properties.sol_ajuste_min, -5, 'o ajuste da trilha fincada pela ACAGI vai para o destino');
  for (const k of Object.keys(velho.properties).filter((k) => !['confianca', 'aproximado', 'fonte', 'notas'].includes(k))) {
    assert.deepEqual(novo.properties[k], velho.properties[k], `campo ${k} mudou sem o pacote tocar nele`);
  }
  assert.ok(novo.properties.notas.startsWith(velho.properties.notas ?? ''), 'notas antigas preservadas');
  assert.match(novo.properties.notas, /Campo 2026-11-20: FIXTURE DE TESTE/);

  // ponto novo
  const porteira = porId(p, 'porteira-fixture-sossego');
  assert.ok(porteira);
  assert.equal(porteira.properties.tipo, 'infra');
  assert.equal(porteira.properties.grupo, 'fora-da-placa');
  assert.equal(porteira.properties.confianca, 'alta');
  assert.equal('alt_m' in porteira.properties.campo, false, 'alt_m null não vira 0');

  // o que o pacote não tocou fica idêntico
  for (const f of pAntes.features.filter((x) => x.properties.id !== 'cachoeira-do-sossego')) assert.deepEqual(porId(p, f.properties.id), f);
  for (const f of tAntes.features) assert.deepEqual(porId(t, f.properties.id), f);
  assert.equal(p.features.length, pAntes.features.length + 1);
  assert.equal(t.features.length, tAntes.features.length + 2);

  // trilhas: fincada pela ACAGI leva autor e ajuste; a outra não leva
  const acagi = porId(t, 'pe-sossego-2026-11-20');
  assert.equal(acagi.geometry.type, 'LineString');
  assert.equal(acagi.geometry.coordinates.length, 5);
  assert.equal(acagi.properties.autor, 'ACAGI');
  assert.equal(acagi.properties.fincada_por, 'ACAGI');
  assert.equal(acagi.properties.sol_ajuste_min, -5);
  assert.equal(acagi.properties.destino_id, 'cachoeira-do-sossego');
  assert.equal(acagi.properties.alt_ini_m, 540); assert.equal(acagi.properties.alt_fim_m, 590);
  const outra = porId(t, 'pe-arapongas-2026-11-20');
  assert.equal(outra.properties.autor, 'GPS em campo');
  assert.equal('fincada_por' in outra.properties, false);
  assert.equal('sol_ajuste_min' in outra.properties, false);
  assert.equal('sol_ajuste_min' in porId(p, 'cachoeira-das-arapongas').properties, false, 'trilha sem ajuste não mexe no destino');

  // o app lê o resultado: o Sossego vira confirmado com hora de sol
  const { enriquecer } = await import(new URL('site/itaitu/js/dados.js', `file://${RAIZ}`).href);
  const info = console.info; console.info = () => {};
  try {
    const e = enriquecer(p);
    const s = porId(e, 'cachoeira-do-sossego').properties;
    assert.equal(s._estado, 'confirmada'); assert.equal(s._hora_de_sol, true);
  } finally { console.info = info; }

  // idempotente: aplicar de novo não muda um byte
  const h = { p: sha(c.pontos), t: sha(c.trilhas) };
  const r2 = rodar('pacote-valido.json', c, '--aplicar');
  assert.equal(r2.codigo, 0, r2.tudo);
  assert.match(r2.out, /Já aplicados, sem mudança \(4\)/);
  assert.match(r2.out, /Gravado: nada/);
  assert.equal(sha(c.pontos), h.p); assert.equal(sha(c.trilhas), h.t);
});

test('--json devolve o relatório para máquina', () => {
  const c = copias();
  const r = rodar('pacote-valido.json', c, '--json');
  assert.equal(r.codigo, 0, r.tudo);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true); assert.equal(j.modo, 'simular');
  assert.deepEqual(j.pontosNovos.map((x) => x.id), ['porteira-fixture-sossego']);
  assert.deepEqual(j.pontosConfirmados.map((x) => x.id), ['cachoeira-do-sossego']);
  assert.deepEqual(j.trilhasNovas.map((x) => x.id), ['pe-sossego-2026-11-20', 'pe-arapongas-2026-11-20']);
  assert.deepEqual(j.rejeitados, []);
});

// [fixture, código de saída, motivos esperados]
const INVALIDOS = [
  ['invalido-versao.json', 1, [/versão desconhecida: 2/]],
  ['invalido-formato.json', 1, [/formato desconhecido/]],
  ['invalido-nao-e-json.json', 1, [/não é JSON válido/]],
  ['invalido-fora-do-recorte.json', 3, [/ponto cachoeira-do-sossego: coordenada \[-40\.7000001, -11\.3801234\] fora do recorte/, /trilha pe-sossego-2026-11-20: coordenada .* fora do recorte/]],
  ['invalido-precisao.json', 3, [/precisão 51 m pior que 30 m/, /precisão 31 m pior que 30 m/, /9 amostras de GPS \(mínimo 10\)/]],
  ['invalido-ids-duplicados.json', 3, [/ponto cachoeira-do-sossego: id repetido no pacote/, /trilha pe-sossego-2026-11-20: id repetido no pacote/]],
  ['invalido-geometria.json', 3, [/cachoeira-do-sossego: geometria inválida/, /cachoeira-do-pianco: geometria inválida/, /menos de 2 coordenadas/, /coordenada malformada/]],
  ['invalido-acao.json', 3, [/não existe em pontos\.geojson \(use "novo"\)/, /já existe em pontos\.geojson \(use "confirmar"\)/, /pe-veu-da-noiva-1: id já existe em trilhas\.geojson/]],
];
for (const [fixture, codigo, motivos] of INVALIDOS) {
  test(`recusa ${fixture} com motivo e não escreve nada, nem com --aplicar`, () => {
    const c = copias();
    const antes = { p: sha(c.pontos), t: sha(c.trilhas) };
    const r = rodar(fixture, c, '--aplicar');
    assert.equal(r.codigo, codigo, r.tudo);
    for (const m of motivos) assert.match(r.tudo, m);
    if (codigo === 3) assert.match(r.out, /Pontos novos \(0\)[\s\S]*Pontos confirmados \(0\)[\s\S]*Trilhas novas \(0\)/);
    assert.equal(sha(c.pontos), antes.p, 'pontos mudou'); assert.equal(sha(c.trilhas), antes.t, 'trilhas mudou');
  });
}

test('uso errado devolve 2 e não lê nada', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--simular', '--aplicar', 'x.json'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  const r2 = spawnSync(process.execPath, [SCRIPT, join(FIX, 'pacote-valido.json'), '--apagar-tudo'], { encoding: 'utf8' });
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /opção desconhecida/);
});
