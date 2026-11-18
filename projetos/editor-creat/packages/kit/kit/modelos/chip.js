// CHIP DE NOME (lower third) com cantoneiras vermelhas e a Aba 71 como selo.
// props:
//   nome: "Marcos"   cargo: "creat.MTT" (só o papel que a pessoa disse ter)
//   x: px da esquerda (ZONA.margem = 84)
//   y: px do topo da placa (padrão: a base da placa encosta no limite de baixo da zona segura, y 1480)
//   largura: largura máxima da placa em px (padrão: até x = 960, a borda da coluna de botões)
//   aba: true (selo "c." à esquerda do nome)   ponto: true (ponto vermelho no fim do nome)
//   saida: true (sai sozinho no fim da camada)
// A placa nunca passa da largura máxima: nome e cargo encolhem para caber (nome 74 -> 44 px, cargo 27 -> 18 px).
// O HUD sai da frente sozinho enquanto o chip está no ar (ver hud.js, prop "cede").
export default function chip(ctx, c) {
  const { el, tl, EASE, cantos, aba, W, H, ZONA, medir } = ctx;
  const p = c.props;
  const x = p.x ?? ZONA.margem;
  const largMax = Math.min(p.largura ?? Infinity, W - ZONA.direita - x);
  const caixa = el("div", "mk-chip", c.el, { position: "absolute", left: x + "px", top: "0px", maxWidth: largMax + "px" });
  const placa = el("div", "", caixa, {
    position: "relative", display: "flex", alignItems: "center", gap: "26px",
    padding: "26px 40px 26px 26px", background: "var(--mk-vidro)", backdropFilter: "blur(14px)",
    borderRadius: "6px", boxShadow: "0 20px 50px rgba(0,0,0,0.35)", boxSizing: "border-box", maxWidth: largMax + "px",
  });
  const selo = p.aba !== false ? aba(placa, 92, { position: "relative", flex: "0 0 auto" }) : null;
  const textos = el("div", "", placa, { minWidth: "0", overflow: "hidden" });

  // largura útil para o texto = placa - respiros - selo
  const util = largMax - 26 - 40 - (selo ? 92 + 26 : 0);
  const txtNome = (p.nome ?? "") + (p.ponto !== false ? "." : "");
  let pxNome = Math.max(44, Math.min(74, Math.floor((74 * util) / Math.max(1, medir(txtNome.toUpperCase(), "Anton", 74) * 1.01))));
  // auto-ajuste (ctx.caber): nome que não cabe nem a 44 px quebra em 2 linhas (antes a placa recortava o nome em silêncio)
  let quebraNome = -1; // índice do caractere onde começa a 2ª linha
  if (medir(txtNome.toUpperCase(), "Anton", pxNome) * 1.01 > util + 0.5) {
    const r = ctx.caber(txtNome, { largura: util / 1.01, max: 74, min: 44, piso: 30, linhas: 2, maiusculas: true });
    pxNome = r.px;
    if (r.quebrou) quebraNome = r.linhas[0].length + 1;
  }
  const txtCargo = p.cargoCru ? (p.cargo ?? "") : (p.cargo ?? "").toUpperCase();
  const regua = document.createElement("canvas").getContext("2d");
  const largCargo = (px) => { regua.font = `500 ${px}px Inter`; return regua.measureText(txtCargo).width; };
  let pxCargo = 27;
  while (pxCargo > 18 && largCargo(pxCargo) + 0.16 * pxCargo * txtCargo.length > util) pxCargo--;
  // cargo que não cabe nem a 18 px vai para 2 linhas; só o que passar disso leva reticências
  let linhasCargo = null;
  if (largCargo(pxCargo) + 0.16 * pxCargo * txtCargo.length > util) {
    const r = ctx.caber(txtCargo, { fonte: p.cargoCru ? "900 Inter" : "500 Inter", ls: p.cargoCru ? 0.10 : 0.16, largura: util, max: 18, min: 18, piso: 16, linhas: 2 });
    pxCargo = r.px; linhasCargo = r.linhas;
  }

  const nome = el("div", "mk-display", textos, { fontSize: pxNome + "px", lineHeight: "0.95", overflow: "hidden", paddingBottom: "4px" });
  const letras = [];
  [...(p.nome ?? "")].forEach((ch, i) => {
    if (i === quebraNome) el("br", "", nome);
    if (i === quebraNome - 1 && ch === " ") return; // o espaço da quebra não vira letra no começo da 2ª linha
    const s = el("span", "", nome, { display: "inline-block", whiteSpace: "pre" });
    s.textContent = ch; letras.push(s);
  });
  if (p.ponto !== false) { const pt = el("span", "mk-ponto", nome, { display: "inline-block" }); pt.textContent = "."; letras.push(pt); }
  const cargo = el("div", "", textos, {
    font: `500 ${pxCargo}px/1.2 'Inter', sans-serif`, letterSpacing: p.cargoCru ? "0.10em" : "0.16em", textTransform: p.cargoCru ? "none" : "uppercase", fontWeight: p.cargoCru ? "900" : "500",
    color: "var(--mk-destaque)", marginTop: "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  });
  cargo.textContent = p.cargo ?? "";
  if (linhasCargo) { cargo.style.whiteSpace = "pre"; cargo.textContent = linhasCargo.join("\n"); }
  const cs = cantos(caixa, { arm: 30, esp: 6, folga: 12 });

  // posição vertical: o pedido, ou a base da placa no limite da zona segura
  const y = p.y ?? Math.round(H - ZONA.base - caixa.offsetHeight);
  caixa.style.top = y + "px";

  const t0 = c.de;
  tl.fromTo(placa, { clipPath: "inset(0% 100% 0% 0% round 6px)" }, { clipPath: "inset(0% 0% 0% 0% round 6px)", duration: 0.5, ease: EASE.chegada }, t0 + 0.06);
  tl.fromTo(cs.no, { x: -26, y: -26, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.42, ease: EASE.chegada }, t0);
  tl.fromTo(cs.se, { x: 26, y: 26, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.42, ease: EASE.chegada }, t0 + 0.04);
  if (selo) tl.fromTo(selo, { scale: 0.2, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.5, ease: EASE.mola }, t0 + 0.1);
  tl.fromTo(letras, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: EASE.chegada, stagger: ctx.DUR.letra }, t0 + 0.16);
  tl.fromTo(cargo, { opacity: 0, filter: "blur(6px)", x: -10 }, { opacity: 1, filter: "blur(0px)", x: 0, duration: 0.35, ease: EASE.chegada }, t0 + 0.34);
  ctx.cue(t0 + 0.06, "chip", -8);

  if (p.saida !== false) {
    const s = c.ate - 0.3;
    tl.to(placa, { clipPath: "inset(0% 0% 0% 100% round 6px)", duration: 0.26, ease: EASE.saida, immediateRender: false }, s);
    tl.to([cs.no, cs.se], { opacity: 0, duration: 0.2, ease: EASE.saida, immediateRender: false }, s + 0.04);
  }
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-display`, de: c.de + 0.7, ate: c.ate - 0.35 });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-chip`, de: c.de + 0.7, ate: c.ate - 0.35 });
}
