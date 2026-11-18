// GANCHO: título cinético que já se lê no quadro 0 (capa do Reel e primeiro olhar).
// props:
//   linhas: ["ISSO NÃO", "FOI *EDITADO*"]   (*palavra* = âmbar; "." no fim = ponto vermelho)
//   troca: { de: "EDITADO", para: "ESCRITO", em: 0.55, dur: 0.36 }  risca, embaralha e pousa a palavra nova (tempo local)
//   modo: "quadro0" (padrão: pronto no quadro 0, a novidade vem na troca) | "entrada" (palavras batem com blur)
//   sobrelinha: texto pequeno em mono acima do bloco (ex.: "// creat.MTT")
//   largura: fração do quadro ocupada pelas linhas (0.80), y: centro do bloco em fração da altura (0.42)
//   cantos: true (cantoneiras vermelhas no bloco)
export default function gancho(ctx, c) {
  const { el, tl, EASE, DUR, W, H, palavras, ajustar, semente } = ctx;
  const p = c.props;
  const modo = p.modo ?? "quadro0";
  const x0l = p.x ?? ctx.ZONA.margem;
  const larg = Math.min(W * (p.largura ?? 0.84), W - x0l - ctx.ZONA.direita - 8); // nunca invade a coluna de ícones
  const x0 = p.x ?? ctx.ZONA.margem;
  const troca = p.troca;

  const bloco = el("div", "", c.el, { position: "absolute", left: x0 + "px", top: "0px" });
  const linhasEl = [];
  let alturaTotal = 0;
  const gap = p.entrelinha ?? 6;

  const sobre = p.sobrelinha ? el("div", "mk-dado", bloco, { fontSize: "28px", color: "rgba(241,235,226,0.75)", marginBottom: "18px" }) : null;
  if (sobre) { sobre.textContent = p.sobrelinha; alturaTotal += 28 + 18; }

  let alvo = null; // span da palavra trocada
  let pontoTroca = null;
  // auto-ajuste (zona segura): a linha que não cabe na largura nem no tamanho mínimo (60 px) quebra em até 4 linhas
  // (ctx.caber); a que cabe fica exatamente como antes. autoAjuste: false desliga (só para o teste negativo do QA).
  const auto = p.autoAjuste !== false;
  for (const linha of p.linhas) {
    const ps = palavras(linha);
    // mede a linha com a versão mais larga (antes ou depois da troca)
    const sufixo = ps.some((w) => w.ponto) ? "." : "";
    const versoes = [ps.map((w) => w.t).join(" ")];
    if (troca) versoes.push(ps.map((w) => (w.t === troca.de ? troca.para + (troca.ponto === false ? "" : ".") : w.t)).join(" "));
    let tam = p.tamanho ?? Math.min(...versoes.map((v) => ajustar(v + sufixo, "Anton", larg / 1.03, p.maximo ?? 300)));
    let grupos = [ps.map((_, i) => i)];
    const larga = versoes.reduce((a, v) => (ctx.medir(v, "Anton", 100) > ctx.medir(a, "Anton", 100) ? v : a));
    if (auto && ctx.medir(larga + sufixo, "Anton", tam) * 1.03 > larg + 0.5) {
      const r = ctx.caber(larga + sufixo, { largura: larg / 1.03, max: p.tamanho ?? p.maximo ?? 300, min: 60, piso: 36, linhas: 4 });
      tam = r.px; grupos = r.grupos;
    }
    for (const g of grupos) {
      const ln = el("div", "mk-display mk-sombra", bloco, { fontSize: tam + "px", marginTop: (linhasEl.length ? gap : 0) + "px" });
      g.forEach((i, k) => {
        const w = ps[i];
        const s = el("span", "mk-palavra" + (w.destaque ? " mk-destaque" : ""), ln);
        s.textContent = w.t;
        if (troca && w.t === troca.de) alvo = s;
        if (w.ponto) { const pt = el("span", "mk-ponto", s); pt.textContent = "."; }
        if (k < g.length - 1) ln.appendChild(document.createTextNode(" "));
      });
      linhasEl.push(ln);
      alturaTotal += tam * 0.92 + (linhasEl.length > 1 ? gap : 0);
    }
  }
  const yc = H * (p.y ?? 0.42);
  bloco.style.top = Math.round(yc - alturaTotal / 2) + "px";

  if (p.cantos !== false) {
    const cs = ctx.cantos(bloco, { arm: 40, esp: 7, folga: 26 });
    if (modo === "entrada") {
      tl.fromTo(cs.no, { x: -40, y: -40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.45, ease: EASE.chegada }, c.de + 0.1);
      tl.fromTo(cs.se, { x: 40, y: 40, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.45, ease: EASE.chegada }, c.de + 0.1);
    }
  }

  const todas = [...bloco.querySelectorAll(".mk-palavra")];
  if (modo === "entrada") {
    todas.forEach((s, i) => {
      tl.fromTo(s, { y: 46, opacity: 0, filter: "blur(10px)" },
        { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.32, ease: EASE.chegadaForte }, c.de + i * DUR.entrePalavras * 1.4);
    });
    const dest = bloco.querySelector(".mk-destaque");
    if (dest) tl.fromTo(dest, { letterSpacing: "0.25em" }, { letterSpacing: "0.005em", duration: 0.7, ease: EASE.chegada }, c.de);
    if (sobre) tl.fromTo(sobre, { opacity: 0 }, { opacity: 1, duration: 0.3 }, c.de);
  }

  if (troca && alvo) {
    const em = c.de + (troca.em ?? 0.55);
    const dur = troca.dur ?? 0.36;
    // 1) risco vermelho atravessa a palavra antiga
    const risco = el("div", "", alvo, { position: "absolute", left: "-4%", right: "-4%", top: "47%", height: "0.09em", background: "var(--mk-ponto)", transformOrigin: "0 50%", transform: "scaleX(0)" });
    alvo.style.position = "relative";
    tl.fromTo(risco, { scaleX: 0 }, { scaleX: 1, duration: 0.12, ease: EASE.chegada }, em - 0.16);
    tl.to(risco, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.1, ease: EASE.saida, immediateRender: false }, em + 0.02);
    // 2) embaralha (função pura do quadro) e pousa a palavra nova em âmbar
    const glifos = "EFHIJKLPRSTZ1234579"; // glifos estreitos: o embaralhado não alarga a linha
    const textoNo = alvo.firstChild; // nó de texto
    const n = Math.max(troca.de.length, troca.para.length);
    pontoTroca = el("span", "mk-ponto", alvo, { display: "inline-block" });
    pontoTroca.textContent = troca.ponto === false ? "" : ".";
    const corBase = getComputedStyle(alvo).color;
    // trava a largura da palavra durante o embaralhado (a linha não pulsa nem invade a zona segura)
    const fs0 = parseFloat(getComputedStyle(alvo).fontSize);
    const largPal = Math.max(ctx.medir(troca.de, "Anton", fs0), ctx.medir(troca.para + ".", "Anton", fs0)) * 1.01;
    Object.assign(alvo.style, { display: "inline-block", width: largPal + "px", textAlign: "left" });
    ctx.aCada((t) => {
      const q = Math.round(t * ctx.fps);
      if (t < em) { textoNo.nodeValue = troca.de; alvo.style.color = ""; return; }
      const k = (t - em) / dur;
      if (k >= 1) { textoNo.nodeValue = troca.para; alvo.style.color = "var(--mk-destaque)"; return; }
      const r = semente(q * 131 + 7);
      let s = "";
      for (let i = 0; i < n; i++) s += k > (i + 1) / (n + 1) ? (troca.para[i] ?? "") : glifos[Math.floor(r() * glifos.length)];
      textoNo.nodeValue = s;
      alvo.style.color = k > 0.5 ? "var(--mk-destaque)" : corBase;
    });
    // 3) a palavra pousa com peso e a câmera leva um empurrão de 2 quadros. A escala de entrada (1,16) encolhe quando a
    //    palavra, crescida a partir do centro, sairia da zona segura (palavra longa encostada na margem)
    const ra = alvo.getBoundingClientRect(), ZZ = ctx.ZONA;
    const folgaLado = Math.max(0, Math.min(ra.left - ZZ.esquerda, W - ZZ.direita - ra.right));
    const s0 = Math.min(1.16, 1 + (2 * folgaLado) / Math.max(1, ra.width));
    tl.fromTo(alvo, { scale: s0 }, { scale: 1, duration: 0.42, ease: EASE.chegadaForte, immediateRender: false }, em + dur);
    tl.fromTo(pontoTroca, { scale: 0, transformOrigin: "50% 80%" }, { scale: 1, duration: 0.34, ease: EASE.mola }, em + dur + 0.04);
    tl.to(bloco, { keyframes: [{ x: 9, duration: 1 / 30 }, { x: -6, duration: 1 / 30 }, { x: 0, duration: 1 / 30 }], ease: "none" }, em + dur);
    ctx.cue(em - 0.16, "risco", -6);
    ctx.cue(em, "embaralha", -10);
    ctx.cue(em + dur, "impacto", 0);
  }

  // regra da casa: título pousado fica parado (o checar mede)
  const pousa = troca ? c.de + (troca.em ?? 0.55) + (troca.dur ?? 0.36) + 0.45 : c.de + (modo === "entrada" ? 0.9 : 0);
  ctx.exigir({ tipo: "parado", alvo: `[data-id="${c.id}"] .mk-display`, de: pousa, ate: c.ate - 0.2 });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-display`, de: c.de, ate: c.ate - 0.2 });
  if (modo === "quadro0") ctx.exigir({ tipo: "legivel-no-inicio", alvo: `[data-id="${c.id}"] .mk-palavra`, em: c.de });
}
