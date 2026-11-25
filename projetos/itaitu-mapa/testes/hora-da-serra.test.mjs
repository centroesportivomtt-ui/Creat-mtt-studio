// hora-da-serra.test.mjs · a prova da Hora da Serra (Forja, backend, 20/11/2026).
// Um cálculo independente (testes/referencia.mjs, porte do hora_da_serra.py) recalcula as horas e confere o motor
// do app (site/itaitu/js/motor/nucleo.js), as regras de exibição e as notas de honestidade.
// Rodar:  node --test 'projetos/itaitu-mapa/testes/*.test.mjs'   (o padrão entre aspas; a pasta sozinha falha no Node 22)
// Node 22, só módulos nativos. Não escreve nada em disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as ref from './referencia.mjs';
import { lerPNG } from './png.mjs';

const RAIZ = fileURLToPath(new URL('../../../site/itaitu/', import.meta.url));
const PASTA_DEM = join(RAIZ, 'tiles/dem/12');
const DATA = '2026-11-20';
const OUTRAS_DATAS = ['2027-06-21', '2027-09-22'];       // as do protótipo
const TOL = 10;                                          // ±10 min: critério de aceite (1). Nunca afrouxar.
const ALVO = { 'cachoeira-veu-da-noiva': 16 * 60 + 7, 'cachoeira-das-arapongas': 15 * 60 + 40 };

const N = await import(new URL('js/motor/nucleo.js', `file://${RAIZ}`).href);
const pontos = JSON.parse(readFileSync(join(RAIZ, 'dados/pontos.geojson'), 'utf8'));

// Estado pela regra da ARQUITETURA 6.1, escrito aqui à parte do dados.js do app.
function estadoDe(f) {
  const p = f.properties || {};
  if (f.geometry == null) return 'sem-coordenada';
  return ['alta', 'media'].includes(p.confianca) && p.aproximado !== true ? 'confirmada' : 'aproximada';
}
const temHoraDeSol = (f) => estadoDe(f) === 'confirmada' && ['cachoeira', 'poco'].includes(f.properties.tipo);
const confirmadas = pontos.features.filter((f) => estadoDe(f) === 'confirmada');
const comHora = pontos.features.filter(temHoraDeSol);
const porId = (id) => pontos.features.find((f) => f.properties.id === id);
const minutosDe = (txt) => { const [h, m] = txt.split(':').map(Number); return h * 60 + m; };

// ------------------------------------------------------------------ as duas grades (cada lado com seu decodificador)
const REL = ref.carregarRelevo(PASTA_DEM);
function gradeDoApp() {
  const tiles = [];
  for (const x of readdirSync(PASTA_DEM).filter((n) => /^\d+$/.test(n))) {
    for (const arq of readdirSync(join(PASTA_DEM, x)).filter((n) => n.endsWith('.png'))) {
      const { rgba } = N.decodificarPNG(readFileSync(join(PASTA_DEM, x, arq)), (z) => new Uint8Array(inflateSync(z)));
      tiles.push({ x: Number(x), y: Number(arq.slice(0, -4)), rgba });
    }
  }
  return N.gradeDeTiles(12, tiles);
}
const G = gradeDoApp();

// cache: um horizonte por ponto em cada lado
const cache = new Map();
function calcular(f) {
  const id = f.properties.id;
  if (cache.has(id)) return cache.get(id);
  const [lon, lat] = f.geometry.coordinates;
  const hRef = ref.horizonte(REL, lon, lat);
  const perfilApp = N.horizonte(G, lon, lat);
  const r = { lon, lat, hRef, perfilApp, porData: {} };
  for (const data of [DATA, ...OUTRAS_DATAS]) {
    r.porData[data] = {
      ref: hRef ? { ...ref.dia(lon, lat, hRef.perfil, data), escureceMin: ref.crepusculoCivil(data, lat, lon) } : null,
      app: N.horasDeSol(G, { lon, lat }, data, { perfil: perfilApp }),
    };
  }
  cache.set(id, r);
  return r;
}

// ------------------------------------------------------------------ 0. as duas leituras do relevo concordam
test('os dois decodificadores de PNG leem o mesmo relevo (grade 3x3 z12)', () => {
  assert.equal(G.w, REL.W); assert.equal(G.h, REL.H);
  assert.equal(G.x0, REL.X0); assert.equal(G.y0, REL.Y0);
  let maxDif = 0;
  for (let i = 0; i < REL.elev.length; i++) maxDif = Math.max(maxDif, Math.abs(REL.elev[i] - G.dados[i]));
  // Float32 do app contra Float64 daqui: a diferença tem de ser só de arredondamento (< 1 cm)
  assert.ok(maxDif < 0.01, `diferença máxima de altitude ${maxDif} m`);
  const um = lerPNG(join(PASTA_DEM, String(REL.X0), `${REL.Y0}.png`));
  assert.equal(um.largura, 256); assert.equal(um.altura, 256);
});

// ------------------------------------------------------------------ (a) a referência acerta o alvo
test(`(a) a referência dá Véu ~16:07 e Arapongas ~15:40 em ${DATA}, dentro de ±${TOL} min`, () => {
  for (const [id, alvo] of Object.entries(ALVO)) {
    const f = porId(id);
    assert.ok(f && f.geometry, `${id} sem coordenada em pontos.geojson`);
    const h = calcular(f).porData[DATA].ref;
    assert.ok(h && h.apagaMin != null, `${id}: a referência não achou sol direto`);
    const dif = h.apagaMin - alvo;
    assert.ok(Math.abs(dif) <= TOL, `${id}: referência ${ref.hm(h.apagaMin)}, alvo ${ref.hm(alvo)} (${dif} min)`);
    // o "sol some atrás da serra" do protótipo é o mesmo minuto quando há um intervalo só à tarde
    assert.equal(h.someNaSerraMin, h.apagaMin, `${id}: protótipo e regra 4.1 divergem`);
  }
});

// ------------------------------------------------------------------ (b) o motor do app bate com a referência
test(`(b) nucleo.js bate com a referência em ±${TOL} min em todo ponto confirmado (3 datas)`, () => {
  assert.ok(comHora.length >= 2, 'menos de 2 pontos com hora de sol: o teste ficaria vazio');
  const linhas = [];
  for (const f of confirmadas) {
    const id = f.properties.id;
    const c = calcular(f);
    assert.ok(c.hRef, `${id}: fora da grade na referência`);
    assert.ok(c.perfilApp, `${id}: fora da grade no app`);
    for (const data of [DATA, ...OUTRAS_DATAS]) {
      const { ref: r, app: a } = c.porData[data];
      if (temHoraDeSol(f) && data === DATA) {
        assert.ok(r.apagaMin != null && a.apagaBrutoMin != null, `${id} ${data}: ponto com hora de sol sem apaga`);
      }
      assert.equal(a.apagaBrutoMin == null, r.apagaMin == null, `${id} ${data}: um lado tem sol e o outro não`);
      if (r.apagaMin != null) {
        const dif = a.apagaBrutoMin - r.apagaMin;
        assert.ok(Math.abs(dif) <= TOL, `${id} ${data}: app ${N.hhmm(a.apagaBrutoMin)} x referência ${ref.hm(r.apagaMin)} (${dif} min)`);
        const difN = a.nascePocoMin - r.solApareceNaSerraMin;
        assert.ok(Math.abs(difN) <= TOL, `${id} ${data}: nasce no poço app ${N.hhmm(a.nascePocoMin)} x ${ref.hm(r.solApareceNaSerraMin)}`);
      }
      const difE = a.escureceBrutoMin - r.escureceMin;
      assert.ok(Math.abs(difE) <= TOL, `${id} ${data}: escurece app ${N.hhmm(a.escureceBrutoMin)} x ${ref.hm(r.escureceMin)}`);
      if (data === DATA) linhas.push(`${id}: ref ${ref.hm(r.apagaMin)} app ${a.apagaBrutoMin == null ? '-' : N.hhmm(a.apagaBrutoMin)}`);
    }
  }
  console.log(`[hora-da-serra] ${DATA} apaga bruto (referência x app): ${linhas.join(' | ')}`);
});

// ------------------------------------------------------------------ (c) o que aparece é múltiplo de 5 e nunca depois do bruto
test('(c) horas exibidas são múltiplos de 5 e não passam do bruto (apaga e escurece para baixo, nasce para cima)', async () => {
  for (const f of comHora) {
    const id = f.properties.id;
    const { ref: r, app: a } = calcular(f).porData[DATA];
    if (a.apagaMin != null) {
      assert.equal(a.apagaMin % 5, 0, `${id}: apagaMin ${a.apagaMin} não é múltiplo de 5`);
      assert.ok(a.apagaMin <= a.apagaBrutoMin, `${id}: exibido ${a.apagaMin} depois do bruto ${a.apagaBrutoMin}`);
      assert.ok(a.apagaBrutoMin - a.apagaMin < 5, `${id}: arredondou mais de 5 min`);
      // e o exibido também não passa do bruto da referência além da tolerância
      assert.ok(a.apagaMin <= r.apagaMin + TOL, `${id}: exibido ${N.hhmm(a.apagaMin)} muito depois da referência ${ref.hm(r.apagaMin)}`);
    }
    assert.equal(a.escureceMin % 5, 0, `${id}: escureceMin não é múltiplo de 5`);
    assert.ok(a.escureceMin <= a.escureceBrutoMin);
  }
  // o que o hóspede lê em 20/11: Véu 16:05, Arapongas 15:40
  const veu = calcular(porId('cachoeira-veu-da-noiva')).porData[DATA];
  const ara = calcular(porId('cachoeira-das-arapongas')).porData[DATA];
  assert.equal(N.hhmm(N.arredondar5(veu.ref.apagaMin, 'baixo')), '16:05');
  assert.equal(N.hhmm(N.arredondar5(ara.ref.apagaMin, 'baixo')), '15:40');
  assert.equal(N.hhmm(veu.app.apagaMin), '16:05');
  assert.equal(N.hhmm(ara.app.apagaMin), '15:40');
  // ajuste de campo (sol_ajuste_min) entra e continua múltiplo de 5 e para baixo
  const [lon, lat] = porId('cachoeira-veu-da-noiva').geometry.coordinates;
  const aj = N.horasDeSol(G, { lon, lat, sol_ajuste_min: -7 }, DATA, { perfil: calcular(porId('cachoeira-veu-da-noiva')).perfilApp });
  assert.equal(aj.ajusteMin, -7);
  assert.equal(aj.apagaMin % 5, 0);
  assert.ok(aj.apagaMin <= aj.apagaBrutoMin - 7);

  // se as regras de exibição já existem, o que elas devolvem também segue a regra
  const regras = await importarRegras();
  if (!regras) return;
  for (const f of comHora) {
    const a = calcular(f).porData[DATA].app;
    const props = propsEnriquecidas(f);
    const e = regras.horasExibidas(a, props, 8 * 60);
    for (const k of ['apaga', 'escurece', 'saiaAte', 'volteComLuzAte', 'nasce']) {
      if (e[k] != null) assert.equal(e[k] % 5, 0, `${f.properties.id}: ${k} = ${e[k]} não é múltiplo de 5`);
    }
    if (e.apaga != null) assert.ok(e.apaga <= a.apagaBrutoMin, `${f.properties.id}: apaga exibido depois do bruto`);
    if (e.escurece != null) assert.ok(e.escurece <= a.escureceBrutoMin);
    if (e.nasce != null) assert.ok(e.nasce >= a.nascePocoMin, `${f.properties.id}: nasce arredondado para baixo (inseguro)`);
  }
});

// ------------------------------------------------------------------ (d) saia até e volte com luz
const URL_REGRAS = new URL('js/hora/regras.js', `file://${RAIZ}`);
async function importarRegras() {
  if (!existsSync(fileURLToPath(URL_REGRAS))) return null;
  return import(URL_REGRAS.href);
}
const utilApp = await import(new URL('js/util.js', `file://${RAIZ}`).href);
function propsEnriquecidas(f) {
  const p = f.properties;
  return { ...p, _estado: estadoDe(f), _hora_de_sol: temHoraDeSol(f), _carro_min: utilApp.tempoMaisLentoMin(p.carro_tempo), _trilha_min: utilApp.tempoMaisLentoMin(p.trilha_tempo) };
}

test('(d1) tempo mais lento da placa: "25–30 min" é 30 e "≈ 60 min" é 60 (util.js, tabela 6.1)', () => {
  const casos = {
    '25–30 min': 30, '≈ 60 min': 60, '12 min': 12, '≈ 30 min': 30, '35–45 min': 45, '1 h': 60, '1h': 60,
    '1 h 30': 90, '1h30': 90, '1h30min': 90, '1 h 30 min': 90, '1-2 h': 120, '40 min–1 h': 60, '1h–1h30': 90,
  };
  for (const [txt, esperado] of Object.entries(casos)) assert.equal(utilApp.tempoMaisLentoMin(txt), esperado, txt);
  for (const txt of ['meia hora', '1,5 h', '30', '', null]) assert.equal(utilApp.tempoMaisLentoMin(txt), null, String(txt));
});

test('(d2) regras.js: Véu em 20/11 (apaga 16:05, carro 3, trilha 30) dá saia até 14:30 e volte com luz até 17:10', async () => {
  const regras = await importarRegras();
  // o arquivo já existe: se sumir, o contrato 6.2 deixa de ser conferido, então falha (não pula)
  assert.ok(regras, 'site/itaitu/js/hora/regras.js não existe: o contrato 6.2 não pode ser conferido');
  for (const nome of ['horasExibidas', 'minutosDeSolNoPoco', 'incertezaMin', 'deveMostrarAmanha', 'valorDaRegua']) {
    assert.equal(typeof regras[nome], 'function', `regras.js não exporta ${nome} (contrato 6.2)`);
  }
  if (typeof regras.tempoMaisLentoMin === 'function') {
    assert.equal(regras.tempoMaisLentoMin('25–30 min'), 30);
    assert.equal(regras.tempoMaisLentoMin('≈ 60 min'), 60);
  }
  const H = (apaga, escurece, nasce = 370) => ({ apagaMin: apaga, apagaBrutoMin: apaga, escureceMin: escurece, nascePocoMin: nasce, ajusteMin: 0 });
  const veuProps = { confianca: 'alta', _estado: 'confirmada', _hora_de_sol: true, _carro_min: 3, _trilha_min: 30 };
  const v = regras.horasExibidas(H(minutosDe('16:05'), minutosDe('18:10')), veuProps, minutosDe('13:00'));
  assert.equal(v.apaga, minutosDe('16:05'));
  assert.equal(v.saiaAte, minutosDe('14:30'), `saia até ${N.hhmm(v.saiaAte)}`);
  assert.equal(v.escurece, minutosDe('18:10'));
  assert.equal(v.volteComLuzAte, minutosDe('17:10'), `volte com luz até ${N.hhmm(v.volteComLuzAte)}`);
  assert.equal(v.situacao, 'planejar');
  // com o bruto do motor (16:07 e 18:11) o resultado é o mesmo: as contas usam os valores já exibidos
  const vBruto = regras.horasExibidas(H(minutosDe('16:07'), minutosDe('18:11')), veuProps, minutosDe('13:00'));
  assert.equal(vBruto.saiaAte, minutosDe('14:30'));
  assert.equal(vBruto.volteComLuzAte, minutosDe('17:10'));
  // Arapongas: apaga 15:40, carro 12, trilha 30 -> saia até 13:55
  const a = regras.horasExibidas(H(minutosDe('15:40'), minutosDe('18:10')), { confianca: 'media', _estado: 'confirmada', _hora_de_sol: true, _carro_min: 12, _trilha_min: 30 }, minutosDe('13:00'));
  assert.equal(a.saiaAte, minutosDe('13:55'), `Arapongas saia até ${N.hhmm(a.saiaAte)}`);
  // sem tempo de placa (Urubu): nunca "saia até"
  const u = regras.horasExibidas(H(minutosDe('16:35'), minutosDe('18:10')), { confianca: 'media', _estado: 'confirmada', _hora_de_sol: true, _carro_min: null, _trilha_min: null }, minutosDe('13:00'));
  assert.equal(u.saiaAte, null); assert.equal(u.situacao, 'sem-tempo');
  // demais contratos da 6.2
  assert.equal(regras.minutosDeSolNoPoco(minutosDe('16:05'), minutosDe('15:52')), 13);
  assert.equal(regras.minutosDeSolNoPoco(minutosDe('16:05'), minutosDe('16:20')), 0);
  assert.equal(regras.incertezaMin({ confianca: 'alta' }), 10);
  assert.equal(regras.incertezaMin({ confianca: 'media' }), 15);
  assert.equal(regras.deveMostrarAmanha({}, minutosDe('17:00')), false, 'lista vazia nunca vira "amanhã"');
  assert.equal(regras.deveMostrarAmanha([], minutosDe('17:00')), false, 'lista vazia (array) nunca vira "amanhã"');
  // lista só com pontos 'sem-sol' (apaga nulo): nunca "amanhã", a qualquer hora
  const semSol = { 'sem-sol-1': regras.horasExibidas(null, {}, null), 'sem-sol-2': { apaga: null, situacao: 'sem-sol' } };
  assert.equal(semSol['sem-sol-1'].situacao, 'sem-sol');
  for (const agora of [minutosDe('06:00'), minutosDe('17:00'), minutosDe('23:55')]) {
    assert.equal(regras.deveMostrarAmanha(semSol, agora), false, `lista só sem-sol virou "amanhã" às ${N.hhmm(agora)}`);
  }
  // todos com apaga passado: verdadeiro; um ainda com sol: falso
  const ex = (apaga) => regras.horasExibidas(H(minutosDe(apaga), minutosDe('18:10')), veuProps, null);
  const doisPontos = { veu: ex('16:05'), arapongas: ex('15:40') };
  assert.equal(regras.deveMostrarAmanha(doisPontos, minutosDe('16:10')), true, 'todos com apaga passado deveriam virar "amanhã"');
  assert.equal(regras.deveMostrarAmanha({ ...doisPontos, ...semSol }, minutosDe('16:10')), true, 'sem-sol na lista não segura o "amanhã"');
  assert.equal(regras.deveMostrarAmanha(doisPontos, minutosDe('15:50')), false, 'Véu ainda tem sol às 15:50');
  // com as Horas brutas do motor (apagaMin) também vale
  assert.equal(regras.deveMostrarAmanha([{ apagaMin: 967 }, { apagaMin: 940 }], minutosDe('16:10')), true);
  // a mesma conta com as horas reais do motor
  const veu = porId('cachoeira-veu-da-noiva');
  const real = regras.horasExibidas(calcular(veu).porData[DATA].app, propsEnriquecidas(veu), minutosDe('13:00'));
  assert.equal(real.saiaAte, minutosDe('14:30'));
  assert.equal(real.volteComLuzAte, minutosDe('17:10'));
});

test('(d3) régua de 20/11/2026: limitesDaRegua dá min 310 e max 1090; valorDaRegua só devolve múltiplo de 5 dentro deles', async () => {
  const regras = await importarRegras();
  assert.ok(regras, 'site/itaitu/js/hora/regras.js não existe');
  for (const nome of ['limitesDaRegua', 'valorDaRegua']) assert.equal(typeof regras[nome], 'function', `regras.js não exporta ${nome}`);
  // o mesmo dia que o app monta (js/hora/index.js, h.dia): nascer e escurecer no centro do recorte (app.js, RECORTE_PADRAO)
  // app.js mexe no DOM e não importa no Node: o centro é lido do texto do RECORTE_PADRAO
  const fonteApp = readFileSync(join(RAIZ, 'js/app.js'), 'utf8');
  const mCentro = fonteApp.match(/RECORTE_PADRAO[\s\S]*?centro:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/);
  assert.ok(mCentro, 'centro do RECORTE_PADRAO não achado em js/app.js');
  const [lonC, latC] = [Number(mCentro[1]), Number(mCentro[2])];
  const np = N.nascerEPor(DATA, latC, lonC);
  const lim = regras.limitesDaRegua(np.nascerMin, np.escureceBrutoMin);
  assert.equal(lim.min, 310, `min da régua ${lim.min} (${N.hhmm(lim.min)})`);
  assert.equal(lim.max, 1090, `max da régua ${lim.max} (${N.hhmm(lim.max)})`);
  assert.equal(lim.min % 5, 0); assert.equal(lim.max % 5, 0);
  let fora = 0;
  for (let m = 0; m < 1440; m++) {
    const v = regras.valorDaRegua(m, np.nascerMin, np.escureceBrutoMin);
    assert.equal(v % 5, 0, `valorDaRegua(${m}) = ${v} não é múltiplo de 5`);
    assert.ok(v >= lim.min && v <= lim.max, `valorDaRegua(${m}) = ${v} fora de ${lim.min}..${lim.max}`);
    if (m >= lim.min && m <= lim.max) assert.ok(v <= m && m - v < 5, `valorDaRegua(${m}) = ${v} não arredonda para baixo`);
    else fora++;
  }
  assert.ok(fora > 0);
  assert.equal(regras.valorDaRegua(null, np.nascerMin, np.escureceBrutoMin), lim.min, 'sem minuto, a régua começa no min');
  assert.equal(regras.valorDaRegua(minutosDe('13:02'), np.nascerMin, np.escureceBrutoMin), minutosDe('13:00'));
});

// ------------------------------------------------------------------ (s) sensibilidade de posição: a nota ±10/±15 não mente
// ARQUITETURA 10 e risco 1: cada ponto confirmado com hora de sol deslocado 50 m para N, S, L e O. Falha se o apaga
// bruto variar mais que incertezaMin(ponto) (alta 10, media 15). A variação vai para o RELATORIO (seção T10).
test('(s) sensibilidade de 50 m (N, S, L, O): o apaga bruto não varia mais que incertezaMin do ponto', async () => {
  const regras = await importarRegras();
  assert.ok(regras && typeof regras.incertezaMin === 'function', 'regras.js sem incertezaMin (6.3)');
  assert.ok(comHora.length >= 2, 'menos de 2 pontos com hora de sol: o teste ficaria vazio');
  const D = 50;
  const linhas = [];
  for (const f of comHora) {
    const id = f.properties.id;
    const c = calcular(f);
    const base = c.porData[DATA].app.apagaBrutoMin;
    assert.ok(base != null, `${id}: sem apaga na posição original`);
    const lim = regras.incertezaMin(f.properties);
    const dLat = D / 111320;
    const dLon = dLat / Math.cos(c.lat * Math.PI / 180);
    const desloc = { N: [0, dLat], S: [0, -dLat], L: [dLon, 0], O: [-dLon, 0] };
    const vari = {};
    for (const [dir, [dx, dy]] of Object.entries(desloc)) {
      const h = N.horasDeSol(G, { lon: c.lon + dx, lat: c.lat + dy }, DATA);
      assert.ok(h.apagaBrutoMin != null, `${id} deslocado 50 m para ${dir}: perdeu o sol direto`);
      vari[dir] = h.apagaBrutoMin - base;
    }
    linhas.push(`${id} (${f.properties.confianca}, ±${lim}): N ${vari.N}, S ${vari.S}, L ${vari.L}, O ${vari.O}`);
    for (const [dir, v] of Object.entries(vari)) {
      assert.ok(Math.abs(v) <= lim, `${id}: 50 m para ${dir} muda o apaga em ${v} min, mais que a nota ±${lim} min`);
    }
  }
  console.log(`[hora-da-serra] sensibilidade 50 m em ${DATA} (min, N/S/L/O): ${linhas.join(' | ')}`);
});

// ------------------------------------------------------------------ (e) aproximada e sem coordenada nunca têm hora de sol
test('(e) pontos aproximados e sem coordenada nunca recebem hora de sol (todo o pontos.geojson)', async () => {
  const { enriquecer } = await import(new URL('js/dados.js', `file://${RAIZ}`).href);
  const info = console.info; console.info = () => {};      // dados.js avisa feature ignorada por console.info
  let app;
  try { app = enriquecer(pontos); } finally { console.info = info; }
  const appPorId = new Map(app.features.map((f) => [f.properties.id, f.properties]));
  let semHora = 0;
  for (const f of pontos.features) {
    const id = f.properties.id, estado = estadoDe(f), p = appPorId.get(id);
    assert.ok(p, `${id} sumiu no enriquecimento do app`);
    assert.equal(p._estado, estado, `${id}: app diz ${p._estado}, a regra 6.1 diz ${estado}`);
    if (estado !== 'confirmada') {
      semHora++;
      assert.equal(p._hora_de_sol, false, `${id} (${estado}) recebeu hora de sol`);
    } else {
      assert.equal(p._hora_de_sol, temHoraDeSol(f), `${id}: _hora_de_sol divergente`);
    }
  }
  assert.ok(semHora > 0, 'nenhum ponto aproximado ou sem coordenada: o teste ficaria vazio');
  const regras = await importarRegras();
  if (regras) {
    // sem Horas (o motor não calcula para eles), as regras não inventam número
    for (const f of pontos.features.filter((x) => estadoDe(x) !== 'confirmada')) {
      let e = null;
      try { e = regras.horasExibidas(null, propsEnriquecidas(f), 13 * 60); } catch (_) { e = null; }
      if (e) for (const k of ['apaga', 'nasce', 'saiaAte', 'saindoAgoraMin']) assert.equal(e[k] ?? null, null, `${f.properties.id}: ${k} sem coordenada`);
    }
  }
});

// ------------------------------------------------------------------ (f) a nota de honestidade existe
test('(f) textos.js tem a nota "calculado pelo relevo, ±10 min" (e ±15 para confiança media)', async () => {
  const X = await import(new URL('js/textos.js', `file://${RAIZ}`).href);
  const nota = X.t('hora.nota', { min: 10 });
  assert.match(nota, /±10 min/);
  assert.equal(nota, 'calculado pelo relevo, ±10 min');
  assert.match(X.notaDeCalculo(15), /±15 min/);
  assert.equal(X.notaCalculo, nota);
});
