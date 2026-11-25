// SEMANA: quadro de agenda que se monta no tempo da fala. Painel de vidro com régua de horas (8h a 20h) e uma faixa por
// dia; em cada faixa um bloco cresce da hora de início à hora de fim, com contagem do horário. O dia em destaque acende
// em âmbar e ganha a frase de assinatura. Tudo é função pura de t.
// props: x (60), y (topo), w (900), titulo, sub, h0 (8), h1 (20),
//        itens: [{ t, dia: "QUA", de: 14, ate: 18, rot: "bastidores + gestão", destaque: false }]
export default function semana(ctx, c) {
  const { el, prog, ease } = ctx;
  const p = c.props, x = p.x ?? 60, w = Math.min(p.w ?? 900, ctx.W - ctx.ZONA.direita - x), h0 = p.h0 ?? 8, h1 = p.h1 ?? 20;
  const LIN = 138, CAB = 104, TAG = 160, PAD = 28, n = p.itens.length;
  const trilho = w - TAG - PAD * 2;
  const eo = ease("expo.out"), pin = ease("power3.in"), po = ease("power2.out");
  const raiz = el("div", "mk-chip", c.el, { position: "absolute", left: x + "px", top: (p.y ?? 980) + "px", width: w + "px", height: (CAB + n * LIN + 54) + "px",
    background: "rgba(12,12,14,0.86)", borderRadius: "14px", borderTop: "4px solid #F5B84D", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", boxSizing: "border-box", overflow: "hidden" });
  const cab = el("div", "", raiz, { position: "absolute", left: PAD + "px", top: "20px", right: PAD + "px" });
  const h = el("div", "", cab, { font: "900 34px 'Inter'", letterSpacing: "0.04em", color: "#fff", whiteSpace: "nowrap" }); h.textContent = p.titulo ?? "DIAS FIXOS NA LOJA";
  const s = el("div", "", cab, { font: "700 20px 'JetBrains Mono'", letterSpacing: "0.10em", color: "rgba(241,235,226,0.70)", marginTop: "6px", whiteSpace: "nowrap" }); s.textContent = p.sub ?? "";
  // régua de horas
  const regua = el("div", "", raiz, { position: "absolute", left: (PAD + TAG) + "px", top: (CAB + n * LIN + 6) + "px", width: trilho + "px", height: "30px" });
  const marcas = [];
  for (let hh = h0; hh <= h1; hh += 2) {
    const m = el("div", "", regua, { position: "absolute", left: ((hh - h0) / (h1 - h0)) * trilho + "px", top: "0", transform: "translateX(-50%)", font: "700 19px 'JetBrains Mono'", color: "rgba(241,235,226,0.6)" });
    m.textContent = hh + "h"; marcas.push(m);
  }
  const linhas = p.itens.map((it, i) => {
    const top = CAB + i * LIN;
    const g = el("div", "", raiz, { position: "absolute", left: PAD + "px", top: top + "px", width: (w - PAD * 2) + "px", height: LIN + "px" });
    const dia = el("div", "mk-display", g, { position: "absolute", left: "0", top: "14px", fontSize: "84px", lineHeight: "1", color: "#fff" }); dia.textContent = it.dia;
    const tr = el("div", "", g, { position: "absolute", left: TAG + "px", top: "18px", width: trilho + "px", height: "54px", borderRadius: "8px", background: "rgba(255,255,255,0.07)" });
    for (let hh = h0 + 2; hh < h1; hh += 2) el("div", "", tr, { position: "absolute", left: ((hh - h0) / (h1 - h0)) * trilho + "px", top: "0", width: "2px", height: "54px", background: "rgba(255,255,255,0.08)" });
    const xa = ((it.de - h0) / (h1 - h0)) * trilho, wb = ((it.ate - it.de) / (h1 - h0)) * trilho;
    const bl = el("div", "", tr, { position: "absolute", left: xa + "px", top: "0", width: wb + "px", height: "54px", borderRadius: "8px", background: it.destaque ? "#F5B84D" : "#DA291C", transformOrigin: "0 50%",
      boxShadow: it.destaque ? "0 0 34px rgba(245,184,77,0.65)" : "0 6px 18px rgba(218,41,28,0.35)" });
    const hr = el("div", "", bl, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", font: "700 27px 'JetBrains Mono'", letterSpacing: "0.02em", color: it.destaque ? "#141416" : "#fff", whiteSpace: "nowrap" });
    const rot = el("div", "", g, { position: "absolute", left: TAG + "px", top: "82px", font: `${it.destaque ? 900 : 500} 28px 'Inter'`, letterSpacing: "0.02em", color: it.destaque ? "#F5B84D" : "rgba(241,235,226,0.86)", whiteSpace: "nowrap" });
    rot.textContent = it.rot ?? "";
    const fio = el("div", "", g, { position: "absolute", left: "0", right: "0", top: "0", height: "2px", background: "rgba(255,255,255,0.08)" });
    return { it, g, dia, bl, hr, rot, fio };
  });
  // cabeça de leitura que varre o trilho quando cada bloco nasce
  const agulha = el("div", "", raiz, { position: "absolute", top: CAB + "px", width: "3px", height: n * LIN + "px", background: "#fff", opacity: "0", boxShadow: "0 0 14px rgba(255,255,255,0.8)" });
  const hora = (v) => { const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return hh + "h" + (mm ? String(mm).padStart(2, "0") : ""); };
  ctx.aCada((t) => {
    const e = eo(prog(t, c.de, 0.5)), ks = pin(prog(t, c.ate - 0.26, 0.26));
    raiz.style.opacity = String(Math.min(1, prog(t, c.de, 0.14)) * (1 - ks));
    raiz.style.transform = `translateY(${(1 - e) * 90 + ks * 40}px) scale(${0.96 + 0.04 * e})`;
    raiz.style.clipPath = `inset(0% ${(1 - e) * 100}% 0% 0% round 14px)`;
    marcas.forEach((m, i) => { m.style.opacity = String(prog(t, c.de + 0.2 + i * 0.04, 0.2)); });
    let ag = 0, agx = 0;
    linhas.forEach((L) => {
      const dt = t - L.it.t, k = eo(prog(dt, 0, 0.7)), a = Math.min(1, prog(dt, -0.05, 0.14));
      L.g.style.opacity = String(0.22 + 0.78 * a);
      L.dia.style.color = dt < 0 ? "rgba(255,255,255,0.35)" : (L.it.destaque ? "#F5B84D" : "#fff");
      L.dia.style.transform = `translateX(${(1 - eo(prog(dt, 0, 0.4))) * -26}px)`;
      L.bl.style.transform = `scaleX(${dt < 0 ? 0 : k})`;
      const fim = L.it.de + (L.it.ate - L.it.de) * po(prog(dt, 0, 0.7));
      L.hr.textContent = dt < 0.25 ? "" : hora(L.it.de) + " – " + hora(dt >= 0.7 ? L.it.ate : Math.round(fim * 2) / 2);
      L.hr.style.transform = `scaleX(${k > 0.05 ? 1 / Math.max(k, 0.05) : 1})`;   // o texto não estica com o bloco
      L.rot.style.opacity = String(prog(dt, 0.35, 0.3));
      L.rot.style.transform = `translateY(${(1 - eo(prog(dt, 0.35, 0.4))) * 14}px)`;
      if (L.it.destaque && dt >= 0) L.bl.style.filter = `brightness(${1 + 0.35 * Math.max(0, 1 - dt / 0.6)})`;
      if (dt >= 0 && dt < 0.7) { ag = 1 - prog(dt, 0.5, 0.2); agx = PAD + TAG + ((L.it.de - h0) / (h1 - h0)) * trilho + ((L.it.ate - L.it.de) / (h1 - h0)) * trilho * k; }
    });
    agulha.style.opacity = String(ag); agulha.style.left = agx + "px";
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
