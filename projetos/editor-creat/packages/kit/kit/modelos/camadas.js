// CAMADAS: placas em perspectiva que empilham, uma por camada do evento. props: x, y, itens:[..], passo (s entre placas)
export default function camadas(ctx, c) {
  const { el, prog, ease } = ctx;
  const p = c.props, t0 = c.de, passo = p.passo ?? 0.16;
  const raiz = el("div", "", c.el, { position: "absolute", left: (p.x ?? 70) + "px", top: (p.y ?? 620) + "px", width: "420px", height: "520px", perspective: "1400px" });
  const eo = ease("expo.out"), pin = ease("power3.in");
  const n = p.itens.length;
  const placas = p.itens.map((rot, i) => {
    const g = el("div", "", raiz, { position: "absolute", left: "0", top: (n - 1 - i) * 82 + "px", width: "400px", height: "92px", transformStyle: "preserve-3d" });
    const pl = el("div", "", g, { position: "absolute", inset: "0", background: i === n - 1 ? "rgba(218,41,28,0.92)" : "rgba(14,14,16,0.86)", borderRadius: "10px",
      border: "3px solid " + (i === n - 1 ? "#FF5A4A" : "rgba(245,184,77,0.9)"), boxShadow: "0 18px 30px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: "16px", padding: "0 22px", boxSizing: "border-box" });
    const nn = el("div", "", pl, { font: "700 20px 'JetBrains Mono'", color: i === n - 1 ? "#fff" : "#F5B84D", letterSpacing: "0.08em" }); nn.textContent = String(i + 1).padStart(2, "0");
    const tx = el("div", "mk-display", pl, { fontSize: "46px", lineHeight: "1" }); tx.textContent = rot;
    return g;
  });
  ctx.aCada((t) => {
    const ks = pin(prog(t, c.ate - 0.22, 0.22));
    raiz.style.opacity = String(1 - ks);
    placas.forEach((g, i) => {
      const ti = t0 + i * passo, k = eo(prog(t, ti, 0.34));
      g.style.opacity = String(Math.min(1, prog(t, ti, 0.08)));
      g.style.transform = `rotateX(46deg) rotateZ(-8deg) translateZ(${(1 - k) * 260}px) translateY(${(1 - k) * -60 - ks * 40 * i}px)`;
    });
  });
}
