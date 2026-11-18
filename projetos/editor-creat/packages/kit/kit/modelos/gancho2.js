// GANCHO 2: a fala vira título cinético. Fase A (legível no quadro 0): 3 linhas e risco vermelho na palavra negada.
// Fase B: "É SOBRE" + palavra âmbar que troca no tempo da fala. Tudo função pura de t.
// props: y (fração), a:{linhas:[..], risca:"ESTÁTICOS", riscaEm, sai}, b:{entra, topo:"É SOBRE", trocas:[{t, p}], fim:{t, p}}, largura
export default function gancho2(ctx, c) {
  const { el, W, H, ajustar, prog, ease, blurDirecional } = ctx;
  const p = c.props, yc = H * (p.y ?? 0.55), larg = W * (p.largura ?? 0.80);
  const eo = ease("expo.out"), p4 = ease("power4.out"), pin = ease("power3.in");
  el("div", "", c.el, { position: "absolute", left: "50%", top: yc + "px", width: "1500px", height: "1100px", transform: "translate(-50%,-50%)",
    background: "radial-gradient(closest-side, rgba(0,0,0,0.50), rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)" });
  // ---- fase A
  const A = el("div", "", c.el, { position: "absolute", left: (W - larg) / 2 - 30 + "px", top: "0px", width: larg + "px" });
  const linhasA = p.a.linhas.map((txt) => {
    const tam = ajustar(txt.replace(/\./g, ""), "Anton", larg, 250, 90);
    const ln = el("div", "mk-display mk-sombra", A, { fontSize: tam + "px", lineHeight: "0.96", position: "relative", display: "table" });
    const ponto = /\.$/.test(txt);
    ln.textContent = txt.replace(/\.$/, "");
    if (ponto) { const pt = el("span", "mk-ponto", ln); pt.textContent = "."; }
    return ln;
  });
  A.style.top = yc - A.offsetHeight / 2 + "px";
  const alvo = linhasA.find((l) => l.textContent.replace(".", "") === p.a.risca);
  const risco = el("div", "", alvo, { position: "absolute", left: "-2%", top: "46%", width: "104%", height: "0.11em", background: "#FF1A1A", transformOrigin: "0 50%", boxShadow: "0 2px 10px rgba(0,0,0,0.5)" });
  // ---- fase B
  const B = el("div", "", c.el, { position: "absolute", left: "0", top: "0", width: W + "px", textAlign: "center" });
  const topo = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc - 250 + "px", fontSize: "120px" });
  topo.textContent = p.b.topo;
  const slots = p.b.trocas.map((tr) => {
    const tam = ajustar(tr.p, "Anton", larg, 230, 80);
    const s = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc - 110 + "px", fontSize: tam + "px", color: "#F5B84D", lineHeight: "1" });
    s.textContent = tr.p; s.dataset.h = tam; return s;
  });
  const fim = el("div", "mk-display mk-sombra", B, { position: "absolute", left: "0", width: "100%", top: yc + 150 + "px", fontSize: "92px" });
  fim.innerHTML = p.b.fim.p.replace(/\.$/, '<span class="mk-ponto">.</span>');
  ctx.aCada((t) => {
    const tb = p.b.entra;
    // A: parada desde o quadro 0; risco; sai para cima
    const ks = pin(prog(t, p.a.sai, tb - p.a.sai));
    A.style.display = t < tb ? "" : "none";
    A.style.transform = `translateY(${-ks * 220}px) scale(${1 - ks * 0.12})`;
    A.style.opacity = String(1 - ks);
    A.style.filter = ks > 0 ? `blur(${ks * 10}px)` : "";
    risco.style.transform = `scaleX(${p4(prog(t, p.a.riscaEm, 0.16))})`;
    alvo.style.color = t >= p.a.riscaEm + 0.1 ? "rgba(255,255,255,0.62)" : "";
    // B
    B.style.display = t >= tb ? "" : "none";
    const kt = eo(prog(t, tb, 0.22));
    topo.style.transform = `translateY(${(1 - kt) * 40}px)`; topo.style.opacity = String(Math.min(1, prog(t, tb, 0.08)));
    slots.forEach((s, i) => {
      const t0 = p.b.trocas[i].t, t1 = i < slots.length - 1 ? p.b.trocas[i + 1].t : c.ate + 1;
      if (t < t0 || t >= t1 + 0.12) { s.style.opacity = "0"; return; }
      const ke = p4(prog(t, t0, 0.14)), kx = pin(prog(t, t1, 0.12));
      s.style.opacity = String(1 - kx);
      s.style.transform = `translateY(${(1 - ke) * 26 - kx * 70}px) scale(${1 + (1 - ke) * 0.28})`;
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
