#!/usr/bin/env node
/*
 * .claude/hooks/porteiro.cjs · porteiro de comandos e triagem de texto de fora · Forja, 12/11/2026
 *
 * Regra da casa que vira trava: instalador de terceiro não roda sem revisão (skill find-skills). Um Reel
 * convincente não faz ninguém rodar `npx pacote@latest`, `curl ... | sh` nem `pip install` sem versão.
 *
 * Dois usos:
 *   node porteiro.cjs pre                 PreToolUse do Bash: lê o JSON do gancho na entrada padrão.
 *                                         Saída 2 = comando recusado (motivo no stderr). Saída 0 = segue.
 *                                         Entrada ilegível ou Bash sem comando: recusa (falha fechada).
 *   node porteiro.cjs triagem [arquivo]   Lê o arquivo (ou a entrada padrão) e lista, só pelo NOME, segredo,
 *                                         instrução escondida e caractere invisível achados. Nunca imprime o
 *                                         trecho achado. Saída 1 = achou algo; 0 = limpo; 2 = erro de leitura.
 *
 * As expressões de SEGREDOS, INJECAO e INVISIVEL vêm de plugins/ruflo-aidefence/hooks/screen.ts do Ruflo
 * (github.com/ruvnet/ruflo, commit cee502244be3c180a48a830c59a512cdce4f6fa5, MIT, Copyright (c) 2024-2026
 * ruvnet), copiadas e revisadas linha a linha; as variantes em português e o porteiro de comandos são nossos.
 * O aviso de copyright e o texto integral da licença MIT dessas expressões estão em LICENSE-ruflo.txt, nesta
 * mesma pasta (conferidos no LICENSE do commit acima). Ver docs/skills-de-fora.md, lote de 12/11/2026.
 *
 * Ligado em .claude/settings.json (PreToolUse, matcher Bash) em 12/11/2026, depois da revisão da Muralha e do Crivo e do teste de uso com comandos reais da casa.
 */
'use strict';
const fs = require('fs');

// ── triagem de texto (do screen.ts, MIT) ─────────────────────────────────────
const SEGREDOS = [
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['chave de acesso AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['token do GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['token do Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['chave do Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['chave da Anthropic ou da OpenAI', /\bsk-(?:(?:ant|proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|(?=[A-Za-z]{0,40}\d)[A-Za-z0-9]{32,})/],
  ['chave do Stripe', /\b[rs]k_live_[A-Za-z0-9]{16,}/],
  ['token do npm', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['token do Hugging Face', /\bhf_[A-Za-z0-9]{30,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['token Bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/],
  ['endereço com senha', /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s/]+/i],
];

const INJECAO = [
  ['mandar ignorar instruções', /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|system)\b[^.\n]{0,30}\b(?:instructions?|rules?|prompts?|guidelines?)\b/i],
  ['mandar ignorar instruções (pt)', /\b(?:ignore|desconsidere|esqueça|esqueca|descarte)\b[^.\n]{0,40}\b(?:as |todas as |suas )?(?:instruç(?:ão|ões)|instruc(?:ao|oes)|regras|ordens|orientaç(?:ão|ões))\b[^.\n]{0,30}\b(?:anteriores|acima|do sistema|que recebeu)?/i],
  ['trocar o papel do agente', /\byou are (?:now|no longer)\b|\bact as (?:an? )?(?:unrestricted|jailbroken)\b|\b(?:agora )?voc[eê] (?:agora )?(?:é|e) um (?:assistente|agente) sem (?:regras|limites|restriç)/i],
  ['instrução nova escondida', /\b(?:new|updated|real) (?:system )?instructions?\s*:|\b(?:novas|verdadeiras) instruç(?:ões|oes)\s*:/i],
  ['etiqueta falsa de sistema', /<\/?\s*(?:system|assistant|developer|instructions?)\s*>|^\s*(?:system|assistant)\s*:/im],
  ['esconder do usuário', /\bdo not (?:tell|inform|mention|reveal)[^.\n]{0,30}\b(?:user|human|operator)\b|\bn[aã]o (?:conte|diga|avise|mostre|revele)[^.\n]{0,30}\b(?:ao |para o |pro )?(?:usu[aá]rio|dono|operador)\b/i],
  ['mandar segredo para fora', /\b(?:exfiltrate|send|post|upload|e-?mail|envie|mande|poste|suba)\b(?:[^.\n]|\.(?=\S)){0,50}(?:\b(?:secrets?|credentials?|api keys?|segredos?|credenciais|chaves? de api|senhas?)\b|\.env(?:rc)?\b)/i],
  ['baixar e executar', /\b(?:curl|wget)\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/i],
];

// Controles C0/C1 (menos tab e nova linha), DEL, hífen suave, junções de largura zero, bidirecionais e de formato.
const INVISIVEL = new RegExp(
  '[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u00ad\\u034f\\u061c\\u115f\\u1160\\u17b4\\u17b5\\u180b-\\u180e\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0\\ufff9-\\ufffb]',
  'g',
);
// Seletor de variação (FE0E/FE0F) e junção de largura zero (200D) fazem parte de emoji comum (❤️, 👨‍👩‍👧, 1️⃣).
// Dentro de uma sequência de emoji não contam como invisível; soltos no texto, contam. (Nosso, 12/11/2026.)
const EMOJI_SEQ = /(?:[#*0-9]\ufe0f?\u20e3|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|[\ufe0e\ufe0f])?(?:\u200d\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|[\ufe0e\ufe0f])?)*)/gu;
const MAX = 200000;

function triagem(texto) {
  const t = String(texto || '');
  const corpo = t.length > MAX ? t.slice(0, MAX / 2) + '\n' + t.slice(-MAX / 2) : t;
  const achados = [];
  const semEmoji = corpo.replace(EMOJI_SEQ, m => m.replace(/[\u200d\ufe0e\ufe0f]/g, ''));
  const invisiveis = (semEmoji.match(INVISIVEL) || []).length;
  if (invisiveis) achados.push(`caractere invisível ou de controle (${invisiveis})`);
  const limpo = semEmoji.replace(INVISIVEL, '');
  for (const [nome, re] of SEGREDOS) if (re.test(limpo)) achados.push('segredo: ' + nome);
  for (const [nome, re] of INJECAO) if (re.test(limpo)) achados.push('instrução escondida: ' + nome);
  return achados;
}

// ── porteiro de comandos (nosso) ─────────────────────────────────────────────
// npx de ferramenta que o projeto já tem instalada, usada na casa (levantamento de 12/11/2026).
const NPX_DA_CASA = new Set(['playwright', 'serve', 'eslint', 'vite', 'cross-env', 'wrangler', 'tsc', 'prettier', 'vitest']);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function partes(comando) {
  // separa por ; && || | nova linha, $( e crase: cada trecho é avaliado sozinho
  return comando.split(/\|\||&&|[;|\n`]|\$\(/).map(s => s.trim()).filter(Boolean);
}

function palavras(trecho) {
  return trecho.replace(/["']/g, ' ').split(/\s+/).filter(Boolean);
}

function pacoteFixo(spec) {
  // nome@1.2.3 ou @escopo/nome@1.2.3; caminho local (./, ../, /) e arquivo .tgz contam como fixos
  if (/^(?:\.{1,2}(?:\/|$)|\/|file:)/.test(spec) || /\.tgz$/.test(spec)) return true;
  const m = /^(@?[^@\s]+)@(.+)$/.exec(spec);
  return Boolean(m && SEMVER.test(m[2]));
}

function semFlags(lista) {
  return lista.filter(w => !w.startsWith('-'));
}

// Posição do primeiro subcomando da lista, pulando flags (-q, --verbose). -1 se a primeira palavra
// que não é flag for outra coisa.
function posSub(lista, subs) {
  for (let k = 0; k < lista.length; k++) {
    if (lista[k].startsWith('-')) continue;
    return subs.includes(lista[k]) ? k : -1;
  }
  return -1;
}

// python [flags] -m modulo: posição do -m (ou de flags juntas que terminam em m, como -Im), pulando
// -I, -B, -u, -E, -s, -S, -O e as que levam argumento (-X opção, -W aviso). -1 se não for -m.
function posModulo(resto) {
  for (let k = 0; k < resto.length; k++) {
    const x = resto[k];
    if (x === '-m' || /^-[A-Za-z]*m$/.test(x)) return k;
    if (x === '-X' || x === '-W') { k++; continue; }
    if (x.startsWith('-')) continue;
    return -1;
  }
  return -1;
}

function avaliarTrecho(t) {
  const w = palavras(t);
  if (!w.length) return null;
  let i = 0;
  while (i < w.length && (/^[A-Z_][A-Z0-9_]*=/.test(w[i]) || w[i] === 'sudo' || w[i] === 'env' || w[i] === 'command' || w[i] === 'exec')) i++;
  const cmd = w[i];
  const resto = w.slice(i + 1);
  if (!cmd) return null;
  const nome = cmd.split('/').pop();

  // bash -c "...": avalia o texto de dentro
  if (['bash', 'sh', 'zsh', 'dash'].includes(nome) && resto[0] === '-c') return avaliar(resto.slice(1).join(' ')) || null;

  // npx, bunx, pnpm dlx, yarn dlx, npm exec: baixa e executa pacote
  let alvo = null;
  if (nome === 'npx' || nome === 'bunx') alvo = semFlags(resto)[0];
  else if ((nome === 'pnpm' || nome === 'yarn') && resto[0] === 'dlx') alvo = semFlags(resto.slice(1))[0];
  else if (nome === 'npm' && (resto[0] === 'exec' || resto[0] === 'x')) alvo = semFlags(resto.slice(1))[0];
  if (alvo !== null) {
    const extras = [];
    resto.forEach((x, k) => {
      if ((x === '-p' || x === '--package') && resto[k + 1]) extras.push(resto[k + 1]);
      else if (x.startsWith('--package=')) extras.push(x.slice(10));
    });
    for (const p of extras.concat(alvo ? [alvo] : [])) {
      if (NPX_DA_CASA.has(p) || pacoteFixo(p)) continue;
      return `"${nome} ${p}" baixa e executa um pacote sem versão fixada. Use versão exata (nome@1.2.3) depois de ler a fonte (skill find-skills), ou uma ferramenta que o projeto já tem.`;
    }
    return null;
  }

  // npm/pnpm/yarn/bun install|add com pacote: só com versão exata
  const gerentes = { npm: ['install', 'i', 'add', 'isntall'], pnpm: ['add', 'install', 'i'], yarn: ['add', 'global'], bun: ['add', 'install', 'i'] };
  if (gerentes[nome] && gerentes[nome].includes(resto[0])) {
    const pacotes = semFlags(resto.slice(1)).filter(p => p !== 'add');
    const soltos = pacotes.filter(p => !pacoteFixo(p));
    if (soltos.length) return `"${nome} ${resto[0]} ${soltos.join(' ')}" instala sem versão exata. Regra da casa: dependência nova com versão fixada (nome@1.2.3) e fonte lida antes.`;
    return null;
  }

  // uvx e uv tool run: o npx do Python (baixa e executa). Só com versão exata (nome==1.2.3 ou nome@1.2.3).
  const eUvx = nome === 'uvx' || (nome === 'uv' && posSub(resto, ['tool']) !== -1 && resto[posSub(resto, ['tool']) + 1] === 'run');
  if (eUvx) {
    const args = nome === 'uvx' ? resto : resto.slice(posSub(resto, ['tool']) + 2);
    const fixo = p => /^[A-Za-z0-9._\[\],-]+(?:==|@)[0-9][0-9A-Za-z.+-]*$/.test(p);
    const extras = [];
    args.forEach((x, k) => {
      if ((x === '--from' || x === '--with') && args[k + 1]) extras.push(args[k + 1]);
      else if (x.startsWith('--from=') || x.startsWith('--with=')) extras.push(x.split('=').slice(1).join('='));
    });
    const alvo = semFlags(args.filter((x, k) => !['--from', '--with', '--python', '-p'].includes(args[k - 1])))[0];
    const fonte = extras.length ? extras : alvo ? [alvo] : [];
    const solto = fonte.find(p => !fixo(p) && !/^(?:\.{1,2}(?:\/|$)|\/)/.test(p));
    if (solto) return `"${nome} ${solto}" baixa e executa um pacote Python sem versão exata (nome==1.2.3). Leia a fonte antes (skill find-skills).`;
    return null;
  }

  // pip install: só com ==versão ou arquivo de requisitos. Aceita flags antes do subcomando
  // (python3 -I -B -m pip install, pip --quiet install, pipx --verbose run).
  const posPyM = /^python[0-9.]*$/.test(nome) ? posModulo(resto) : -1;
  const ePyPip = posPyM !== -1 && resto[posPyM + 1] === 'pip' && posSub(resto.slice(posPyM + 2), ['install']) !== -1;
  const ePip = /^pip[0-9.]*$/.test(nome) && posSub(resto, ['install']) !== -1;
  const eUv = nome === 'uv' && resto[posSub(resto, ['pip'])] === 'pip' && resto[posSub(resto, ['pip']) + 1] === 'install';
  const ePipx = nome === 'pipx' && posSub(resto, ['install', 'run']) !== -1;
  if (ePip || ePyPip || eUv || ePipx) {
    let ini;
    if (ePyPip) ini = posPyM + 2 + posSub(resto.slice(posPyM + 2), ['install']) + 1;
    else if (ePip) ini = posSub(resto, ['install']) + 1;
    else if (eUv) ini = posSub(resto, ['pip']) + 2;
    else ini = posSub(resto, ['install', 'run']) + 1;
    const args = resto.slice(ini);
    const pacotes = [];
    for (let k = 0; k < args.length; k++) {
      if (args[k] === '-r' || args[k] === '--requirement' || args[k] === '-c' || args[k] === '--constraint') { k++; continue; }
      if (args[k].startsWith('-')) continue;
      pacotes.push(args[k]);
    }
    // pipx run --spec pacote==1.2.3 app: o que baixa é o --spec; o nome depois é só o programa
    const spec = args.findIndex(x => x === '--spec');
    if (ePipx && spec !== -1 && args[spec + 1]) pacotes.splice(0, pacotes.length, args[spec + 1]);
    else if (ePipx && args.some(x => x.startsWith('--spec='))) pacotes.splice(0, pacotes.length, args.find(x => x.startsWith('--spec=')).slice(7));
    const soltos = pacotes.filter(p => !/^[A-Za-z0-9._\[\],-]+==[0-9][0-9A-Za-z.+-]*$/.test(p) && !/^(?:\.{1,2}(?:\/|$)|\/)/.test(p));
    if (soltos.length) return `"${nome} install ${soltos.join(' ')}" instala sem versão exata (pacote==1.2.3). Leia a fonte antes (skill find-skills).`;
    return null;
  }
  return null;
}

function avaliar(comando) {
  if (typeof comando !== 'string' || !comando.trim()) return 'comando vazio ou ilegível';
  // baixar e executar, em qualquer forma
  if (/\b(?:curl|wget)\b[^|\n]{0,300}\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/i.test(comando) ||
      /\b(?:ba|z)?sh\s+(?:-c\s+)?["']?\s*<?\s*\(\s*(?:curl|wget)\b/i.test(comando) ||
      /\b(?:ba|z)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b/i.test(comando) ||
      /\b(?:curl|wget)\b[^|\n]{0,300}\|\s*(?:sudo\s+)?(?:python[0-9.]*|node|perl|ruby)\b/i.test(comando)) {
    return 'baixar e executar na mesma linha (curl ou wget com | sh) é proibido. Baixe, leia e só então decida (skill find-skills).';
  }
  for (const t of partes(comando)) {
    const motivo = avaliarTrecho(t);
    if (motivo) return motivo;
  }
  return null;
}

function lerEntrada() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function principal() {
  const modo = process.argv[2];
  if (modo === 'pre') {
    let d;
    try { d = JSON.parse(lerEntrada()); } catch (e) { process.stderr.write('porteiro: entrada do gancho ilegível\n'); return 2; }
    if (!d || d.tool_name !== 'Bash') return 0;
    const motivo = avaliar(d.tool_input && d.tool_input.command);
    if (motivo) { process.stderr.write('porteiro: ' + motivo + '\n'); return 2; }
    return 0;
  }
  if (modo === 'triagem') {
    let texto;
    try { texto = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : lerEntrada(); } catch (e) { process.stderr.write('porteiro: não li o arquivo\n'); return 2; }
    const achados = triagem(texto);
    if (!achados.length) { process.stdout.write('limpo\n'); return 0; }
    process.stdout.write(achados.map(a => '- ' + a).join('\n') + '\n');
    return 1;
  }
  process.stderr.write('uso: node porteiro.cjs pre | triagem [arquivo]\n');
  return 2;
}

if (require.main === module) {
  try { process.exitCode = principal(); } catch (e) { process.stderr.write('porteiro: erro interno\n'); process.exitCode = 2; }
}

module.exports = { avaliar, triagem, pacoteFixo };
