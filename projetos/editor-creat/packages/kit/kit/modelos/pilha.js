// PILHA: as cenas do filme viram abas de navegador que se empilham até 70; a 71ª é a Aba 71 (transição aba71 por cima).
// O 1º cartão nasce em tela cheia com o último quadro da gravação (corte invisível) e encolhe para o monte.
// props: imgs:[urls], ini (nº da 1ª aba), total (70), dur (s de empilhamento), cy (fração), final (tempo em que vira 71)
export default async function pilha(ctx, c) {
  const { el, W, H, prog, ease, semente } = ctx;
  const p = c.props, t0 = c.de, D = p.dur ?? 2.0, ini = p.ini ?? 9, total = p.total ?? 70, N = total - ini + 1;
  const CW = 372, CH = 660, BAR = 44, cx = W / 2, cy = H * (p.cy ?? 0.44);
  const fundo = el("div", "", c.el, { position: "absolute", inset: "0", background: "#0B0B0C" });
  el("div", "", fundo, { position: "absolute", left: "50%", top: "44%", width: "1700px", height: "1700px", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(245,184,77,0.20), rgba(245,184,77,0.05) 55%, rgba(0,0,0,0) 100%)" });
  await Promise.all(p.imgs.map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
  const r = semente(71), cards = [];
  for (let i = 0; i < N; i++) {
    const g = el("div", "", c.el, { position: "absolute", left: cx - CW / 2 + "px", top: cy - CH / 2 + "px", width: CW + "px", height: CH + "px", transformOrigin: "50% 50%", willChange: "transform" });
    const bar = el("div", "", g, { position: "absolute", left: "0", top: -BAR + "px", width: "100%", height: BAR + "px", background: "#17171A", borderRadius: "12px 12px 0 0", boxSizing: "border-box", padding: "0 14px", display: "flex", alignItems: "center", gap: "8px" });
    for (const cor of ["#FF1A1A", "#F5B84D", "rgba(241,235,226,0.5)"]) el("div", "", bar, { width: "12px", height: "12px", borderRadius: "50%", background: cor });
    const tt = el("div", "", bar, { marginLeft: "10px", font: "700 19px 'JetBrains Mono'", letterSpacing: "0.08em", color: "rgba(241,235,226,0.92)" }); tt.textContent = "ABA " + String(ini + i).padStart(2, "0");
    const im = el("img", "", g, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "0 0 12px 12px" });
    im.src = p.imgs[i % p.imgs.length];
    el("div", "", g, { position: "absolute", left: "0", top: -BAR + "px", width: "100%", height: CH + BAR + "px", borderRadius: "12px", boxShadow: "0 0 0 2px rgba(241,235,226,0.20), 0 24px 50px rgba(0,0,0,0.55)" });
    const u = i / (N - 1);
    cards.push({ g, bar, t: i === 0 ? t0 : t0 + 0.34 + (D - 0.34) * Math.pow(u, 0.62), dx: i === 0 ? 0 : (r() - 0.5) * 380, dy: i === 0 ? 20 : (r() - 0.5) * 230, rot: i === 0 ? -2 : (r() - 0.5) * 15 });
  }
  const leg = el("div", "", c.el, { position: "absolute", left: "0", width: "100%", top: "1290px", textAlign: "center" });
  const l1 = el("div", "", leg, { font: "700 26px 'JetBrains Mono'", letterSpacing: "0.16em", color: "rgba(241,235,226,0.85)" }); l1.textContent = "ABAS ABERTAS";
  const num = el("div", "mk-display", leg, { fontSize: "170px", lineHeight: "1", color: "#F5B84D", marginTop: "4px" });
  const eo = ease("expo.out"), p4 = ease("power4.out"), pin = ease("power3.in");
  const S0 = H / CH;   // tela cheia
  ctx.aCada((t) => {
    fundo.style.opacity = String(Math.min(1, prog(t, t0 + 0.02, 0.16)));
    let n = 0;
    const kfim = p.final ? pin(prog(t, p.final, 0.5)) : 0;
    for (let i = 0; i < N; i++) {
      const q = cards[i];
      if (t < q.t) { q.g.style.display = "none"; continue; }
      q.g.style.display = ""; n = i;
    }
    for (let i = 0; i <= n; i++) {
      const q = cards[i], prof = n - i;
      if (prof > 26) { q.g.style.display = "none"; continue; }
      let s, x, y, rot;
      if (i === 0) { const k = eo(prog(t, t0 + 0.03, 0.42)); s = S0 + (1 - S0) * k; x = q.dx * k; y = (H / 2 - cy) * (1 - k) + q.dy * k; rot = q.rot * k; q.bar.style.opacity = String(k); }
      else { const k = p4(prog(t, q.t, 0.2)); s = 1 + (1 - k) * 0.36; x = q.dx; y = q.dy + (1 - k) * 60; rot = q.rot * (0.4 + 0.6 * k); q.g.style.opacity = String(Math.min(1, prog(t, q.t, 0.05))); }
      const rec = Math.pow(0.988, prof);
      s *= rec * (1 - kfim * 0.25);
      q.g.style.transform = `translate(${x * (1 - kfim * 0.7)}px, ${y * (1 - kfim * 0.7) - prof * 2.2}px) rotate(${rot}deg) scale(${s})`;
      q.g.style.filter = prof > 0 ? `brightness(${Math.max(0.45, 1 - prof * 0.035)})` : "";
    }
    const atual = ini + n;
    num.textContent = p.final && t >= p.final ? "71" : String(atual);
    num.style.color = p.final && t >= p.final ? "#FF1A1A" : "#F5B84D";
    const kn = n > 0 ? p4(prog(t, cards[n].t, 0.12)) : 1;
    num.style.transform = `scale(${1 + (1 - kn) * 0.10})`;
    leg.style.opacity = String(Math.min(1, prog(t, t0 + 0.3, 0.2)));
  });
}
