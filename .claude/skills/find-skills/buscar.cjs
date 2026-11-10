#!/usr/bin/env node
/*
 * .claude/skills/find-skills/buscar.cjs · busca no diretório público skills.sh
 *
 * Uso: node .claude/skills/find-skills/buscar.cjs "<assunto>" [--limite 10] [--json]
 * Só lê. Não instala nada, não executa nada de fora. Manda ao skills.sh apenas o texto da busca:
 * nunca coloque nome de cliente, e-mail, link privado ou dado do dono na busca.
 * Usa o curl do sistema, que respeita o proxy do ambiente.
 */
'use strict';
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const json = args.includes('--json');
const iL = args.indexOf('--limite');
const limite = Math.min(50, Math.max(1, iL >= 0 ? parseInt(args[iL + 1], 10) || 10 : 10));
const termos = args.filter((a, i) => !a.startsWith('--') && !(iL >= 0 && i === iL + 1)).join(' ').trim();
if (!termos) { console.error('uso: node buscar.cjs "<assunto>" [--limite 10] [--json]'); process.exit(2); }
if (/@|https?:\/\/|\d{5,}/.test(termos)) { console.error('recusado: a busca parece ter e-mail, link ou número. Use só o assunto.'); process.exit(2); }

let bruto;
try {
  bruto = execFileSync('curl', ['-sS', '-m', '30', '--get', 'https://skills.sh/api/search', '--data-urlencode', 'q=' + termos, '--data-urlencode', 'limit=' + limite], { encoding: 'utf8', maxBuffer: 4e6 });
} catch (e) { console.error('erro   não consegui falar com skills.sh: ' + String(e.message).slice(0, 160)); process.exit(1); }

let dados;
try { dados = JSON.parse(bruto); } catch (e) { console.error('erro   resposta inesperada do skills.sh: ' + bruto.slice(0, 160)); process.exit(1); }
const lista = (dados.skills || []).map(s => ({
  instalacoes: Number(s.installs) || 0,
  nome: String(s.name || s.skillId || ''),
  fonte: String(s.source || ''),
  link: 'https://skills.sh/' + String(s.id || ''),
  repositorio: /^[\w.-]+\/[\w.-]+$/.test(String(s.source || '')) ? 'https://github.com/' + s.source : ''
})).sort((a, b) => b.instalacoes - a.instalacoes);

if (json) { console.log(JSON.stringify({ busca: termos, resultados: lista }, null, 1)); process.exit(0); }
if (!lista.length) { console.log(`Nada encontrado para "${termos}".`); process.exit(0); }
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
console.log(`Busca: "${termos}" · ${lista.length} resultado(s), por instalações\n`);
for (const s of lista) {
  const alerta = s.instalacoes < 1000 ? '  [poucas instalações: só com motivo forte]' : '';
  console.log(`${fmt(s.instalacoes).padStart(8)}  ${s.nome}  ·  ${s.fonte}${alerta}\n          ${s.link}`);
}
console.log('\nAntes de trazer qualquer uma: conferir fonte e licença, ler a skill inteira em quarentena e passar pela segurança (ver SKILL.md).');
