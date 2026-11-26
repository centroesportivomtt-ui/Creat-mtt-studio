// Núcleo comum dos modelos de social media (carrossel e apresentação).
// Lê a marca, resolve caminhos de logo e fontes para file:// e valida o JSON de entrada.
// Sem rede, sem modelo de IA: só arquivos locais e o Chromium do Playwright.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const MODELOS = __dirname;
const MARCA_PADRAO = path.join(MODELOS, 'marca-creat-mtt.json');

function lerJson(arquivo, rotulo) {
  if (!arquivo || !fs.existsSync(arquivo)) throw new Error(`${rotulo} não encontrado: ${arquivo}`);
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); }
  catch (e) { throw new Error(`${rotulo} não é JSON válido (${arquivo}): ${e.message}`); }
}

// Procura o arquivo relativo à pasta da marca; se não achar, relativo à pasta dos modelos
// (assim uma marca de cliente pode reaproveitar as fontes da casa sem copiar).
function resolver(rel, pastaMarca, rotulo) {
  if (!rel) return null;
  const candidatos = path.isAbsolute(rel) ? [rel] : [path.resolve(pastaMarca, rel), path.resolve(MODELOS, rel)];
  const achado = candidatos.find((c) => fs.existsSync(c));
  if (!achado) throw new Error(`${rotulo} não encontrado: ${rel} (procurei em ${candidatos.join(' e ')})`);
  return pathToFileURL(achado).href;
}

const COR = /^#[0-9a-f]{6}$/i;
const CORES = ['fundo', 'brilho', 'destaque', 'sobre_destaque', 'tinta', 'tinta_suave', 'linha'];

function carregarMarca(arquivo) {
  const arq = path.resolve(arquivo || MARCA_PADRAO);
  const m = lerJson(arq, 'Arquivo de marca');
  const pasta = path.dirname(arq);
  const base = lerJson(MARCA_PADRAO, 'Marca padrão');
  const cores = { ...base.cores, ...(m.cores || {}) };
  for (const c of CORES) if (!COR.test(cores[c] || '')) throw new Error(`Cor "${c}" da marca precisa ser #rrggbb (veio "${cores[c]}")`);
  const fontes = { display: { ...base.fontes.display, ...((m.fontes || {}).display || {}) }, texto: { ...base.fontes.texto, ...((m.fontes || {}).texto || {}) } };
  return {
    nome: m.nome || 'Marca',
    arroba: m.arroba || '',
    logo: m.logo ? resolver(m.logo, pasta, 'Logo') : null,
    cores,
    fontes: {
      display: { ...fontes.display, url: resolver(fontes.display.arquivo, pasta, 'Fonte display') },
      texto: { ...fontes.texto, url: resolver(fontes.texto.arquivo, pasta, 'Fonte de texto') },
    },
  };
}

module.exports = { MODELOS, MARCA_PADRAO, lerJson, carregarMarca };
