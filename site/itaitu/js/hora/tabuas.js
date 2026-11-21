// hora/tabuas.js · as tábuas da placa e a faixa "saia até" (Pixel, frontend B). ARQUITETURA 6.2–6.4, DESIGN 6.
// O estado vem DOS DADOS (_estado do dados.js), nunca de lista fixa:
//   confirmada      tinta cheia, "sol no poço até", "saia até", "volte com luz até" e a nota ±10/15 min
//   aproximada      tracejada, "posição aproximada", sem hora nenhuma
//   sem-coordenada  "posição não confirmada: vá com guia" e o botão "Chamar um guia"
// Botões HTML de verdade (>= 44 px). Tocar no nome leva o voo (itaitu:destino-escolhido, origem 'tabua').
// Plano B: com ?tabua=clara (ou localStorage 'itaitu:tabua'), <html data-tabua="clara">: tábua creme, tinta madeira.

import { T, t, linhaDaPlaca, notaDeCalculo, comArtigo } from '../textos.js';
import { hhmm } from '../motor/nucleo.js';
import { el, icone, linkSeguro, lerLocal, gravarLocal } from '../util.js';
import { linkGuia } from '../marca.js';
import { chaveDaSituacao } from './regras.js';

export function montarTabuas(H) {
  const alvo = document.getElementById('hora-tabuas');
  const faixa = document.getElementById('hora-faixa');
  const ctx = H.ctx;
  const vitrine = ctx.params.get('vitrine') === '1';

  // plano B da tábua (decisão da verificação ao sol): data-tabua="clara"
  const pedido = ctx.params.get('tabua');
  if (pedido === 'clara' || pedido === 'madeira') gravarLocal('itaitu:tabua', pedido === 'clara' ? 'clara' : null);
  if (lerLocal('itaitu:tabua') === 'clara') document.documentElement.dataset.tabua = 'clara';

  let assinatura = '';
  let faixaVisivel = false;

  // ---------------------------------------------------------------- uma hora da tábua
  const hora = (rotulo, valor) => el('div', { class: 'tabua__hora' }, el('dt', {}, rotulo), el('dd', { class: 'tabua__num' }, valor));

  function chamarGuia() {
    const g = linkSeguro(linkGuia(ctx.marca, ctx.dados?.info));
    if (!g) return null;
    const a = el('a', { class: 'tabua__guia', href: g, target: '_blank', rel: 'noopener noreferrer' }, icone('i-guia'), el('span', {}, T.tabuas.chamar_guia));
    a.addEventListener('click', (e) => {
      if (vitrine) { e.preventDefault(); ctx.avisar?.(T.demo.vitrine); }
      else if (navigator.onLine === false) { e.preventDefault(); ctx.avisar?.(T.erros.link_offline); }
    });
    if (vitrine) a.setAttribute('aria-disabled', 'true');
    return a;
  }

  function tabua(p) {
    const props = p.props;
    const amanha = p.temHora && p.mostra === 'amanha';
    const e = p.temHora ? H.exibMostrada(p) : null;
    const li = el('li', {
      class: 'tabua', 'data-estado': p.estado, 'data-ponto': p.id, 'data-amanha': amanha ? '1' : '0',
    });
    if (H.foco === p.id) li.setAttribute('aria-current', 'true');
    const titulo = el('button', { class: 'tabua__titulo', type: 'button', id: `tabua-${p.id}` }, p.nome);
    titulo.addEventListener('click', () => {
      H.focar(p.id);
      ctx.emit('itaitu:destino-escolhido', { id: p.id, origem: 'tabua' });
    });
    li.append(titulo, el('span', { class: 'tabua__selo' }, amanha ? T.hora.amanha : ''));
    const placa = linhaDaPlaca(props);
    if (placa) li.append(el('p', { class: 'tabua__placa' }, placa));

    if (p.estado === 'confirmada' && p.temHora) {
      if (!e) {
        li.append(el('p', { class: 'tabua__nota' }, H.motorFalhou ? T.hora.indisponivel : T.hora.calculando));
      } else {
        const agora = H.exibDe(p, H.hoje);
        const sit = amanha ? 'planejar' : agora.situacao;
        const horas = el('dl', { class: 'tabua__horas' });
        if (e.apaga != null) horas.append(hora(T.hora.apaga, hhmm(e.apaga)));
        // passou do 'saia até', mas ainda dá: a coluna diz 'agora' e a frase embaixo diz quantos minutos de sol
        if (sit === 'saia-agora' && agora.saindoAgoraMin != null) horas.append(hora(T.hora.saia_ate, T.regua.agora_curto));
        // sem tempo de chegar com sol hoje: o "saia até" de hoje já passou e não aparece; a frase embaixo explica
        else if (e.saiaAte != null && sit !== 'sem-tempo-hoje') horas.append(hora(T.hora.saia_ate, hhmm(e.saiaAte)));
        if (e.volteComLuzAte != null) horas.append(hora(T.hora.volte_com_luz, hhmm(e.volteComLuzAte)));
        else if (e.escurece != null) horas.append(hora(T.hora.escurece, hhmm(e.escurece)));
        li.dataset.luz = !amanha && agora.situacao !== 'sol-foi' && agora.apaga != null && H.agoraMin() < agora.apaga ? 'sol' : 'sombra';
        if (horas.childElementCount) li.append(horas);
        // situação em palavras (o número sozinho não diz que o sol já foi)
        // 'hora.sol_foi' só quando o sol já foi de fato (regras.chaveDaSituacao, com teste)
        const chave = chaveDaSituacao(agora, p.mostra, H.amanhaGeral);
        const sitTexto = chave ? t(chave, { min: agora.saindoAgoraMin, nome: p.poco, hora: agora.apaga != null ? hhmm(agora.apaga) : '' }) : '';
        if (sitTexto) li.append(el('p', { class: 'tabua__aviso hora-tabua__situacao' }, sitTexto));
        if (e.apaga != null) li.append(el('p', { class: 'tabua__nota' }, notaDeCalculo(p.incerteza)));
        if (sit === 'sem-tempo') { const g = chamarGuia(); if (g) li.append(g); }
      }
    } else if (p.estado === 'aproximada') {
      li.append(el('p', { class: 'tabua__aviso' }, T.tabuas.aproximada));
    } else if (p.estado === 'sem-coordenada') {
      li.append(el('p', { class: 'tabua__aviso' }, T.tabuas.sem_coordenada));
      const g = chamarGuia();
      if (g) li.append(g);
    }
    if (props.fincada_por) li.append(el('span', { class: 'tabua__fincada' }, t('tabuas.fincada_por', { quem: props.fincada_por })));
    return li;
  }

  // ---------------------------------------------------------------- lista
  function renderizar() {
    if (!alvo) return;
    const focoAntes = document.activeElement && alvo.contains(document.activeElement) ? document.activeElement.id : null;
    const agua = H.pontos.filter((p) => p.agua);
    const placa = agua.filter((p) => p.props.grupo === 'placa');
    const fora = agua.filter((p) => p.props.grupo !== 'placa');
    const outros = H.pontos.filter((p) => !p.agua && p.coord);
    const blocos = [];
    if (placa.length) {
      blocos.push(el('h3', { class: 'hora-tabuas__titulo', id: 'tabuas-placa' }, T.tabuas.titulo_placa));
      blocos.push(el('p', { class: 'nota hora-tabuas__nota' }, T.hora.carro_da_placa));
      blocos.push(el('ul', { class: 'tabuas', 'aria-labelledby': 'tabuas-placa' }, placa.map(tabua)));
    }
    if (fora.length) {
      blocos.push(el('h3', { class: 'hora-tabuas__titulo', id: 'tabuas-fora' }, T.tabuas.titulo_outros));
      blocos.push(el('ul', { class: 'tabuas', 'aria-labelledby': 'tabuas-fora' }, fora.map(tabua)));
    }
    if (outros.length) {
      // vila, pico, mirante e entradas continuam ao alcance (a lista simples do A se recolhe com as tábuas)
      blocos.push(el('h3', { class: 'hora-tabuas__titulo', id: 'tabuas-lugares' }, t('tabuas.titulo_lugares', {}, 'Vila e outros pontos')));
      blocos.push(el('ul', { class: 'destinos hora-lugares', 'aria-labelledby': 'tabuas-lugares' }, outros.map((p) => el('li', {},
        el('button', { class: 'destino', type: 'button', 'data-estado': p.estado, 'data-ponto': p.id, onclick: () => ctx.emit('itaitu:destino-escolhido', { id: p.id, origem: 'lista' }) },
          el('span', { class: 'destino__nome' }, p.nome),
          p.estado === 'aproximada' ? el('span', { class: 'destino__estado' }, T.tabuas.aproximada) : null)))));
    }
    if (!H.pontos.length) blocos.push(el('p', { class: 'vazio' }, T.tabuas.vazia));
    alvo.replaceChildren(...blocos);
    assinatura = assinar();
    if (focoAntes) document.getElementById(focoAntes)?.focus({ preventScroll: true });
    renderizarFaixa();
  }

  // só refaz a lista quando algo visível mudou (o relógio chama a cada minuto)
  function assinar() {
    return H.pontos.filter((p) => p.temHora).map((p) => {
      const e = H.exibMostrada(p);
      const a = H.exibDe(p, H.hoje);
      return `${p.id}:${p.mostra}:${e ? [e.apaga, e.saiaAte, e.volteComLuzAte].join(',') : '-'}:${a ? `${a.situacao},${a.saindoAgoraMin}` : '-'}`;
    }).join('|') + `|${H.amanhaGeral}|${H.motorFalhou}|${H.foco}`;
  }
  function atualizarSeMudou() {
    if (assinar() !== assinatura) renderizar();
    else renderizarFaixa();
  }

  function marcarAtual(id) {
    if (!alvo) return;
    for (const li of alvo.querySelectorAll('.tabua')) {
      if (li.dataset.ponto === id) li.setAttribute('aria-current', 'true');
      else li.removeAttribute('aria-current');
    }
  }

  // ---------------------------------------------------------------- faixa "saia até" (#hora-faixa)
  function renderizarFaixa() {
    if (!faixa) return;
    const p = H.destinoDaFaixa();
    const e = p && H.exibMostrada(p);
    if (!p || !e || e.apaga == null) { faixa.replaceChildren(); faixa.hidden = true; return; }
    const amanha = p.mostra === 'amanha';
    const hoje = H.exibDe(p, H.hoje);
    const nota = notaDeCalculo(p.incerteza);
    let rotulo, num, destino, aria;
    if (!amanha && hoje.situacao === 'saia-agora' && hoje.saindoAgoraMin != null) {
      // chave do Verbo 'faixa.saindo_agora_destino' ('{min} min de sol {no:nome}'): o número vai para a
      // coluna grande e o resto para o destino; se o texto não começar pelo número, vai inteiro no destino
      rotulo = T.faixa.saindo_agora;
      const min = String(hoje.saindoAgoraMin);
      const frase = t('faixa.saindo_agora_destino', { min, nome: p.poco });
      if (frase.startsWith(min)) { num = min; destino = frase.slice(min.length).trim(); }
      else { num = ''; destino = frase; }
      aria = `${t('hora.saindo_agora', { min })}. ${p.poco}.`;
    } else if (!amanha && hoje.situacao === 'sem-tempo-hoje') {
      // o sol ainda está no poço, mas não dá mais para chegar com ele: a hora em que a serra apaga, sem "saia até"
      rotulo = T.hora.apaga;
      num = hhmm(hoje.apaga);
      destino = comArtigo('no', p.poco);
      aria = t('hora.frase_sem_tempo_hoje_apaga', { nome: p.poco, hora: num });
    } else if (e.saiaAte != null) {
      rotulo = amanha ? `${T.faixa.amanha}, ${T.faixa.rotulo}` : T.faixa.rotulo;
      num = hhmm(e.saiaAte);
      destino = t('faixa.destino', { nome: p.poco });
      aria = `${amanha ? `${T.hora.amanha}: ` : ''}${t('faixa.aria', { hora: num, nome: p.poco })}`;
    } else {
      // sem tempo de placa: só a hora em que a serra apaga o sol, nunca um "saia até" inventado
      rotulo = T.hora.apaga;
      num = hhmm(e.apaga);
      destino = comArtigo('no', p.poco);
      aria = `${T.hora.apaga} ${num}, ${destino}. ${T.hora.sem_tempo}`;
    }
    faixa.setAttribute('role', 'note');
    faixa.setAttribute('aria-label', `${aria} ${nota}`);
    faixa.dataset.ponto = p.id;
    faixa.dataset.amanha = amanha ? '1' : '0';
    faixa.dataset.situacao = amanha ? 'amanha' : hoje.situacao;
    faixa.replaceChildren(
      el('span', { class: 'faixa-saia__rotulo' }, rotulo),
      num ? el('span', { class: 'faixa-saia__num' }, num) : null,
      el('span', { class: 'faixa-saia__destino' }, destino),
      el('span', { class: 'faixa-saia__nota' }, nota));
    faixa.hidden = !faixaVisivel;
  }
  function mostrarFaixa() {
    faixaVisivel = true;
    renderizarFaixa();
    ctx.layout?.();
  }

  // o destino escolhido por qualquer caminho vira o destino da faixa e da janela da régua
  document.addEventListener('itaitu:destino-escolhido', (ev) => {
    const id = ev.detail?.id;
    if (id && H.porId.get(id)?.temHora && H.foco !== id) H.focar(id);
  });

  return { renderizar, atualizarSeMudou, marcarAtual, renderizarFaixa, mostrarFaixa, get faixaVisivel() { return faixaVisivel; } };
}
