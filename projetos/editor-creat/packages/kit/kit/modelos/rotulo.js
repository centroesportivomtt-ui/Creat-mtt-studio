// RÓTULO de sistema: etiqueta de vidro com ponto (status) + título + linha de apoio, que entra decodificando.
// props: x, y (canto sup. esq.), titulo, sub, cor ("ambar"|"vermelho"), ponto (true), direita (alinha pela direita em x)
export default function rotulo(ctx, c) {
  const { el, tl, EASE, prog, semente } = ctx;
  const p = c.props, t0 = c.de;
  const cor = p.cor === "vermelho" ? "#FF1A1A" : "#F5B84D";
  const card = el("div", "mk-chip", c.el, { position: "absolute", top: (p.y ?? 400) + "px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 22px 14px 18px",
    background: "rgba(14,14,16,0.84)", borderRadius: "8px", borderLeft: `5px solid ${cor}`, boxShadow: "0 14px 36px rgba(0,0,0,0.35)", whiteSpace: "nowrap" });
  if (p.direita) card.style.right = (ctx.W - p.x) + "px"; else card.style.left = (p.x ?? 60) + "px";
  let pt = null;
  if (p.ponto !== false) pt = el("div", "", card, { width: "16px", height: "16px", borderRadius: "50%", background: cor, flex: "0 0 auto" });
  // auto-ajuste (zona segura, ctx.caber): a etiqueta termina na coluna de botões (ou, alinhada pela direita, na margem
  // esquerda da zona). Título e linha de apoio que não cabem encolhem e quebram em até 2 linhas; o que cabe fica igual.
  const Z = ctx.ZONA, x0 = p.x ?? 60;
  const maxCard = p.direita ? x0 - Z.esquerda : ctx.W - Z.direita - x0;
  const util = maxCard - 18 - 22 - 5 - (p.ponto !== false ? 30 : 0) - 2;
  const tam = p.tam ?? 30;
  const rT = ctx.caber(p.titulo, { fonte: "900 Inter", ls: 0.03, largura: util, max: tam, min: Math.round(tam * 0.8), piso: 16, linhas: 2 });
  const titulo = rT.quebrou || rT.cortado ? rT.linhas.join("\n") : p.titulo;
  const tx = el("div", "", card, {});
  const h1 = el("div", "", tx, { font: `900 ${rT.px}px 'Inter'`, letterSpacing: "0.03em", color: "#fff", ...(rT.quebrou ? { whiteSpace: "pre" } : {}) });
  const h2 = p.sub ? el("div", "", tx, { font: "700 18px 'JetBrains Mono'", letterSpacing: "0.08em", color: "rgba(241,235,226,0.78)", marginTop: "3px" }) : null;
  if (h2) {
    const rS = ctx.caber(p.sub, { fonte: "700 'JetBrains Mono'", ls: 0.08, largura: util, max: 18, min: 15, piso: 12, linhas: 2 });
    h2.style.fontSize = rS.px + "px";
    if (rS.quebrou) h2.style.whiteSpace = "pre";
    h2.textContent = rS.quebrou || rS.cortado ? rS.linhas.join("\n") : p.sub;
  }
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/"; const r = semente(p.titulo.length * 7 + 3);
  const lixo = Array.from({ length: 12 }, () => [...titulo].map((ch) => (ch === " " || ch === "·" || ch === "." || ch === "\n" ? ch : alfabeto[Math.floor(r() * alfabeto.length)])).join(""));
  tl.fromTo(card, { clipPath: "inset(0% 100% 0% 0% round 8px)" }, { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 0.36, ease: EASE.chegada }, t0);
  if (h2) tl.fromTo(h2, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: EASE.chegada }, t0 + 0.22);
  tl.to(card, { clipPath: "inset(0% 0% 0% 100% round 8px)", duration: 0.22, ease: EASE.saida, immediateRender: false }, c.ate - 0.24);
  ctx.aCada((t) => {
    const k = prog(t, t0 + 0.05, 0.42), n = Math.floor(k * titulo.length);
    h1.textContent = k >= 1 ? titulo : titulo.slice(0, n) + lixo[Math.floor(k * 11)].slice(n);
    if (pt) pt.style.opacity = String(0.55 + 0.45 * Math.cos((t - t0) * Math.PI * 2 * 1.2));
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.5, ate: c.ate - 0.3 });
}
