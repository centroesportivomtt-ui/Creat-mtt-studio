// ABAS: a "aba" do navegador que acompanha o filme. Pílula no canto (ABA 02 · O SISTEMA) + fileira de quadradinhos,
// um por aba aberta. A cada assunto novo a pílula troca o rótulo e nasce um quadradinho âmbar.
// props: x, y, abas:[{t, n, titulo}], corrida:{de, ate, ini, fim} (contagem acelerada), some (tempo em que tudo apaga)
export default function abas(ctx, c) {
  const { el, aba, prog, ease, W } = ctx;
  const p = c.props, x = p.x ?? 60, y = p.y ?? 292, lista = p.abas;
  const raiz = el("div", "", c.el, { position: "absolute", left: x + "px", top: y + "px" });
  const pill = el("div", "", raiz, { position: "relative", display: "inline-flex", alignItems: "center", gap: "12px", height: "58px", padding: "0 20px 0 10px",
    background: "rgba(14,14,16,0.82)", borderRadius: "12px 12px 4px 4px", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", borderBottom: "3px solid #F5B84D", overflow: "hidden", whiteSpace: "nowrap" });
  const selo = aba(pill, 38, { position: "relative", flex: "0 0 auto" });
  const num = el("div", "", pill, { font: "700 22px 'JetBrains Mono'", letterSpacing: "0.08em", color: "rgba(241,235,226,0.72)" });
  const caixa = el("div", "", pill, { position: "relative", height: "58px", overflow: "hidden" });
  const tit = el("div", "", caixa, { font: "900 25px/58px 'Inter'", letterSpacing: "0.04em", color: "#fff" });
  const fila = el("div", "", raiz, { position: "absolute", left: "0px", top: "70px", width: "640px", display: "flex", flexWrap: "wrap", gap: "6px" });
  const N = p.corrida ? p.corrida.fim : lista.length;
  const qs = [];
  for (let i = 0; i < N; i++) qs.push(el("div", "", fila, { width: "15px", height: "15px", borderRadius: "3px", background: "#DA291C", opacity: "0" }));
  const eo = ease("expo.out"), ein = ease("power2.in");
  const medidor = document.createElement("canvas").getContext("2d");
  medidor.font = "900 25px Inter";
  const larg = lista.map((a) => medidor.measureText(a.titulo).width + a.titulo.length * 1.0 + 6);
  ctx.aCada((t) => {
    if (t < lista[0].t || (p.some && t >= p.some)) { raiz.style.opacity = "0"; return; }
    let k = 0; for (let i = 0; i < lista.length; i++) if (t >= lista[i].t) k = i;
    const a = lista[k], dt = t - a.t;
    const e0 = eo(prog(t, lista[0].t, 0.45));
    raiz.style.opacity = String(Math.min(1, prog(t, lista[0].t, 0.12)));
    raiz.style.transform = `translateY(${(1 - e0) * -40}px)`;
    // contagem
    let n = k + (p.base ?? 0), nTxt = a.n;
    if (p.corrida && t >= p.corrida.de) { const kk = ein(prog(t, p.corrida.de, p.corrida.ate - p.corrida.de)); n = Math.round(p.corrida.ini + kk * (p.corrida.fim - p.corrida.ini)); nTxt = String(n).padStart(2, "0"); }
    num.textContent = "ABA " + nTxt;
    // rótulo: o novo sobe de baixo
    const e = eo(prog(dt, 0, 0.30));
    tit.textContent = a.titulo;
    const w0 = k > 0 ? larg[k - 1] : 0;
    caixa.style.width = (w0 + (larg[k] - w0) * e) + "px";
    tit.style.transform = `translateY(${(1 - e) * 58}px)`;
    pill.style.borderBottomColor = dt < 0.5 ? "#FFFFFF" : "#F5B84D";
    selo.style.transform = `rotate(${(1 - eo(prog(dt, 0, 0.45))) * -180}deg)`;
    const vis = p.corrida && t >= p.corrida.de ? n : (k + 1);
    for (let i = 0; i < N; i++) {
      const q = qs[i];
      if (i >= vis) { q.style.opacity = "0"; continue; }
      q.style.opacity = "1";
      const novo = i === vis - 1 && (dt < 0.6 || (p.corrida && t >= p.corrida.de));
      q.style.background = novo ? "#F5B84D" : "#DA291C";
      q.style.transform = i === k && dt < 0.3 && !(p.corrida && t >= p.corrida.de) ? `scale(${1 + (1 - eo(prog(dt, 0, 0.3))) * 1.6})` : "";
    }
  });
}
