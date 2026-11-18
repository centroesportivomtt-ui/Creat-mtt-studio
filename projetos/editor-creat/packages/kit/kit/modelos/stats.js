// STATS: cartão de bastidor com números que contam. props: x, y, w, titulo, itens:[{n, rot}], rodape
export default function stats(ctx, c) {
  const { el, tl, EASE, prog, ease, aba } = ctx;
  const p = c.props, t0 = c.de;
  const card = el("div", "mk-chip", c.el, { position: "absolute", left: (p.x ?? 60) + "px", top: (p.y ?? 420) + "px", width: (p.w ?? 420) + "px", boxSizing: "border-box", padding: "22px 26px 22px",
    background: "rgba(14,14,16,0.86)", borderRadius: "10px", borderTop: "5px solid #F5B84D", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" });
  const cab = el("div", "", card, { display: "flex", alignItems: "center", gap: "12px" });
  aba(cab, 36, { position: "relative", flex: "0 0 auto" });
  const h = el("div", "", cab, { font: "700 19px 'JetBrains Mono'", letterSpacing: "0.10em", color: "#F5B84D" }); h.textContent = p.titulo;
  // número: 71 conta como inteiro (como sempre); texto com número ("R$ 12.999,90", "1.234.567", "98%") conta no formato
  // brasileiro com o prefixo, as casas decimais e o sufixo de quem escreveu
  const contador = (alvo) => {
    if (typeof alvo === "number") return (k) => String(Math.round(k * alvo));
    const m = /^(.*?)(\d[\d.]*(?:,\d+)?)(.*)$/.exec(String(alvo ?? ""));
    if (!m) return () => String(alvo ?? "");
    const dec = (m[2].split(",")[1] ?? "").length, v = parseFloat(m[2].replace(/\./g, "").replace(",", "."));
    return (k) => m[1] + (k * v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
  };
  // auto-ajuste (ctx.caber): o cartão recorta o que passa da largura (clip-path). Rótulo que não cabe ao lado do número
  // encolhe e quebra; número largo (preço) encolhe até caber com o rótulo. O que cabe fica igual.
  const inner = (p.w ?? 420) - 52;
  const nums = p.itens.map((it, i) => {
    const ln = el("div", "", card, { display: "flex", alignItems: "baseline", gap: "16px", marginTop: i ? "6px" : "14px" });
    const fmt = contador(it.n), final = fmt(1);
    let pxN = 118, pxR = 27;
    const nLarg = (px) => Math.max(150 * px / 118, ctx.medir(final, "Anton", px) * 1.02);
    // o rótulo quebra sozinho (pre-line) ao lado do número; só a PALAVRA que não cabe nem sozinha na linha força o ajuste:
    // o rótulo encolhe até ela caber (mín. 16 px) e, se ainda faltar, o número encolhe (mín. 48 px). O que cabe fica igual.
    const palavrasRot = String(it.rot ?? "").split(/\s+/).filter(Boolean);
    const maiorPal = (px) => Math.max(0, ...palavrasRot.map((w) => ctx.medir(w, "900 Inter", px) + 0.02 * px * w.length));
    const sobra = inner - 16 - nLarg(118);
    if (maiorPal(27) > sobra) {
      pxR = Math.max(16, Math.min(27, Math.floor((27 * Math.max(sobra, 1)) / maiorPal(27))));
      const falta = nLarg(118) + 16 + maiorPal(pxR) - inner;
      if (falta > 0) pxN = Math.max(48, Math.floor((118 * (inner - 16 - maiorPal(pxR))) / (ctx.medir(final, "Anton", 118) * 1.02)));
    }
    const rot = it.rot;
    const n = el("div", "mk-display", ln, { fontSize: pxN + "px", lineHeight: "1", color: i === 0 ? "#F5B84D" : "#fff", minWidth: Math.round(150 * Math.min(1, pxN / 118)) + "px" });
    const r = el("div", "", ln, { font: `900 ${pxR}px/1.1 'Inter'`, color: "#fff", letterSpacing: "0.02em", whiteSpace: "pre-line" }); r.textContent = rot;
    return { ln, n, fmt, t: t0 + 0.3 + i * 0.45 };
  });
  const rod = el("div", "", card, { marginTop: "14px", paddingTop: "12px", borderTop: "2px solid rgba(241,235,226,0.2)", font: "700 19px/1.35 'JetBrains Mono'", letterSpacing: "0.06em", color: "rgba(241,235,226,0.9)" });
  rod.textContent = p.rodape;
  const scan = el("div", "", card, { position: "absolute", left: "0", top: "0", width: "100%", height: "3px", background: "rgba(245,184,77,0.9)", boxShadow: "0 0 18px rgba(245,184,77,0.9)" });
  tl.fromTo(card, { clipPath: "inset(0% 0% 100% 0% round 10px)", y: -16 }, { clipPath: "inset(0% 0% 0% 0% round 10px)", y: 0, duration: 0.45, ease: EASE.chegada }, t0);
  tl.to(card, { clipPath: "inset(0% 100% 0% 0% round 10px)", duration: 0.24, ease: EASE.saida, immediateRender: false }, c.ate - 0.26);
  const eo = ease("expo.out"), tr = t0 + 0.3 + nums.length * 0.45;
  ctx.aCada((t) => {
    nums.forEach((q) => {
      const k = prog(t, q.t, 0.5);
      q.ln.style.opacity = String(Math.min(1, prog(t, q.t - 0.05, 0.1)));
      q.n.textContent = q.fmt(eo(k));
    });
    rod.style.opacity = String(Math.min(1, prog(t, tr, 0.25)));
    const ks = prog(t, tr - 0.2, 0.9);
    scan.style.opacity = ks > 0 && ks < 1 ? "1" : "0"; scan.style.transform = `translateY(${ks * card.offsetHeight}px)`;
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
