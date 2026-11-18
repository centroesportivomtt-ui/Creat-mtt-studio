// CHECKLIST ao vivo: painel de vidro do "sistema" que marca cada item no instante em que a palavra é dita.
// props: x, y, w, titulo, sub, itens:[{t, rot}]
export default function checklist(ctx, c) {
  const { el, tl, EASE, aba, prog, ease } = ctx;
  const p = c.props, t0 = c.de, w = p.w ?? 400;
  const card = el("div", "mk-chip", c.el, { position: "absolute", left: (p.x ?? 60) + "px", top: (p.y ?? 420) + "px", width: w + "px", boxSizing: "border-box", padding: "22px 24px 24px",
    background: "rgba(14,14,16,0.86)", borderRadius: "10px", borderTop: "5px solid #FF1A1A", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" });
  const cab = el("div", "", card, { display: "flex", alignItems: "center", gap: "14px" });
  aba(cab, 44, { position: "relative", flex: "0 0 auto" });
  const ct = el("div", "", cab, {});
  const h1 = el("div", "", ct, { font: "700 19px 'JetBrains Mono'", letterSpacing: "0.10em", color: "#F5B84D" }); h1.textContent = p.titulo;
  const h2 = el("div", "", ct, { font: "900 27px 'Inter'", letterSpacing: "0.02em", color: "#fff", marginTop: "2px" }); h2.textContent = p.sub;
  const lista = el("div", "", card, { marginTop: "18px", display: "flex", flexDirection: "column", gap: "12px" });
  const ns = "http://www.w3.org/2000/svg";
  const linhas = p.itens.map((it) => {
    const ln = el("div", "", lista, { display: "flex", alignItems: "center", gap: "16px" });
    const cx = el("div", "", ln, { width: "40px", height: "40px", borderRadius: "8px", border: "3px solid rgba(241,235,226,0.55)", boxSizing: "border-box", position: "relative", flex: "0 0 auto" });
    const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 40 40");
    Object.assign(svg.style, { position: "absolute", left: "-3px", top: "-3px", width: "40px", height: "40px" });
    const pa = document.createElementNS(ns, "path"); pa.setAttribute("d", "M9 21 L17 29 L31 12"); pa.setAttribute("fill", "none"); pa.setAttribute("stroke", "#111");
    pa.setAttribute("stroke-width", "5.5"); pa.setAttribute("stroke-linecap", "round"); pa.setAttribute("stroke-linejoin", "round"); pa.style.strokeDasharray = "40"; pa.style.strokeDashoffset = "40";
    svg.appendChild(pa); cx.appendChild(svg);
    const tx = el("div", "mk-display", ln, { fontSize: "44px", lineHeight: "1", color: "rgba(255,255,255,0.78)" }); tx.textContent = it.rot;
    return { ln, cx, pa, tx, t: it.t };
  });
  const barra = el("div", "", card, { marginTop: "20px", height: "8px", background: "rgba(241,235,226,0.18)", borderRadius: "4px", overflow: "hidden" });
  const cheia = el("div", "", barra, { height: "100%", width: "100%", background: "#F5B84D", transformOrigin: "0 50%" });
  const cont = el("div", "", card, { marginTop: "10px", font: "700 18px 'JetBrains Mono'", letterSpacing: "0.10em", color: "rgba(241,235,226,0.7)" });
  tl.fromTo(card, { clipPath: "inset(0% 0% 100% 0% round 10px)", y: -18 }, { clipPath: "inset(0% 0% 0% 0% round 10px)", y: 0, duration: 0.45, ease: EASE.chegada }, t0);
  tl.to(card, { clipPath: "inset(0% 100% 0% 0% round 10px)", duration: 0.24, ease: EASE.saida, immediateRender: false }, c.ate - 0.26);
  const eo = ease("expo.out"), bk = ease("back.out(2)");
  ctx.aCada((t) => {
    let feitos = 0;
    linhas.forEach((l, i) => {
      const ap = t0 + 0.25 + i * 0.07;
      const ke = eo(prog(t, ap, 0.3));
      l.ln.style.opacity = String(Math.min(1, prog(t, ap, 0.1))); l.ln.style.transform = `translateX(${(1 - ke) * -24}px)`;
      const k = prog(t, l.t, 0.22);
      if (t >= l.t) feitos++;
      l.cx.style.background = t >= l.t ? "#F5B84D" : "transparent"; l.cx.style.borderColor = t >= l.t ? "#F5B84D" : "rgba(241,235,226,0.55)";
      l.cx.style.transform = t >= l.t ? `scale(${0.7 + 0.3 * bk(k)})` : "";
      l.pa.style.strokeDashoffset = String(40 * (1 - eo(prog(t, l.t + 0.03, 0.2))));
      l.tx.style.color = t >= l.t ? "#FFFFFF" : "rgba(255,255,255,0.62)";
    });
    let f = 0; linhas.forEach((l) => { f += eo(prog(t, l.t, 0.3)); });
    cheia.style.transform = `scaleX(${f / linhas.length})`;
    cont.textContent = `${feitos}/${linhas.length} CONFERIDO`;
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
