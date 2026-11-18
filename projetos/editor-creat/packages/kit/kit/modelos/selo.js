// SELO: (a) assinatura animada da creat.MTT na abertura, numa "barra de endereço" de vidro; (b) cartão da cobertura com a logo do cliente.
// props: tipo:"assinatura" | "cobertura"; logo; x,y; linhas
export default async function selo(ctx, c) {
  const { el, tl, EASE, W, aba, prog, ease } = ctx;
  const p = c.props, t0 = c.de;
  if (p.tipo === "assinatura") {
    const barra = el("div", "", c.el, { position: "absolute", left: "50%", top: (p.y ?? 292) + "px", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "18px",
      height: "84px", padding: "0 30px 0 18px", background: "rgba(14,14,16,0.84)", borderRadius: "16px", boxShadow: "0 14px 40px rgba(0,0,0,0.4)" });
    const a = aba(barra, 54, { position: "relative", flex: "0 0 auto" });
    const img = el("img", "", barra, { height: "46px", display: "block" });
    img.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png"; await img.decode().catch(() => {});
    const fio = el("div", "", barra, { position: "absolute", left: "0", bottom: "0", height: "4px", width: "100%", background: "#FF1A1A", transformOrigin: "0 50%", borderRadius: "0 0 16px 16px" });
    tl.fromTo(barra, { clipPath: "inset(0% 50% 0% 50% round 16px)" }, { clipPath: "inset(0% 0% 0% 0% round 16px)", duration: 0.32, ease: EASE.chegada }, t0);
    tl.fromTo(a, { rotation: -270, scale: 0.3 }, { rotation: 0, scale: 1, duration: 0.5, ease: EASE.mola }, t0 + 0.04);
    tl.fromTo(img, { clipPath: "inset(0% 100% 0% 0%)", x: -14 }, { clipPath: "inset(0% 0% 0% 0%)", x: 0, duration: 0.42, ease: EASE.chegada }, t0 + 0.14);
    tl.fromTo(fio, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, t0 + 0.2);
    tl.to(barra, { clipPath: "inset(0% 100% 0% 0% round 16px)", x: -180, duration: 0.24, ease: EASE.saida, immediateRender: false }, c.ate - 0.26);
    return;
  }
  // cobertura
  const x = p.x ?? 60, y = p.y ?? 380;
  const card = el("div", "mk-chip", c.el, { position: "absolute", left: x + "px", top: y + "px", display: "flex", alignItems: "center", gap: "22px", padding: "18px 28px 18px 22px",
    background: "rgba(14,14,16,0.84)", borderRadius: "8px", borderLeft: "6px solid #FF1A1A", boxShadow: "0 16px 40px rgba(0,0,0,0.35)" });
  const img = el("img", "", card, { height: (p.altura ?? 96) + "px", display: "block" });
  img.src = p.logo; await img.decode().catch(() => {});
  const tx = el("div", "", card, {});
  const l1 = el("div", "", tx, { font: "700 19px 'JetBrains Mono'", letterSpacing: "0.14em", color: "#F5B84D" }); l1.textContent = p.linhas[0];
  const l2 = el("div", "mk-display", tx, { fontSize: "56px", lineHeight: "1.05", marginTop: "4px" }); l2.textContent = p.linhas[1];
  const l3 = el("div", "", tx, { font: "700 18px 'JetBrains Mono'", letterSpacing: "0.10em", color: "rgba(241,235,226,0.75)", marginTop: "4px" }); l3.textContent = p.linhas[2];
  tl.fromTo(card, { clipPath: "inset(0% 100% 0% 0% round 8px)" }, { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 0.45, ease: EASE.chegada }, t0);
  tl.fromTo(img, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: EASE.mola }, t0 + 0.12);
  tl.fromTo([l1, l2, l3], { x: -18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: EASE.chegada, stagger: 0.07 }, t0 + 0.2);
  tl.to(card, { clipPath: "inset(0% 0% 0% 100% round 8px)", duration: 0.24, ease: EASE.saida, immediateRender: false }, c.ate - 0.26);
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
