// LEGENDA: palavra por palavra, palavra ativa em âmbar que NUNCA pisca escura.
// Por que nunca pisca: a palavra entra com opacidade 1 desde o primeiro quadro (o que anima é escala e blur),
// a cor só viaja entre duas cores claras (âmbar <-> branco, sem passar por escuro) e não existe caixa de fundo
// que acende por cima ou por baixo do texto. O `checar` mede a luminância da palavra ativa em todo quadro.
// props:
//   texto: "cada quadro | deste vídeo | é *código*."  ("|" quebra a página; *palavra* fica âmbar e maior)
//   ritmo: segundos por palavra quando não há tempos (0.3)   inicio: tempo local da 1ª palavra (0.1)
//   palavras: [{ p: "CADA", i: 2.60, f: 2.85 }, ...]  tempos absolutos (ex.: transcrição do faster-whisper)
//   porPagina: máximo de palavras por página quando não há "|" (3)
//   y: centro da legenda em fração da altura (0.60)   tamanho: px (104)   largura: fração útil (0.78)
export default function legenda(ctx, c) {
  const { el, tl, EASE, DUR, W, H } = ctx;
  const p = c.props;
  const tam = p.tamanho ?? 104;
  const yc = H * (p.y ?? 0.6);

  // 1) lista de palavras com tempos
  let lista = [];
  if (p.palavras) {
    lista = p.palavras.map((w) => ({ bruto: w.p ?? w.word, i: w.i ?? w.start, f: w.f ?? w.end, quebra: !!w.quebra }));
  } else {
    const ritmo = p.ritmo ?? 0.3;
    let t = c.de + (p.inicio ?? 0.1);
    for (const pag of p.texto.split("|")) {
      pag.trim().split(/\s+/).filter(Boolean).forEach((w, k) => {
        lista.push({ bruto: w, i: t, f: t + ritmo, quebra: k === 0 });
        t += ritmo * (/[.,!?]$/.test(w) ? 1.6 : 1);
      });
    }
  }
  lista = lista.map((w) => {
    const ponto = /\.\*?$/.test(w.bruto);
    let t = w.bruto.replace(/\.(\*?)$/, "$1");
    const mch = t.match(/^\*(.*)\*([,;:!?]*)$/);   // *PALAVRA*, com pontuação depois também é palavra-chave
    const chave = !!mch;
    if (chave) t = mch[1] + mch[2];
    const cru = t.startsWith("~"); if (cru) t = t.slice(1);   // ~creat.MTT: mantém a caixa da marca
    return { ...w, t: cru ? t : t.toUpperCase(), ponto, chave, cru };
  });

  // 2) páginas
  const porPagina = p.porPagina ?? 3;
  const paginas = [];
  for (const w of lista) {
    const ult = paginas[paginas.length - 1];
    if (!ult || w.quebra || (!p.texto && ult.length >= porPagina)) paginas.push([w]);
    else ult.push(w);
  }

  const larg = W * (p.largura ?? 0.78);
  paginas.forEach((pag, n) => {
    const caixa = el("div", "mk-display mk-sombra", c.el, {
      position: "absolute", left: "50%", top: yc + "px", width: larg + "px", marginLeft: -larg / 2 + "px",
      textAlign: "center", whiteSpace: "normal", fontSize: tam + "px", lineHeight: "1.0", transform: "translateY(-50%)",
    });
    const ini = pag[0].i;
    const entradas = [];
    const fim = n < paginas.length - 1 ? paginas[n + 1][0].i : Math.max(pag[pag.length - 1].f, c.ate - 0.05);
    tl.set(caixa, { display: "none" }, c.de);
    tl.set(caixa, { display: "block" }, ini);
    tl.set(caixa, { display: "none" }, fim);
    gsap_inicial(caixa);

    pag.forEach((w, k) => {
      const s = el("span", "mk-palavra", caixa, { margin: "0 0.12em", fontSize: w.chave ? "1.22em" : "1em", color: "#FFFFFF" });
      s.textContent = w.t;
      if (w.cru) s.style.textTransform = "none";
      s.dataset.i = w.i; s.dataset.f = k < pag.length - 1 ? pag[k + 1].i : fim;
      if (w.ponto) { const pt = el("span", "mk-ponto", s); pt.textContent = "."; }
      // entrada: opacidade 1 já no 1º quadro; anima escala, subida e blur
      tl.set(s, { opacity: 0 }, c.de);
      tl.set(s, { opacity: 1 }, w.i);
      // a escala de entrada (1,22) é decidida depois de medir a página (ver caberPagina)
      entradas.push([s, w.i]);
      // ativa: âmbar enquanto é a palavra falada; depois volta a branco (palavra-chave continua âmbar)
      tl.set(s, { color: "#F5B84D" }, w.i);
      const sai = k < pag.length - 1 ? pag[k + 1].i : null;
      if (sai !== null && !w.chave) tl.to(s, { color: "#FFFFFF", duration: 0.1, ease: "none", immediateRender: false }, sai);
      s.classList.add("mk-leg");
    });
    // auto-ajuste (zona segura): palavra maior que a largura (ELETRODOMÉSTICOS em destaque) ou página alta demais
    // encolhem a página inteira (tudo nela está em em); página que cabe fica igual
    caberPagina(caixa, entradas);
  });
  function caberPagina(caixa, entradas) {
    const Z = ctx.ZONA, altMax = 2 * Math.min(yc - Z.topo, H - Z.base - yc);
    caixa.style.display = "block";
    let px = tam;
    for (let k = 0; k < 6; k++) {
      const spans = [...caixa.children];
      const maior = Math.max(...spans.map((e) => e.offsetWidth + 0.24 * parseFloat(getComputedStyle(e).fontSize)));
      const f = Math.min(1, larg / maior, altMax / caixa.offsetHeight);
      if (f >= 0.999 || px <= 40) break;
      px = Math.max(40, Math.floor(px * Math.min(f, 0.98)));
      caixa.style.fontSize = px + "px";
    }
    // palavra que, crescida a 1,22 a partir do centro, passaria da zona entra com escala menor
    for (const [s, ti] of entradas) {
      const r = s.getBoundingClientRect();
      const folga = Math.max(0, Math.min(r.left - Z.esquerda, W - Z.direita - r.right));
      const s0 = Math.min(1.22, 1 + (2 * folga) / Math.max(1, r.width));
      tl.fromTo(s, { scale: s0, y: 14, filter: "blur(8px)" }, { scale: 1, y: 0, filter: "blur(0px)", duration: DUR.palavra, ease: EASE.chegadaForte, immediateRender: false }, ti);
    }
    caixa.style.display = "none";
  }
  function gsap_inicial(caixa) { caixa.style.display = "none"; }

  ctx.cue(lista[0].i, "legenda-entra", -14);
  ctx.exigir({ tipo: "legenda-clara", alvo: `[data-id="${c.id}"] .mk-leg`, de: c.de, ate: c.ate, minimo: 0.5 });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-leg`, de: c.de, ate: c.ate });
}
