#!/usr/bin/env node
// aplicar-pacote.mjs · valida um pacote de atualização v1 e o funde nos dados do app (Forja, backend, 20/11/2026).
// Contrato: ARQUITETURA 7.5. Quem exporta: marcos.html (js/marcos/pacote.js). Quem roda: o time de dados, quando decidir.
//
// Uso:
//   node projetos/itaitu-mapa/scripts/aplicar-pacote.mjs <pacote.json> [--simular | --aplicar] [--json]
//        [--pontos=site/itaitu/dados/pontos.geojson] [--trilhas=site/itaitu/dados/trilhas.geojson] [--recorte=site/itaitu/dados/recorte.json]
//   --simular (padrão) valida, funde em memória e imprime o relatório; não escreve nada.
//   --aplicar          o mesmo, e grava os dois .geojson (só os que mudaram; escrita atômica por arquivo temporário + rename).
//   --json             relatório em JSON (para máquina) em vez de texto.
// Saída: 0 = tudo aceito · 1 = pacote recusado inteiro ou arquivo ilegível · 2 = uso errado · 3 = aplicado/simulado com itens recusados.
//
// Regras (7.5): recusa formato/versão desconhecidos, coordenada fora do recorte, precisão pior que 30 m (ponto confirmado entra
// como confiança 'alta'; o pedido da tarefa dizia 50 m, o contrato e o exportador dizem 30, vale o mais rígido), menos de 10
// amostras, id repetido, geometria inválida. Ponto confirmado entra com confianca 'alta', aproximado false e
// fonte 'GPS no local, AAAA-MM-DD' (sem nome de pessoa). Campos que o pacote não toca ficam como estavam.
// Idempotente: aplicar o mesmo pacote de novo não muda nada (o relatório mostra "já aplicado").
// Node 22, só módulos nativos. Sem rede.
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PADRAO = {
  pontos: join(RAIZ, 'site/itaitu/dados/pontos.geojson'),
  trilhas: join(RAIZ, 'site/itaitu/dados/trilhas.geojson'),
  recorte: join(RAIZ, 'site/itaitu/dados/recorte.json'),
};
export const BBOX_ITAITU = [-40.60, -11.42, -40.40, -11.26];      // recorte.bbox (ARQUITETURA 7.0)
export const FORMATO = 'itaitu-pacote';
export const VERSOES = [1];
export const PRECISAO_MAX_M = 30;
export const AMOSTRAS_MIN = 10;
export const AJUSTE_MAX = 30;
const TAMANHO_MAX = 20 * 1024 * 1024;
const TIPOS = new Set(['cachoeira', 'poco', 'vila', 'praca', 'igreja', 'hospedagem', 'infra', 'pico', 'area', 'mirante', 'estacionamento', 'entrada-trilha']);
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v) => Number.isInteger(v);
const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const r7 = (v) => Math.round(v * 1e7) / 1e7;
const igualJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const dentro = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
function distanciaM([lo1, la1], [lo2, la2]) {
  const R = 6371000, rad = Math.PI / 180;
  const a = Math.sin((la2 - la1) * rad / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin((lo2 - lo1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// geometria: lista de números finitos [lon, lat] (alt opcional quando permitida)
function erroCoordenada(c, bbox, comAlt) {
  if (!Array.isArray(c) || !(c.length === 2 || (comAlt && c.length === 3)) || !c.every(num)) return 'geometria inválida';
  if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) return 'geometria inválida';
  if (!dentro(c[0], c[1], bbox)) return `coordenada [${c[0]}, ${c[1]}] fora do recorte ${bbox.join(',')}`;
  return null;
}

// ------------------------------------------------------------------ validação
export function validarPonto(p, bbox) {
  const e = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['ponto não é objeto'];
  if (typeof p.id !== 'string' || !ID.test(p.id)) e.push('id inválido');
  if (!['confirmar', 'novo'].includes(p.acao)) e.push(`acao desconhecida: ${p.acao}`);
  if (!texto(p.nome, 120)) e.push('nome vazio ou longo demais');
  if (!TIPOS.has(p.tipo)) e.push(`tipo fora do contrato: ${p.tipo}`);
  const ec = erroCoordenada(p.gps_media, bbox, false);
  if (ec) e.push(ec === 'geometria inválida' ? 'geometria inválida (gps_media precisa ser [lon, lat])' : ec);
  if (p.alt_m != null && !num(p.alt_m)) e.push('alt_m não é número');
  if (!num(p.precisao_m) || p.precisao_m < 0) e.push('precisao_m ausente ou inválida');
  else if (p.precisao_m > PRECISAO_MAX_M) e.push(`precisão ${p.precisao_m} m pior que ${PRECISAO_MAX_M} m (exigido para entrar como confiança alta)`);
  if (!int(p.n_amostras) || p.n_amostras < AMOSTRAS_MIN) e.push(`${p.n_amostras} amostras de GPS (mínimo ${AMOSTRAS_MIN})`);
  if (!dataValida(p.data)) e.push('data inválida');
  if (p.nota != null && (typeof p.nota !== 'string' || p.nota.length > 500)) e.push('nota não é texto (até 500 caracteres)');
  if ('sol_ajuste_min' in p && (!int(p.sol_ajuste_min) || Math.abs(p.sol_ajuste_min) > AJUSTE_MAX)) e.push(`sol_ajuste_min fora de −${AJUSTE_MAX}..${AJUSTE_MAX}`);
  return e;
}

export function validarTrilha(t, bbox) {
  const e = [];
  if (!t || typeof t !== 'object' || Array.isArray(t)) return ['trilha não é objeto'];
  if (typeof t.id !== 'string' || !ID.test(t.id)) e.push('id inválido');
  if (t.destino_id != null && (typeof t.destino_id !== 'string' || !ID.test(t.destino_id))) e.push('destino_id inválido');
  if (!texto(t.nome, 160)) e.push('nome vazio ou longo demais');
  if (!['pe', 'carro'].includes(t.modo)) e.push(`modo desconhecido: ${t.modo}`);
  if ('fincada_por' in t && t.fincada_por !== 'ACAGI') e.push('fincada_por só aceita "ACAGI"');
  if (!dataValida(t.data)) e.push('data inválida');
  if (!num(t.km) || t.km < 0) e.push('km inválido');
  if (!int(t.desnivel_m) || t.desnivel_m < 0) e.push('desnivel_m inválido');
  if (!int(t.duracao_s) || t.duracao_s < 0) e.push('duracao_s inválido');
  if (!Array.isArray(t.coordenadas) || t.coordenadas.length < 2) e.push('geometria inválida (menos de 2 coordenadas)');
  else {
    const primeiro = t.coordenadas.map((c) => erroCoordenada(c, bbox, true)).find(Boolean);
    if (primeiro) e.push(primeiro === 'geometria inválida' ? 'geometria inválida (coordenada malformada)' : primeiro);
  }
  if (t.passagens != null) {
    if (!Array.isArray(t.passagens)) e.push('passagens não é lista');
    else for (const p of t.passagens) {
      const ec = p && typeof p === 'object' ? erroCoordenada([p.lon, p.lat], bbox, false) : 'geometria inválida';
      if (ec) { e.push(`passagem: ${ec}`); break; }
      if (typeof p.nota !== 'string' || p.nota.length > 200) { e.push('passagem sem nota de texto'); break; }
    }
  }
  if (t.perfil != null) {
    const ok = Array.isArray(t.perfil) && t.perfil.every((p) => Array.isArray(p) && p.length === 2 && int(p[0]) && int(p[1]))
      && (t.perfil.length === 0 || t.perfil[0][0] === 0);
    if (!ok) e.push('perfil inválido ([distância_m, altitude_m] inteiros, começando em 0)');
  }
  if ('sol_ajuste_min' in t && (!int(t.sol_ajuste_min) || Math.abs(t.sol_ajuste_min) > AJUSTE_MAX)) e.push(`sol_ajuste_min fora de −${AJUSTE_MAX}..${AJUSTE_MAX}`);
  return e;
}

// Erros que recusam o pacote inteiro.
export function validarCabecalho(pacote) {
  const e = [];
  if (!pacote || typeof pacote !== 'object' || Array.isArray(pacote)) return ['o arquivo não é um objeto JSON'];
  if (pacote.formato !== FORMATO) e.push(`formato desconhecido: ${JSON.stringify(pacote.formato)} (esperado "${FORMATO}")`);
  if (!VERSOES.includes(pacote.versao)) e.push(`versão desconhecida: ${JSON.stringify(pacote.versao)} (este script lê a versão ${VERSOES.join(', ')})`);
  if (typeof pacote.gerado_em !== 'string' || !ISO.test(pacote.gerado_em)) e.push('gerado_em não é data e hora ISO 8601');
  if (!Array.isArray(pacote.pontos)) e.push('pontos não é lista');
  if (!Array.isArray(pacote.trilhas)) e.push('trilhas não é lista');
  return e;
}

function validarColecao(fc, nome, tipoGeo) {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error(`${nome} não é FeatureCollection`);
  const ids = new Set();
  for (const f of fc.features) {
    const id = f && f.properties && f.properties.id;
    if (typeof id !== 'string') throw new Error(`${nome}: feature sem properties.id`);
    if (ids.has(id)) throw new Error(`${nome}: id repetido no arquivo (${id}); corrija antes de aplicar`);
    ids.add(id);
    if (f.geometry != null && f.geometry.type !== tipoGeo) throw new Error(`${nome}: ${id} não é ${tipoGeo}`);
  }
}

// ------------------------------------------------------------------ fusão (pura)
const fonteDe = (data) => `GPS no local, ${data}`;
const notaDeCampo = (data, nota) => `Campo ${data}: ${nota.trim()}`;

function perfilResumo(t) {
  const alts = (Array.isArray(t.perfil) && t.perfil.length ? t.perfil.map((p) => p[1]) : t.coordenadas.filter((c) => c.length === 3).map((c) => c[2]));
  if (!alts.length) return {};
  let desce = 0;
  for (let i = 1; i < alts.length; i++) if (alts[i] < alts[i - 1]) desce += alts[i - 1] - alts[i];
  return { descida_m: Math.round(desce), alt_ini_m: Math.round(alts[0]), alt_fim_m: Math.round(alts[alts.length - 1]) };
}

// Devolve { pontos, trilhas, relatorio, mudouPontos, mudouTrilhas }. Não muta as entradas.
export function fundir(pacote, pontosFC, trilhasFC, { bbox = BBOX_ITAITU } = {}) {
  const rel = { pontosNovos: [], pontosConfirmados: [], trilhasNovas: [], jaAplicados: [], rejeitados: [], avisos: [], ajustesCopiados: [] };
  const cab = validarCabecalho(pacote);
  if (cab.length) return { recusado: cab, relatorio: rel };
  validarColecao(pontosFC, 'pontos.geojson', 'Point');
  validarColecao(trilhasFC, 'trilhas.geojson', 'LineString');
  const pontos = structuredClone(pontosFC);
  const trilhas = structuredClone(trilhasFC);
  const idxPonto = new Map(pontos.features.map((f, i) => [f.properties.id, i]));
  const idxTrilha = new Map(trilhasFC.features.map((f, i) => [f.properties.id, i]));
  const contar = (lista) => lista.reduce((m, x) => (x && typeof x.id === 'string' ? m.set(x.id, (m.get(x.id) || 0) + 1) : m), new Map());
  const repP = contar(pacote.pontos), repT = contar(pacote.trilhas);
  const recusar = (tipo, id, motivos) => rel.rejeitados.push({ tipo, id: id ?? '(sem id)', motivos });
  const ajusteDoPacote = new Set();

  // ---- pontos
  for (const p of pacote.pontos) {
    const erros = validarPonto(p, bbox);
    if (p && repP.get(p.id) > 1) erros.push('id repetido no pacote');
    if (erros.length) { recusar('ponto', p && p.id, erros); continue; }
    const coords = [r7(p.gps_media[0]), r7(p.gps_media[1])];
    const campo = { data: p.data, precisao_m: p.precisao_m, n_amostras: p.n_amostras, ...(p.alt_m != null ? { alt_m: Math.round(p.alt_m) } : {}) };
    const i = idxPonto.get(p.id);
    if (p.acao === 'novo') {
      if (i != null) {
        const ant = pontos.features[i];
        const mesmo = ant.geometry && igualJSON(ant.geometry.coordinates.slice(0, 2), coords) && ant.properties.fonte === fonteDe(p.data);
        if (mesmo) rel.jaAplicados.push({ tipo: 'ponto', id: p.id });
        else recusar('ponto', p.id, ['acao "novo", mas o id já existe em pontos.geojson (use "confirmar")']);
        continue;
      }
      const props = { id: p.id, nome: p.nome.trim(), tipo: p.tipo, grupo: 'fora-da-placa', confianca: 'alta', aproximado: false, fonte: fonteDe(p.data), campo };
      if (p.nota && p.nota.trim()) props.notas = notaDeCampo(p.data, p.nota);
      if ('sol_ajuste_min' in p) { props.sol_ajuste_min = p.sol_ajuste_min; ajusteDoPacote.add(p.id); }
      pontos.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: props });
      idxPonto.set(p.id, pontos.features.length - 1);
      rel.pontosNovos.push({ id: p.id, nome: props.nome, tipo: p.tipo, coordenadas: coords, precisao_m: p.precisao_m });
      continue;
    }
    // confirmar
    if (i == null) { recusar('ponto', p.id, ['acao "confirmar", mas o id não existe em pontos.geojson (use "novo")']); continue; }
    const ant = pontos.features[i];
    const props = { ...ant.properties };
    if (props.fonte !== fonteDe(p.data) && props.fonte != null) props.fonte_anterior = props.fonte;
    Object.assign(props, { confianca: 'alta', aproximado: false, fonte: fonteDe(p.data), campo });
    if (p.nota && p.nota.trim()) {
      const n = notaDeCampo(p.data, p.nota);
      if (!String(props.notas || '').includes(n)) props.notas = props.notas ? `${props.notas} | ${n}` : n;
    }
    if ('sol_ajuste_min' in p) { props.sol_ajuste_min = p.sol_ajuste_min; ajusteDoPacote.add(p.id); }
    if (p.tipo !== ant.properties.tipo) rel.avisos.push(`ponto ${p.id}: o pacote diz tipo "${p.tipo}", o arquivo diz "${ant.properties.tipo}"; ficou o do arquivo`);
    const novo = { ...ant, geometry: { type: 'Point', coordinates: coords }, properties: props };
    if (igualJSON(novo, ant)) { rel.jaAplicados.push({ tipo: 'ponto', id: p.id }); continue; }
    pontos.features[i] = novo;
    const antes = ant.geometry ? ant.geometry.coordinates.slice(0, 2) : null;
    rel.pontosConfirmados.push({
      id: p.id, nome: props.nome, antes: { coordenadas: antes, confianca: ant.properties.confianca, aproximado: ant.properties.aproximado === true },
      depois: { coordenadas: coords, confianca: 'alta' }, deslocamento_m: antes ? Math.round(distanciaM(antes, coords)) : null, precisao_m: p.precisao_m,
    });
  }

  // ---- trilhas
  for (const t of pacote.trilhas) {
    const erros = validarTrilha(t, bbox);
    if (t && repT.get(t.id) > 1) erros.push('id repetido no pacote');
    if (erros.length) { recusar('trilha', t && t.id, erros); continue; }
    const coords = t.coordenadas.map((c) => (c.length === 3 ? [r7(c[0]), r7(c[1]), Math.round(c[2])] : [r7(c[0]), r7(c[1])]));
    const props = {
      id: t.id, destino_id: t.destino_id ?? null, nome: t.nome.trim(), modo: t.modo, confianca: 'alta', aproximado: false,
      fonte: fonteDe(t.data), autor: t.fincada_por === 'ACAGI' ? 'ACAGI' : 'GPS em campo',
      ...(t.fincada_por === 'ACAGI' ? { fincada_por: 'ACAGI' } : {}),
      km: t.km, desnivel_m: t.desnivel_m, ...perfilResumo(t), duracao_s: t.duracao_s, data: t.data,
      passagens: (t.passagens || []).map((x) => ({ lon: r7(x.lon), lat: r7(x.lat), nota: x.nota })),
      perfil: t.perfil || [],
      ...('sol_ajuste_min' in t ? { sol_ajuste_min: t.sol_ajuste_min } : {}),
    };
    const feat = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props };
    const i = idxTrilha.get(t.id);
    if (i != null) {
      if (igualJSON(trilhasFC.features[i], feat)) rel.jaAplicados.push({ tipo: 'trilha', id: t.id });
      else recusar('trilha', t.id, ['id já existe em trilhas.geojson com outro conteúdo']);
      continue;
    }
    if (props.destino_id && !idxPonto.has(props.destino_id)) rel.avisos.push(`trilha ${t.id}: destino_id "${props.destino_id}" não existe em pontos.geojson`);
    trilhas.features.push(feat);
    idxTrilha.set(t.id, trilhas.features.length - 1);
    rel.trilhasNovas.push({ id: t.id, nome: props.nome, destino_id: props.destino_id, modo: t.modo, km: t.km, pontos: coords.length, fincada_pela_acagi: t.fincada_por === 'ACAGI', sol_ajuste_min: props.sol_ajuste_min ?? null });
    // ajuste de sol medido na trilha fincada vale para o destino (o ponto do próprio pacote tem prioridade)
    if ('sol_ajuste_min' in t && props.destino_id && idxPonto.has(props.destino_id) && !ajusteDoPacote.has(props.destino_id)) {
      const j = idxPonto.get(props.destino_id);
      const pd = pontos.features[j].properties;
      if (pd.sol_ajuste_min !== t.sol_ajuste_min) {
        pontos.features[j] = { ...pontos.features[j], properties: { ...pd, sol_ajuste_min: t.sol_ajuste_min } };
        rel.ajustesCopiados.push({ trilha: t.id, ponto: props.destino_id, de: pd.sol_ajuste_min ?? null, para: t.sol_ajuste_min });
      }
    }
  }
  if (typeof pacote.gpx !== 'string' || !/^<\?xml[^>]*\?>\s*<gpx[\s>]/.test(pacote.gpx)) rel.avisos.push('gpx ausente ou malformado (não é usado na fusão)');
  return { pontos, trilhas, relatorio: rel, mudouPontos: !igualJSON(pontos, pontosFC), mudouTrilhas: !igualJSON(trilhas, trilhasFC) };
}

// ------------------------------------------------------------------ CLI
const serializar = (fc) => JSON.stringify(fc, null, 1) + '\n';     // mesmo formato dos arquivos do time de dados

function lerJSON(caminho, rotulo) {
  if (!existsSync(caminho)) throw new Error(`${rotulo} não existe: ${caminho}`);
  if (statSync(caminho).size > TAMANHO_MAX) throw new Error(`${rotulo} passa de ${TAMANHO_MAX / 1048576} MB`);
  try { return JSON.parse(readFileSync(caminho, 'utf8')); } catch (e) { throw new Error(`${rotulo} não é JSON válido (${e.message})`); }
}
function gravarAtomico(caminho, conteudo) {
  const tmp = `${caminho}.tmp-${process.pid}`;
  try { writeFileSync(tmp, conteudo); renameSync(tmp, caminho); }
  finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
function bboxDe(caminho) {
  if (!caminho || !existsSync(caminho)) return BBOX_ITAITU;
  const r = lerJSON(caminho, 'recorte.json');
  if (!Array.isArray(r.bbox) || r.bbox.length !== 4 || !r.bbox.every(num) || r.bbox[0] >= r.bbox[2] || r.bbox[1] >= r.bbox[3]) throw new Error('recorte.json com bbox inválido');
  return r.bbox;
}

function textoDoRelatorio(r, { arquivo, modo, pacote, gravados }) {
  const L = [];
  const fmt = (c) => (c ? `[${c[0]}, ${c[1]}]` : 'sem coordenada');
  L.push(`Pacote ${arquivo} · ${pacote ? `v${pacote.versao}, gerado em ${pacote.gerado_em}` : ''} · modo ${modo === 'aplicar' ? 'APLICAR' : 'SIMULAR (nada foi escrito)'}`);
  L.push(`\nPontos novos (${r.pontosNovos.length})`);
  for (const p of r.pontosNovos) L.push(`  + ${p.id} · ${p.nome} (${p.tipo}) em ${fmt(p.coordenadas)}, precisão ${p.precisao_m} m`);
  L.push(`\nPontos confirmados (${r.pontosConfirmados.length})`);
  for (const p of r.pontosConfirmados) {
    L.push(`  ✓ ${p.id} · ${p.nome}: ${fmt(p.antes.coordenadas)} (${p.antes.confianca}${p.antes.aproximado ? ', aproximado' : ''}) → ${fmt(p.depois.coordenadas)} (alta)` +
      `${p.deslocamento_m != null ? `, moveu ${p.deslocamento_m} m` : ''}, precisão ${p.precisao_m} m`);
  }
  L.push(`\nTrilhas novas (${r.trilhasNovas.length})`);
  for (const t of r.trilhasNovas) {
    L.push(`  + ${t.id} · ${t.nome} → ${t.destino_id || 'sem destino'} · ${t.modo} · ${t.km} km · ${t.pontos} pontos` +
      `${t.fincada_pela_acagi ? ' · fincada pela ACAGI' : ''}${t.sol_ajuste_min != null ? ` · sol_ajuste_min ${t.sol_ajuste_min}` : ''}`);
  }
  if (r.ajustesCopiados.length) {
    L.push(`\nAjuste de sol levado ao destino (${r.ajustesCopiados.length})`);
    for (const a of r.ajustesCopiados) L.push(`  ~ ${a.ponto}: sol_ajuste_min ${a.de ?? 'nenhum'} → ${a.para} (da trilha ${a.trilha})`);
  }
  if (r.jaAplicados.length) L.push(`\nJá aplicados, sem mudança (${r.jaAplicados.length}): ${r.jaAplicados.map((x) => `${x.tipo} ${x.id}`).join(', ')}`);
  L.push(`\nRecusados (${r.rejeitados.length})`);
  for (const x of r.rejeitados) L.push(`  ✗ ${x.tipo} ${x.id}: ${x.motivos.join('; ')}`);
  if (r.avisos.length) { L.push(`\nAvisos (${r.avisos.length})`); for (const a of r.avisos) L.push(`  ! ${a}`); }
  if (modo === 'aplicar') L.push(`\nGravado: ${gravados.length ? gravados.join(', ') : 'nada (nenhuma mudança)'}`);
  else L.push('\nNada foi escrito. Para gravar: o mesmo comando com --aplicar (tarefa do time de dados).');
  return L.join('\n');
}

export function main(argv = process.argv.slice(2), saida = console) {
  const opc = {}; const posicionais = [];
  for (const a of argv) {
    if (a === '--simular' || a === '--aplicar' || a === '--json') opc[a.slice(2)] = true;
    else if (/^--(pontos|trilhas|recorte)=.+/.test(a)) { const [k, ...v] = a.slice(2).split('='); opc[k] = v.join('='); }
    else if (a.startsWith('--')) { saida.error(`opção desconhecida: ${a}`); return 2; }
    else posicionais.push(a);
  }
  if (posicionais.length !== 1 || (opc.simular && opc.aplicar)) {
    saida.error('uso: node projetos/itaitu-mapa/scripts/aplicar-pacote.mjs <pacote.json> [--simular | --aplicar] [--json] [--pontos=…] [--trilhas=…] [--recorte=…]');
    return 2;
  }
  const modo = opc.aplicar ? 'aplicar' : 'simular';
  const arquivo = resolve(posicionais[0]);
  const caminhos = { pontos: resolve(opc.pontos || PADRAO.pontos), trilhas: resolve(opc.trilhas || PADRAO.trilhas), recorte: opc.recorte ? resolve(opc.recorte) : PADRAO.recorte };
  let pacote, res;
  try {
    pacote = lerJSON(arquivo, 'pacote');
    const bbox = bboxDe(caminhos.recorte);
    res = fundir(pacote, lerJSON(caminhos.pontos, 'pontos.geojson'), lerJSON(caminhos.trilhas, 'trilhas.geojson'), { bbox });
  } catch (e) {
    if (opc.json) saida.log(JSON.stringify({ ok: false, erro: e.message }));
    else saida.error(`ERRO: ${e.message}`);
    return 1;
  }
  if (res.recusado) {
    if (opc.json) saida.log(JSON.stringify({ ok: false, recusado: res.recusado }));
    else saida.error(`Pacote ${basename(arquivo)} RECUSADO inteiro:\n${res.recusado.map((x) => `  ✗ ${x}`).join('\n')}\nNada foi escrito.`);
    return 1;
  }
  const gravados = [];
  if (modo === 'aplicar') {
    if (res.mudouPontos) { gravarAtomico(caminhos.pontos, serializar(res.pontos)); gravados.push(caminhos.pontos); }
    if (res.mudouTrilhas) { gravarAtomico(caminhos.trilhas, serializar(res.trilhas)); gravados.push(caminhos.trilhas); }
  }
  const r = res.relatorio;
  if (opc.json) saida.log(JSON.stringify({ ok: r.rejeitados.length === 0, modo, gravados, ...r }, null, 1));
  else saida.log(textoDoRelatorio(r, { arquivo: basename(arquivo), modo, pacote, gravados }));
  return r.rejeitados.length ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
