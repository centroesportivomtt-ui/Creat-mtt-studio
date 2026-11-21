// Teste dos textos do app (Verbo, copywriter, 20/11/2026). Dono deste arquivo: copywriter.
// Roda junto com o teste do backend:  node --test projetos/itaitu-mapa/testes/
// Confere o que a revisão da T4 pediu: SMS numa parte só, nenhum {casa} na marca padrão,
// nenhuma conta de minutos de sol dentro do textos.js, fontes certas no info.json e
// nota pública das marcas sem a ordem de venda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('../../../site/itaitu/', import.meta.url);
const X = await import(new URL('js/textos.js', raiz).href);
const lerJSON = (rel) => JSON.parse(readFileSync(new URL(rel, raiz), 'utf8'));
const MARCAS = ['padrao', 'demo-village', 'demo-camping'].map((slug) => lerJSON(`marcas/${slug}.json`));
const COM_INSTAGRAM = { parceiro: 'Pousada Exemplo', instagram: 'https://www.instagram.com/pousadaexemplo/' };
const VEU = [-11.3331084, -40.5035718];
// O que vai para a tela: o JSON sem os campos que começam com _ (nota da equipe).
const semNotas = (v) =>
  Array.isArray(v) ? v.map(semNotas)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, semNotas(x)]))
      : v;
const linkCurto = ([lat, lon]) => `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
const linkLongo = ([lat, lon]) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;

test('SMS do SOS cabe numa parte (160, GSM-7) no pior caso e nunca perde a coordenada', () => {
  const pontos = [VEU, [-11.42, -40.6], [-33.75, -73.99], [-1.5, -48.5]];
  const precisoes = [undefined, null, 0, 0.4, 5, 12, 150, 1500, 25000, 999999];
  for (const ponto of pontos) {
    const coordenada = `${ponto[0].toFixed(6)}, ${ponto[1].toFixed(6)}`;
    for (const precisaoM of precisoes) {
      for (const link of [undefined, '', X.T.meta.url, linkCurto(ponto), linkLongo(ponto), 'https://exemplo.com/~fora']) {
        const s = X.textoSMS({ lat: ponto[0], lon: ponto[1], precisaoM, link });
        assert.ok(X.cabeEmUmSMS(s), `${s.length} caracteres: ${s}`);
        assert.ok(s.includes(coordenada), `sem a coordenada: ${s}`);
      }
    }
  }
});

test('o link do ponto (48 caracteres) entra com qualquer precisão de GPS até 25 km', () => {
  for (const precisaoM of [undefined, 5, 12, 150, 1500, 25000]) {
    const link = linkCurto(VEU);
    const s = X.textoSMS({ lat: VEU[0], lon: VEU[1], precisaoM, link });
    assert.ok(s.endsWith(` ${link}`), s);
  }
  assert.equal(
    X.textoSMS({ lat: VEU[0], lon: VEU[1], precisaoM: 12, link: linkCurto(VEU) }),
    'Preciso de ajuda em Itaitu, Jacobina BA. Posicao: -11.333108, -40.503572 (precisao de 12 m). https://maps.google.com/?q=-11.333108,-40.503572',
  );
});

test('SMS sai sem acento e sem ° mesmo com coordenada em graus, minutos e segundos', () => {
  const s = X.textoSMS({ coordenada: '11°19′59,2″ S · 40°30′12,9″ O', precisaoM: 12 });
  assert.ok(X.cabeEmUmSMS(s), s);
  assert.equal(X.cabeEmUmSMS('Minha posição'), false);
  assert.equal(X.cabeEmUmSMS('a'.repeat(161)), false);
  assert.equal(X.cabeEmUmSMS('a'.repeat(160)), true);
});

test('textos da casa: nenhuma marca deixa {casa} ou {parceiro} na tela', () => {
  const chaves = [
    'cartao.compartilhado', 'cartao.legenda_copiada', 'cartao.cortesia', 'marca.cortesia',
    'placa.cortesia', 'demo.fase4', 'meta.titulo_marca',
  ];
  for (const marca of [...MARCAS, COM_INSTAGRAM, undefined]) {
    for (const chave of chaves) {
      const s = X.textoDaCasa(chave, marca);
      assert.equal(typeof s, 'string');
      assert.doesNotMatch(s, /[{}]/, `${chave} na marca ${marca?.slug ?? 'sem marca'}: ${s}`);
    }
    const legendas = X.legendasDoCartao({
      cachoeira: 'Véu da Noiva', km: 2, subidaM: 90, instagram: marca?.instagram, parceiro: marca?.parceiro,
      apagaHHMM: '16:05', minutosDeSol: 13, chegadaHHMM: '15:52', nasceHHMM: '06:10',
    });
    for (const l of legendas) assert.doesNotMatch(l.texto, /[{}]/, l.texto);
  }
  const padrao = MARCAS[0];
  assert.equal(X.textoDaCasa('cartao.compartilhado', padrao), X.T.cartao.compartilhado_sem_casa);
  assert.equal(X.textoDaCasa('cartao.legenda_copiada', padrao), X.T.cartao.legenda_copiada_sem_casa);
  assert.equal(X.textoDaCasa('cartao.cortesia', padrao), '');
  assert.equal(X.textoDaCasa('demo.fase4', padrao), X.T.demo.fase4_sem_casa);
  assert.equal(X.textoDaCasa('meta.titulo_marca', padrao), X.T.meta.titulo);
  assert.equal(X.textoDaCasa('cartao.compartilhado', COM_INSTAGRAM), 'Pronto. Marque @pousadaexemplo no story.');
});

test('fraseCartao não calcula minutos de sol: o número só vem de minutosDeSol', () => {
  assert.equal(X.fraseCartao({ chegadaHHMM: '05:00', apagaHHMM: '16:05' }), 'Cheguei 05:00 · a serra apaga o sol 16:05');
  assert.doesNotMatch(X.fraseCartao({ chegadaHHMM: '15:52', apagaHHMM: '16:05' }), /min de sol/);
  assert.match(X.fraseCartao({ chegadaHHMM: '16:20', apagaHHMM: '16:05' }), /apagou o sol 16:05 · poço na sombra da serra$/);
  assert.equal(
    X.fraseCartao({ chegadaHHMM: '15:52', apagaHHMM: '16:05', minutosDeSol: 13 }),
    'Cheguei 15:52 · a serra apaga o sol 16:05 · 13 min de sol no poço',
  );
  assert.match(X.fraseCartao({ chegadaHHMM: '15:52', apagaHHMM: '16:05', minutosDeSol: 0 }), /sombra da serra$/);
});

test('a legenda 6 ("cheguei com sol no poço") sai de quem chegou sem sol', () => {
  const base = { cachoeira: 'Véu da Noiva', apagaHHMM: '16:05' };
  assert.equal(X.legendasDoCartao({ ...base, minutosDeSol: 545, chegadaHHMM: '05:00', nasceHHMM: '06:10' })[0].n, 1);
  assert.equal(X.legendasDoCartao({ ...base, minutosDeSol: 13, chegadaHHMM: '15:52', nasceHHMM: '06:10' })[0].n, 6);
  assert.equal(X.legendasDoCartao({ ...base, minutosDeSol: 0, chegadaHHMM: '16:20' })[0].n, 1);
});

test('info.json: toda informação tem fonte, data e as duas marcas de honestidade', () => {
  const info = lerJSON('dados/info.json');
  const itens = [
    info.emergencia_fonte, ...info.avisos, info.guias, info.melhor_epoca,
    ...info.taxas, ...info.horarios, ...info.acesso, info.atrativos,
  ];
  for (const i of itens) {
    assert.ok(typeof i.fonte === 'string' && i.fonte.length > 0, JSON.stringify(i));
    assert.match(i.data, /^\d{4}(-\d{2}){0,2}$/, JSON.stringify(i));
    assert.equal(typeof i.confirmado, 'boolean', JSON.stringify(i));
    assert.equal(typeof i.desatualizado, 'boolean', JSON.stringify(i));
  }
  assert.doesNotMatch(JSON.stringify(semNotas(info)), /alco[oó]l/i, 'bebida alcoólica não tem fonte');
  for (const chave of ['regras-veu', 'agua']) {
    const aviso = info.avisos.find((a) => a.chave === chave);
    assert.equal(aviso.url, 'https://pt.wikipedia.org/wiki/Itaitu', chave);
    assert.equal(aviso.confirmado, false, chave);
  }
});

test('marcas: nota da equipe sem ordem nem visita de venda (o arquivo vai ao ar)', () => {
  for (const marca of MARCAS) {
    const notas = JSON.stringify({ nota: marca._nota, pendente: marca._pendente });
    assert.doesNotMatch(notas, /alvo|visita de venda|\b\d+º/i, marca.slug);
  }
});

test('SEO: title até 60 caracteres e description até 155', () => {
  assert.ok(X.T.meta.titulo.length <= 60, X.T.meta.titulo);
  assert.ok(X.T.meta.titulo_alternativo.length <= 60, X.T.meta.titulo_alternativo);
  assert.ok(X.T.meta.descricao.length <= 155, X.T.meta.descricao);
});
