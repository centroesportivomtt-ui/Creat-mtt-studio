// pacote.js · pacote de atualização v1 (ARQUITETURA 7.5) + GPX.
// montarPacote() junta: pontos de 'pontos-local' (acao 'confirmar' | 'novo') e trilhas de 'trilhas' com
// app 'marcos' e oficial: true. validarPacote() é pura (Node importa para teste) e aplica as mesmas regras
// do scripts/aplicar-pacote.mjs: formato/versão, coordenada dentro do recorte, precisao_m <= 30,
// n_amostras >= 10. O que não passa fica fora do arquivo, com o motivo na tela.
// Nunca leva nome de pessoa: o condutor fica só no aparelho; a trilha leva fincada_por: 'ACAGI'.

export const FORMATO = 'itaitu-pacote';
export const VERSAO = 1;
// ARQUITETURA 7.3: ajuste de sol medido em campo vale de −30 a +30 min. O motor (motor/nucleo.js) troca
// por 0, em silêncio, qualquer valor fora disso; por isso o app recusa na entrada e o pacote recusa de novo.
export const AJUSTE_MAX = 30;
const TIPOS = new Set(['cachoeira', 'poco', 'vila', 'praca', 'igreja', 'hospedagem', 'infra', 'pico', 'area', 'mirante', 'estacionamento', 'entrada-trilha']);
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v) => Number.isInteger(v);
const dentro = ([lon, lat], b) => num(lon) && num(lat) && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

export function validarPonto(p, bbox) {
  const e = [];
  if (!p || typeof p !== 'object') return ['ponto não é objeto'];
  if (!ID.test(p.id || '')) e.push('id inválido');
  if (!['confirmar', 'novo'].includes(p.acao)) e.push('acao inválida');
  if (typeof p.nome !== 'string' || !p.nome.trim()) e.push('nome vazio');
  if (!TIPOS.has(p.tipo)) e.push(`tipo fora do contrato: ${p.tipo}`);
  if (!Array.isArray(p.gps_media) || p.gps_media.length !== 2 || !dentro(p.gps_media, bbox)) e.push('coordenada fora do recorte');
  if (p.alt_m != null && !int(p.alt_m)) e.push('alt_m não é inteiro');
  if (!num(p.precisao_m) || p.precisao_m > 30 || p.precisao_m < 0) e.push(`precisão ${p.precisao_m} m (máximo 30)`);
  if (!int(p.n_amostras) || p.n_amostras < 10) e.push(`${p.n_amostras} amostras (mínimo 10)`);
  if (!DATA.test(p.data || '')) e.push('data inválida');
  if (p.nota != null && typeof p.nota !== 'string') e.push('nota não é texto');
  if ('sol_ajuste_min' in p && (!int(p.sol_ajuste_min) || Math.abs(p.sol_ajuste_min) > AJUSTE_MAX)) e.push(`sol_ajuste_min fora de −${AJUSTE_MAX}..${AJUSTE_MAX}`);
  return e;
}

export function validarTrilha(t, bbox) {
  const e = [];
  if (!t || typeof t !== 'object') return ['trilha não é objeto'];
  if (!ID.test(t.id || '')) e.push('id inválido');
  if (t.destino_id != null && !ID.test(t.destino_id)) e.push('destino_id inválido');
  if (typeof t.nome !== 'string' || !t.nome.trim()) e.push('nome vazio');
  if (!['pe', 'carro'].includes(t.modo)) e.push('modo inválido');
  if ('fincada_por' in t && t.fincada_por !== 'ACAGI') e.push('fincada_por só aceita ACAGI');
  if (!DATA.test(t.data || '')) e.push('data inválida');
  if (!num(t.km) || t.km < 0) e.push('km inválido');
  if (!int(t.desnivel_m) || t.desnivel_m < 0) e.push('desnivel_m inválido');
  if (!int(t.duracao_s) || t.duracao_s < 0) e.push('duracao_s inválido');
  if (!Array.isArray(t.coordenadas) || t.coordenadas.length < 2) e.push('menos de 2 coordenadas');
  else if (!t.coordenadas.every((c) => Array.isArray(c) && (c.length === 2 || c.length === 3) && dentro(c, bbox) && (c.length === 2 || num(c[2])))) e.push('coordenada fora do recorte ou malformada');
  if (!Array.isArray(t.passagens) || !t.passagens.every((p) => p && dentro([p.lon, p.lat], bbox) && typeof p.nota === 'string')) e.push('passagem inválida');
  if (!Array.isArray(t.perfil) || !t.perfil.every((p) => Array.isArray(p) && p.length === 2 && int(p[0]) && int(p[1])) || (t.perfil.length && t.perfil[0][0] !== 0)) e.push('perfil inválido');
  if ('sol_ajuste_min' in t && (!int(t.sol_ajuste_min) || Math.abs(t.sol_ajuste_min) > AJUSTE_MAX)) e.push(`sol_ajuste_min fora de −${AJUSTE_MAX}..${AJUSTE_MAX}`);
  return e;
}

// { ok, erros: [texto] }
export function validarPacote(pacote, bbox) {
  const erros = [];
  if (!pacote || pacote.formato !== FORMATO) erros.push('formato errado');
  if (pacote?.versao !== VERSAO) erros.push('versão errada');
  if (!ISO.test(pacote?.gerado_em || '')) erros.push('gerado_em não é ISO 8601');
  if (!Array.isArray(pacote?.pontos)) erros.push('pontos não é lista');
  if (!Array.isArray(pacote?.trilhas)) erros.push('trilhas não é lista');
  if (typeof pacote?.gpx !== 'string' || !/^<\?xml[^>]*\?>\s*<gpx[\s>]/.test(pacote.gpx)) erros.push('gpx ausente ou malformado');
  for (const p of pacote?.pontos || []) for (const x of validarPonto(p, bbox)) erros.push(`ponto ${p?.id}: ${x}`);
  for (const t of pacote?.trilhas || []) for (const x of validarTrilha(t, bbox)) erros.push(`trilha ${t?.id}: ${x}`);
  return { ok: erros.length === 0, erros };
}

// Porteira e ponte viram tipo 'infra' (o 7.5 é fixo, sem chave nova): o rótulo vai na frente da nota.
const ROTULO_SUBTIPO = { porteira: 'Porteira', ponte: 'Ponte' };
export function notaComSubtipo(c) {
  const nota = typeof c.nota === 'string' ? c.nota.trim() : '';
  const rotulo = ROTULO_SUBTIPO[c.subtipo] || (typeof c.subtipo === 'string' && c.subtipo ? c.subtipo : '');
  if (!rotulo || nota.toLowerCase().startsWith(rotulo.toLowerCase())) return nota;
  return nota ? `${rotulo}: ${nota}` : rotulo;
}

// Feature de pontos-local -> item do pacote
export function pontoDoPacote(f) {
  const p = f.properties || {};
  const c = p.confirmacao || {};
  const item = {
    id: p.id, acao: c.acao === 'novo' ? 'novo' : 'confirmar', nome: p.nome, tipo: p.tipo,
    gps_media: c.gps_media || f.geometry?.coordinates?.slice(0, 2), alt_m: c.alt_m ?? null,
    precisao_m: c.precisao_m, n_amostras: c.n_amostras, data: c.data, nota: notaComSubtipo(c),
  };
  if (Number.isInteger(c.sol_ajuste_min)) item.sol_ajuste_min = c.sol_ajuste_min;
  return item;
}

// registro de 'trilhas' -> item do pacote (perfil e desnível já calculados por rota.js)
export function trilhaDoPacote(r, perfil, data) {
  const item = {
    id: r.id, destino_id: r.destino_id || null, nome: r.nome, modo: r.modo === 'carro' ? 'carro' : 'pe',
    data, km: Math.round((r.km || 0) * 1000) / 1000,
    desnivel_m: Math.max(0, Math.round(perfil ? perfil.subida_m : (r.desnivel_m || 0))),
    duracao_s: Math.max(0, Math.round(r.duracao_s || 0)),
    coordenadas: r.pontos.map((p) => (Number.isFinite(p.alt) ? [r7(p.lon), r7(p.lat), Math.round(p.alt)] : [r7(p.lon), r7(p.lat)])),
    passagens: (r.passagens || []).map((p) => ({ lon: r7(p.lon), lat: r7(p.lat), nota: String(p.nota || '').slice(0, 120) })),
    perfil: perfil ? perfil.pontos : [],
  };
  if (r.fincada_por === 'ACAGI') item.fincada_por = 'ACAGI';
  if (Number.isInteger(r.sol_ajuste_min)) item.sol_ajuste_min = r.sol_ajuste_min;
  return item;
}
const r7 = (v) => Math.round(v * 1e7) / 1e7;

// ---------------------------------------------------------------- navegador
export async function montarPacote({ bbox, comPerfil, gerarGPX, agoraIso, hojeDe, pontosLocais, trilhas }) {
  const fora = [];
  const pontos = [];
  for (const f of pontosLocais) {
    const item = pontoDoPacote(f);
    const e = validarPonto(item, bbox);
    if (e.length) fora.push(`${item.nome || item.id}: ${e.join(', ')}`); else pontos.push(item);
  }
  const lista = [];
  for (const r of trilhas) {
    if (!Array.isArray(r.pontos) || r.pontos.length < 2) { fora.push(`${r.nome}: sem traçado`); continue; }
    let perfil = null;
    try { perfil = await comPerfil(r); } catch (_) { perfil = null; }
    const item = trilhaDoPacote(r, perfil, hojeDe(r.criada_em));
    const e = validarTrilha(item, bbox);
    if (e.length) fora.push(`${r.nome}: ${e.join(', ')}`); else lista.push({ item, r });
  }
  const gpx = gpxDoPacote({ gerarGPX, pontos, trilhas: lista.map((x) => x.r) });
  const pacote = { formato: FORMATO, versao: VERSAO, gerado_em: agoraIso(), pontos, trilhas: lista.map((x) => x.item), gpx };
  return { pacote, fora, validacao: validarPacote(pacote, bbox) };
}

// Um GPX só: <wpt> dos pontos e um <trk> por trilha (o gerarGPX do app público monta cada pedaço)
export function gpxDoPacote({ gerarGPX, pontos, trilhas }) {
  const base = gerarGPX({
    nome: 'Itaitu · pacote de atualização',
    waypoints: pontos.map((p) => ({ lon: p.gps_media[0], lat: p.gps_media[1], alt: p.alt_m, nome: p.nome, nota: [p.acao === 'novo' ? 'ponto novo' : 'posição confirmada', `precisão ${p.precisao_m} m`, p.nota].filter(Boolean).join(' · '), tipo: p.tipo })),
  });
  const trks = trilhas.map((r) => {
    const txt = gerarGPX({ nome: r.nome, pontos: r.pontos, passagens: r.passagens || [] });
    const wpts = (txt.match(/<wpt[\s\S]*?<\/wpt>/g) || []).join('\n');
    const trk = (txt.match(/<trk>[\s\S]*<\/trk>/) || [''])[0];
    return [wpts, trk].filter(Boolean).join('\n');
  }).filter(Boolean);
  return base.replace(/<\/gpx>\s*$/, `${trks.join('\n')}${trks.length ? '\n' : ''}</gpx>`);
}
