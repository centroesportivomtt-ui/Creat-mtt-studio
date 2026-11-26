#!/usr/bin/env node
/* Monta o mês de uma empresa no padrão social-media da creat.MTT, sem modelo de IA e sem custo.

   node .claude/skills/social-media/rodar-mes.cjs --empresa "creat.MTT" --mes dezembro --ano 2026 \
        --textos <pasta-com-os-5-arquivos> --saida <pasta> [--marca <marca.json>]

   A pasta de textos tem: estrategia*.md, agenda.json, carrossel.json, apresentacao.json, atendente-direct.md
   (ficha-da-empresa.md é opcional). O script:
   1. confere os 5 arquivos e cada evento da agenda (data, hora, fim depois do início, título curto);
   2. gera o carrossel (PNG 1080x1350 + prancha) e a apresentação (PDF + PNG por slide) pelos modelos;
   3. monta <saida>/entrega/ igual à pasta do Dropbox, com nomes e pastas sem acento (o Dropbox descarta no envio
      arquivo com acento no nome ou no caminho); <saida> também precisa ser um caminho sem acento;
   4. grava <saida>/manifesto.json com, para cada arquivo, o caminho local, o nome de envio e o nome final com acento,
      e a lista de eventos da Google Agenda já com "[EMPRESA]" no título e a cor da empresa (empresas.json);
   5. escreve o LEIA PRIMEIRO.md.
   Código de saída 0 = tudo certo; 1 = algo para corrigir (a mensagem diz o quê). Envio ao Dropbox e criação dos eventos
   são feitos depois, pelos conectores, seguindo o manifesto (SKILL.md, seções 2 e 6). */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const AQUI = __dirname;
const MODELOS = path.join(AQUI, 'modelos');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function falha(msg) { console.error('erro   ' + msg); process.exit(1); }
function arg(nome, obrigatorio = true) {
  const a = process.argv.slice(2), i = a.indexOf('--' + nome);
  if (i < 0 || !a[i + 1]) { if (obrigatorio) falha(`falta --${nome}`); return null; }
  return a[i + 1];
}
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const lerJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { falha(`${path.basename(p)} não é JSON válido: ${e.message}`); } };

const empresa = arg('empresa');
const mes = arg('mes').toLowerCase();
const ano = Number(arg('ano'));
const pastaTextos = path.resolve(arg('textos'));
const saida = path.resolve(arg('saida'));
const marcaArg = arg('marca', false);
const iMes = MESES.indexOf(mes);
if (iMes < 0) falha(`mês "${mes}" inválido (use: ${MESES.join(', ')})`);
if (!(ano >= 2026 && ano <= 2100)) falha('ano inválido');
if (/[^\x20-\x7E]/.test(saida)) falha(`--saida com acento (${saida}): o envio ao Dropbox barra caminho com acento; use uma pasta sem acento`);

const empresas = lerJson(path.join(AQUI, 'empresas.json')).empresas;
const cad = empresas[empresa];
if (!cad) falha(`empresa "${empresa}" não está em empresas.json: cadastre com a próxima cor livre antes de rodar`);
const marca = marcaArg ? path.resolve(marcaArg) : (cad.marca ? path.join(AQUI, cad.marca) : null);
if (!marca || !fs.existsSync(marca)) falha(`sem arquivo de marca para "${empresa}": crie modelos/marcas/<empresa>.json (veja modelos/LEIA-ME.md) e passe --marca`);

// 1. Os 5 arquivos
const arquivos = fs.readdirSync(pastaTextos);
const achar = re => { const f = arquivos.find(n => re.test(n)); return f ? path.join(pastaTextos, f) : null; };
const ent = {
  estrategia: achar(/^estrategia.*\.md$/i),
  agenda: achar(/^agenda\.json$/i),
  carrossel: achar(/^carrossel\.json$/i),
  apresentacao: achar(/^apresentacao\.json$/i),
  atendente: achar(/^atendente-direct\.md$/i),
  ficha: achar(/^ficha.*\.md$/i)
};
for (const k of ['estrategia', 'agenda', 'carrossel', 'apresentacao', 'atendente']) if (!ent[k]) falha(`falta o arquivo de ${k} em ${pastaTextos}`);

// Agenda: cada evento conferido
const agenda = lerJson(ent.agenda);
if (!Array.isArray(agenda) || !agenda.length) falha('agenda.json precisa ser uma lista com eventos');
const problemas = [];
const inicioJanela = new Date(Date.UTC(ano, iMes, 1) - 7 * 864e5);   // aceita a semana anterior (arrumação do perfil)
const fimJanela = new Date(Date.UTC(ano, iMes + 1, 1));
agenda.forEach((e, i) => {
  const onde = `evento ${i + 1} (${e.titulo || 'sem título'})`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data || '')) return problemas.push(`${onde}: data fora do formato AAAA-MM-DD`);
  const d = new Date(e.data + 'T00:00:00Z');
  if (isNaN(d) || d < inicioJanela || d >= fimJanela) problemas.push(`${onde}: data ${e.data} fora de ${mes}/${ano}`);
  if (!/^\d{2}:\d{2}$/.test(e.inicio || '') || !/^\d{2}:\d{2}$/.test(e.fim || '')) problemas.push(`${onde}: hora fora do formato HH:MM`);
  else if (e.fim <= e.inicio) problemas.push(`${onde}: fim (${e.fim}) não é depois do início (${e.inicio})`);
  if (!e.titulo || e.titulo.length > 70) problemas.push(`${onde}: título vazio ou com mais de 70 caracteres`);
});
if (problemas.length) falha('agenda.json:\n  ' + problemas.join('\n  '));

// 2. Arte
const pasta = `Social Media ${cap(mes)}`;
const trabalho = path.join(saida, 'render');
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(trabalho, { recursive: true });
function rodar(script, a) {
  const r = spawnSync(process.execPath, [path.join(MODELOS, script), ...a, '--marca', marca], { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status !== 0) falha(`${script} terminou com código ${r.status}: corrija o texto apontado acima e rode de novo`);
}
rodar('render-carrossel.cjs', [ent.carrossel, path.join(trabalho, 'carrossel')]);
rodar('render-apresentacao.cjs', [ent.apresentacao, path.join(trabalho, 'apresentacao.pdf')]);

// 3. Entrega igual ao Dropbox
const carrossel = lerJson(ent.carrossel);
const temaCurto = (carrossel.tema_curto || carrossel.tema || 'carrossel').split(/[:.]/)[0].trim().slice(0, 40);
const entrega = path.join(saida, 'entrega');
const manifesto = { empresa, mes, ano, pasta_dropbox: `/Marcos/${empresa}/${pasta}`, arquivos: [], eventos: [] };
function por(sub, nomeFinal, origem, conteudo) {
  // O formulário do Dropbox põe "<remetente> - " na frente do nome: o envio vai sem o prefixo da empresa.
  const prefixo = `${empresa} - `;
  const nomeEnvio = semAcento(!origem || /\.(md|json|txt)$/i.test(nomeFinal) ? nomeFinal : (nomeFinal.startsWith(prefixo) ? nomeFinal.slice(prefixo.length) : nomeFinal));
  const dir = path.join(entrega, semAcento(sub));   // pasta local sem acento: acento no caminho também barra o envio
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, nomeEnvio);
  if (origem) fs.copyFileSync(origem, destino); else fs.writeFileSync(destino, conteudo);
  manifesto.arquivos.push({ pasta: sub, nome_final: nomeFinal, nome_envio: nomeEnvio, local: destino, texto: /\.(md|json|txt)$/i.test(nomeFinal) });
}
const cartoes = fs.readdirSync(path.join(trabalho, 'carrossel')).filter(n => /^cartao-\d+\.png$/.test(n)).sort();
cartoes.forEach((n, i) => por('0 - Para aprovar/Imagens', `${empresa} - ${temaCurto} - cartão ${i + 1}.png`, path.join(trabalho, 'carrossel', n)));
por('0 - Para aprovar/Imagens', `${empresa} - ${temaCurto} - todos os cartões.jpg`, path.join(trabalho, 'carrossel', 'prancha.jpg'));
por('4 - Textos', `${empresa} - ${temaCurto} - legenda.md`, null, `# ${carrossel.tema}\n\n${carrossel.legenda || ''}\n`);
por('4 - Textos', `${empresa} - Estratégia de ${mes}.md`, ent.estrategia);
por('4 - Textos', `${empresa} - Atendente do Direct.md`, ent.atendente);
if (ent.ficha) por('4 - Textos', `${empresa} - Ficha da empresa.md`, ent.ficha);
por('5 - Relatórios', `${empresa} - Plano de ${mes} - apresentação.pdf`, path.join(trabalho, 'apresentacao.pdf'));
for (const k of ['agenda', 'carrossel', 'apresentacao']) por('7 - Projeto editável', path.basename(ent[k]), ent[k]);

// 4. Eventos da Google Agenda
for (const e of agenda) {
  const gravacao = /\bGravar\b/.test(e.titulo);   // só o bloco de gravação ganha lembrete de 60 min
  manifesto.eventos.push({
    summary: `[${empresa}] ${e.titulo}`,
    startTime: `${e.data}T${e.inicio}:00`,
    endTime: `${e.data}T${e.fim}:00`,
    colorId: cad.colorId,
    description: `${e.descricao || ''}\n\nPadrão social media creat.MTT · Dropbox: /Marcos/${empresa}/${pasta}`,
    notificationLevel: 'NONE',
    overrideReminders: [{ method: 'popup', minutes: gravacao ? 60 : 15 }]
  });
}

// 5. LEIA PRIMEIRO
const leia = `# ${empresa} · ${pasta} ${ano}

Padrão fixo de social media da creat.MTT. Feito pela agência.

## O que aprovar agora
- Carrossel "${carrossel.tema}": \`0 - Para aprovar/Imagens\` (${cartoes.length} cartões e a prancha com todos). Aprovado, vai para \`3 - Imagens\` e é agendado.
- Apresentação do mês: \`5 - Relatórios\` (o mês inteiro em ${lerJson(ent.apresentacao).slides.length} slides).

## Onde está cada coisa
- \`4 - Textos\`: estratégia do mês, atendente do Direct (respostas prontas e palavras-chave), legenda do carrossel.
- \`5 - Relatórios\`: apresentação em PDF.
- \`7 - Projeto editável\`: os arquivos que geram tudo de novo (agenda, carrossel, apresentação).
- Google Agenda: ${agenda.length} compromissos com "[${empresa}]" no título, na cor ${cad.cor}.
`;
fs.mkdirSync(entrega, { recursive: true });
fs.writeFileSync(path.join(entrega, 'LEIA PRIMEIRO.md'), leia);
manifesto.arquivos.push({ pasta: '', nome_final: 'LEIA PRIMEIRO.md', nome_envio: 'LEIA PRIMEIRO.md', local: path.join(entrega, 'LEIA PRIMEIRO.md'), texto: true });
fs.writeFileSync(path.join(saida, 'manifesto.json'), JSON.stringify(manifesto, null, 2));

console.log(`ok     ${empresa} · ${mes}/${ano}: ${cartoes.length} cartões, apresentação, ${manifesto.arquivos.length} arquivos, ${agenda.length} eventos`);
console.log(`       entrega: ${entrega}`);
console.log(`       manifesto: ${path.join(saida, 'manifesto.json')}`);
