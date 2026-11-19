// HUD: camada de interface por cima da cena (REC, timecode, quadro, rótulo, cantoneiras da zona segura).
// O HUD é decorativo: fica isento da zona segura de texto (desenha a moldura dela), mas NUNCA pode encostar em texto.
// Por isso cada peça leva a classe .mk-hud e o checar mede a regra "sem-colisao" em todo quadro.
// Os números vêm do tempo t, então o HUD é verdadeiro em todo quadro.
// props:
//   rotulo: "CREAT NUVEM // MOTION"   direita: "1080×1920 · 30P"
//   rec: true   timecode: true   quadro: true   cantos: true
//   linhas: ["CADA QUADRO = f(t)"] textos extras em mono embaixo do rótulo (no topo), que aparecem decodificando
//   (rótulo e linhas ficam no topo para não brigar com chip e legenda na parte de baixo)
//   opacidade: 0.85
//   cede: true  (padrão) cada peça do HUD que cair em cima de um texto de outra camada (.mk-chip, .mk-display,
//         .mk-leg) apaga em 0,18 s antes de o texto entrar e volta quando ele sai. false desliga.
export default function hud(ctx, c) {
  const { el, tl, EASE, W, H, ZONA, semente, prog, ease } = ctx;
  const p = c.props;
  const raiz = el("div", "", c.el, { position: "absolute", inset: "0", opacity: String(p.opacidade ?? 0.85) });
  const topo = ZONA.topo + 24, base = H - ZONA.base - 24, esq = 64, dir = W - ZONA.direita - 8;
  const mono = (css) => el("div", "mk-dado mk-hud", raiz, { position: "absolute", fontSize: "24px", color: "rgba(241,235,226,0.9)", ...css });

  if (p.cantos !== false) {
    const quad = [["no", esq - 20, topo - 20], ["ne", dir - 46, topo - 20], ["so", esq - 20, base - 26], ["se", dir - 46, base - 26]];
    quad.forEach(([q, x, y], i) => {
      const k = el("div", `mk-canto mk-hud ${q}`, raiz, { left: x + "px", top: y + "px", width: "46px", height: "46px", borderColor: "rgba(241,235,226,0.55)", borderWidth: "0" });
      if (q.includes("n")) k.style.borderTopWidth = "3px"; else k.style.borderBottomWidth = "3px";
      if (q.includes("o")) k.style.borderLeftWidth = "3px"; else k.style.borderRightWidth = "3px";
      const sx = q.includes("o") ? -30 : 30, sy = q.includes("n") ? -30 : 30;
      tl.fromTo(k, { x: sx, y: sy, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: EASE.chegada }, c.de + i * 0.04);
    });
  }

  // auto-ajuste (zona segura, ctx.caber): o HUD é isento só nas cantoneiras; os textos dele ficam dentro da zona.
  // Rótulo e linhas extras (24 px, mono) que não cabem até a coluna de botões encolhem até 16 px e, no fim, levam reticências.
  const limTexto = W - ZONA.direita - (esq + 16) - 8;
  const caberMono = (txt, largura, maiusc = true) => {
    const r = ctx.caber(txt, { fonte: "700 'JetBrains Mono'", ls: 0.08, largura, max: 24, min: 18, piso: 16, maiusculas: maiusc });
    return { px: r.px, t: r.cortado ? r.linhas[0] : txt };
  };
  const textos = [];
  let rec = null, tc = null, qd = null;
  if (p.rec !== false) {
    rec = mono({ left: esq + 16 + "px", top: topo + 6 + "px" });
    rec.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:var(--mk-ponto);margin-right:12px;vertical-align:1px"></span>REC';
    textos.push(rec);
  }
  if (p.timecode !== false) { tc = mono({ left: esq + 130 + "px", top: topo + 6 + "px" }); textos.push(tc); }
  if (p.direita !== false) {
    const a = caberMono(p.direita ?? `${W}×${H} · ${ctx.fps}P`, dir - 12 - (esq + 130 + 260));
    const d = mono({ right: W - dir + 12 + "px", top: topo + 6 + "px", textAlign: "right", fontSize: a.px + "px" }); d.textContent = a.t; textos.push(d);
  }
  if (p.rotulo) { const a = caberMono(p.rotulo, limTexto); const r = mono({ left: esq + 16 + "px", top: topo + 52 + "px", color: "rgba(241,235,226,0.6)", fontSize: a.px + "px" }); r.textContent = a.t; textos.push(r); }
  if (p.quadro !== false) { qd = mono({ right: W - dir + 12 + "px", top: base - 34 + "px", color: "var(--mk-destaque)" }); textos.push(qd); }
  const extras = (p.linhas ?? []).map((txt, i) => {
    const a = caberMono(txt, limTexto, false);
    const e = mono({ left: esq + 16 + "px", top: topo + 52 + (i + 1) * 38 + "px", color: "rgba(245,184,77,0.8)", textTransform: "none", fontSize: a.px + "px" });
    e.dataset.alvo = a.t; return e;
  });
  tl.fromTo(textos, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "none", stagger: 0.05 }, c.de + 0.1);

  // o HUD cede: mede (na montagem) onde estão os textos das outras camadas e apaga a peça que encostaria neles
  if (p.cede !== false) {
    const folga = 48; // respiro visual: peça do HUD a menos de 48 px de um texto também sai (nada de dois cantos "se beijando")
    const pecas = [...raiz.querySelectorAll(".mk-hud")];
    // mede na posição de repouso: tira por um instante os deslocamentos de entrada (transform) que o GSAP já aplicou
    const soltos = [...pecas, ...ctx.palco.querySelectorAll(".mk-chip .mk-canto")];
    const guardado = soltos.map((e) => e.style.transform);
    soltos.forEach((e) => { e.style.transform = "none"; });
    // textos que só ganham conteúdo no seek: mede com o tamanho de um valor real
    if (tc) tc.textContent = "00:00:00:00";
    if (qd) qd.textContent = "Q 0000";
    for (const e of extras) e.textContent = e.dataset.alvo;
    const caixa = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    const unir = (e) => { let b = caixa(e); for (const k of e.querySelectorAll(".mk-canto")) { const d = caixa(k); b = [Math.min(b[0], d[0]), Math.min(b[1], d[1]), Math.max(b[2], d[2]), Math.max(b[3], d[3])]; } return b; };
    const textos = [...ctx.palco.querySelectorAll(".mk-chip:not(.mk-camada), .mk-display, .mk-leg")].filter((e) => !c.el.contains(e) && !e.closest(".mk-transicao"));
    for (const peca of pecas) {
      const a = caixa(peca);
      const janelas = [];
      for (const e of textos) {
        const cam = ctx.camadas[e.closest(".mk-camada")?.dataset.id];
        if (!cam || cam.ate <= c.de || cam.de >= c.ate) continue;
        const b = unir(e);
        if (b[2] - b[0] < 1 || b[3] - b[1] < 1) continue; // ainda escondido na montagem
        if (a[0] - folga < b[2] && b[0] < a[2] + folga && a[1] - folga < b[3] && b[1] < a[3] + folga) janelas.push([cam.de, cam.ate]);
      }
      janelas.sort((x, y) => x[0] - y[0]);
      const juntas = [];
      for (const j of janelas) { const u = juntas[juntas.length - 1]; if (u && j[0] <= u[1] + 0.3) u[1] = Math.max(u[1], j[1]); else juntas.push([...j]); }
      if (!juntas.length) continue;
      // a peça vai para dentro de um invólucro só dela: a entrada (timeline) mexe na opacidade da peça e o "cede"
      // mexe na do invólucro, como função pura de t; as duas nunca brigam, em qualquer ordem de seek
      const inv = el("div", "", raiz, { position: "absolute", inset: "0", pointerEvents: "none" });
      inv.appendChild(peca);
      const sai = ease(EASE.saida), volta = ease(EASE.chegada);
      ctx.aCada((t) => {
        let f = 1;
        for (const [de, ate] of juntas) {
          if (t < de - 0.18 || t >= ate + 0.25) continue;
          f = Math.min(f, t < de ? 1 - sai(prog(t, de - 0.18, 0.18)) : t < ate ? 0 : volta(prog(t, ate, 0.25)));
        }
        inv.style.opacity = String(f);
      });
    }
    soltos.forEach((e, i) => { e.style.transform = guardado[i]; });
  }

  const glifos = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#";
  const pad = (n, k = 2) => String(n).padStart(k, "0");
  ctx.aCada((t) => {
    const q = Math.round(t * ctx.fps);
    if (tc) tc.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t) % 60)}:${pad(q % ctx.fps)}`;
    if (qd) qd.textContent = `Q ${pad(q, 4)}`;
    if (rec) rec.firstChild.style.opacity = Math.floor(t * 2) % 2 === 0 ? "1" : "0.25";
    // linhas extras decodificam uma vez (efeito scramble), depois ficam paradas
    extras.forEach((e, i) => {
      const k = prog(t, c.de + 0.3 + i * 0.25, 0.5);
      const alvo = e.dataset.alvo; const r = semente(q * 17 + i);
      let s = "";
      for (let j = 0; j < alvo.length; j++) s += k >= 1 || j < k * alvo.length || alvo[j] === " " ? alvo[j] : glifos[Math.floor(r() * glifos.length)];
      e.textContent = k <= 0 ? "" : s;
    });
  });
}
