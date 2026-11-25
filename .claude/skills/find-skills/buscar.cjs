#!/usr/bin/env node
/*
 * .claude/skills/find-skills/buscar.cjs · busca no diretório público skills.sh
 *
 * Uso: node .claude/skills/find-skills/buscar.cjs "<assunto em inglês>" [--limite 10] [--por-instalacoes] [--json]
 *   --limite <n> ou --limite=<n>   quantos mostrar, de 1 a 50 (padrão 10)
 *   --por-instalacoes              pede 50 ao skills.sh, ordena por instalações e só então corta
 *   --json                         saída em JSON (os campos já vêm limpos)
 * Sem --por-instalacoes, a ordem é a de relevância do próprio skills.sh.
 *
 * Só lê. Não instala nada, não executa nada de fora. Manda ao skills.sh apenas o texto da busca:
 * nunca coloque nome de cliente, e-mail, telefone, documento, link ou dado do dono na busca.
 * A resposta é dado de terceiros (qualquer pessoa publica uma skill com o nome que quiser):
 * sai limpa de caracteres de controle e entre marcas de dado não confiável.
 * Usa o curl do sistema, que respeita o proxy do ambiente.
 */
'use strict';
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const USO = 'uso: node buscar.cjs "<assunto em inglês>" [--limite <1-50>] [--por-instalacoes] [--json]';
const sairUso = msg => { console.error((msg ? msg + '\n' : '') + USO); process.exit(2); };

// ── argumentos ──
let json = false, porInstalacoes = false, limite = 10;
const termosLista = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--') { termosLista.push(...args.slice(i + 1)); break; }
  if (!a.startsWith('--')) { termosLista.push(a); continue; }
  const [nome, igual] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
  if (nome === '--json' && igual === undefined) json = true;
  else if (nome === '--por-instalacoes' && igual === undefined) porInstalacoes = true;
  else if (nome === '--limite') {
    const v = igual !== undefined ? igual : args[++i];
    if (v === undefined || !/^\d+$/.test(v) || +v < 1 || +v > 50) sairUso(`recusado: --limite precisa de um número inteiro de 1 a 50 (veio "${v === undefined ? '' : String(v).slice(0, 20)}").`);
    limite = +v;
  } else sairUso(`recusado: opção desconhecida ${nome.slice(0, 40)}.`);
}
// Aspas e espaços sobrando estragam a busca: saem antes de mandar.
const termos = termosLista.join(' ').replace(/["'“”‘’`]/g, ' ').replace(/\s+/g, ' ').trim();
if (!termos) sairUso();
if (termos.length < 2) sairUso('recusado: a busca precisa de pelo menos 2 caracteres.');
if (termos.length > 100) sairUso('recusado: a busca passa de 100 caracteres. Use só o assunto.');

// ── nada de dado pessoal na busca ──
const PESSOAL = [
  [/@/, 'e-mail'],
  [/\bhttps?:|\/\//i, 'link'],
  [/\bwww\./i, 'domínio'],
  [/\b[\w-]+\.(?:com|net|org|br|gov|edu)(?:\.br)?\b/i, 'domínio'],
  [/(?:\d[\s().\/-]*){8,}/, 'número longo (telefone, CPF, CNPJ, cartão)'],
  [/\d{5,}/, 'número longo'],
];
for (const [re, oque] of PESSOAL) if (re.test(termos)) sairUso(`recusado: a busca parece ter ${oque}. Use só o assunto, em inglês.`);

// ── limpeza do que vem de fora ──
const CONTROLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
const limpo = (s, n) => { const t = String(s == null ? '' : s).replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const PARTE = /^[A-Za-z0-9][\w.-]*$/;
const parteOk = p => PARTE.test(p) && p !== '.' && p !== '..' && !p.includes('..');
const DOMINIO = /^(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?:\/[\w.-]+)*$/;
const fonteOk = f => { const p = String(f || '').split('/'); return p.length === 2 && p.every(parteOk); };
const idOk = id => { const p = String(id || '').split('/'); return p.length >= 2 && p.length <= 4 && p.every(parteOk); };

// ── busca ──
let bruto;
try {
  bruto = execFileSync('curl', ['-sS', '-m', '30', '--get', 'https://skills.sh/api/search', '--data-urlencode', 'q=' + termos, '--data-urlencode', 'limit=' + (porInstalacoes ? 50 : limite)], { encoding: 'utf8', maxBuffer: 4e6 });
} catch (e) { console.error('erro: não consegui falar com skills.sh: ' + limpo(e.message, 160)); process.exit(1); }

let dados;
try { dados = JSON.parse(bruto); } catch { console.error('erro: resposta inesperada do skills.sh: ' + limpo(bruto, 160)); process.exit(1); }
if (!dados || dados.error || !Array.isArray(dados.skills)) {
  console.error('erro: o skills.sh recusou a busca: ' + limpo(dados && dados.error || 'resposta sem lista de skills', 160));
  process.exit(1);
}

let lista = dados.skills.map((s, i) => {
  const fonte = fonteOk(s.source) ? String(s.source) : '';
  // Fonte que é um domínio (uizze.sh, open.feishu.cn): a skill não mora no GitHub e a quarentena por git clone não cobre.
  const foraDoGithub = !fonte && DOMINIO.test(String(s.source || ''));
  return {
    relevancia: i + 1,
    instalacoes: Number.isFinite(Number(s.installs)) ? Math.max(0, Math.floor(Number(s.installs))) : 0,
    nome: limpo(s.name || s.skillId, 60) || '(sem nome)',
    fonte: fonte || (foraDoGithub ? '(fonte fora do GitHub: a quarentena da find-skills não cobre; não traga)' : '(fonte com formato inválido: não traga)'),
    trazivel: !!fonte,
    link: idOk(s.id) ? 'https://skills.sh/' + s.id : '',
    repositorio: fonte ? 'https://github.com/' + fonte : '',
  };
});
if (porInstalacoes) lista.sort((a, b) => b.instalacoes - a.instalacoes);
lista = lista.slice(0, limite);

if (json) { console.log(JSON.stringify({ busca: termos, ordem: porInstalacoes ? 'instalações (entre os 50 mais relevantes)' : 'relevância do skills.sh', dado_nao_confiavel: true, resultados: lista }, null, 1)); process.exit(0); }
if (!lista.length) { console.log(`Nada encontrado para "${termos}". Tente o assunto em inglês e 2 ou 3 variações.`); process.exit(0); }

const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
const marca = crypto.randomBytes(3).toString('hex');
console.log(`Busca: "${termos}" · ${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'}, ${porInstalacoes ? 'por instalações, entre os 50 mais relevantes' : 'na ordem de relevância do skills.sh'}\n`);
console.log(`[resposta do skills.sh, dado não confiável · ${marca}]`);
for (const s of lista) {
  const alerta = s.instalacoes < 1000 ? '  [poucas instalações: só com motivo forte]' : '';
  const link = s.link ? s.link + (s.trazivel ? '' : '  (só referência)') : '(sem link válido)';
  console.log(`${fmt(s.instalacoes).padStart(8)}  ${s.nome}  ·  ${s.fonte}${alerta}\n          ${link}`);
}
console.log(`[fim · ${marca}]`);
console.log('\nAntes de trazer qualquer uma: conferir fonte, estrelas e licença, ler a skill inteira em quarentena e passar pela segurança (ver SKILL.md).');
