// FECHO 2: "SEGUE A" + logo creat.MTT animada + @ + linha de apoio. Pousa em ~1,1 s e fica parado.
// props: cta:"SEGUE A", logo, larguraLogo, arroba, apoio
export default async function fecho2(ctx, c) {
  const { el, tl, EASE, W, H, cantos, aba, ZONA } = ctx;
  const p = c.props, t0 = c.de;
  if (p.fundo !== false) {
    const bg = el("div", "", c.el, { position: "absolute", inset: "0", background: "#0B0B0C" });
    el("div", "", bg, { position: "absolute", left: "50%", top: "45%", width: "1800px", height: "1800px", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(218,41,28,0.30), rgba(218,41,28,0.08) 55%, rgba(0,0,0,0) 100%)" });
  }
  const a = aba(c.el, 120, { left: W / 2 - 60 + "px", top: "400px" });
  const cta = el("div", "mk-display mk-sombra", c.el, { position: "absolute", left: "120px", width: "840px", top: "585px", textAlign: "center", fontSize: "190px", lineHeight: "1" });
  const letras = [...(p.cta ?? "SEGUE A")].map((ch) => { const s = el("span", "mk-palavra", cta, { whiteSpace: "pre" }); s.textContent = ch; return s; });
  const LW = p.larguraLogo ?? 800;
  const cx = el("div", "", c.el, { position: "absolute", left: (W - LW) / 2 + "px", top: "815px", width: LW + "px" });
  const logo = el("img", "", cx, { width: "100%", display: "block" });
  logo.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png"; await logo.decode().catch(() => {});
  const barra = el("div", "", cx, { position: "absolute", top: "-6%", height: "112%", width: "14px", background: "#FF1A1A", left: "0", boxShadow: "0 0 30px rgba(255,26,26,0.7)" });
  const brilho = el("div", "", cx, { position: "absolute", inset: "0", background: "linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 60%)", mixBlendMode: "overlay", backgroundSize: "300% 100%" });
  brilho.style.webkitMaskImage = brilho.style.maskImage = `url(${logo.src})`; brilho.style.maskSize = brilho.style.webkitMaskSize = "100% 100%";
  const cs = cantos(cx, { arm: 44, esp: 7, folga: 34 });
  const arroba = el("div", "", c.el, { position: "absolute", left: "0", width: "100%", top: "1010px", textAlign: "center", font: "900 58px 'Inter'", letterSpacing: "0.02em", color: "#F5B84D" });
  arroba.textContent = p.arroba ?? "@creat.mtt";
  const apoio = el("div", "", c.el, { position: "absolute", left: "0", width: "100%", top: "1110px", textAlign: "center", font: "700 27px 'JetBrains Mono'", letterSpacing: "0.10em", color: "rgba(241,235,226,0.85)" });
  apoio.textContent = p.apoio ?? "";
  tl.fromTo(a, { scale: 0, rotation: -200 }, { scale: 1, rotation: 0, duration: 0.55, ease: EASE.mola }, t0 + 0.05);
  tl.fromTo(letras, { yPercent: 60, opacity: 0, filter: "blur(8px)" }, { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 0.3, ease: EASE.chegadaForte, stagger: 0.03 }, t0 + 0.12);
  tl.fromTo(logo, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.inOut" }, t0 + 0.30);
  tl.fromTo(barra, { left: "0%", opacity: 1 }, { left: "100%", duration: 0.55, ease: "power3.inOut" }, t0 + 0.30);
  tl.to(barra, { opacity: 0, duration: 0.1, ease: "none", immediateRender: false }, t0 + 0.85);
  tl.fromTo(cx, { scale: 1.08 }, { scale: 1, duration: 0.7, ease: EASE.chegada }, t0 + 0.30);
  tl.fromTo(brilho, { backgroundPosition: "120% 0", opacity: 1 }, { backgroundPosition: "-60% 0", duration: 0.7, ease: "power2.inOut" }, t0 + 0.9);
  tl.fromTo(cs.no, { x: -40, y: -40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.4, ease: EASE.chegada }, t0 + 0.6);
  tl.fromTo(cs.se, { x: 40, y: 40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.4, ease: EASE.chegada }, t0 + 0.63);
  tl.fromTo(arroba, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.chegada }, t0 + 0.72);
  tl.fromTo(apoio, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.chegada }, t0 + 0.9);
  const pousa = t0 + 1.2;
  ctx.exigir({ tipo: "cta", alvo: `[data-id="${c.id}"] .mk-palavra`, de: pousa, ate: c.ate, minimo: 2 });
  ctx.exigir({ tipo: "parado", alvo: `[data-id="${c.id}"] .mk-display`, de: pousa, ate: c.ate });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-display`, de: pousa, ate: c.ate });
}
