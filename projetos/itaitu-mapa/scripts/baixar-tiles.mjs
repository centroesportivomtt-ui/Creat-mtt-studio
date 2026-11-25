#!/usr/bin/env node
// Baixa os tiles de relevo (Terrarium, AWS Open Data) e de satélite
// (Sentinel-2 cloudless 2016, EOX, CC BY 4.0) do vale de Itaitu para
// site/itaitu/tiles/. Node 22, só módulos nativos.
//
// Uso:
//   node projetos/itaitu-mapa/scripts/baixar-tiles.mjs            # tudo
//   node projetos/itaitu-mapa/scripts/baixar-tiles.mjs --so=dem   # só relevo
//   node projetos/itaitu-mapa/scripts/baixar-tiles.mjs --so=sat   # só satélite
//
// Reexecutável: arquivo já baixado (tamanho > 0) é pulado.
// 404 de verdade é registrado em dados/tiles-contagem.json, nunca escondido.
// Respeito aos servidores: concorrência 3, nova tentativa com espera crescente.
//
// SATÉLITE: só a camada "s2cloudless_3857" (a versão 2016, CC BY 4.0).
// Proibido trocar por s2cloudless-2018+ (CC BY-NC-SA) ou Esri World Imagery.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const DESTINO = path.join(RAIZ, 'site/itaitu/tiles');
const CONTAGEM = path.join(RAIZ, 'projetos/itaitu-mapa/dados/tiles-contagem.json');

// bbox oeste, sul, leste, norte
const BBOX = [-40.60, -11.42, -40.40, -11.26];
const ZMIN = 8, ZMAX = 14;
const CONCORRENCIA = 3;
const TENTATIVAS = 4;
const META_BYTES = 20 * 1024 * 1024;

// Recorte reduzido para o z14 do satélite, usado só se o total passar da meta:
// vila de Itaitu e as cachoeiras do lado oeste (Véu da Noiva, Arapongas e vizinhas).
const BBOX_SAT_Z14_REDUZIDO = [-40.56, -11.38, -40.44, -11.30];

const FONTES = {
  dem: {
    url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    arquivo: (z, x, y) => path.join(DESTINO, 'dem', String(z), String(x), `${y}.png`),
    ext: 'png',
  },
  sat: {
    // Ordem da EOX: {z}/{y}/{x}
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`,
    arquivo: (z, x, y) => path.join(DESTINO, 'sat', String(z), String(x), `${y}.jpg`),
    ext: 'jpg',
  },
};

function lon2x(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function lat2y(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
function tilesDoBbox([o, s, l, n], z) {
  const x0 = lon2x(o, z), x1 = lon2x(l, z);
  const y0 = lat2y(n, z), y1 = lat2y(s, z);
  const lista = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) lista.push([z, x, y]);
  return lista;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixarUm(fonte, [z, x, y]) {
  const destino = fonte.arquivo(z, x, y);
  try {
    const st = fs.statSync(destino);
    if (st.size > 0) return { estado: 'ja', bytes: st.size };
  } catch {}
  const url = fonte.url(z, x, y);
  let ultimoErro = '';
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'itaitu-offline-tiles/1.0' } });
      if (r.status === 404) return { estado: '404', url };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0) throw new Error('corpo vazio');
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino + '.parcial', buf);
      fs.renameSync(destino + '.parcial', destino);
      return { estado: 'novo', bytes: buf.length };
    } catch (e) {
      ultimoErro = String(e.message || e);
      await esperar(800 * 2 ** (t - 1));
    }
  }
  return { estado: 'erro', url, erro: ultimoErro };
}

async function rodarFila(fonte, lista) {
  const resultados = new Array(lista.length);
  let i = 0;
  async function trabalhador() {
    while (i < lista.length) {
      const k = i++;
      resultados[k] = { tile: lista[k], ...(await baixarUm(fonte, lista[k])) };
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  return resultados;
}

function bytesNoDisco(tipo) {
  let total = 0, n = 0;
  const base = path.join(DESTINO, tipo);
  if (!fs.existsSync(base)) return { total, n };
  for (const z of fs.readdirSync(base)) for (const x of fs.readdirSync(path.join(base, z))) {
    for (const f of fs.readdirSync(path.join(base, z, x))) {
      if (f.endsWith('.parcial')) continue;
      total += fs.statSync(path.join(base, z, x, f)).size; n++;
    }
  }
  return { total, n };
}

async function main() {
  const so = (process.argv.find((a) => a.startsWith('--so=')) || '').slice(5);
  const tipos = so ? [so] : ['dem', 'sat'];
  const anterior = fs.existsSync(CONTAGEM) ? JSON.parse(fs.readFileSync(CONTAGEM, 'utf8')) : {};
  const saida = {
    gerado_em: new Date().toISOString(),
    bbox: BBOX,
    zooms: [ZMIN, ZMAX],
    fontes: {
      dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      sat: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg (Sentinel-2 cloudless 2016, CC BY 4.0)',
    },
    tipos: { ...(anterior.tipos || {}) },
    reducao_sat_z14: anterior.reducao_sat_z14 || null,
  };

  for (const tipo of tipos) {
    const fonte = FONTES[tipo];
    const porZoom = {};
    const ausentes = [], erros = [];
    for (let z = ZMIN; z <= ZMAX; z++) {
      let lista = tilesDoBbox(BBOX, z);
      if (tipo === 'sat' && z === 14 && saida.reducao_sat_z14) lista = tilesDoBbox(BBOX_SAT_Z14_REDUZIDO, z);
      const res = await rodarFila(fonte, lista);
      const c = { esperados: lista.length, novos: 0, ja: 0, ausentes_404: 0, erros: 0, bytes: 0 };
      for (const r of res) {
        if (r.estado === 'novo') { c.novos++; c.bytes += r.bytes; }
        else if (r.estado === 'ja') { c.ja++; c.bytes += r.bytes; }
        else if (r.estado === '404') { c.ausentes_404++; ausentes.push(r.tile.join('/')); }
        else { c.erros++; erros.push({ tile: r.tile.join('/'), erro: r.erro }); }
      }
      porZoom[z] = c;
      console.log(`${tipo} z${z}: ${c.novos + c.ja}/${c.esperados} (novos ${c.novos}, 404 ${c.ausentes_404}, erros ${c.erros}) ${(c.bytes / 1024).toFixed(0)} KB`);
    }
    const disco = bytesNoDisco(tipo);
    saida.tipos[tipo] = { por_zoom: porZoom, arquivos: disco.n, bytes: disco.total, ausentes_404: ausentes, erros };
    if (tipo === 'dem') {
      const z12 = porZoom[12];
      if (z12.novos + z12.ja !== z12.esperados) {
        console.error(`ERRO: z12 do relevo incompleto (${z12.novos + z12.ja}/${z12.esperados}). O motor de sombra precisa dele.`);
        process.exitCode = 2;
      }
    }
  }

  const total = Object.values(saida.tipos).reduce((s, t) => s + (t.bytes || 0), 0);
  saida.bytes_total = total;
  saida.meta_bytes = META_BYTES;

  // Passou da meta: reduz o z14 do satélite à vila e às cachoeiras e apaga o excedente.
  if (total > META_BYTES && !saida.reducao_sat_z14 && saida.tipos.sat) {
    const manter = new Set(tilesDoBbox(BBOX_SAT_Z14_REDUZIDO, 14).map((t) => `${t[1]}/${t[2]}`));
    const base = path.join(DESTINO, 'sat', '14');
    let apagados = 0;
    for (const x of fs.readdirSync(base)) for (const f of fs.readdirSync(path.join(base, x))) {
      if (!manter.has(`${x}/${f.replace('.jpg', '')}`)) { fs.unlinkSync(path.join(base, x, f)); apagados++; }
    }
    saida.reducao_sat_z14 = { motivo: `total ${total} bytes passou de ${META_BYTES}`, bbox: BBOX_SAT_Z14_REDUZIDO, apagados };
    const disco = bytesNoDisco('sat');
    saida.tipos.sat.arquivos = disco.n; saida.tipos.sat.bytes = disco.total;
    saida.bytes_total = Object.values(saida.tipos).reduce((s, t) => s + (t.bytes || 0), 0);
    console.log(`Meta passou: z14 do satélite reduzido, ${apagados} tiles apagados.`);
  }

  fs.mkdirSync(path.dirname(CONTAGEM), { recursive: true });
  fs.writeFileSync(CONTAGEM, JSON.stringify(saida, null, 2) + '\n');
  console.log(`Total: ${(saida.bytes_total / 1048576).toFixed(2)} MB. Contagem em ${path.relative(RAIZ, CONTAGEM)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
