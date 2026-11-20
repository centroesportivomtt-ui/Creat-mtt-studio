#!/usr/bin/env node
// Varre site/itaitu/ e escreve site/itaitu/precache.json, a lista que o service worker usa.
//   { versao, gerado_em, bytes_total, casco: [url...], arquivos: [{url, bytes, hash}] }
// - url: relativa à pasta do app (sem "./"), igual ao caminho servido sob o escopo do SW.
// - hash: 16 primeiros hex do SHA-256 do conteúdo. O SW copia do cache antigo os arquivos
//   com o mesmo hash e só baixa o que mudou ao atualizar.
// - versao: 12 hex do SHA-256 do conjunto (url + hash, em ordem). Muda se qualquer arquivo mudar.
// - casco: o que o SW guarda já no install (html, css, js, manifest, ícones, vendor, marcas).
//   Fora do casco (pré-cache pesado, sob demanda): tiles/, dados/, fontes/ e arquivos de fonte.
// Fica de fora: sw.js, precache.json, arquivos ocultos, .md, .map, .parcial.
// Reexecutável: rode de novo sempre que um arquivo do app mudar (a tarefa final do devops roda).
//   node projetos/itaitu-mapa/scripts/gerar-precache.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
// --app=<pasta> gera para outra cópia do app (teste); padrão site/itaitu.
const ARG_APP = (process.argv.find((a) => a.startsWith('--app=')) || '').slice(6);
const APP = ARG_APP ? path.resolve(ARG_APP) : path.join(RAIZ, 'site/itaitu');
const SAIDA = path.join(APP, 'precache.json');

const FORA = new Set(['sw.js', 'precache.json']);
const EXT_FORA = ['.md', '.map', '.parcial'];
const EXT_FONTE = ['.woff2', '.woff', '.ttf', '.otf'];

function varrer(dir, lista = []) {
  for (const nome of fs.readdirSync(dir).sort()) {
    if (nome.startsWith('.')) continue;
    const abs = path.join(dir, nome);
    const st = fs.statSync(abs);
    if (st.isDirectory()) varrer(abs, lista);
    else lista.push(abs);
  }
  return lista;
}

const pesado = (url) => /^(tiles|dados|fontes)\//.test(url) || EXT_FONTE.some((e) => url.endsWith(e));

const arquivos = [];
for (const abs of varrer(APP)) {
  const url = path.relative(APP, abs).split(path.sep).join('/');
  if (FORA.has(url) || EXT_FORA.some((e) => url.endsWith(e))) continue;
  const buf = fs.readFileSync(abs);
  arquivos.push({ url, bytes: buf.length, hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) });
}
arquivos.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

const versao = crypto.createHash('sha256').update(arquivos.map((a) => `${a.url}:${a.hash}`).join('\n')).digest('hex').slice(0, 12);
const casco = arquivos.filter((a) => !pesado(a.url)).map((a) => a.url);
const bytes_total = arquivos.reduce((s, a) => s + a.bytes, 0);

const saida = { versao, gerado_em: new Date().toISOString(), bytes_total, casco, arquivos };
fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n');
const bytesCasco = arquivos.filter((a) => !pesado(a.url)).reduce((s, a) => s + a.bytes, 0);
console.log(`precache.json: versao ${versao}, ${arquivos.length} arquivos, ${(bytes_total / 1048576).toFixed(2)} MB; casco ${casco.length} arquivos, ${(bytesCasco / 1048576).toFixed(2)} MB`);
