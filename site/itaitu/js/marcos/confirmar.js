// confirmar.js · "Estou aqui: confirmar posição" e "Criar ponto novo" (frontend C, ARQUITETURA 7.5 e 7.7).
// Média do GPS por ~20 s com a precisão na tela. Descarta leitura com precisão pior que 30 m e leitura
// fora do bolo (mais longe da mediana que 2,5x a distância mediana, mínimo 6 m). Grava a Feature no
// IndexedDB, store 'pontos-local', por cima do pontos.geojson, com confianca 'alta' e
// fonte 'GPS no local, AAAA-MM-DD' (sem nome de pessoa). O dados.js do app público já sobrepõe essa
// store no marcos.html (6.1); aqui só recarregamos os dados e redesenhamos o mapa.

import { T } from '../textos.js';
import { el, distanciaM, dentroDoBbox } from '../util.js';
import * as banco from '../banco.js';
import { $, m, avisar, anunciar, hoje, dataBR, slugDe } from './comum.js';
import { AJUSTE_MAX } from './pacote.js';

export const DURACAO_S = 20;
export const DURACAO_MAX_S = 40;
export const PRECISAO_MAX = 30;
export const AMOSTRAS_MIN = 10;

// Tipos do botão "Criar ponto novo" -> tipo do contrato (pontos.geojson). Porteira e ponte são 'infra'.
export const TIPOS_NOVO = [
  { chave: 'porteira', tipo: 'infra', rotulo: 'Porteira' },
  { chave: 'estacionamento', tipo: 'estacionamento', rotulo: 'Estacionamento' },
  { chave: 'ponte', tipo: 'infra', rotulo: 'Ponte' },
  { chave: 'mirante', tipo: 'mirante', rotulo: 'Mirante' },
  { chave: 'poco', tipo: 'poco', rotulo: 'Poço' },
  { chave: 'cachoeira', tipo: 'cachoeira', rotulo: 'Cachoeira' },
  { chave: 'entrada-trilha', tipo: 'entrada-trilha', rotulo: 'Entrada de trilha' },
];

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (v) => Math.round(v * 10) / 10;

// Puro: amostras [{lon, lat, alt, precisao, t}] -> resultado da média
export function mediaDasAmostras(amostras, { precisaoMax = PRECISAO_MAX } = {}) {
  const boas = amostras.filter((a) => a && Number.isFinite(a.lon) && Number.isFinite(a.lat) && Number.isFinite(a.precisao) && a.precisao <= precisaoMax);
  let ficam = boas;
  if (boas.length >= 3) {
    const centro = [mediana(boas.map((a) => a.lon)), mediana(boas.map((a) => a.lat))];
    const dists = boas.map((a) => distanciaM(centro, [a.lon, a.lat]));
    const limite = Math.max(6, 2.5 * mediana(dists));
    ficam = boas.filter((_, i) => dists[i] <= limite);
  }
  const descartadas = amostras.length - ficam.length;
  if (!ficam.length) return { n_amostras: 0, descartadas, gps_media: null, precisao_m: null, alt_m: null, dispersao_m: null };
  let sw = 0, sx = 0, sy = 0;
  for (const a of ficam) { const w = 1 / Math.max(1, a.precisao) ** 2; sw += w; sx += a.lon * w; sy += a.lat * w; }
  const lon = sx / sw, lat = sy / sw;
  const alts = ficam.map((a) => a.alt).filter((v) => Number.isFinite(v));
  const disp = Math.sqrt(ficam.reduce((s, a) => s + distanciaM([lon, lat], [a.lon, a.lat]) ** 2, 0) / ficam.length);
  return {
    n_amostras: ficam.length,
    descartadas,
    gps_media: [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7],
    alt_m: alts.length ? Math.round(mediana(alts)) : null,
    // honesto e conservador: a precisão declarada é a mediana das leituras que ficaram, não a da média
    precisao_m: r1(mediana(ficam.map((a) => a.precisao))),
    dispersao_m: r1(disp),
  };
}

export function medidaAceita(r) { return !!(r && r.gps_media && r.n_amostras >= AMOSTRAS_MIN && r.precisao_m != null && r.precisao_m <= PRECISAO_MAX); }

// ---------------------------------------------------------------- medição no aparelho
function medir({ aoAtualizar }) {
  let cancelado = false;
  const amostras = [];
  const vistas = new Set();
  let watch = null, intervalo = null, relogio = null;
  const inicio = Date.now();
  const receber = (pos) => {
    const c = pos.coords;
    const chave = `${pos.timestamp}|${c.latitude}|${c.longitude}|${c.accuracy}`;
    if (vistas.has(chave)) return;
    vistas.add(chave);
    amostras.push({ lon: c.longitude, lat: c.latitude, alt: Number.isFinite(c.altitude) ? c.altitude : null, precisao: Number.isFinite(c.accuracy) ? c.accuracy : null, t: pos.timestamp || Date.now() });
  };
  const promessa = new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('sem-gps')); return; }
    const opcoes = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
    const falhou = (e) => { if (e && e.code === 1) { parar(); reject(new Error('negado')); } };
    watch = navigator.geolocation.watchPosition(receber, falhou, opcoes);
    // um pedido por segundo além do watch: aparelhos que só avisam quando a posição muda também enchem a média
    intervalo = setInterval(() => navigator.geolocation.getCurrentPosition(receber, falhou, opcoes), 1000);
    const parar = () => { clearInterval(intervalo); clearInterval(relogio); if (watch != null) navigator.geolocation.clearWatch(watch); };
    relogio = setInterval(() => {
      if (cancelado) { parar(); resolve(null); return; }
      const s = (Date.now() - inicio) / 1000;
      const r = mediaDasAmostras(amostras);
      aoAtualizar?.({ s, r, ultima: amostras[amostras.length - 1] || null });
      const chegou = s >= DURACAO_S && r.n_amostras >= AMOSTRAS_MIN;
      if (chegou || s >= DURACAO_MAX_S) { parar(); resolve(r); }
    }, 250);
  });
  return { promessa, cancelar: () => { cancelado = true; } };
}

// ---------------------------------------------------------------- lista na tela
let ctx = null;
let aoMudarDados = null;

function estadoDoPonto(f) {
  const p = f.properties;
  if (p._local) return p._local.acao === 'novo' ? m('estado_novo', { data: dataBR(p._local.data) }) : m('estado_local', { data: dataBR(p._local.data) });
  if (!f.geometry) return m('estado_sem');
  if (p.aproximado === true) return m('estado_aprox');
  if (p.confianca === 'media') return m('estado_media');
  if (p.confianca === 'baixa') return m('estado_baixa');
  return m('estado_alta');
}

export function precisaConfirmar(f) {
  const p = f.properties;
  if (p._local) return false;
  return !f.geometry || p.aproximado === true || p.confianca === 'media' || p.confianca === 'baixa' || p.confianca === 'sem-coordenada';
}

async function locais() {
  try { return await banco.listar('pontos-local'); } catch (_) { return []; }
}

export async function listarNaTela() {
  const ul = $('confirmar-lista');
  if (!ul || !ctx) return;
  const loc = new Map((await locais()).map((f) => [f.properties.id, f]));
  const feats = (ctx.dados?.pontos?.features || []).map((f) => (loc.has(f.properties.id) ? { ...f, properties: { ...f.properties, _local: loc.get(f.properties.id).properties.confirmacao } } : f));
  const pendentes = feats.filter(precisaConfirmar);
  const feitos = feats.filter((f) => f.properties._local);
  ul.replaceChildren();
  const item = (f) => {
    const p = f.properties;
    const li = el('li', { class: 'm-item', dataset: { estado: p._local ? 'local' : (f.geometry ? (p.aproximado ? 'aproximada' : p.confianca || '') : 'sem-coordenada') } },
      el('p', { class: 'm-item__nome' }, p.nome),
      el('p', { class: 'm-item__info' }, [T.marcar?.tipos?.[p.tipo] || p.tipo, estadoDoPonto(f), p.grupo === 'placa' ? 'da placa' : null].filter(Boolean).join(' · ')));
    const botoes = el('div', { class: 'linha-botoes' });
    if (!p._local) botoes.append(el('button', { class: 'botao botao--marca', type: 'button', onclick: () => confirmar(f) }, m('confirmar')));
    else {
      botoes.append(el('button', { class: 'botao botao--linha', type: 'button', onclick: () => confirmar(f) }, m('confirmar_de_novo')));
      botoes.append(el('button', { class: 'botao botao--texto', type: 'button', onclick: () => desfazer(p.id) }, m('desfazer')));
    }
    li.append(botoes);
    return li;
  };
  if (!pendentes.length && !feitos.length) ul.append(el('li', { class: 'vazio' }, m('nada_a_confirmar')));
  for (const f of pendentes) ul.append(item(f));
  for (const f of feitos) ul.append(item(f));
}

async function desfazer(id) {
  await banco.apagar('pontos-local', id);
  avisar(m('desfeito'));
  await aoMudarDados?.();
}

// ---------------------------------------------------------------- diálogo
let medicao = null;

function preencherTipos() {
  const sel = $('confirmar-tipo');
  if (sel.options.length) return;
  for (const x of TIPOS_NOVO) sel.append(el('option', { value: x.chave }, x.rotulo));
}

// f = Feature existente (confirmar) ou null (ponto novo)
export function confirmar(f = null) {
  const dlg = $('confirmar-dlg');
  const novo = !f;
  preencherTipos();
  $('confirmar-novo-campos').hidden = !novo;
  $('confirmar-alvo').textContent = novo ? m('novo_ponto') : f.properties.nome;
  $('confirmar-titulo').textContent = novo ? m('novo_ponto') : m('confirmar');
  $('confirmar-nome').value = '';
  $('confirmar-tipo').value = 'mirante';
  $('confirmar-nota').value = '';
  $('confirmar-ajuste').value = '';
  const erro = $('confirmar-erro');
  erro.hidden = true;
  let resultado = null;

  const comecar = () => {
    medicao?.cancelar();
    resultado = null;
    $('confirmar-salvar').disabled = true;
    $('confirmar-repetir').hidden = true;
    $('confirmar-resultado').textContent = '';
    erro.hidden = true;
    const barra = $('confirmar-barra');
    medicao = medir({
      aoAtualizar: ({ s, r, ultima }) => {
        const resta = Math.max(0, Math.ceil(DURACAO_S - s));
        $('confirmar-contagem').textContent = resta > 0 ? m('confirmando', { s: resta }) : 'Juntando as últimas leituras…';
        $('confirmar-precisao').textContent = m('precisao_agora', { m: ultima?.precisao != null ? Math.round(ultima.precisao) : '–', n: r.n_amostras, d: r.descartadas });
        barra.style.width = `${Math.min(100, (s / DURACAO_S) * 100).toFixed(0)}%`;
      },
    });
    medicao.promessa.then((r) => {
      if (!r) return;
      resultado = r;
      barra.style.width = '100%';
      $('confirmar-repetir').hidden = false;
      if (!medidaAceita(r)) {
        $('confirmar-contagem').textContent = 'Medição fraca';
        erro.textContent = r.n_amostras < AMOSTRAS_MIN ? m('poucas_amostras', { n: r.n_amostras }) : m('precisao_ruim', { m: Math.round(r.precisao_m) });
        erro.hidden = false;
        anunciar(erro.textContent);
        return;
      }
      if (!dentroDoBbox(r.gps_media, ctx.recorte.bbox)) {
        erro.textContent = 'Esta posição fica fora do recorte do mapa de Itaitu; o pacote recusa.';
        erro.hidden = false;
        return;
      }
      const linhas = [m('confirmado', { n: r.n_amostras, m: String(r.precisao_m).replace('.', ',') })];
      if (r.alt_m != null) linhas.push(`altitude do GPS ${r.alt_m} m`);
      if (f?.geometry) linhas.push(m('distancia_antiga', { m: Math.round(distanciaM(f.geometry.coordinates, r.gps_media)) }));
      $('confirmar-contagem').textContent = `${r.precisao_m.toFixed(1).replace('.', ',')} m`;
      $('confirmar-resultado').textContent = linhas.join(' · ');
      $('confirmar-salvar').disabled = false;
      anunciar(linhas[0]);
    }).catch((e) => {
      erro.textContent = e && e.message === 'negado' ? (T.gps?.negado || m('sem_gps')) : m('sem_gps');
      erro.hidden = false;
      $('confirmar-repetir').hidden = false;
    });
  };

  $('confirmar-repetir').onclick = comecar;
  $('confirmar-cancelar').onclick = () => dlg.close();
  $('confirmar-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!medidaAceita(resultado)) return;
    const nome = novo ? $('confirmar-nome').value.trim().slice(0, 60) : f.properties.nome;
    if (novo && !nome) { erro.textContent = m('nome_obrigatorio'); erro.hidden = false; $('confirmar-nome').focus(); return; }
    const ajusteTxt = $('confirmar-ajuste').value.trim();
    const ajuste = ajusteTxt === '' ? null : Math.round(Number(ajusteTxt));
    if (ajuste != null && (!Number.isFinite(ajuste) || Math.abs(ajuste) > AJUSTE_MAX)) { erro.textContent = `O ajuste vai de −${AJUSTE_MAX} a ${AJUSTE_MAX} min.`; erro.hidden = false; return; }
    try {
      await gravarConfirmacao({ f, novo, nome, tipoChave: $('confirmar-tipo').value, nota: $('confirmar-nota').value.trim().slice(0, 280), ajuste, r: resultado });
    } catch (err) {
      console.info('[confirmar] não gravou', err && err.message);
      erro.textContent = T.erros?.salvar || 'Não deu para salvar neste celular.';
      erro.hidden = false;
      return;
    }
    dlg.close();
    avisar(m('salvo_local'));
    await aoMudarDados?.();
  };
  dlg.addEventListener('close', () => { medicao?.cancelar(); medicao = null; }, { once: true });
  dlg.showModal();
  (novo ? $('confirmar-nome') : $('confirmar-cancelar')).focus();
  comecar();
}

export async function gravarConfirmacao({ f, novo, nome, tipoChave, nota, ajuste, r }) {
  const data = hoje();
  const tipoNovo = TIPOS_NOVO.find((x) => x.chave === tipoChave) || TIPOS_NOVO[3];
  const base = f ? { ...f.properties } : { grupo: 'fora-da-placa' };
  for (const k of Object.keys(base)) if (k.startsWith('_')) delete base[k];
  const id = f ? f.properties.id : `${slugDe(nome)}-${Date.now().toString(36)}`;
  const props = {
    ...base,
    id,
    nome,
    tipo: f ? base.tipo : tipoNovo.tipo,
    confianca: 'alta',
    aproximado: false,
    fonte: `GPS no local, ${data}`,
    confirmacao: {
      acao: novo ? 'novo' : 'confirmar', data, gps_media: r.gps_media, alt_m: r.alt_m, precisao_m: r.precisao_m,
      n_amostras: r.n_amostras, dispersao_m: r.dispersao_m, nota: nota || '', ...(ajuste != null ? { sol_ajuste_min: ajuste } : {}),
      ...(novo && tipoNovo.tipo === 'infra' ? { subtipo: tipoNovo.chave } : {}),
      medido_em: new Date().toISOString(),
    },
  };
  if (novo && tipoNovo.tipo === 'infra') props.notas = [tipoNovo.rotulo, nota].filter(Boolean).join(': ');
  if (nota && !novo) props.notas = [base.notas, `Campo ${dataBR(data)}: ${nota}`].filter(Boolean).join(' · ');
  if (ajuste != null) props.sol_ajuste_min = ajuste;
  const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [...r.gps_media] }, properties: props };
  await banco.gravar('pontos-local', { ...feature, id });
  return feature;
}

export function montarConfirmar(contexto, { recarregar }) {
  ctx = contexto;
  aoMudarDados = recarregar;
  $('confirmar-novo').addEventListener('click', () => confirmar(null));
  listarNaTela();
  // no detalhe do destino (app público por baixo), o mesmo botão onde o ponto precisa
  document.addEventListener('itaitu:destino-escolhido', (e) => {
    const id = e.detail?.id;
    requestAnimationFrame(() => setTimeout(() => {
      const corpo = $('destino-corpo');
      const f = ctx.dados?.pontos?.features.find((x) => x.properties.id === id);
      if (!corpo || !f || corpo.querySelector('.m-confirmar-aqui')) return;
      if (!precisaConfirmar(f)) return;
      corpo.append(el('div', { class: 'linha-botoes m-confirmar-aqui' },
        el('button', { class: 'botao botao--marca', type: 'button', onclick: () => confirmar(f) }, m('confirmar'))));
    }, 60));
  });
}
