#!/usr/bin/env node
// Empacotador da loja Creat Nuvem. Zero dependências (só módulos do Node).
//
// Uso (a partir da raiz do repositório ou de qualquer lugar):
//   node projetos/loja/empacotar.cjs                 gera os 4 zips em projetos/loja/dist/
//   node projetos/loja/empacotar.cjs lite kit-toon   gera só os produtos indicados
//   node projetos/loja/empacotar.cjs --verificar     gera e depois relê cada zip, conferindo CRC
//   node projetos/loja/empacotar.cjs --listar        mostra os ids dos produtos
//   node projetos/loja/empacotar.cjs --final         como o padrão, mas aborta se sobrar marcador
//                                                    como [NOME_TITULAR] ou [EMAIL_SUPORTE] (use antes de vender).
//                                                    Também confere o texto dos PDFs (via pdftotext, se houver),
//                                                    as fontes HTML dos PDFs e se o PDF é mais novo que a fonte.
//
// Ids: agencia, kit-toon, barbearia, lite.
//
// O zip é escrito à mão (deflate do zlib + CRC32 por tabela), com data fixa e
// arquivos em ordem alfabética: a mesma origem gera sempre o mesmo zip, byte a byte.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');

const LOJA = __dirname;
const RAIZ = path.resolve(LOJA, '..', '..');
const DIST = path.join(LOJA, 'dist');
const PRODUTOS = path.join(LOJA, 'produtos');

// Caminho relativo à raiz do repositório, sempre com '/', para mensagens e logs.
const rel = (abs) => path.relative(RAIZ, abs).split(path.sep).join('/') || '.';

// ---------------------------------------------------------------------------
// Exclusões globais (por nome, em qualquer nível)
// ---------------------------------------------------------------------------
const NOMES_EXCLUIDOS = new Set([
  '.mcp.json', '.verificacao', 'node_modules', 'estado.json', '.git',
  '.impeccable', '.env', '.DS_Store', 'settings.local.json', 'dist',
  // Notas internas da equipe (relatórios de QA, nomes de agentes, falhas): nunca vão para o comprador.
  'RELATORIO.md',
]);
function excluido(nome) {
  if (NOMES_EXCLUIDOS.has(nome)) return true;
  // .env.* fica de fora; .env.example é a exceção (é o modelo sem segredo que o comprador precisa).
  if (nome.startsWith('.env.') && nome !== '.env.example') return true;
  if (nome.endsWith('.log')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Varredura de segredos e caminhos de máquina
// ---------------------------------------------------------------------------
const PADROES_PROIBIDOS = [
  { nome: "caminho '/home/'", re: /\/home\// },
  { nome: "caminho '/Users/'", re: /\/Users\// },
  { nome: "caminho 'C:\\Users'", re: /C:\\Users/i },
  { nome: 'chave sk-...', re: /(^|[^A-Za-z0-9_-])sk-(ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/ },
  { nome: "token 'ghp_'", re: /ghp_[A-Za-z0-9]/ },
  { nome: "chave AWS 'AKIA'", re: /AKIA[0-9A-Z]{12,}/ },
  { nome: 'chave privada', re: /BEGIN [A-Z ]*PRIVATE KEY/ },
  { nome: "'token='", re: /token=/i },
];
const EXT_BINARIAS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.mp3', '.ogg', '.wav',
  '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf', '.zip', '.glb', '.gltf', '.bin',
]);
function ehTexto(nome, buf) {
  if (EXT_BINARIAS.has(path.extname(nome).toLowerCase())) return false;
  return !buf.subarray(0, 8192).includes(0);
}
function varrer(entradas) {
  const achados = [];
  for (const e of entradas) {
    if (!ehTexto(e.nome, e.dados)) continue;
    const linhas = e.dados.toString('utf8').split(/\r?\n/);
    linhas.forEach((linha, i) => {
      for (const p of PADROES_PROIBIDOS) {
        if (p.re.test(linha)) achados.push(`${e.nome}:${i + 1}  ${p.nome}  (origem: ${e.origem})`);
      }
    });
  }
  return achados;
}

// Marcadores que precisam ser preenchidos antes de vender. Sem --final viram aviso; com --final, erro.
const MARCADORES_PENDENTES = /\[(NOME_TITULAR|EMAIL_SUPORTE|LINK_[A-Z0-9_.]+|PREENCHER)\]/g;
function marcadores(entradas) {
  const achados = [];
  for (const e of entradas) {
    if (!ehTexto(e.nome, e.dados)) continue;
    e.dados.toString('utf8').split(/\r?\n/).forEach((linha, i) => {
      // Marcador citado entre crases (`[PREENCHER]`) é documentação, como no checklist
      // do padrao-de-entrega; não conta como pendência.
      const ms = linha.replace(/`[^`]*`/g, '').match(MARCADORES_PENDENTES);
      if (ms) achados.push(`${e.nome}:${i + 1}  ${[...new Set(ms)].join(' ')}`);
    });
  }
  return achados;
}

// Texto de um PDF via pdftotext (poppler). Devolve null se a ferramenta não existir.
function textoDoPdf(buf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'empacotar-'));
  try {
    const arq = path.join(tmp, 'x.pdf');
    fs.writeFileSync(arq, buf);
    return cp.execFileSync('pdftotext', ['-enc', 'UTF-8', arq, '-'], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`pdftotext falhou: ${e.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Marcadores fora do que é texto puro: o texto dos PDFs e as fontes declaradas (arquivo que gera um
// binário do zip, como GUIA.html -> GUIA.pdf). Devolve { achados, avisos }.
function marcadoresExtras(p, entradas) {
  const achados = [];
  const avisos = [];
  for (const e of entradas) {
    if (path.extname(e.nome).toLowerCase() !== '.pdf') continue;
    const txt = textoDoPdf(e.dados);
    if (txt === null) { avisos.push(`${e.nome}: pdftotext não encontrado; texto do PDF não conferido (instale poppler-utils)`); continue; }
    for (const a of marcadores([{ nome: e.nome + ' (texto do PDF)', dados: txt }])) achados.push(a);
  }
  for (const f of p.fontes || []) {
    const fonteAbs = path.join(RAIZ, f.fonte);
    const geradoAbs = path.join(RAIZ, f.gera);
    if (!fs.existsSync(fonteAbs)) continue;
    for (const a of marcadores([{ nome: f.fonte, dados: fs.readFileSync(fonteAbs) }])) achados.push(`${a}  (fonte de ${f.gera})`);
    if (fs.existsSync(geradoAbs) && fs.statSync(geradoAbs).mtimeMs < fs.statSync(fonteAbs).mtimeMs) {
      achados.push(`${f.gera} é mais antigo que ${f.fonte}; rode ${f.comando}`);
    }
  }
  return { achados, avisos };
}

// ---------------------------------------------------------------------------
// CRC32 por tabela
// ---------------------------------------------------------------------------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// Escritor de ZIP (PKZIP 2.0, deflate ou store, nomes UTF-8)
// ---------------------------------------------------------------------------
// Data fixa: 2026-01-01 00:00:00 no formato DOS.
const DOS_HORA = 0;
const DOS_DATA = ((2026 - 1980) << 9) | (1 << 5) | 1;
const FLAG_UTF8 = 0x0800;

function escreverZip(entradas) {
  const locais = [];
  const central = [];
  let deslocamento = 0;

  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const crc = crc32(e.dados);
    const deflado = zlib.deflateRawSync(e.dados, { level: 9 });
    const usarDeflate = deflado.length < e.dados.length;
    const corpo = usarDeflate ? deflado : e.dados;
    const metodo = usarDeflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);                 // versão necessária
    lh.writeUInt16LE(FLAG_UTF8, 6);
    lh.writeUInt16LE(metodo, 8);
    lh.writeUInt16LE(DOS_HORA, 10);
    lh.writeUInt16LE(DOS_DATA, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(corpo.length, 18);
    lh.writeUInt32LE(e.dados.length, 22);
    lh.writeUInt16LE(nome.length, 26);
    lh.writeUInt16LE(0, 28);                 // extra
    locais.push(lh, nome, corpo);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);      // feito por: Unix, v2.0
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(FLAG_UTF8, 8);
    ch.writeUInt16LE(metodo, 10);
    ch.writeUInt16LE(DOS_HORA, 12);
    ch.writeUInt16LE(DOS_DATA, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(corpo.length, 20);
    ch.writeUInt32LE(e.dados.length, 24);
    ch.writeUInt16LE(nome.length, 28);
    ch.writeUInt16LE(0, 30);                 // extra
    ch.writeUInt16LE(0, 32);                 // comentário
    ch.writeUInt16LE(0, 34);                 // disco
    ch.writeUInt16LE(0, 36);                 // atributos internos
    ch.writeUInt32LE(((0o100644) << 16) >>> 0, 38); // -rw-r--r--
    ch.writeUInt32LE(deslocamento, 42);
    central.push(ch, nome);

    deslocamento += lh.length + nome.length + corpo.length;
  }

  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fim.writeUInt16LE(0, 20);

  if (entradas.length > 0xFFFF || deslocamento + tamCentral > 0xFFFFFFFF) {
    throw new Error('zip grande demais para o formato sem ZIP64');
  }
  return Buffer.concat([...locais, ...central, fim]);
}

// ---------------------------------------------------------------------------
// Leitor de ZIP (para --verificar)
// ---------------------------------------------------------------------------
function lerZip(buf) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) throw new Error('fim do diretório central não encontrado');
  const total = buf.readUInt16LE(p + 10);
  let c = buf.readUInt32LE(p + 16);
  const itens = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(c) !== 0x02014b50) throw new Error(`entrada ${i}: assinatura central inválida`);
    const metodo = buf.readUInt16LE(c + 10);
    const crc = buf.readUInt32LE(c + 16);
    const tamC = buf.readUInt32LE(c + 20);
    const tamO = buf.readUInt32LE(c + 24);
    const lenNome = buf.readUInt16LE(c + 28);
    const lenExtra = buf.readUInt16LE(c + 30);
    const lenCom = buf.readUInt16LE(c + 32);
    const off = buf.readUInt32LE(c + 42);
    const nome = buf.toString('utf8', c + 46, c + 46 + lenNome);
    c += 46 + lenNome + lenExtra + lenCom;

    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error(`${nome}: cabeçalho local inválido`);
    const ini = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const bruto = buf.subarray(ini, ini + tamC);
    let dados;
    if (metodo === 8) dados = zlib.inflateRawSync(bruto);
    else if (metodo === 0) dados = bruto;
    else throw new Error(`${nome}: método ${metodo} não suportado`);
    if (dados.length !== tamO) throw new Error(`${nome}: tamanho ${dados.length} difere do declarado ${tamO}`);
    const crcReal = crc32(dados);
    if (crcReal !== crc) throw new Error(`${nome}: CRC ${crcReal.toString(16)} difere do declarado ${crc.toString(16)}`);
    itens.push({ nome, tamanho: tamO, crc });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// Montagem do conteúdo
// ---------------------------------------------------------------------------
class OrigemFaltando extends Error {}

// Lista arquivos de uma pasta (recursivo), aplicando as exclusões por nome.
function andar(dirAbs, prefixoZip, saida) {
  const nomes = fs.readdirSync(dirAbs).sort();
  for (const n of nomes) {
    if (excluido(n)) continue;
    const abs = path.join(dirAbs, n);
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    const destino = prefixoZip ? `${prefixoZip}/${n}` : n;
    if (st.isDirectory()) andar(abs, destino, saida);
    else if (st.isFile()) saida.push({ origemAbs: abs, destino });
  }
}

// Cada produto descreve "o que vai para onde". Os passos coletam faltas antes de abortar.
function montador(raizZip) {
  const itens = new Map(); // destino -> { origemAbs }
  const faltas = [];
  const api = {
    // Copia uma pasta inteira para dentro de destDir.
    pasta(origemRel, destDir, { exigir = [] } = {}) {
      const abs = path.join(RAIZ, origemRel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) { faltas.push(origemRel + '/'); return api; }
      for (const req of exigir) {
        if (!fs.existsSync(path.join(abs, req))) faltas.push(`${origemRel}/${req}`);
      }
      const lista = [];
      andar(abs, destDir, lista);
      for (const it of lista) itens.set(it.destino, { origemAbs: it.origemAbs });
      return api;
    },
    // Copia um arquivo para um destino exato (sobrescreve o que a pasta tiver posto ali).
    arquivo(origemRel, destino) {
      const abs = path.join(RAIZ, origemRel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { faltas.push(origemRel); return api; }
      if (excluido(path.basename(destino))) throw new Error(`destino excluído pela lista global: ${destino}`);
      itens.set(destino, { origemAbs: abs });
      return api;
    },
    remover(destino) { itens.delete(destino); return api; },
    tem(destino) { return itens.has(destino); },
    faltas,
    entradas() {
      return [...itens.keys()].sort().map((destino) => {
        const { origemAbs } = itens.get(destino);
        return { nome: `${raizZip}/${destino}`, dados: fs.readFileSync(origemAbs), origem: rel(origemAbs) };
      });
    },
  };
  return api;
}

// Lê o import do toon-kit na demo para decidir onde o kit precisa estar no zip.
function destinoDoKitNaDemo(demoAbs) {
  if (!fs.existsSync(demoAbs)) return null;
  const html = fs.readFileSync(demoAbs, 'utf8');
  // import estático, import() dinâmico ou entrada de importmap ("toon-kit": "../toon-kit.js").
  const m = html.match(/from\s*['"]([^'"]*toon-kit\.js)['"]/)
    || html.match(/import\(\s*['"]([^'"]*toon-kit\.js)['"]/)
    || html.match(/['"]([^'"\s]*toon-kit\.js)['"]/);
  if (!m) throw new Error('demo/index.html não importa toon-kit.js; a demo abriria quebrada');
  const spec = m[1];
  if (/^(https?:)?\/\//.test(spec) || spec.startsWith('/')) {
    throw new Error(`a demo importa o kit por caminho absoluto ou URL (${spec}); use um caminho relativo, como ../toon-kit.js`);
  }
  const resolvido = path.posix.normalize(path.posix.join('demo', spec));
  if (resolvido.startsWith('..')) throw new Error(`a demo importa o kit de fora do pacote: ${spec}`);
  return resolvido;
}

const AGENTES_15 = [
  'arquiteto', 'backend', 'copywriter', 'criativo', 'designer', 'devops', 'diretor', 'frontend',
  'motion-3d', 'pesquisador', 'qa', 'revisor', 'seguranca', 'shader', 'som',
].map((a) => `${a}.md`);

const PRODUTOS_DEF = [
  {
    id: 'agencia',
    zip: 'creat-nuvem-agencia-15-agentes',
    montar(m) {
      m.pasta('.claude/agents', '.claude/agents', { exigir: AGENTES_15 });
      m.pasta('.claude/skills', '.claude/skills');
      m.pasta('.claude/workflows', '.claude/workflows');
      m.arquivo('CLAUDE.md', 'CLAUDE.md');
      m.arquivo('sede/index.html', 'sede/index.html');
      // Cópia endurecida do servidor (escuta só em 127.0.0.1, trava de caminho com separador).
      // A sede/servidor.cjs da casa não entra no pacote.
      m.arquivo('projetos/loja/produtos/agencia/sede/servidor.cjs', 'sede/servidor.cjs');
      m.arquivo('projetos/loja/produtos/agencia/README.md', 'README.md');
      m.arquivo('projetos/loja/produtos/agencia/GUIA.pdf', 'GUIA.pdf');
      m.arquivo('projetos/loja/produtos/LICENSE-creat-nuvem.txt', 'LICENSE');
    },
    fontes: [{
      fonte: 'projetos/loja/produtos/agencia/GUIA.html',
      gera: 'projetos/loja/produtos/agencia/GUIA.pdf',
      comando: 'node projetos/loja/gerar-guia.cjs',
    }],
  },
  {
    id: 'kit-toon',
    zip: 'kit-toon-3d-threejs',
    montar(m) {
      const base = 'projetos/loja/produtos/kit-toon';
      m.pasta(base, '', { exigir: ['demo/index.html', 'README.md'] });
      // A fonte do kit é sempre a skill da casa; a cópia que estiver em kit-toon/ é substituída.
      m.arquivo('.claude/skills/toon-3d/toon-kit.js', 'toon-kit.js');
      const naDemo = destinoDoKitNaDemo(path.join(RAIZ, base, 'demo/index.html'));
      if (naDemo && naDemo !== 'toon-kit.js') m.arquivo('.claude/skills/toon-3d/toon-kit.js', naDemo);
      m.arquivo('projetos/loja/produtos/LICENSE-kit-toon.txt', 'LICENSE');
    },
  },
  {
    id: 'barbearia',
    zip: 'site-barbearia-whatsapp',
    montar(m) {
      m.pasta('projetos/barbearia', '', { exigir: ['index.html', 'README.md'] });
      m.arquivo('projetos/loja/produtos/LICENSE-barbearia.txt', 'LICENSE');
    },
  },
  {
    id: 'lite',
    zip: 'creat-nuvem-lite-gratis',
    montar(m) {
      // Versões Lite: sem navegador, direcao-de-arte e padrao-de-entrega, que não vêm no pacote.
      m.arquivo('projetos/loja/produtos/lite/agents/frontend.md', '.claude/agents/frontend.md');
      m.arquivo('projetos/loja/produtos/lite/agents/revisor.md', '.claude/agents/revisor.md');
      m.arquivo('projetos/loja/produtos/lite/agents/qa.md', '.claude/agents/qa.md');
      m.pasta('.claude/skills/verificacao-visual', '.claude/skills/verificacao-visual', { exigir: ['SKILL.md'] });
      m.arquivo('projetos/loja/produtos/lite/README.md', 'README.md');
      m.arquivo('projetos/loja/produtos/LICENSE-lite.txt', 'LICENSE');
    },
  },
];

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
function arvore(nomes) {
  const raiz = {};
  for (const n of nomes) {
    let no = raiz;
    for (const parte of n.split('/')) no = no[parte] = no[parte] || {};
  }
  const linhas = [];
  (function desenhar(no, prefixo) {
    const chaves = Object.keys(no).sort((a, b) => {
      const da = Object.keys(no[a]).length > 0, db = Object.keys(no[b]).length > 0;
      return da === db ? a.localeCompare(b) : da ? -1 : 1;
    });
    chaves.forEach((k, i) => {
      const ultimo = i === chaves.length - 1;
      const ehPasta = Object.keys(no[k]).length > 0;
      linhas.push(`${prefixo}${ultimo ? '└── ' : '├── '}${k}${ehPasta ? '/' : ''}`);
      if (ehPasta) desenhar(no[k], prefixo + (ultimo ? '    ' : '│   '));
    });
  })(raiz, '');
  return linhas.join('\n');
}
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const verificar = args.includes('--verificar');
  const final = args.includes('--final');
  if (args.includes('--listar')) {
    for (const p of PRODUTOS_DEF) console.log(`${p.id.padEnd(10)} -> dist/${p.zip}.zip`);
    return;
  }
  const pedidos = args.filter((a) => !a.startsWith('--'));
  const desconhecidos = pedidos.filter((id) => !PRODUTOS_DEF.some((p) => p.id === id));
  if (desconhecidos.length) {
    console.error(`Produto desconhecido: ${desconhecidos.join(', ')}. Use --listar.`);
    process.exit(2);
  }
  const alvo = pedidos.length ? PRODUTOS_DEF.filter((p) => pedidos.includes(p.id)) : PRODUTOS_DEF;

  // 1) Monta tudo em memória e junta todas as faltas antes de gravar qualquer coisa.
  const montados = [];
  const faltas = [];
  for (const p of alvo) {
    const m = montador(p.zip);
    p.montar(m);
    for (const f of m.faltas) faltas.push(`  [${p.id}] falta: ${f}`);
    montados.push({ p, m });
  }
  if (faltas.length) {
    console.error('Empacotamento abortado: origens que ainda não existem.\n' + faltas.join('\n'));
    process.exit(1);
  }

  // 2) Varre segredos e caminhos de máquina em cada pacote.
  const pacotes = [];
  const achados = [];
  for (const { p, m } of montados) {
    const entradas = m.entradas();
    if (!entradas.length) throw new Error(`[${p.id}] pacote vazio`);
    for (const a of varrer(entradas)) achados.push(`  [${p.id}] ${a}`);
    pacotes.push({ p, entradas });
  }
  if (achados.length) {
    console.error('Empacotamento abortado: conteúdo proibido encontrado (arquivo:linha).\n' + achados.join('\n'));
    process.exit(1);
  }

  // 2b) Marcadores de preenchimento obrigatório antes de vender.
  const pendentes = [];
  for (const { p, entradas } of pacotes) {
    for (const a of marcadores(entradas)) pendentes.push(`  [${p.id}] ${a}`);
    const extra = marcadoresExtras(p, entradas);
    for (const a of extra.achados) pendentes.push(`  [${p.id}] ${a}`);
    for (const a of extra.avisos) console.warn(`AVISO: [${p.id}] ${a}`);
  }
  if (pendentes.length) {
    const msg = 'marcadores sem preencher (obrigatório antes de vender):\n' + pendentes.join('\n');
    if (final) { console.error('Empacotamento abortado (--final): ' + msg); process.exit(1); }
    console.warn('AVISO: ' + msg + '\n  Rode com --final para tratar isto como erro.');
  }

  // 3) Grava os zips.
  fs.mkdirSync(DIST, { recursive: true });
  for (const { p, entradas } of pacotes) {
    const buf = escreverZip(entradas);
    const destino = path.join(DIST, `${p.zip}.zip`);
    fs.writeFileSync(destino, buf);
    console.log(`\n${rel(destino)}  ${kb(buf.length)}  ${entradas.length} arquivos`);
    console.log(arvore(entradas.map((e) => e.nome)));
  }

  // 4) Opcional: relê cada zip do disco, confere CRC e tamanho de cada arquivo.
  if (verificar) {
    console.log('\nVerificação:');
    let erro = false;
    for (const { p, entradas } of pacotes) {
      const destino = path.join(DIST, `${p.zip}.zip`);
      try {
        const itens = lerZip(fs.readFileSync(destino));
        if (itens.length !== entradas.length) throw new Error(`${itens.length} entradas, esperadas ${entradas.length}`);
        const fora = itens.filter((i) => !i.nome.startsWith(`${p.zip}/`));
        if (fora.length) throw new Error(`fora da pasta raiz: ${fora.map((i) => i.nome).join(', ')}`);
        const internos = itens.filter((i) => excluido(path.posix.basename(i.nome)));
        if (internos.length) throw new Error(`arquivo excluído entrou no zip: ${internos.map((i) => i.nome).join(', ')}`);
        console.log(`  ok  ${rel(destino)}  ${itens.length} arquivos, CRC conferido`);
        for (const i of itens) console.log(`      ${i.crc.toString(16).padStart(8, '0')}  ${String(i.tamanho).padStart(8)}  ${i.nome}`);
      } catch (e) {
        erro = true;
        console.error(`  FALHOU  ${rel(destino)}: ${e.message}`);
      }
    }
    if (erro) process.exit(1);
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Erro: ' + e.message); process.exit(1); }
}

module.exports = { crc32, escreverZip, lerZip, varrer, excluido, marcadores, marcadoresExtras };
