// pacote-tela.js · aba Pacote: resumo, exportar (Web Share com arquivo ou download) e só o GPX.

import { el } from '../util.js';
import * as banco from '../banco.js';
import { gerarGPX, blobGPX } from '../gpx.js';
import { perfilDaTrilha } from '../rota.js';
import { $, m, avisar, anunciar, isoBahia, hoje, compartilharOuBaixar } from './comum.js';
import { montarPacote } from './pacote.js';
import { trilhasDoMarcos } from './gravador-pro.js';

let ctx = null;

async function juntar() {
  let pontosLocais = [];
  try { pontosLocais = await banco.listar('pontos-local'); } catch (_) {}
  const trilhas = (await trilhasDoMarcos()).filter((r) => r.oficial);
  return montarPacote({
    bbox: ctx.recorte.bbox,
    comPerfil: (r) => perfilDaTrilha(r, ctx.motor),
    gerarGPX,
    agoraIso: () => isoBahia(),
    hojeDe: (ms) => hoje(ms),
    pontosLocais,
    trilhas,
  });
}

export async function atualizarResumo() {
  const alvo = $('pacote-resumo');
  if (!alvo || !ctx) return null;
  const { pacote, fora } = await juntar();
  const filhos = [el('p', { class: 'status' }, m('pacote_resumo', { pontos: pacote.pontos.length, trilhas: pacote.trilhas.length }))];
  if (pacote.pontos.length) filhos.push(el('ul', { class: 'm-resumo' }, pacote.pontos.map((p) => el('li', {}, `${p.nome} · ${p.acao === 'novo' ? 'novo' : 'confirmado'} · ${String(p.precisao_m).replace('.', ',')} m · ${p.n_amostras} leituras`))));
  if (pacote.trilhas.length) filhos.push(el('ul', { class: 'm-resumo' }, pacote.trilhas.map((t) => el('li', {}, `${t.nome} · ${String(t.km).replace('.', ',')} km · sobe ${t.desnivel_m} m${t.fincada_por ? ' · fincada pela ACAGI' : ''}`))));
  if (fora.length) filhos.push(el('p', { class: 'aviso-honesto' }, m('pacote_fora', { n: fora.length })), el('ul', { class: 'm-resumo m-resumo--fora' }, fora.map((x) => el('li', {}, x))));
  alvo.replaceChildren(...filhos);
  $('pacote-exportar').disabled = !(pacote.pontos.length || pacote.trilhas.length);
  $('pacote-gpx').disabled = $('pacote-exportar').disabled;
  return pacote;
}

async function exportar(soGPX) {
  const st = $('pacote-status');
  const { pacote, validacao } = await juntar();
  if (!pacote.pontos.length && !pacote.trilhas.length) { st.textContent = m('pacote_vazio'); return; }
  if (!validacao.ok) { st.textContent = `O pacote não passou na validação: ${validacao.erros.slice(0, 3).join('; ')}`; console.info('[pacote] inválido', validacao.erros); return; }
  const dia = hoje();
  const r = soGPX
    ? await compartilharOuBaixar(blobGPX(pacote.gpx), `itaitu-pacote-${dia}.gpx`, 'GPX do pacote de Itaitu')
    : await compartilharOuBaixar(new Blob([JSON.stringify(pacote, null, 1)], { type: 'application/json' }), `itaitu-pacote-${dia}.json`, 'Pacote de atualização de Itaitu');
  if (r === 'cancelado') { st.textContent = ''; return; }
  st.textContent = m('pacote_pronto', { pontos: pacote.pontos.length, trilhas: pacote.trilhas.length }) + (r === 'baixado' ? ' Arquivo baixado.' : '');
  anunciar(st.textContent);
  ctx.ultimoPacote = pacote;     // para conferência (teste) sem reler o download
}

export function montarPacoteTela(contexto) {
  ctx = contexto;
  $('pacote-exportar').addEventListener('click', () => exportar(false).catch((e) => { console.info('[pacote] falhou', e && e.message); avisar('Não deu para gerar o pacote agora.'); }));
  $('pacote-gpx').addEventListener('click', () => exportar(true).catch((e) => { console.info('[pacote] gpx falhou', e && e.message); }));
  document.addEventListener('itaitu:marcos-mudou', () => atualizarResumo());
  atualizarResumo();
}
