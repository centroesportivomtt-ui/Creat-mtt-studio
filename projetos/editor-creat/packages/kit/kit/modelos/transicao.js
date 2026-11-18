// TRANSIÇÕES com causa. A camada de transição atua sobre outras camadas pelo id.
// props comuns: tipo, corte (tempo absoluto do corte), sai: [ids], entra: [ids]
//   whip:    chicote horizontal; quem sai arrasta e borra, quem entra chega borrado e foca. direcao: "esq" | "dir"
//   mascara: cortina diagonal com faixa vermelha na borda; quem entra é revelado. angulo (graus, 14)
//   aba71:   a etiqueta Aba 71 gira na tela, a câmera mergulha no ponto preto e a cena nova abre em íris
//            tamanho (px, 560), cy (fração da altura, 0.5), giro: momento do giro (tempo local)
export default function transicao(ctx, c) {
  const p = c.props;
  if (p.tipo === "whip") return whip(ctx, c, p);
  if (p.tipo === "mascara") return mascara(ctx, c, p);
  if (p.tipo === "aba71") return aba71(ctx, c, p);
  throw new Error("transição desconhecida: " + p.tipo);
}

const alvos = (ctx, ids = []) => ids.map((id) => ctx.camadas[id]?.el).filter(Boolean);

function whip(ctx, c, p) {
  const { tl, W, el, blurDirecional, prog, ease } = ctx;
  const corte = p.corte ?? (c.de + c.ate) / 2;
  const s = p.direcao === "dir" ? 1 : -1;
  const sai = alvos(ctx, p.sai), entra = alvos(ctx, p.entra);
  const dSai = corte - c.de, dEntra = c.ate - corte;
  const fin = ease("power3.in"), fout = ease("expo.out");
  const filtros = new Map();
  for (const e of [...sai, ...entra]) filtros.set(e, blurDirecional());
  ctx.aCada((t) => {
    for (const e of sai) {
      const f = filtros.get(e);
      if (t < c.de || t >= corte) { e.style.transform = ""; e.style.filter = ""; continue; }
      const k = fin(prog(t, c.de, dSai));
      e.style.transform = `translateX(${s * k * W * 0.6}px)`;
      f.aplicar(k * 60); e.style.filter = f.url;
    }
    for (const e of entra) {
      const f = filtros.get(e);
      if (t < corte || t >= c.ate) { e.style.transform = ""; e.style.filter = ""; continue; }
      const k = fout(prog(t, corte, dEntra));
      e.style.transform = `translateX(${-s * (1 - k) * W * 0.6}px)`;
      f.aplicar((1 - k) * 60); e.style.filter = f.url;
    }
  });
  // riscos de luz que vendem a velocidade
  const r = ctx.semente(31);
  const riscos = [];
  for (let i = 0; i < 7; i++) {
    const h = 3 + Math.floor(r() * 10);
    const cor = i % 3 === 0 ? "rgba(245,184,77,0.85)" : "rgba(255,255,255,0.55)";
    riscos.push({ e: el("div", "", c.el, { position: "absolute", left: "0", top: (300 + r() * 1300) + "px", width: (500 + r() * 900) + "px", height: h + "px", background: cor, borderRadius: h + "px", filter: "blur(2px)" }), atraso: r() * 0.08, vel: 0.8 + r() * 0.6 });
  }
  ctx.aCada((t) => {
    for (const q of riscos) {
      const k = prog(t, corte - 0.12 + q.atraso, 0.24 / q.vel);
      q.e.style.opacity = k > 0 && k < 1 ? String(Math.sin(k * Math.PI)) : "0";
      q.e.style.transform = `translateX(${s < 0 ? W - k * (W + 1500) : -1500 + k * (W + 1500)}px)`;
    }
  });
  ctx.cue(corte - 0.1, "whip", -2);
}

function mascara(ctx, c, p) {
  const { el, W, H, prog, ease } = ctx;
  const entra = alvos(ctx, p.entra);
  const ang = ((p.angulo ?? 14) * Math.PI) / 180;
  const inc = Math.tan(ang) * H; // deslocamento horizontal da borda entre topo e base
  const f = ease(p.ease ?? "expo.inOut");
  const faixa = el("div", "", c.el, { position: "absolute", top: "-10%", height: "120%", width: "46px", background: "var(--mk-ponto)", transformOrigin: "50% 50%", boxShadow: "0 0 40px rgba(255,26,26,0.55)" });
  const fio = el("div", "", c.el, { position: "absolute", top: "-10%", height: "120%", width: "8px", background: "var(--mk-destaque)" });
  const dur = c.ate - c.de;
  ctx.aCada((t) => {
    const k = f(prog(t, c.de, dur));
    // borda vai de x = -inc (fora, à esquerda) até x = W + inc
    const xb = -inc + k * (W + 2 * inc);
    const topo = xb + inc / 2, base = xb - inc / 2;
    for (const e of entra) {
      e.style.clipPath = t >= c.ate ? "" : `polygon(0px 0px, ${topo}px 0px, ${base}px ${H}px, 0px ${H}px)`;
    }
    const vis = t >= c.de && t < c.ate && k > 0 && k < 1;
    faixa.style.opacity = fio.style.opacity = vis ? "1" : "0";
    faixa.style.transform = `translateX(${xb - 23}px) rotate(${(ang * 180) / Math.PI}deg)`;
    fio.style.transform = `translateX(${xb - 23 - 34}px) rotate(${(ang * 180) / Math.PI}deg)`;
  });
  ctx.cue(c.de + dur * 0.25, "mascara", -4);
}

function aba71(ctx, c, p) {
  const { el, tl, W, H, aba, prog, ease, EASE } = ctx;
  const S = p.tamanho ?? 560;
  const cy = H * (p.cy ?? 0.5);
  const entra = alvos(ctx, p.entra), sai = alvos(ctx, p.sai);
  const palco = el("div", "", c.el, { position: "absolute", inset: "0", perspective: "1600px" });
  // frente "c." e verso "71"
  const cartao = el("div", "", palco, { position: "absolute", left: W / 2 - S / 2 + "px", top: cy - S / 2 + "px", width: S + "px", height: S + "px", transformStyle: "preserve-3d" });
  const frente = aba(cartao, S, { left: "0", top: "0", backfaceVisibility: "hidden" });
  const verso = el("div", "mk-aba", cartao, { left: "0", top: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)" });
  verso.style.setProperty("--s", S + "px");
  const n71 = el("div", "mk-display", verso, { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: S * 0.5 + "px", color: "var(--mk-off)" });
  n71.innerHTML = 'ABA<span style="display:inline-block;width:.18em"></span>71';
  n71.style.fontSize = S * 0.3 + "px";
  // íris: a cena nova abre a partir do centro do ponto
  const anel = el("div", "", c.el, { position: "absolute", left: "0", top: "0", width: "10px", height: "10px", borderRadius: "50%", border: "10px solid var(--mk-ponto)", opacity: "0" });
  const preto = el("div", "", c.el, { position: "absolute", inset: "0", background: "#111", opacity: "0" });

  const t0 = c.de;
  const aparece = p.aparece ?? 0.14;         // cartão nasce sobre as partículas
  const giro = t0 + (p.giro ?? 0.12);         // começa a girar
  const dGiro = p.durGiro ?? 0.46;
  const mergulho = giro + dGiro + (p.pausa ?? 0.06);       // câmera mergulha no ponto
  const dMerg = p.durMergulho ?? 0.3;
  const corte = mergulho + dMerg;
  const dIris = c.ate - corte;
  // ponto preto em coordenadas do quadro (centro do .d)
  const dx = W / 2 - S / 2 + S * (0.606 + 0.075), dy = cy - S / 2 + S * (0.516 + 0.075);

  tl.fromTo(cartao, { opacity: 0 }, { opacity: 1, duration: aparece, ease: "none" }, t0);
  tl.fromTo(cartao, { rotationY: 0 }, { rotationY: 360, duration: dGiro, ease: "power3.inOut" }, giro);
  tl.fromTo(cartao, { scale: 1 }, { scale: 0.86, duration: dGiro / 2, ease: "power2.out", yoyo: true, repeat: 1 }, giro);
  // mergulho: escala enorme com origem no ponto
  const fm = ease(EASE.saida), fi = ease("expo.out");
  ctx.aCada((t) => {
    const k = prog(t, mergulho, dMerg);
    if (t >= mergulho && t < corte) {
      const esc = 1 + fm(k) * 70;
      palco.style.transform = `scale(${esc})`;
      palco.style.transformOrigin = `${dx}px ${dy}px`;
    } else if (t < mergulho) { palco.style.transform = ""; }
    preto.style.opacity = t >= corte - 0.05 && t < corte ? "1" : "0";
    palco.style.display = t >= corte ? "none" : "";
    // íris a partir do ponto
    const ki = fi(prog(t, corte, dIris));
    const rMax = Math.hypot(Math.max(dx, W - dx), Math.max(dy, H - dy));
    const raio = ki * rMax;
    for (const e of entra) e.style.clipPath = t >= corte && t < c.ate ? `circle(${raio}px at ${dx}px ${dy}px)` : (t < corte && t >= c.de ? "circle(0px at 0px 0px)" : "");
    for (const e of sai) e.style.opacity = t >= corte ? "0" : "";
    const va = t >= corte && t < c.ate;
    anel.style.opacity = va ? String(1 - ki) : "0";
    anel.style.transform = `translate(${dx - raio - 10}px, ${dy - raio - 10}px)`;
    anel.style.width = anel.style.height = 2 * raio + "px";
  });
  ctx.cue(giro, "giro", -4);
  ctx.cue(mergulho, "mergulho", -2);
  ctx.cue(corte, "abre", 0);
}
