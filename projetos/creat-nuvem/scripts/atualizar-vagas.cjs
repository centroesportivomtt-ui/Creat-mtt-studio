#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/atualizar-vagas.cjs (T5 · Pixel)
   Edita dados/vagas.json e dados/precos.json com validação e carimba
   atualizado_em (agora, UTC). A vitrine mostra o preço de inauguração com
   precos.json de até 7 dias (ADR-005); passou disso, volta ao preço padrão.
   Os contadores ao vivo ("Restam X", vagas de hoje) estão desligados na
   página (checkout.config.js contadoresAoVivo: false, decisão D1) até o número
   vir de pedido pago gravado em servidor. Rode este script todo dia, mesmo
   sem mudança, com --confirmar.

   Uso (pasta do projeto):
     node scripts/atualizar-vagas.cjs                       mostra o estado e não grava nada
     node scripts/atualizar-vagas.cjs --confirmar           confere e carimba os dois arquivos
     node scripts/atualizar-vagas.cjs --vagas-hoje 2        vagas de produção restantes hoje
     node scripts/atualizar-vagas.cjs --em-producao 1       pedidos em produção agora
     node scripts/atualizar-vagas.cjs --capacidade 3        capacidade por dia
     node scripts/atualizar-vagas.cjs --novo-dia            vagas_hoje = capacidade_dia
     node scripts/atualizar-vagas.cjs --vendeu              1 pedido pago: -1 vaga hoje, +1 em produção,
                                                            e -1 vaga de inauguração se ela estiver ativa
     node scripts/atualizar-vagas.cjs --entregou            1 pedido entregue: -1 em produção
     node scripts/atualizar-vagas.cjs --inauguracao-restantes 12
     node scripts/atualizar-vagas.cjs --pagos-inauguracao 3   Aberturas de inauguração pagas contadas no servidor
                                                            (contarPagos do pacote 1A): vagasRestantes = vagasTotal - N
     node scripts/atualizar-vagas.cjs --inauguracao on|off
     node scripts/atualizar-vagas.cjs --prazo-horas 48      (só depois de medido; briefing seção 2)
     node scripts/atualizar-vagas.cjs --rotina              o que o carimbo diário das 06:30 roda (docs/ROTINA-DIARIA.md,
                                                            tarefa agendada da sessão principal; o workflow da
                                                            Cloudflare está obsoleto desde a D9): --novo-dia
                                                            + --confirmar, e FALHA (código 2) se a inauguração
                                                            acabou e algum link de R$ 297 ainda está no
                                                            checkout.config.js
   Opções: --raiz <pasta do projeto> · --simular (mostra o resultado sem gravar)
   Na rotina diária, --raiz aponta para a cópia dos arquivos do APP no ar (public/dados/*.json e
   public/checkout.config.js lidos pelo MCP), porque o app é a fonte do estado de produção.

   Links de R$ 297 (passo obrigatório): quando a inauguração acaba (0 vaga ou --inauguracao off),
   TODOS os links do preço de inauguração continuam pagáveis por quem os guardou (são preferências
   do Checkout Pro, sem quantidade máxima; a trava real é o vencimento por portaAbertaFecharPrefs):
   links.aberturaInauguracao, os 6 de linksPorPraca e os 2 combos do anual (estes não ficam no
   checkout.config.js; estão em docs/INTEGRACAO-PAGAMENTO.md e na lista COMBOS_FORA_DA_PAGINA abaixo).
   O script imprime a lista de links a desativar no Mercado Pago. Depois disso, volte
   aberturaInauguracao para o marcador e linksPorPraca para {} no checkout.config.js. Com --rotina,
   a rotina falha enquanto qualquer um deles estiver publicado.

   Regras: inteiros >= 0; vagas_hoje <= capacidade_dia; vagasRestantes <= vagasTotal;
   inauguração chega a 0 vaga = desligada sozinha; preço de inauguração < padrão.
   Qualquer valor inválido: nada é gravado e o código de saída é 1.
   Gravação atômica (arquivo temporário + rename), JSON com 2 espaços.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function valor(nome) { const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1]; }
function tem(nome) { return args.indexOf(nome) !== -1; }
const RAIZ = path.resolve(valor('--raiz') || path.join(__dirname, '..'));
const ARQ_VAGAS = path.join(RAIZ, 'dados', 'vagas.json');
const ARQ_PRECOS = path.join(RAIZ, 'dados', 'precos.json');

const CONHECIDAS = ['--raiz', '--simular', '--confirmar', '--vagas-hoje', '--em-producao', '--capacidade', '--novo-dia', '--vendeu', '--entregou', '--inauguracao-restantes', '--pagos-inauguracao', '--inauguracao', '--prazo-horas', '--rotina', '--ajuda'];
const desconhecida = args.find((a, i) => a.startsWith('--') && CONHECIDAS.indexOf(a) === -1);
if (desconhecida) sair(`opção desconhecida: ${desconhecida}. Use --ajuda.`);
if (tem('--ajuda')) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*|^ {3}/gm, '')); process.exit(0); }

function sair(msg) { console.error('erro: ' + msg + '\nNada foi gravado.'); process.exit(1); }
function lerJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function inteiro(nome) {
  const v = valor(nome);
  if (v === undefined) return undefined;
  if (!/^\d{1,4}$/.test(v)) sair(`${nome} precisa de um inteiro de 0 a 9999 (recebi ${JSON.stringify(v)})`);
  return +v;
}
function gravar(p, obj) {
  const tmp = p + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

// Estado atual (arquivo ausente ou inválido: começa do padrão do briefing, seção 8)
const vagas = lerJSON(ARQ_VAGAS) || { capacidade_dia: 3, em_producao: 0, vagas_hoje: 3, atualizado_em: null };
const precos = lerJSON(ARQ_PRECOS);
if (!precos || !precos.abertura || !precos.abertura.inauguracao || !precos.planos) sair('dados/precos.json ausente ou sem abertura/planos; corrija o arquivo antes (formato na seção 8 do briefing).');
const inaug = precos.abertura.inauguracao;

const mudou = [];
const cap = inteiro('--capacidade'); if (cap !== undefined) { vagas.capacidade_dia = cap; mudou.push('capacidade_dia'); }
const vh = inteiro('--vagas-hoje'); if (vh !== undefined) { vagas.vagas_hoje = vh; mudou.push('vagas_hoje'); }
const ep = inteiro('--em-producao'); if (ep !== undefined) { vagas.em_producao = ep; mudou.push('em_producao'); }
const ROTINA = tem('--rotina');
const inaugAntes = !!(inaug.ativa && inaug.vagasRestantes > 0);
if (tem('--novo-dia') || ROTINA) { vagas.vagas_hoje = vagas.capacidade_dia; mudou.push('vagas_hoje (novo dia)'); }
if (tem('--vendeu')) {
  if (vagas.vagas_hoje > 0) vagas.vagas_hoje -= 1;
  vagas.em_producao += 1;
  if (inaug.ativa && inaug.vagasRestantes > 0) { inaug.vagasRestantes -= 1; mudou.push('inauguracao.vagasRestantes'); }
  mudou.push('venda');
}
if (tem('--entregou')) { if (vagas.em_producao > 0) vagas.em_producao -= 1; mudou.push('entrega'); }
const ir = inteiro('--inauguracao-restantes'); if (ir !== undefined) { inaug.vagasRestantes = ir; mudou.push('inauguracao.vagasRestantes'); }
// Contagem do servidor (contarPagos, pacote 1A) é a verdade: nunca devolve vaga, só tira.
const pi = inteiro('--pagos-inauguracao');
if (pi !== undefined) {
  if (ir !== undefined) sair('use --pagos-inauguracao ou --inauguracao-restantes, não os dois');
  if (!Number.isInteger(inaug.vagasTotal) || inaug.vagasTotal < 0) sair('inauguracao.vagasTotal inválido em precos.json');
  const pelaContagem = Math.max(0, inaug.vagasTotal - pi);
  if (Number.isInteger(inaug.vagasRestantes) && pelaContagem < inaug.vagasRestantes) { inaug.vagasRestantes = pelaContagem; mudou.push('inauguracao.vagasRestantes (contagem do servidor)'); }
}
const io = valor('--inauguracao');
if (io !== undefined) { if (io !== 'on' && io !== 'off') sair('--inauguracao aceita on ou off'); inaug.ativa = io === 'on'; mudou.push('inauguracao.ativa'); }
const ph = inteiro('--prazo-horas'); if (ph !== undefined) { if (ph < 1) sair('--prazo-horas precisa ser maior que 0'); precos.prazoHoras = ph; mudou.push('prazoHoras'); }
if (inaug.ativa && inaug.vagasRestantes === 0) { inaug.ativa = false; mudou.push('inauguracao desligada (0 vaga)'); }

// Validação completa antes de gravar
const ok = (v) => Number.isInteger(v) && v >= 0;
const pos = (v) => typeof v === 'number' && isFinite(v) && v > 0;
const erros = [];
if (!ok(vagas.capacidade_dia)) erros.push('capacidade_dia');
if (!ok(vagas.em_producao)) erros.push('em_producao');
if (!ok(vagas.vagas_hoje)) erros.push('vagas_hoje');
if (ok(vagas.vagas_hoje) && ok(vagas.capacidade_dia) && vagas.vagas_hoje > vagas.capacidade_dia) erros.push(`vagas_hoje (${vagas.vagas_hoje}) maior que capacidade_dia (${vagas.capacidade_dia})`);
if (!pos(precos.prazoHoras)) erros.push('prazoHoras');
if (!pos(precos.abertura.padrao)) erros.push('abertura.padrao');
if (typeof inaug.ativa !== 'boolean') erros.push('inauguracao.ativa');
if (!pos(inaug.preco) || inaug.preco >= precos.abertura.padrao) erros.push('inauguracao.preco precisa ser maior que 0 e menor que abertura.padrao');
if (!ok(inaug.vagasTotal) || !ok(inaug.vagasRestantes) || inaug.vagasRestantes > inaug.vagasTotal) erros.push(`inauguracao.vagasRestantes (${inaug.vagasRestantes}) precisa ficar entre 0 e vagasTotal (${inaug.vagasTotal})`);
if (!pos(precos.planos.aberto) || !pos(precos.planos.vitrine)) erros.push('planos');
if (!Number.isInteger(precos.anualMesesPagos) || precos.anualMesesPagos < 1 || precos.anualMesesPagos > 12) erros.push('anualMesesPagos');
if (erros.length) sair('valores inválidos: ' + erros.join('; '));

// Links de R$ 297 ainda publicados com a inauguração encerrada = preço de inauguração pagável depois do fim.
// Os combos do anual saíram da página (decisão D3), mas continuam ativos no Mercado Pago até alguém desativar.
const COMBOS_FORA_DA_PAGINA = [
  ['Combo Abertura + Aberto anual (R$ 1.767)', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-78effa57-7b26-4cd5-9617-6d6bc32cce32'],
  ['Combo Abertura + Vitrine anual (R$ 3.267)', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-9914ecb8-0c03-45b7-a9bc-3c36972f372d']
];
const publicado = (v) => typeof v === 'string' && /^https:\/\//i.test(v) && v.indexOf('[') === -1;
// Lê o checkout.config.js como o navegador lê (vm), igual ao scripts/checar.cjs.
function linksInauguracaoPublicados() {
  let txt = '';
  try { txt = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8'); } catch (e) { return []; }
  const vm = require('vm'), j = {}; j.window = j;
  try { vm.runInContext(txt, vm.createContext(Object.assign(j, { URL, Promise }))); }
  catch (e) { return [['checkout.config.js não carrega (' + e.message + '); confira à mão', '']]; }
  const C = j.CREAT_CHECKOUT || {};
  const out = [];
  if (C.links && publicado(C.links.aberturaInauguracao)) out.push(['links.aberturaInauguracao', C.links.aberturaInauguracao]);
  Object.keys(C.linksPorPraca || {}).forEach((k) => { if (publicado(C.linksPorPraca[k])) out.push(['linksPorPraca.' + k, C.linksPorPraca[k]]); });
  Object.keys(C.combosAnual || {}).forEach((k) => { const c = C.combosAnual[k]; if (c && publicado(c.link)) out.push(['combosAnual.' + k, c.link]); });
  return out;
}
function checarLinkInauguracao() {
  if (inaug.ativa && inaug.vagasRestantes > 0) return true;
  const naPagina = linksInauguracaoPublicados();
  if (inaugAntes || naPagina.length) {
    const lista = naPagina.concat(COMBOS_FORA_DA_PAGINA).map(([nome, url]) => '     - ' + nome + (url ? ': ' + url : '')).join('\n');
    console.error('ATENÇÃO  inauguração encerrada. Passo obrigatório (ADR-005, revisão de 10/11):\n' +
      '  1. Estes links são preferências do Checkout Pro, sem quantidade máxima. Feche-as pelo workflow "Porta Aberta · fechar R$ 297"\n' +
      '     do AutoCreatFlux (função portaAbertaFecharPrefs, docs/EXECUTOR.md passo m). Os 2 combos não estão na lista fixa da função:\n' +
      '     confira e, se seguirem pagáveis, avise o coordenador. Links de preço de inauguração:\n' + lista + '\n' +
      '  2. Em checkout.config.js, volte links.aberturaInauguracao para o marcador e linksPorPraca para {} e publique.' +
      (naPagina.length ? '\n  Ainda publicados no checkout.config.js: ' + naPagina.map((x) => x[0]).join(', ') + '.' : ''));
  }
  return !naPagina.length;
}

function resumo() {
  return `vagas hoje ${vagas.vagas_hoje} de ${vagas.capacidade_dia}, em produção ${vagas.em_producao} · ` +
    `inauguração ${inaug.ativa ? 'ativa' : 'desligada'} (${inaug.vagasRestantes} de ${inaug.vagasTotal}) · prazo ${precos.prazoHoras} h`;
}
const idade = (o) => { const t = Date.parse(o && o.atualizado_em); return isNaN(t) ? 'sem data' : Math.round((Date.now() - t) / 360000) / 10 + ' h atrás'; };

const linkOk = checarLinkInauguracao();
if (!mudou.length && !tem('--confirmar') && !ROTINA) {
  console.log('estado atual: ' + resumo());
  console.log(`vagas.json carimbado ${idade(vagas)}; precos.json carimbado ${idade(precos)}. Use --confirmar para carimbar agora, ou --ajuda.`);
  process.exit(0);
}
const agora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
vagas.atualizado_em = agora;
precos.atualizado_em = agora;
const ordemVagas = { capacidade_dia: vagas.capacidade_dia, em_producao: vagas.em_producao, vagas_hoje: vagas.vagas_hoje, atualizado_em: agora };
if (tem('--simular')) { console.log('simulação (nada gravado): ' + resumo()); process.exit(0); }
gravar(ARQ_VAGAS, ordemVagas);
gravar(ARQ_PRECOS, precos);
console.log(`gravado em ${agora}: ${resumo()}${mudou.length ? ' · mudou: ' + mudou.join(', ') : ' · só carimbo'}`);
if (ROTINA && !linkOk) { console.error('erro: link(s) de R$ 297 ainda publicado(s) no checkout.config.js com a inauguração encerrada (ver ATENÇÃO acima).'); process.exit(2); }
