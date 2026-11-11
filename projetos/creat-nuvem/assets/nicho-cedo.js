/* Porta Aberta · nicho-cedo.js
   Roda no <head>, antes da primeira pintura: marca <html data-nicho="..."> com o nicho do anúncio
   (?nicho= ou #k= vindo de /abrir/ e /previa/), para o título da dobra já nascer no nicho certo,
   sem piscar e sem salto de layout. Sem JS, o HTML mostra a versão "sem nicho".
   Mesma regra de assets/vitrine.js (paginaHome): "salão" e "estetica" viram salao; nicho desconhecido fica de fora. */
(function () {
  try {
    var NICHOS = ['barbearia', 'salao', 'academia'];
    var k = new URLSearchParams(location.search).get('nicho');
    if (k === 'salão' || k === 'estetica') k = 'salao';
    if (NICHOS.indexOf(k) === -1) k = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('k');
    if (NICHOS.indexOf(k) !== -1) document.documentElement.setAttribute('data-nicho', k);
  } catch (e) {}
})();
