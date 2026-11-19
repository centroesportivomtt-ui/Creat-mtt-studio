// FECHO: cartão final com logo e CTA. Pousa em ~1,2 s e fica parado (CTA legível por no mínimo 2 s).
// props:
//   cta: ["MANDA NO", "*DIRECT*."]   (linhas; *palavra* em âmbar; "." vermelho)
//   apoio: "conta o que você quer vender"   (linha pequena embaixo do CTA)
//   logo: "assets/marca/logo_creatMTT_claro.png"  larguraLogo: 620
//   icone: true (aviãozinho do direct desenhado em traço)   aba: true (selo Aba 71 no canto)
//   y: centro do bloco do CTA em fração da altura (0.5)
export default async function fecho(ctx, c) {
  const { el, tl, EASE, DUR, W, H, palavras, ajustar, cantos, aba, ZONA } = ctx;
  const p = c.props;
  const t0 = c.de;

  const logo = el("img", "", c.el, { position: "absolute", left: "50%", top: H * 0.3 + "px", width: (p.larguraLogo ?? 620) + "px", transform: "translate(-50%,-50%)" });
  logo.src = p.logo ?? "assets/marca/logo_creatMTT_claro.png";
  await logo.decode().catch(() => {});
  tl.fromTo(logo, { clipPath: "inset(0% 100% 0% 0%)", y: 18 }, { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 0.6, ease: EASE.chegada }, t0 + 0.05);

  const bloco = el("div", "", c.el, { position: "absolute", left: "50%", top: H * (p.y ?? 0.5) + "px", transform: "translate(-50%,-50%)", textAlign: "center" });
  const linhas = p.cta ?? ["MANDA NO", "*DIRECT*."];
  const larg = W * 0.7;
  let tam = Math.min(...linhas.map((l) => ajustar(l.replace(/\*/g, ""), "Anton", larg, 210)));
  // auto-ajuste (zona segura, ctx.caber): linha que não cabe a 60 px quebra em até 3; o CTA inteiro usa o menor tamanho
  let grupos = linhas.map((l) => [palavras(l).map((_, k) => k)]);
  const naoCabe = linhas.some((l) => ctx.medir(l.replace(/\*/g, ""), "Anton", tam) > larg + 0.5);
  if (naoCabe) {
    const rs = linhas.map((l) => ctx.caber(l.replace(/\*/g, ""), { largura: larg, max: 210, min: 60, piso: 40, linhas: 3 }));
    tam = Math.min(...rs.map((r) => r.px)); grupos = rs.map((r) => r.grupos);
  }
  const spans = [];
  linhas.forEach((l, i) => {
    const ps = palavras(l);
    for (const g of grupos[i]) {
      const ln = el("div", "mk-display mk-sombra", bloco, { fontSize: tam + "px", lineHeight: "0.95" });
      g.forEach((k, j) => {
        const w = ps[k];
        const s = el("span", "mk-palavra" + (w.destaque ? " mk-destaque" : ""), ln);
        s.textContent = w.t;
        if (w.ponto) { const pt = el("span", "mk-ponto", s); pt.textContent = "."; }
        if (j < g.length - 1) ln.appendChild(document.createTextNode(" "));
        spans.push(s);
      });
    }
  });
  const nLinhas = grupos.reduce((n, g) => n + g.length, 0);
  const cs = cantos(bloco, { arm: 44, esp: 7, folga: 34 });
  spans.forEach((s, i) => {
    tl.fromTo(s, { opacity: 0, y: 30, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.3, ease: EASE.chegadaForte }, t0 + 0.32 + i * DUR.entrePalavras * 1.5);
  });
  tl.fromTo(cs.no, { x: -40, y: -40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: EASE.chegada }, t0 + 0.55);
  tl.fromTo(cs.se, { x: 40, y: 40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: EASE.chegada }, t0 + 0.58);

  let iconeSvg = null;
  if (p.icone !== false) {
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
    // centrado em W/2 como antes, mas a caixa termina na coluna de botões (texto longo quebra dentro da zona);
    // com o CTA quebrado em mais linhas, o apoio desce junto
    const lado = ZONA.direita;
    const topoApoio = nLinhas === linhas.length ? H * (p.y ?? 0.5) + tam * 1.2 : H * (p.y ?? 0.5) + bloco.offsetHeight / 2 + tam * 0.25;
    apoio = el("div", "", c.el, { position: "absolute", left: lado + "px", right: lado + "px", top: topoApoio + "px", textAlign: "center", font: "500 34px/1.3 'Inter', sans-serif", letterSpacing: "0.04em", color: "rgba(241,235,226,0.86)" });
    if (iconeSvg) apoio.appendChild(iconeSvg);
    apoio.appendChild(document.createTextNode(p.apoio));
    tl.fromTo(apoio, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE.chegada }, t0 + 0.85);
  }
  if (p.aba !== false) {
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
