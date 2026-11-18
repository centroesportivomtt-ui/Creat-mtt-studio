// GANCHO 2: a fala vira título cinético. Fase A (legível no quadro 0): 3 linhas e risco vermelho na palavra negada.
// Fase B: "É SOBRE" + palavra âmbar que troca no tempo da fala. Tudo função pura de t.
// props: y (fração), a:{linhas:[..], risca:"ESTÁTICOS", riscaEm, sai}, b:{entra, topo:"É SOBRE", trocas:[{t, p}], fim:{t, p}}, largura
export default function gancho2(ctx, c) {
  const { el, W, H, ajustar, prog, ease, blurDirecional, ZONA } = ctx;
  const z = ZONA ?? { direita: 120, esquerda: 60 };
  // Zona segura (QA zona_segura): o bloco inteiro, com o ponto final e o risco, fica entre x 60 e 960
  // (a coluna de botões do Reels começa em 960). Antes o ponto era somado depois do ajuste e invadia a coluna.
  const p = c.props, yc = H * (p.y ?? 0.55);
  const larg = Math.min(W * (p.largura ?? 0.80), W - z.direita - z.esquerda - 40);
  const esq = Math.max(z.esquerda + 20, Math.min((W - larg) / 2 - 30, W - z.direita - 20 - larg));
  const eo = ease("expo.out"), p4 = ease("power4.out"), pin = ease("power3.in");
  el("div", "", c.el, { position: "absolute", left: "50%", top: yc + "px", width: "1500px", height: "1100px", transform: "translate(-50%,-50%)",
    background: "radial-gradient(closest-side, rgba(0,0,0,0.50), rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)" });
  // ---- fase A
  const A = el("div", "", c.el, { position: "absolute", left: esq + "px", top: "0px", width: larg + "px" });
  // auto-ajuste (zona segura, ctx.caber): a linha que não cabe a 90 px quebra em até 4 linhas; a que cabe fica igual
  const autoA = (txt) => {
    const t = ajustar(txt, "Anton", larg * 0.96, 250, 90);   // mede COM o ponto; 4% de folga para o risco (104%)
    if (ctx.medir(txt, "Anton", t) <= larg * 0.96 + 0.5) return { px: t, linhas: [txt] };
    return ctx.caber(txt, { largura: larg * 0.96, max: 250, min: 90, piso: 44, linhas: 4 });
  };
  const linhasA = [], porLinha = [];
  for (const txt of p.a.linhas) {
    const r = autoA(txt), minhas = [];
    r.linhas.forEach((sub) => {
      const ln = el("div", "mk-display mk-sombra", A, { fontSize: r.px + "px", lineHeight: "0.96", position: "relative", display: "table" });
      const ponto = /\.$/.test(sub);
      ln.textContent = sub.replace(/\.$/, "");
      if (ponto) { const pt = el("span", "mk-ponto", ln); pt.textContent = "."; }
      linhasA.push(ln); minhas.push(ln);
    });
    porLinha.push({ txt, els: minhas });
  }
  A.style.top = yc - A.offsetHeight / 2 + "px";
  // a linha riscada é a que o autor escreveu igual a `risca` (com ou sem o ponto final); quebrada, o risco vai em cada pedaço.
  // Antes comparava o textContent sem o PRIMEIRO ponto e quebrava ("R$ 12.999,90" virava "R$ 12999,90" e o modelo caía).
  const sem = (x) => String(x ?? "").replace(/\.$/, "");
  const alvos = (porLinha.find((l) => sem(l.txt) === sem(p.a.risca)) ?? { els: [] }).els;
  const riscos = alvos.map((alvo) => el("div", "", alvo, { position: "absolute", left: "-2%", top: "46%", width: "104%", height: "0.11em", background: "#FF1A1A", transformOrigin: "0 50%", boxShadow: "0 2px 10px rgba(0,0,0,0.5)" }));
  // ---- fase B
  const B = el("div", "", c.el, { position: "absolute", left: "0", top: "0", width: W + "px", textAlign: "center" });
  // fase B centrada em x = W/2: metade útil até a coluna de botões = W/2 - direita (420 px em 1080)
  const meiaB = W / 2 - z.direita;
  const centrado = (txt, max, min, linhas, largura = 2 * meiaB) => ctx.caber(txt, { largura, max, min, piso: Math.min(min, 40), linhas });
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const linhasHtml = (ls, ponto) => ls.map((l, i) => (ponto && i === ls.length - 1 ? esc(l).replace(/\.$/, '<span class="mk-ponto">.</span>') : esc(l))).join("<br>");
  const rTopo = centrado(p.b.topo, 120, 64, 2);
  const topo = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc - 250 - (rTopo.linhas.length - 1) * rTopo.px * 0.92 + "px", fontSize: rTopo.px + "px" });
  topo.innerHTML = linhasHtml(rTopo.linhas, false);
  const slots = p.b.trocas.map((tr) => {
    let tam = ajustar(tr.p, "Anton", larg, 230, 80), ls = [tr.p];
    if (ctx.medir(tr.p, "Anton", tam) > larg + 0.5) { const r = centrado(tr.p, 230, 80, 3, larg); tam = r.px; ls = r.linhas; }
    const s = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc - 110 + "px", fontSize: tam + "px", color: "#F5B84D", lineHeight: "1" });
    s.innerHTML = linhasHtml(ls, false); s.dataset.h = tam;
    // entrada com escala 1,28: encolhe para a palavra crescida não passar da coluna de botões
    const w = Math.max(...ls.map((l) => ctx.medir(l, "Anton", tam)));
    s.dataset.s0 = String(Math.max(1, Math.min(1.28, (2 * meiaB) / Math.max(1, w))));
    return s;
  });
  const rFim = centrado(p.b.fim.p, 92, 52, 2);
  const fim = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc + 150 + "px", fontSize: rFim.px + "px" });
  fim.innerHTML = linhasHtml(rFim.linhas, /\.$/.test(p.b.fim.p));
  ctx.aCada((t) => {
    const tb = p.b.entra;
    // A: parada desde o quadro 0; risco; sai para cima
    const ks = pin(prog(t, p.a.sai, tb - p.a.sai));
    A.style.display = t < tb ? "" : "none";
    A.style.transform = `translateY(${-ks * 220}px) scale(${1 - ks * 0.12})`;
    A.style.opacity = String(1 - ks);
    A.style.filter = ks > 0 ? `blur(${ks * 10}px)` : "";
    for (const r of riscos) r.style.transform = `scaleX(${p4(prog(t, p.a.riscaEm, 0.16))})`;
    for (const a of alvos) a.style.color = t >= p.a.riscaEm + 0.1 ? "rgba(255,255,255,0.62)" : "";
    // B
    B.style.display = t >= tb ? "" : "none";
    const kt = eo(prog(t, tb, 0.22));
    topo.style.transform = `translateY(${(1 - kt) * 40}px)`; topo.style.opacity = String(Math.min(1, prog(t, tb, 0.08)));
    slots.forEach((s, i) => {
      const t0 = p.b.trocas[i].t, t1 = i < slots.length - 1 ? p.b.trocas[i + 1].t : c.ate + 1;
      if (t < t0 || t >= t1 + 0.12) { s.style.opacity = "0"; return; }
      const ke = p4(prog(t, t0, 0.14)), kx = pin(prog(t, t1, 0.12));
      s.style.opacity = String(1 - kx);
      s.style.transform = `translateY(${(1 - ke) * 26 - kx * 70}px) scale(${1 + (1 - ke) * (+s.dataset.s0 - 1)})`;
      s.style.filter = ke < 1 ? `blur(${(1 - ke) * 10}px)` : (kx > 0 ? `blur(${kx * 8}px)` : "");
    });
    const kf = eo(prog(t, p.b.fim.t, 0.25));
    fim.style.opacity = t >= p.b.fim.t ? "1" : "0";
    fim.style.transform = `translateY(${(1 - kf) * 30}px)`;
    fim.style.filter = kf < 1 ? `blur(${(1 - kf) * 6}px)` : "";
    // saída geral
    const kz = pin(prog(t, c.ate - 0.16, 0.16));
    B.style.opacity = String(1 - kz);
  });
}
