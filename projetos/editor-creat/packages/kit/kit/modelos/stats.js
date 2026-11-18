// STATS: cartão de bastidor com números que contam. props: x, y, w, titulo, itens:[{n, rot}], rodape
export default function stats(ctx, c) {
  const { el, tl, EASE, prog, ease, aba } = ctx;
  const p = c.props, t0 = c.de;
  const card = el("div", "mk-chip", c.el, { position: "absolute", left: (p.x ?? 60) + "px", top: (p.y ?? 420) + "px", width: (p.w ?? 420) + "px", boxSizing: "border-box", padding: "22px 26px 22px",
    background: "rgba(14,14,16,0.86)", borderRadius: "10px", borderTop: "5px solid #F5B84D", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" });
  const cab = el("div", "", card, { display: "flex", alignItems: "center", gap: "12px" });
  aba(cab, 36, { position: "relative", flex: "0 0 auto" });
  const h = el("div", "", cab, { font: "700 19px 'JetBrains Mono'", letterSpacing: "0.10em", color: "#F5B84D" }); h.textContent = p.titulo;
  const nums = p.itens.map((it, i) => {
    const ln = el("div", "", card, { display: "flex", alignItems: "baseline", gap: "16px", marginTop: i ? "6px" : "14px" });
    const n = el("div", "mk-display", ln, { fontSize: "118px", lineHeight: "1", color: i === 0 ? "#F5B84D" : "#fff", minWidth: "150px" });
    const r = el("div", "", ln, { font: "900 27px/1.1 'Inter'", color: "#fff", letterSpacing: "0.02em", whiteSpace: "pre-line" }); r.textContent = it.rot;
    return { ln, n, alvo: it.n, t: t0 + 0.3 + i * 0.45 };
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
      q.n.textContent = String(Math.round(eo(k) * q.alvo));
    });
    rod.style.opacity = String(Math.min(1, prog(t, tr, 0.25)));
    const ks = prog(t, tr - 0.2, 0.9);
    scan.style.opacity = ks > 0 && ks < 1 ? "1" : "0"; scan.style.transform = `translateY(${ks * card.offsetHeight}px)`;
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
