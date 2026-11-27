// LEGENDA ADESIVO (Maryna Biscoitos, 25/11/2026): a mesma régua de tempo da `legenda`, com cara de adesivo de marca:
// Lilita One branca com contorno grosso escuro (como o adesivo do carro da Maryna), página levemente inclinada que alterna
// o lado, palavra falada que "cola" com um tranco de escala e uma fita vermelha por trás. Palavra-chave fica amarela.
// A palavra NUNCA escurece (o texto é sempre branco ou amarelo claro; a fita fica atrás, não por cima).
// Base: LEGENDA palavra por palavra, palavra ativa em âmbar que NUNCA pisca escura.
// Por que nunca pisca: a palavra entra com opacidade 1 desde o primeiro quadro (o que anima é escala e blur),
// a cor só viaja entre duas cores claras (âmbar <-> branco, sem passar por escuro) e não existe caixa de fundo
// que acende por cima ou por baixo do texto. O `checar` mede a luminância da palavra ativa em todo quadro.
// props:
//   texto: "cada quadro | deste vídeo | é *código*."  ("|" quebra a página; *palavra* fica âmbar e maior)
//   ritmo: segundos por palavra quando não há tempos (0.3)   inicio: tempo local da 1ª palavra (0.1)
//   palavras: [{ p: "CADA", i: 2.60, f: 2.85 }, ...]  tempos absolutos (ex.: transcrição do faster-whisper)
//   porPagina: máximo de palavras por página quando não há "|" (3)
//   y: centro da legenda em fração da altura (0.60)   tamanho: px (104)   largura: fração útil (0.78)
export default function legenda_adesivo(ctx, c) {
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
    const caixa = el("div", "", c.el, {
      position: "absolute", left: "50%", top: yc + "px", width: larg + "px", marginLeft: -larg / 2 + "px",
      textAlign: "center", whiteSpace: "normal", fontSize: tam + "px", lineHeight: "1.08", transform: `translateY(-50%) rotate(${n % 2 ? 2.2 : -2.2}deg)`,
      fontFamily: "'Lilita One', 'Anton', sans-serif", textTransform: "uppercase", letterSpacing: "0.01em",
    });
    const ini = pag[0].i;
    const fim = n < paginas.length - 1 ? paginas[n + 1][0].i : Math.max(pag[pag.length - 1].f, c.ate - 0.05);
    tl.set(caixa, { display: "none" }, c.de);
    tl.set(caixa, { display: "block" }, ini);
    tl.set(caixa, { display: "none" }, fim);
    gsap_inicial(caixa);

    pag.forEach((w, k) => {
      const s = el("span", "mk-palavra", caixa, { margin: "0 0.26em", fontSize: w.chave ? "1.18em" : "1em", color: w.chave ? "#FFD23F" : "#FFFFFF",
        position: "relative", display: "inline-block", WebkitTextStroke: "0.16em #241612", paintOrder: "stroke fill",
        textShadow: "0 0.07em 0 #241612, 0 0.12em 0.18em rgba(0,0,0,0.45)" });
      const fita = el("span", "", s, { position: "absolute", left: "-0.12em", right: "-0.12em", top: "0.30em", bottom: "0.02em", background: "#E3121B",
        borderRadius: "0.12em", zIndex: "-1", transformOrigin: "0 50%", transform: "scaleX(0) rotate(-2deg)" });
      const txt = el("span", "", s, { position: "relative" }); txt.textContent = w.t;
      if (w.cru) s.style.textTransform = "none";
      s.dataset.i = w.i; s.dataset.f = k < pag.length - 1 ? pag[k + 1].i : fim;
      if (w.ponto) { const pt = el("span", "", s, { position: "relative", color: "#FFD23F" }); pt.textContent = "."; }
      caixa.style.isolation = "isolate";
      // entrada: opacidade 1 já no 1º quadro; anima escala, subida e blur
      tl.set(s, { opacity: 0 }, c.de);
      tl.set(s, { opacity: 1 }, w.i);
      tl.fromTo(s, { scale: 1.12, y: -6, rotation: k % 2 ? 3 : -3 }, { scale: 1, y: 0, rotation: 0, duration: 0.2, ease: "back.out(1.8)", immediateRender: false }, w.i);
      // ativa: fita vermelha corre por trás da palavra falada e sai quando entra a próxima
      tl.fromTo(fita, { scaleX: 0 }, { scaleX: 1, duration: 0.14, ease: "power3.out", immediateRender: false }, w.i);
      const sai = k < pag.length - 1 ? pag[k + 1].i : null;
      if (sai !== null) tl.to(fita, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.12, ease: "power2.in", immediateRender: false }, sai);
      s.classList.add("mk-leg");
    });
  });
  function gsap_inicial(caixa) { caixa.style.display = "none"; }

  ctx.cue(lista[0].i, "legenda-entra", -14);
  ctx.exigir({ tipo: "legenda-clara", alvo: `[data-id="${c.id}"] .mk-leg`, de: c.de, ate: c.ate, minimo: 0.5 });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-leg`, de: c.de, ate: c.ate });
}
