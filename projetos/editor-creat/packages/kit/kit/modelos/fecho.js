// FECHO: cartão final com logo e CTA. Pousa em ~1,2 s e fica parado (CTA legível por no mínimo 2 s).
// props:
//   cta: ["MANDA NO", "*DIRECT*."]   (linhas; *palavra* em âmbar; "." vermelho)
//   apoio: "conta o que você quer vender"   (linha pequena embaixo do CTA)
//   logo: "assets/marca/logo_creatMTT_claro.png"  larguraLogo: 620
//   icone: true (aviãozinho do direct desenhado em traço)   aba: true (selo Aba 71 no canto)
//   y: centro do bloco do CTA em fração da altura (0.5)
//   logo_cliente: logo do cliente em alta (chave do armazenamento). Quando existe, ELA é a protagonista no topo
//     (altura alturaCliente, 430 px) e a logo da creat.MTT vira assinatura pequena embaixo (larguraAssinatura, 230 px).
//   logo_parceiro: segunda marca (parceria): as duas lado a lado no topo.
//   veu: escurece o fundo para o CTA ler sobre qualquer plano (padrão: true com logo_cliente)
export default async function fecho(ctx, c) {
  const { el, tl, EASE, DUR, W, H, palavras, ajustar, cantos, aba, ZONA } = ctx;
  const p = c.props;
  const t0 = c.de;
  const comCliente = !!p.logo_cliente;

  if (p.veu ?? comCliente) {
    const veu = el("div", "", c.el, { position: "absolute", inset: "0", background: "linear-gradient(180deg, rgba(8,8,10,0.55) 0%, rgba(8,8,10,0.72) 45%, rgba(8,8,10,0.82) 100%)" });
    tl.fromTo(veu, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: EASE.chegada }, t0);
  }
  let logo;
  if (comCliente && p.logo_parceiro) {
    // parceria: as duas marcas lado a lado, mesma altura, com um "×" fino entre elas
    const hc = p.alturaCliente ?? 340, cy = ZONA.topo + 20 + hc / 2;
    const larg = (W - ZONA.esquerda - ZONA.direita);
    const a = el("img", "", c.el, { position: "absolute", top: cy + "px", height: hc + "px", left: ZONA.esquerda + larg * 0.25 + "px", transform: "translate(-50%,-50%)" });
    const b = el("img", "", c.el, { position: "absolute", top: cy + "px", height: hc + "px", left: ZONA.esquerda + larg * 0.75 + "px", transform: "translate(-50%,-50%)" });
    const x = el("div", "mk-display", c.el, { position: "absolute", top: cy + "px", left: ZONA.esquerda + larg * 0.5 + "px", transform: "translate(-50%,-50%)", fontSize: "92px", color: "rgba(241,235,226,0.8)" });
    x.textContent = "×";
    a.src = p.logo_cliente; b.src = p.logo_parceiro;
    await a.decode().catch(() => {}); await b.decode().catch(() => {});
    tl.fromTo(a, { scale: 0.6, opacity: 0, x: -30 }, { scale: 1, opacity: 1, x: 0, duration: 0.55, ease: EASE.mola }, t0 + 0.05);
    tl.fromTo(b, { scale: 0.6, opacity: 0, x: 30 }, { scale: 1, opacity: 1, x: 0, duration: 0.55, ease: EASE.mola }, t0 + 0.15);
    tl.fromTo(x, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: EASE.chegada }, t0 + 0.3);
    // logo nunca fica parada (regra do dono, 19/11): respiro leve e alternado depois do pouso
    tl.to(a, { scale: 1.035, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 3 }, t0 + 0.75);
    tl.to(b, { scale: 1.035, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 3 }, t0 + 1.3);
    logo = a;
    const ass = el("img", "", c.el, { position: "absolute", left: "50%", top: H - ZONA.base - 40 + "px", width: (p.larguraAssinatura ?? 230) + "px", transform: "translate(-50%,-50%)", opacity: "0.92" });
    ass.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png";
    await ass.decode().catch(() => {});
    tl.fromTo(ass, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: EASE.chegada }, t0 + 1.0);
  } else if (comCliente) {
    const hc = p.alturaCliente ?? 430;
    logo = el("img", "", c.el, { position: "absolute", left: "50%", top: ZONA.topo + 20 + hc / 2 + "px", height: hc + "px", transform: "translate(-50%,-50%)" });
    logo.src = p.logo_cliente;
    await logo.decode().catch(() => {});
    tl.fromTo(logo, { scale: 0.6, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: EASE.mola }, t0 + 0.05);
    tl.to(logo, { scale: 1.035, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 3 }, t0 + 0.75);
    const ass = el("img", "", c.el, { position: "absolute", left: "50%", top: H - ZONA.base - 40 + "px", width: (p.larguraAssinatura ?? 230) + "px", transform: "translate(-50%,-50%)", opacity: "0.92" });
    ass.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png";
    await ass.decode().catch(() => {});
    tl.fromTo(ass, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: EASE.chegada }, t0 + 1.0);
  } else {
    logo = el("img", "", c.el, { position: "absolute", left: "50%", top: H * 0.3 + "px", width: (p.larguraLogo ?? 620) + "px", transform: "translate(-50%,-50%)" });
    logo.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png";
    await logo.decode().catch(() => {});
    tl.fromTo(logo, { clipPath: "inset(0% 100% 0% 0%)", y: 18 }, { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 0.6, ease: EASE.chegada }, t0 + 0.05);
  }

  const bloco = el("div", "", c.el, { position: "absolute", left: "50%", top: H * (p.y ?? 0.5) + "px", transform: "translate(-50%,-50%)", textAlign: "center" });
  const linhas = p.cta ?? ["MANDA NO", "*DIRECT*."];
  const larg = W * 0.7;
  const tam = Math.min(...linhas.map((l) => ajustar(l.replace(/\*/g, ""), "Anton", larg, 210)));
  const spans = [];
  linhas.forEach((l, i) => {
    const ln = el("div", "mk-display mk-sombra", bloco, { fontSize: tam + "px", lineHeight: "0.95" });
    palavras(l).forEach((w, k, arr) => {
      const s = el("span", "mk-palavra" + (w.destaque ? " mk-destaque" : ""), ln);
      s.textContent = w.t;
      if (w.ponto) { const pt = el("span", "mk-ponto", s); pt.textContent = "."; }
      if (k < arr.length - 1) ln.appendChild(document.createTextNode(" "));
      spans.push(s);
    });
  });
  const cs = cantos(bloco, { arm: 44, esp: 7, folga: 34 });
  spans.forEach((s, i) => {
    tl.fromTo(s, { opacity: 0, y: 30, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.3, ease: EASE.chegadaForte }, t0 + 0.32 + i * DUR.entrePalavras * 1.5);
  });
  tl.fromTo(cs.no, { x: -40, y: -40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: EASE.chegada }, t0 + 0.55);
  tl.fromTo(cs.se, { x: 40, y: 40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: EASE.chegada }, t0 + 0.58);

  let iconeSvg = null;
  if (p.icone ?? !comCliente) {
    // aviãozinho do direct, desenhado em traço vermelho
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    Object.assign(svg.style, { position: "absolute", width: tam * 0.62 + "px", height: tam * 0.62 + "px", left: "0px", top: "0px", overflow: "visible" });
    const d = ["M8 46 L92 10 L62 90 L46 56 Z", "M46 56 L92 10"];
    const tracos = d.map((dd) => {
      const pa = document.createElementNS(ns, "path");
      pa.setAttribute("d", dd); pa.setAttribute("fill", "none"); pa.setAttribute("stroke", "#FF1A1A");
      pa.setAttribute("stroke-width", "7"); pa.setAttribute("stroke-linejoin", "round"); pa.setAttribute("stroke-linecap", "round");
      svg.appendChild(pa); return pa;
    });
    svg.style.position = "relative"; svg.style.width = svg.style.height = "38px"; svg.style.marginRight = "14px"; svg.style.verticalAlign = "-8px";
    iconeSvg = svg;
    tracos.forEach((pa, i) => {
      const L = pa.getTotalLength();
      pa.style.strokeDasharray = `${L}`;
      tl.fromTo(pa, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.inOut" }, t0 + 0.9 + i * 0.15);
    });
  }

  let apoio = null;
  if (p.apoio) {
    // dentro da zona segura (x 60 a 960), quebrando linha em vez de vazar (aviso legal longo cabe)
    apoio = el("div", "", c.el, { position: "absolute", left: ZONA.esquerda + "px", width: (W - ZONA.direita - ZONA.esquerda) + "px", top: H * (p.y ?? 0.5) + tam * 1.2 + "px", textAlign: "center", font: "600 32px/1.3 'Inter', sans-serif", letterSpacing: "0.02em", color: "rgba(241,235,226,0.95)" });
    if (iconeSvg) apoio.appendChild(iconeSvg);
    apoio.appendChild(document.createTextNode(p.apoio));
    tl.fromTo(apoio, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE.chegada }, t0 + 0.85);
  }
  if (p.aba ?? !comCliente) {
    const a = aba(c.el, 84, { left: W - ZONA.direita - 84 - 24 + "px", top: H - ZONA.base - 84 + "px" });
    tl.fromTo(a, { scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: 0.5, ease: EASE.mola }, t0 + 0.95);
  }
  ctx.cue(t0 + 0.05, "logo", -2);
  ctx.cue(t0 + 0.32, "cta", -6);

  const pousa = t0 + 1.25;
  ctx.exigir({ tipo: "cta", alvo: `[data-id="${c.id}"] .mk-palavra`, de: pousa, ate: c.ate, minimo: 2 });
  ctx.exigir({ tipo: "parado", alvo: `[data-id="${c.id}"] .mk-display`, de: pousa, ate: c.ate });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-display`, de: pousa, ate: c.ate });
}
