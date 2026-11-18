// RÓTULO de sistema: etiqueta de vidro com ponto (status) + título + linha de apoio, que entra decodificando.
// props: x, y (canto sup. esq.), titulo, sub, cor ("ambar"|"vermelho"), ponto (true), direita (alinha pela direita em x)
export default function rotulo(ctx, c) {
  const { el, tl, EASE, prog, semente } = ctx;
  const p = c.props, t0 = c.de;
  const cor = p.cor === "vermelho" ? "#FF1A1A" : "#F5B84D";
  const card = el("div", "mk-chip", c.el, { position: "absolute", top: (p.y ?? 400) + "px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 22px 14px 18px",
    background: "rgba(14,14,16,0.84)", borderRadius: "8px", borderLeft: `5px solid ${cor}`, boxShadow: "0 14px 36px rgba(0,0,0,0.35)", whiteSpace: "nowrap" });
  // Zona segura: o cartão nunca passa de x 960 (coluna de botões) nem de x 60; texto longo quebra de linha em vez de vazar.
  const zD = ctx.W - ctx.ZONA.direita, zE = ctx.ZONA.esquerda;
  if (p.direita) { const xr = Math.min(p.x, zD); card.style.right = (ctx.W - xr) + "px"; card.style.maxWidth = (xr - zE) + "px"; }
  else { const xl = Math.max(zE, Math.min(p.x ?? 60, zD - 260)); card.style.left = xl + "px"; card.style.maxWidth = (zD - xl) + "px"; }
  card.style.whiteSpace = "normal"; card.style.boxSizing = "border-box";
  let pt = null;
  if (p.ponto !== false) pt = el("div", "", card, { width: "16px", height: "16px", borderRadius: "50%", background: cor, flex: "0 0 auto" });
  const tx = el("div", "", card, {});
  const h1 = el("div", "", tx, { font: `900 ${p.tam ?? 30}px 'Inter'`, letterSpacing: "0.03em", color: "#fff" });
  const h2 = p.sub ? el("div", "", tx, { font: "700 18px 'JetBrains Mono'", letterSpacing: "0.08em", color: "rgba(241,235,226,0.78)", marginTop: "3px" }) : null;
  if (h2) h2.textContent = p.sub;
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/"; const r = semente(p.titulo.length * 7 + 3);
  const lixo = Array.from({ length: 12 }, () => [...p.titulo].map((ch) => (ch === " " || ch === "·" || ch === "." ? ch : alfabeto[Math.floor(r() * alfabeto.length)])).join(""));
  tl.fromTo(card, { clipPath: "inset(0% 100% 0% 0% round 8px)" }, { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 0.36, ease: EASE.chegada }, t0);
  if (h2) tl.fromTo(h2, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: EASE.chegada }, t0 + 0.22);
  tl.to(card, { clipPath: "inset(0% 0% 0% 100% round 8px)", duration: 0.22, ease: EASE.saida, immediateRender: false }, c.ate - 0.24);
  ctx.aCada((t) => {
    const k = prog(t, t0 + 0.05, 0.42), n = Math.floor(k * p.titulo.length);
    h1.textContent = k >= 1 ? p.titulo : p.titulo.slice(0, n) + lixo[Math.floor(k * 11)].slice(n);
    if (pt) pt.style.opacity = String(0.55 + 0.45 * Math.cos((t - t0) * Math.PI * 2 * 1.2));
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.5, ate: c.ate - 0.3 });
}
