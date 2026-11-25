// RECEITA: a ficha de receita da família, escrita à mão no tempo da fala. Cartão de papel pautado entra girando,
// cada linha se escreve (máscara da esquerda para a direita, letra Caveat Brush), uma linha pode ser riscada e um número
// grande pode contar de A até B. Feito para a história da Maryna Biscoitos ("4 receitas que minha mãe fazia… hoje 8 sabores").
// props: x (60), y (360), w (620), titulo ("Receita da Vovó Niran"), linhas: [{t, texto, risca: t?, cor?}],
//        conta: {de: t, dur, a: 4, b: 8, rotulo: "SABORES"}, giro (-3)
export default function receita(ctx, c) {
  const { el, prog, ease } = ctx;
  const p = c.props, t0 = c.de;
  const x = Math.max(ctx.ZONA.esquerda, p.x ?? 60), w = Math.min(p.w ?? 620, ctx.W - ctx.ZONA.direita - x), giro = p.giro ?? -3;
  const card = el("div", "mk-chip", c.el, { position: "absolute", left: x + "px", top: (p.y ?? 360) + "px", width: w + "px", boxSizing: "border-box",
    padding: "30px 34px 34px 64px", background: "#FFF8EC", borderRadius: "10px", boxShadow: "0 28px 60px rgba(0,0,0,0.45)", color: "#3A2418",
    backgroundImage: "repeating-linear-gradient(180deg, transparent 0 61px, rgba(227,18,27,0.16) 61px 63px)", backgroundPosition: "0 96px", transformOrigin: "20% 0%" });
  el("div", "", card, { position: "absolute", left: "42px", top: "0", bottom: "0", width: "3px", background: "rgba(227,18,27,0.45)" });   // margem do caderno
  el("div", "", card, { position: "absolute", left: "50%", top: "-18px", width: "150px", height: "38px", marginLeft: "-75px", background: "rgba(255,210,63,0.75)", transform: "rotate(-4deg)" }); // fita adesiva
  const tit = el("div", "", card, { font: "400 58px/1 'Kaushan Script'", color: "#E3121B", marginBottom: "16px", whiteSpace: "nowrap" }); tit.textContent = p.titulo ?? "Receita da Vovó Niran";
  const linhas = (p.linhas ?? []).map((L) => {
    const box = el("div", "", card, { position: "relative", font: "400 50px/63px 'Caveat Brush'", color: L.cor ?? "#3A2418", whiteSpace: "nowrap" });
    const tx = el("span", "", box, { display: "inline-block" }); tx.textContent = L.texto;
    const risco = L.risca != null ? el("div", "", box, { position: "absolute", left: "-6px", top: "34px", height: "6px", width: "0", background: "#E3121B", borderRadius: "3px", transform: "rotate(-2deg)" }) : null;
    return { L, tx, risco, larg: 0 };
  });
  let num = null, rot = null;
  if (p.conta) {
    const caixa = el("div", "", card, { display: "flex", alignItems: "baseline", gap: "18px", marginTop: "10px" });
    num = el("div", "", caixa, { font: "400 170px/0.9 'Lilita One'", color: "#E3121B", WebkitTextStroke: "8px #FFF8EC", paintOrder: "stroke fill", textShadow: "0 8px 0 #3A2418" });
    rot = el("div", "", caixa, { font: "400 64px/1 'Lilita One'", color: "#3A2418", letterSpacing: "0.02em" }); rot.textContent = p.conta.rotulo ?? "";
  }
  const eo = ease("expo.out"), pin = ease("power3.in"), po = ease("power2.out");
  ctx.aCada((t) => {
    const e = eo(prog(t, t0, 0.55)), sai = pin(prog(t, c.ate - 0.25, 0.25));
    card.style.opacity = String(Math.min(1, prog(t, t0, 0.12)) * (1 - sai));
    card.style.transform = `translateY(${(1 - e) * 120 + sai * 60}px) rotate(${giro + (1 - e) * -14}deg)`;
    linhas.forEach((o) => {
      const k = po(prog(t, o.L.t, Math.max(0.35, o.L.texto.length * 0.045)));
      o.tx.style.clipPath = `inset(-20% ${(1 - k) * 100}% -20% 0)`;
      if (o.risco) { if (!o.larg) o.larg = o.tx.offsetWidth + 12; o.risco.style.width = o.larg * eo(prog(t, o.L.risca, 0.3)) + "px"; o.tx.style.opacity = t >= o.L.risca + 0.3 ? "0.55" : "1"; }
    });
    if (num) {
      const q = p.conta, k = prog(t, q.de, q.dur ?? 1.2);
      num.textContent = String(Math.round(q.a + (q.b - q.a) * po(k)));
      num.style.opacity = String(prog(t, q.de - 0.3, 0.2));
      num.style.transform = `scale(${1 + (k > 0 && k < 1 ? 0.06 * Math.sin(k * Math.PI * 6) : 0) + (t >= q.de + (q.dur ?? 1.2) ? 0.12 * Math.max(0, 1 - (t - q.de - (q.dur ?? 1.2)) / 0.25) : 0)})`;
      rot.style.opacity = String(prog(t, q.de - 0.3, 0.2));
    }
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.6, ate: c.ate - 0.3 });
}
