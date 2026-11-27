// VITRINE: fecho de marca de produto. A logo do produto entra como adesivo (cai, quica e assenta com sombra), a frase de
// assinatura se escreve à mão, o "onde comprar" sobe com a logo do varejo e, por último, a assinatura de quem produziu o vídeo.
// props: logo (produto), larguraLogo (820), frase ("Uma tradição de família!"), onde ("TEM NO"), logo_varejo, apoio (texto pequeno),
//        logo_assina (creat.MTT), assina ("vídeo"), arroba, fundo (true = véu escuro sobre o vídeo)
//        soLogo: true = só a logo (e a frase, se houver) no alto da tela, em `topo` px, para o gancho
export default async function vitrine(ctx, c) {
  const { el, prog, ease, W } = ctx;
  const p = c.props, t0 = c.de;
  if (p.fundo !== false) el("div", "", c.el, { position: "absolute", inset: "0", background: "radial-gradient(120% 80% at 50% 40%, rgba(20,10,6,0.55), rgba(20,10,6,0.88))" });
  const LW = Math.min(p.larguraLogo ?? 820, W - 2 * ctx.ZONA.margem);
  const TOPO = p.topo ?? 430;
  const logo = el("img", "", c.el, { position: "absolute", left: (W - LW) / 2 + "px", top: TOPO + "px", width: LW + "px", filter: "drop-shadow(0 26px 30px rgba(0,0,0,0.55))" });
  logo.src = p.logo; await logo.decode().catch(() => {});
  const frase = el("div", "mk-chip", c.el, { position: "absolute", left: "0", width: W + "px", top: TOPO + LW * (logo.naturalHeight / logo.naturalWidth || 0.56) + 40 + "px", textAlign: "center",
    font: "400 72px/1 'Kaushan Script'", color: "#FFFFFF", textShadow: "0 4px 0 #241612, 0 10px 24px rgba(0,0,0,0.5)" });
  frase.textContent = p.frase ?? "";
  if (p.soLogo) {
    const bo = ease("back.out(1.8)"), eo = ease("expo.out"), pin = ease("power3.in");
    ctx.aCada((t) => {
      const k = prog(t, t0, 0.45), s = pin(prog(t, c.ate - 0.25, 0.25));
      logo.style.opacity = String(Math.min(1, k * 4) * (1 - s));
      logo.style.transform = `translateY(${(1 - bo(k)) * -200 - s * 60}px) rotate(${(1 - eo(k)) * 12 - 3}deg) scale(${0.75 + 0.25 * bo(k)})`;
      frase.style.opacity = String(1 - s);
      frase.style.clipPath = `inset(-30% ${(1 - prog(t, t0 + 0.5, 0.6)) * 100}% -30% 0)`;
    });
    frase.classList.remove("mk-chip"); logo.classList.add("mk-chip");
    return;
  }
  const yOnde = parseFloat(frase.style.top) + 130;
  const onde = el("div", "mk-chip", c.el, { position: "absolute", left: "50%", top: yOnde + "px", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "24px",
    padding: "14px 30px 14px 36px", background: "#1B1210", border: "4px solid #FFD23F", borderRadius: "22px", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", whiteSpace: "nowrap" });
  const ot = el("div", "", onde, { font: "400 62px/1 'Lilita One'", color: "#FFFFFF" }); ot.textContent = p.onde ?? "TEM NO";
  const lv = el("img", "", onde, { height: "132px", display: "block" }); lv.src = p.logo_varejo; await lv.decode().catch(() => {});
  const apoio = p.apoio ? el("div", "mk-chip", c.el, { position: "absolute", left: "0", width: W + "px", top: yOnde + 186 + "px", textAlign: "center", font: "500 26px 'Inter'", color: "rgba(255,248,236,0.85)" }) : null;
  if (apoio) apoio.textContent = p.apoio;
  const ass = el("div", "", c.el, { position: "absolute", left: "50%", top: "1440px", transform: "translateX(-50%)", padding: "0 0 0 0", display: "flex", alignItems: "center", gap: "14px", whiteSpace: "nowrap" });
  const at = el("div", "", ass, { font: "700 22px 'JetBrains Mono'", letterSpacing: "0.14em", color: "rgba(255,248,236,0.75)" }); at.textContent = (p.assina ?? "VÍDEO");
  const al = el("img", "", ass, { height: "40px", display: "block" }); al.src = p.logo_assina; await al.decode().catch(() => {});
  if (p.arroba) { const ar = el("div", "", ass, { font: "700 24px 'JetBrains Mono'", letterSpacing: "0.06em", color: "#FFD23F" }); ar.textContent = p.arroba; }
  const bo = ease("back.out(1.8)"), eo = ease("expo.out"), po = ease("power2.out");
  ctx.aCada((t) => {
    const k = prog(t, t0, 0.5);
    logo.style.opacity = String(Math.min(1, k * 4));
    logo.style.transform = `translateY(${(1 - bo(k)) * -260}px) rotate(${(1 - eo(k)) * 14 - 3}deg) scale(${0.7 + 0.3 * bo(k)})`;
    const kf = po(prog(t, t0 + 0.55, 0.7));
    frase.style.clipPath = `inset(-30% ${(1 - kf) * 100}% -30% 0)`;
    const ko = eo(prog(t, t0 + 1.0, 0.5));
    onde.style.opacity = String(Math.min(1, ko * 2)); onde.style.transform = `translateX(-50%) translateY(${(1 - ko) * 80}px)`;
    if (apoio) apoio.style.opacity = String(prog(t, t0 + 1.4, 0.4));
    const ka = eo(prog(t, t0 + 1.6, 0.5));
    ass.style.opacity = String(ka); ass.style.transform = `translateX(-50%) translateY(${(1 - ka) * 30}px)`;
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 1.8, ate: c.ate - 0.1 });
}
