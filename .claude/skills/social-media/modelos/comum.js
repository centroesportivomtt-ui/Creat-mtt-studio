// Funções de página comuns ao carrossel e à apresentação.
/* global document, window */
(function () {
  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }

  function aplicarMarca(marca) {
    const r = document.documentElement.style;
    const c = marca.cores;
    r.setProperty('--cor-fundo', c.fundo);
    r.setProperty('--cor-brilho', c.brilho);
    r.setProperty('--cor-brilho-rgb', hexRgb(c.brilho));
    r.setProperty('--cor-destaque', c.destaque);
    r.setProperty('--cor-sobre-destaque', c.sobre_destaque);
    r.setProperty('--cor-tinta', c.tinta);
    r.setProperty('--cor-tinta-suave', c.tinta_suave);
    r.setProperty('--cor-linha', c.linha);
    const d = marca.fontes.display, t = marca.fontes.texto;
    r.setProperty('--fonte-display', `"${d.familia}", sans-serif`);
    r.setProperty('--fonte-texto', `"${t.familia}", sans-serif`);
    r.setProperty('--peso-display', d.peso || 900);
    r.setProperty('--largura-display', d.largura || 100);
    r.setProperty('--peso-texto', t.peso || 400);
    r.setProperty('--peso-texto-forte', t.peso_forte || 700);
    const css = document.createElement('style');
    css.textContent =
      `@font-face{font-family:"${d.familia}";src:url("${d.url}");font-weight:100 900;font-stretch:62% 125%;font-display:block}` +
      `@font-face{font-family:"${t.familia}";src:url("${t.url}");font-weight:100 900;font-display:block}`;
    document.head.appendChild(css);
  }

  async function esperarFontes(marca) {
    const d = marca.fontes.display, t = marca.fontes.texto;
    await Promise.all([
      document.fonts.load(`${d.peso || 900} 40px "${d.familia}"`, 'Aá01'),
      document.fonts.load(`${t.peso || 400} 40px "${t.familia}"`, 'Aá01'),
      document.fonts.load(`${t.peso_forte || 700} 40px "${t.familia}"`, 'Aá01'),
    ]);
    await document.fonts.ready;
    // Devolve as famílias que NÃO carregaram (lista vazia = tudo certo).
    const carregadas = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    return [d.familia, t.familia].filter((f) => !carregadas.has(f));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  // *palavra* vira destaque na cor da marca; quebra de linha manual com \n.
  function enfase(s) {
    return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  }

  const estoura = (caixa) => caixa.scrollHeight > caixa.clientHeight + 1 || caixa.scrollWidth > caixa.clientWidth + 1;

  // Reduz o tamanho dos elementos (em ordem de prioridade) até a caixa parar de estourar.
  function ajustar(caixa, regras) {
    for (const { el, min } of regras) {
      if (!el) continue;
      let px = parseFloat(getComputedStyle(el).fontSize);
      while (estoura(caixa) && px > min) {
        px = Math.max(min, px - 2);
        el.style.fontSize = px + 'px';
      }
    }
    return !estoura(caixa);
  }

  // Confere se o que importa ficou dentro da zona segura e se nenhum texto ficou menor que o mínimo.
  function conferir(raiz, area, minimoPx, rotulo) {
    const avisos = [];
    const base = raiz.getBoundingClientRect();
    raiz.querySelectorAll('[data-seguro]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const x0 = r.left - base.left, y0 = r.top - base.top, x1 = r.right - base.left, y1 = r.bottom - base.top;
      if (x0 < area.x0 - 0.5 || y0 < area.y0 - 0.5 || x1 > area.x1 + 0.5 || y1 > area.y1 + 0.5)
        avisos.push(`${rotulo}: "${el.dataset.seguro}" fora da zona segura (${Math.round(x0)},${Math.round(y0)} a ${Math.round(x1)},${Math.round(y1)})`);
    });
    raiz.querySelectorAll('[data-texto]').forEach((el) => {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (el.textContent.trim() && px < minimoPx - 0.01) avisos.push(`${rotulo}: "${el.dataset.texto}" com ${px}px (mínimo ${minimoPx}px)`);
    });
    return avisos;
  }

  window.Comum = { aplicarMarca, esperarFontes, esc, enfase, ajustar, estoura, conferir };
})();
