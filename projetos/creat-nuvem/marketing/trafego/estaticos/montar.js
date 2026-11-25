// Monta as placas a partir dos SVGs reais da vitrine e escreve o nome em giz.
(async function(){
  const SVG = '../../../assets/svg/';
  const txt = async f => (await fetch(SVG + f)).text();
  const [corrente, aberto, fechado] = await Promise.all([txt('corrente.svg'), txt('placa-aberto.svg'), txt('placa-fechado.svg')]);
  document.querySelectorAll('[data-placa]').forEach(el => {
    const face = el.dataset.placa === 'aberto' ? aberto : fechado;
    const com = el.hasAttribute('data-corrente');
    el.innerHTML = (com ? '<div style="margin-bottom:-5%">' + corrente + '</div>' : '') + face;
    // ids repetidos entre SVGs: renomeia clipPath/filtro por instância
    const uid = Math.random().toString(36).slice(2,7);
    el.querySelectorAll('[id]').forEach(n => { const o = n.id; n.id = o + '-' + uid; el.querySelectorAll('[clip-path="url(#'+o+')"],[filter="url(#'+o+')"]').forEach(r => { if (r.getAttribute('clip-path')) r.setAttribute('clip-path','url(#'+o+'-'+uid+')'); if (r.getAttribute('filter')) r.setAttribute('filter','url(#'+o+'-'+uid+')'); }); });
    const nome = el.querySelector('[id^="placa-nome"]');
    if (nome && el.dataset.nome) { nome.textContent = el.dataset.nome; const n = el.dataset.nome.length; if (n > 20) nome.setAttribute('font-size', Math.round(24 * 20 / n)); }
  });
  await document.fonts.ready;
  document.documentElement.dataset.pronto = '1';
})();
