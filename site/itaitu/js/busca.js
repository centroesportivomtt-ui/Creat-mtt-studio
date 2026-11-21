// busca.js · busca offline por nome (destinos, outros nomes e lugares do mapa-base) e por coordenada.
// Frontend A. Sem rede: tudo sai de Itaitu.dados.

import { T, t } from './textos.js';
import { el, normalizar, lerCoordenada, formatarDecimal, dentroDoBbox } from './util.js';
import { abrirBalao, obterMapa, deslocamento } from './mapa.js';

let ctx = null;
let indice = [];

export function montarBusca(contexto) {
  ctx = contexto;
  const campo = document.getElementById('busca');
  const saida = document.getElementById('busca-resultados');
  if (!campo || !saida) return;
  indexar();
  let espera = null;
  campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => buscar(campo.value, saida), 120); });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saida.querySelector('button')?.click(); }
    if (e.key === 'Escape' && campo.value) { e.stopPropagation(); campo.value = ''; buscar('', saida); }
  });
}

function indexar() {
  indice = [];
  for (const f of ctx.dados.pontos.features) {
    const p = f.properties;
    const nomes = [p.nome, ...(Array.isArray(p.outros_nomes) ? p.outros_nomes : [])];
    indice.push({ tipo: 'ponto', id: p.id, nome: p.nome, chave: normalizar(nomes.join(' ')), ordem: p._ordem, estado: p._estado });
  }
  const vistos = new Set(indice.map((i) => normalizar(i.nome)));
  for (const f of ctx.dados.base.features) {
    const p = f.properties;
    if (p.camada !== 'area' || p.tipo !== 'lugar' || !p.nome || f.geometry?.type !== 'Point') continue;
    const k = normalizar(p.nome);
    if (vistos.has(k)) continue;
    vistos.add(k);
    indice.push({ tipo: 'lugar', nome: p.nome, chave: k, coord: f.geometry.coordinates, ordem: 1000 });
  }
}

export function procurar(texto, limite = 8) {
  const q = normalizar(texto);
  if (!q) return [];
  const palavras = q.split(' ');
  return indice
    .map((i) => {
      if (!palavras.every((w) => i.chave.includes(w))) return null;
      const comeca = i.chave.split(' ').some((w) => w.startsWith(palavras[0]));
      return { ...i, peso: (comeca ? 0 : 10) + i.ordem / 100 };
    })
    .filter(Boolean)
    .sort((a, b) => a.peso - b.peso)
    .slice(0, limite);
}

function buscar(texto, saida) {
  saida.replaceChildren();
  const valor = texto.trim();
  if (!valor) { saida.hidden = true; return; }
  saida.hidden = false;
  const coord = lerCoordenada(valor);
  if (coord) {
    const fora = !dentroDoBbox(coord, ctx.recorte.bbox, 0.05);
    saida.append(el('li', {}, el('button', {
      class: 'busca__item', type: 'button',
      onclick: () => irCoordenada(coord),
    }, el('span', { class: 'busca__nome num' }, formatarDecimal(coord[0], coord[1])), el('span', { class: 'busca__tipo' }, fora ? t('busca.fora_do_mapa', {}, 'Ir para a coordenada · fora da área do mapa') : t('busca.coordenada', {}, 'Ir para a coordenada')))));
    return;
  }
  const r = procurar(valor);
  if (!r.length) { saida.append(el('li', { class: 'busca__vazio', role: 'status' }, t('destinos.sem_resultado', { termo: valor }))); return; }
  for (const i of r) {
    const sub = i.tipo === 'ponto' ? ({ confirmada: T.tabuas.confirmada, aproximada: T.tabuas.aproximada, 'sem-coordenada': T.tabuas.sem_coordenada }[i.estado]) : T.destinos.grupo_outros;
    saida.append(el('li', {}, el('button', {
      class: 'busca__item', type: 'button',
      onclick: () => {
        if (i.tipo === 'ponto') ctx.emit('itaitu:destino-escolhido', { id: i.id, origem: 'busca' });
        else { ctx.fecharPaineis?.(); obterMapa()?.flyTo({ center: i.coord, zoom: 15, offset: deslocamento(), duration: ctx.reduzMovimento() ? 0 : 1200 }); }
      },
    }, el('span', { class: 'busca__nome' }, i.nome), el('span', { class: 'busca__tipo' }, sub))));
  }
}

function irCoordenada([lon, lat]) {
  const map = obterMapa();
  if (!map) return;
  ctx.fecharPaineis?.();
  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), offset: deslocamento(), duration: ctx.reduzMovimento() ? 0 : 1200 });
  map.once('moveend', () => abrirBalao({ lng: lon, lat }, 'toque'));
}
