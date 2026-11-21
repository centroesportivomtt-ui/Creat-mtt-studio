#!/usr/bin/env node
// Prepara site/itaitu/vendor/ (zero CDN em tempo de execução).
//  1. Copia projetos/itaitu-mapa/vendor/ (MapLibre GL JS 5.24.0: js, css, LICENSE.txt).
//  2. Baixa qrcode-generator (Kazuhiko Arase, MIT) na versão FIXADA abaixo, do registro
//     oficial do npm, confere a integridade sha512 publicada pelo npm, extrai dist/qrcode.js
//     e o texto da licença, e grava site/itaitu/vendor/VERSOES.json com versão e SHA-256.
// Node 22, só módulos nativos (fetch, zlib, crypto). Reexecutável.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const ORIGEM = path.join(RAIZ, 'projetos/itaitu-mapa/vendor');
const DESTINO = path.join(RAIZ, 'site/itaitu/vendor');

const QR = {
  nome: 'qrcode-generator',
  versao: '2.0.4', // publicada em 2025-08-07 no npm
  tarball: 'https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz',
  integridade: 'sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==',
  repositorio: 'https://github.com/kazuhikoarase/qrcode-generator',
  licenca_url: 'https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/LICENSE',
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function lerTar(buf) {
  const arquivos = new Map();
  let off = 0;
  while (off + 512 <= buf.length) {
    const cab = buf.subarray(off, off + 512);
    if (cab.every((b) => b === 0)) break;
    const nome = cab.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const prefixo = cab.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
    const tam = parseInt(cab.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    const tipo = String.fromCharCode(cab[156] || 48);
    const completo = prefixo ? `${prefixo}/${nome}` : nome;
    off += 512;
    if (tipo === '0' || tipo === '\0') arquivos.set(completo, buf.subarray(off, off + tam));
    off += Math.ceil(tam / 512) * 512;
  }
  return arquivos;
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const versoes = { gerado_em: new Date().toISOString(), arquivos: {} };

  for (const f of ['maplibre-gl.js', 'maplibre-gl.css', 'LICENSE.txt']) {
    const buf = fs.readFileSync(path.join(ORIGEM, f));
    fs.writeFileSync(path.join(DESTINO, f), buf);
    versoes.arquivos[f] = { pacote: 'maplibre-gl', versao: '5.24.0', licenca: 'BSD-3-Clause', bytes: buf.length, sha256: sha256(buf) };
  }

  const r = await fetch(QR.tarball);
  if (!r.ok) throw new Error(`tarball ${r.status}`);
  const tgz = Buffer.from(await r.arrayBuffer());
  const [alg, esperado] = QR.integridade.split('-');
  const obtido = crypto.createHash(alg).update(tgz).digest('base64');
  if (obtido !== esperado) throw new Error(`integridade não confere: ${obtido}`);
  const tar = lerTar(zlib.gunzipSync(tgz));
  const js = tar.get('package/dist/qrcode.js');
  if (!js) throw new Error(`dist/qrcode.js não achado: ${[...tar.keys()].join(', ')}`);
  const mjs = tar.get('package/dist/qrcode.mjs');
  // O pacote do npm não traz o arquivo LICENSE: o texto vem do repositório oficial no GitHub.
  let lic = tar.get('package/LICENSE') || tar.get('package/LICENSE.txt');
  let fonteLicenca = 'pacote npm';
  if (!lic) {
    const rl = await fetch(QR.licenca_url);
    if (!rl.ok) throw new Error(`licença ${rl.status}`);
    lic = Buffer.from(await rl.arrayBuffer());
    fonteLicenca = QR.licenca_url;
    if (!/MIT License/i.test(lic.toString())) throw new Error('texto da licença não é MIT');
  }
  const cabecalho = Buffer.from(`// qrcode-generator ${QR.versao} - Kazuhiko Arase - MIT - ${QR.repositorio}\n// Licença: LICENSE-qrcode-generator.txt\n`);
  const jsFinal = Buffer.concat([cabecalho, js]);
  fs.writeFileSync(path.join(DESTINO, 'qrcode-generator.js'), jsFinal);
  fs.writeFileSync(path.join(DESTINO, 'LICENSE-qrcode-generator.txt'), lic);
  if (mjs) {
    const mjsFinal = Buffer.concat([cabecalho, mjs]);
    fs.writeFileSync(path.join(DESTINO, 'qrcode-generator.mjs'), mjsFinal);
    versoes.arquivos['qrcode-generator.mjs'] = { pacote: QR.nome, versao: QR.versao, licenca: 'MIT', bytes: mjsFinal.length, sha256: sha256(mjsFinal), nota: 'mesma biblioteca em módulo ES (export default)' };
  }
  versoes.arquivos['qrcode-generator.js'] = {
    pacote: QR.nome, versao: QR.versao, licenca: 'MIT', fonte: QR.tarball, integridade_npm: QR.integridade,
    sha256_original_dist_qrcode_js: sha256(js), sha256: sha256(jsFinal), bytes: jsFinal.length,
  };
  versoes.arquivos['LICENSE-qrcode-generator.txt'] = { fonte: fonteLicenca, bytes: lic.length, sha256: sha256(lic) };

  fs.writeFileSync(path.join(DESTINO, 'VERSOES.json'), JSON.stringify(versoes, null, 2) + '\n');
  for (const [k, v] of Object.entries(versoes.arquivos)) console.log(`${k}  ${v.versao || ''}  ${v.bytes} B  sha256 ${v.sha256}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
