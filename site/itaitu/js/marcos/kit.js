// kit.js · kit de venda v1 (ARQUITETURA 7.6). O CONTEÚDO NUNCA ENTRA NO REPOSITÓRIO: o Marcos recebe o
// .json no Dropbox, importa aqui, e ele fica só no aparelho (store 'kit', chave 'atual'), atrás do PIN.
// Formato: { formato: 'itaitu-kit', versao: 1, gerado_em, roteiro: [{titulo, texto}],
//            objecoes: [{pergunta, resposta}], precos: [{plano, valor_centavos, periodo: 'mensal'|'unico', inclui: [..]}], notas }
// Tudo entra no DOM por textContent.

import { el } from '../util.js';
import * as banco from '../banco.js';
import { $, m, anunciar, dataBR } from './comum.js';

const LIMITE = 512 * 1024;
const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Puro: valida e limpa. Devolve { ok, kit?, erro? }
export function validarKit(bruto) {
  if (!bruto || typeof bruto !== 'object' || bruto.formato !== 'itaitu-kit' || bruto.versao !== 1) return { ok: false, erro: 'formato' };
  const lista = (v) => (Array.isArray(v) ? v : []);
  const kit = {
    formato: 'itaitu-kit', versao: 1, gerado_em: txt(bruto.gerado_em, 40),
    roteiro: lista(bruto.roteiro).map((x) => ({ titulo: txt(x?.titulo, 120), texto: txt(x?.texto, 4000) })).filter((x) => x.titulo || x.texto).slice(0, 60),
    objecoes: lista(bruto.objecoes).map((x) => ({ pergunta: txt(x?.pergunta, 300), resposta: txt(x?.resposta, 3000) })).filter((x) => x.pergunta).slice(0, 80),
    precos: lista(bruto.precos).map((x) => ({
      plano: txt(x?.plano, 120),
      valor_centavos: Number.isInteger(x?.valor_centavos) && x.valor_centavos >= 0 ? x.valor_centavos : null,
      periodo: x?.periodo === 'unico' ? 'unico' : 'mensal',
      inclui: lista(x?.inclui).map((i) => txt(i, 200)).filter(Boolean).slice(0, 30),
    })).filter((x) => x.plano && x.valor_centavos != null).slice(0, 20),
    notas: txt(bruto.notas, 4000),
  };
  if (!kit.roteiro.length && !kit.objecoes.length && !kit.precos.length) return { ok: false, erro: 'vazio' };
  return { ok: true, kit };
}

export function reais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let podeVer = () => false;
let aoTrancado = () => {};
function aberto() { if (podeVer()) return true; aoTrancado(); return false; }

export async function mostrar() {
  const alvo = $('kit-conteudo');
  if (!alvo || !podeVer()) return;
  let reg = null;
  try { reg = await banco.obter('kit', 'atual'); } catch (_) {}
  $('kit-apagar').hidden = !reg;
  if (!reg) { alvo.replaceChildren(el('p', { class: 'vazio' }, m('kit_vazio'))); return; }
  const k = reg.kit;
  const blocos = [el('p', { class: 'nota' }, `Importado em ${dataBR(reg.importado_em)}${k.gerado_em ? ` · versão de ${dataBR(k.gerado_em)}` : ''}`)];
  if (k.precos.length) {
    blocos.push(el('h4', { class: 'm-subtitulo' }, 'Preços'));
    blocos.push(el('ul', { class: 'm-precos' }, k.precos.map((p) => el('li', { class: 'm-preco' },
      el('p', { class: 'm-preco__plano' }, p.plano),
      el('p', { class: 'm-preco__valor num' }, `${reais(p.valor_centavos)}${p.periodo === 'mensal' ? ' por mês' : ' uma vez'}`),
      p.inclui.length ? el('ul', { class: 'm-preco__inclui' }, p.inclui.map((i) => el('li', {}, i))) : null))));
  }
  if (k.roteiro.length) {
    blocos.push(el('h4', { class: 'm-subtitulo' }, 'Roteiro da visita'));
    blocos.push(el('ol', { class: 'm-roteiro' }, k.roteiro.map((r) => el('li', {}, r.titulo ? el('p', { class: 'm-roteiro__titulo' }, r.titulo) : null, r.texto ? el('p', {}, r.texto) : null))));
  }
  if (k.objecoes.length) {
    blocos.push(el('h4', { class: 'm-subtitulo' }, 'Objeções'));
    for (const o of k.objecoes) blocos.push(el('details', { class: 'm-objecao' }, el('summary', {}, o.pergunta), el('p', {}, o.resposta)));
  }
  if (k.notas) blocos.push(el('h4', { class: 'm-subtitulo' }, 'Notas'), el('p', {}, k.notas));
  alvo.replaceChildren(...blocos);
}

async function importar(e) {
  const arq = e.target.files && e.target.files[0];
  e.target.value = '';
  const st = $('kit-status');
  if (!arq) return;
  if (!aberto()) return;
  if (arq.size > LIMITE) { st.textContent = m('kit_invalido'); return; }
  let bruto = null;
  try { bruto = JSON.parse(await arq.text()); } catch (_) { st.textContent = m('kit_invalido'); return; }
  const r = validarKit(bruto);
  if (!r.ok) { st.textContent = m('kit_invalido'); return; }
  await banco.gravar('kit', { chave: 'atual', kit: r.kit, importado_em: new Date().toISOString() });
  st.textContent = m('kit_ok');
  anunciar(st.textContent);
  await mostrar();
}

export function montarKit({ liberado, trancado }) {
  podeVer = liberado;
  if (trancado) aoTrancado = trancado;
  $('kit-arquivo').addEventListener('change', importar);
  $('kit-apagar').addEventListener('click', async () => {
    if (!aberto()) return;
    await banco.apagar('kit', 'atual');
    $('kit-status').textContent = 'Kit apagado deste celular.';
    await mostrar();
  });
}
