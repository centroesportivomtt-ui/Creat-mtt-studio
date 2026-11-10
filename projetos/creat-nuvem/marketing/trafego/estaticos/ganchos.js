// Monta os estáticos G3 a G6: formato pela URL (?f=9x16 ou ?f=1x1), recorte do print real
// da prévia (só a faixa data-de..data-ate, nada do que vem abaixo é desenhado) e ajuste
// do texto à largura. Paleta, 10/11/2026.
(async function () {
  const f = new URLSearchParams(location.search).get('f') === '1x1' ? 'f1' : 'f9';
  document.documentElement.classList.add(f);
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll('.tela')].map(t => new Promise(ok => {
    const de = +t.dataset.de, ate = +t.dataset.ate, larg = +(t.dataset.larg || 1170);
    const s = t.clientWidth / larg;
    const r = document.createElement('div'); r.className = 'recorte'; r.style.height = Math.round((ate - de) * s) + 'px';
    const im = new Image(); im.alt = ''; im.style.marginTop = (-de * s) + 'px';
    im.onload = ok; im.onerror = ok; im.src = t.dataset.print;
    r.appendChild(im); t.prepend(r);
    // selos presos a uma linha do print (ex.: o rótulo acima do nome)
    t.parentElement.querySelectorAll('[data-y]').forEach(el => { el.style.top = Math.round((+el.dataset.y - de) * s - el.offsetHeight / 2) + 'px'; });
  })));
  // letreiro e linhas: reduz até caber na largura da caixa
  document.querySelectorAll('[data-fit]').forEach(el => {
    const max = +el.dataset.fit, min = +(el.dataset.min || 28);
    let fs = parseFloat(getComputedStyle(el).fontSize);
    const prop = el.classList.contains('nicho') ? '--t' : (el.classList.contains('linha') ? '--l' : null);
    const set = v => prop ? el.style.setProperty(prop, v + 'px') : (el.style.fontSize = v + 'px');
    while (el.getBoundingClientRect().width > max && fs > min) { fs -= 1; set(fs); }
  });
  document.documentElement.dataset.pronto = '1';
})();
