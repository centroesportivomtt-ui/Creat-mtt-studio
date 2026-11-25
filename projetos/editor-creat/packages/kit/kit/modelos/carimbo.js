// CARIMBO: o "júri do corredor". Um carimbo de tinta vermelha bate na tela no instante do veredito, com tranco de câmera,
// borrão de tinta e contador de votos. Feito para provas de produto com gente real (Maryna Biscoitos, 25/11/2026).
// props: texto ("APROVADO"), quem ("REPOSITORA"), n (3), total (5), x (centro da zona segura), y (centro, 990; 430 quando o rosto está baixo), giro (-12),
//        tam (116), selo ("JÚRI DO CORREDOR")
// Tudo é função pura de t: o carimbo cai de escala 1,12 com desfoque (cabe na zona segura já na queda), bate em 0,16 s, a tela treme 0,2 s e a tinta assenta.
export default function carimbo(ctx, c) {
  const { el, prog, ease, semente, W } = ctx;
  const p = c.props, t0 = c.de;
  const x = Math.max(ctx.ZONA.esquerda + 240, Math.min(p.x ?? (ctx.ZONA.esquerda + W - ctx.ZONA.direita) / 2, W - ctx.ZONA.direita - 240)), y = p.y ?? 990, giro = p.giro ?? -12, tam = p.tam ?? 116;
  const raiz = el("div", "mk-chip", c.el, { position: "absolute", left: x + "px", top: y + "px", width: "0", height: "0" });
  const sel = el("div", "", raiz, { position: "absolute", left: "0", top: "0", transform: "translate(-50%,-50%)", padding: "22px 40px 18px",
    border: "12px solid #E3121B", borderRadius: "22px", color: "#E3121B", textAlign: "center", whiteSpace: "nowrap", boxSizing: "border-box",
    boxShadow: "0 18px 40px rgba(0,0,0,0.35)", background: "rgba(255,250,240,0.93)" });
  const topo = el("div", "", sel, { font: "900 26px 'Inter'", letterSpacing: "0.28em", marginBottom: "6px" }); topo.textContent = p.selo ?? "JÚRI DO CORREDOR";
  const meio = el("div", "", sel, { font: `400 ${tam}px/0.92 'Anton'`, letterSpacing: "0.02em" }); meio.textContent = p.texto ?? "APROVADO";
  const base = el("div", "", sel, { font: "700 26px 'JetBrains Mono'", letterSpacing: "0.14em", marginTop: "8px" });
  base.textContent = (p.quem ? p.quem + " · " : "") + (p.total ? `VOTO ${String(p.n).padStart(2, "0")}/${String(p.total).padStart(2, "0")}` : "");
  // falhas de tinta: manchas fixas por semente (o carimbo nunca sai igual ao anterior)
  const r = semente((p.n ?? 1) * 97 + 13);
  const tinta = el("div", "", sel, { position: "absolute", inset: "-12px", pointerEvents: "none", borderRadius: "22px",
    background: Array.from({ length: 14 }, () => `radial-gradient(circle at ${Math.round(r() * 100)}% ${Math.round(r() * 100)}%, rgba(255,248,236,0.55) 0 ${2 + Math.round(r() * 5)}px, transparent ${4 + Math.round(r() * 8)}px)`).join(",") });
  // respingos em volta
  const resp = Array.from({ length: 7 }, (_, i) => el("div", "", raiz, { position: "absolute", width: 8 + r() * 16 + "px", height: 8 + r() * 16 + "px", borderRadius: "50%", background: "#E3121B",
    left: Math.cos(i * 0.9 + r()) * (260 + r() * 90) + "px", top: Math.sin(i * 0.9 + r()) * (140 + r() * 60) + "px", opacity: "0" }));
  // cabe na zona segura com a inclinação: largura girada <= faixa útil (x 60 a 960)
  const ww = sel.offsetWidth || 700, hh = sel.offsetHeight || 260, rad = Math.abs(giro) * Math.PI / 180;
  const util = (ctx.W - ctx.ZONA.direita - ctx.ZONA.esquerda) - 40;
  const caber = Math.min(1, util / (1.07 * (ww * Math.cos(rad) + hh * Math.sin(rad))));   // 1,07 = folga do tranco da batida
  const pin = ease("power4.in"), eo = ease("expo.out"), fim = ease("power2.in");
  ctx.aCada((t) => {
    const k = prog(t, t0, 0.16);                    // queda
    const bate = t >= t0 + 0.16;
    const s = (bate ? 1 + 0.06 * Math.max(0, 1 - (t - t0 - 0.16) / 0.12) : 1.12 - 0.12 * pin(k)) * caber;
    const sai = fim(prog(t, c.ate - 0.22, 0.22));
    sel.style.opacity = String(Math.min(1, k * 3) * (1 - sai));
    sel.style.filter = bate ? "none" : `blur(${(1 - k) * 10}px)`;
    const tr = bate ? Math.max(0, 1 - (t - t0 - 0.16) / 0.22) : 0;   // tranco
    const dx = tr * 10 * Math.sin((t - t0) * 90), dy = tr * 8 * Math.cos((t - t0) * 70);
    sel.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${giro + (1 - k) * -8}deg) scale(${s * (1 - 0.15 * sai)})`;
    resp.forEach((d, i) => { const a = prog(t, t0 + 0.16, 0.12); d.style.opacity = String(bate ? Math.min(1, a) * (1 - sai) * 0.85 : 0); d.style.transform = `scale(${0.4 + 0.6 * eo(a)})`; });
    tinta.style.opacity = String(bate ? 1 : 0.4);
  });
  ctx.cue(t0 + 0.16, "carimbo", -8);
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.4, ate: c.ate - 0.3 });
}
