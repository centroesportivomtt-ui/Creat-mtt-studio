#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/atualizar-vagas.cjs (T5 · Pixel)
   Edita dados/vagas.json e dados/precos.json com validação e carimba
   atualizado_em (agora, UTC). A vitrine só mostra contador e preço de
   inauguração com dado de até 48 h (regra dura 2, CDC art. 37, ADR-003):
   rode este script todo dia, mesmo sem mudança, com --confirmar.

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
     node scripts/atualizar-vagas.cjs --inauguracao on|off
     node scripts/atualizar-vagas.cjs --prazo-horas 48      (só depois de medido; briefing seção 2)
     node scripts/atualizar-vagas.cjs --rotina              o que a rotina diária automática roda
                                                            (.github/workflows/rotina-vagas.yml): --novo-dia
                                                            + --confirmar, e FALHA (código 2) se a inauguração
                                                            acabou e o link dela ainda está no checkout.config.js
   Opções: --raiz <pasta do projeto> · --simular (mostra o resultado sem gravar)

   Link da inauguração (passo obrigatório): quando a inauguração acaba (0 vaga ou --inauguracao off),
   o link do Asaas dela continua pagável por quem o guardou. Desative o link no Asaas e volte
   aberturaInauguracao do checkout.config.js para o marcador. Este script avisa sempre e, com
   --rotina, falha até isso ser feito.

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

const CONHECIDAS = ['--raiz', '--simular', '--confirmar', '--vagas-hoje', '--em-producao', '--capacidade', '--novo-dia', '--vendeu', '--entregou', '--inauguracao-restantes', '--inauguracao', '--prazo-horas', '--rotina', '--ajuda'];
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

// Link da inauguração ainda publicado com a inauguração encerrada = R$ 297 pagável depois do fim.
function linkInauguracaoPublicado() {
  let txt = '';
  try { txt = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8'); } catch (e) { return false; }
  const m = txt.match(/aberturaInauguracao\s*:\s*(['"])([^'"]*)\1/);
  return !!(m && /^https:\/\//i.test(m[2]) && m[2].indexOf('[') === -1);
}
function checarLinkInauguracao() {
  if (inaug.ativa && inaug.vagasRestantes > 0) return true;
  const publicado = linkInauguracaoPublicado();
  if (inaugAntes || publicado) {
    console.error('ATENÇÃO  inauguração encerrada. Passo obrigatório do Marcos:\n' +
      '  1. Asaas > Cobranças > Links de pagamento > link "Abertura inauguração" > Desativar.\n' +
      '  2. Em checkout.config.js, volte links.aberturaInauguracao para o marcador e publique.');
  }
  return !publicado;
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
if (ROTINA && !linkOk) { console.error('erro: link da inauguração ainda publicado com a inauguração encerrada (ver ATENÇÃO acima).'); process.exit(2); }
