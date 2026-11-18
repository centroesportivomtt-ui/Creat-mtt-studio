// FUNDO: placa de fundo da cena. Fica fora do render com alfa (overlay).
// props:
//   tipo: "grafite" (preto + brilho radial) | "codigo" (código real rolando em perspectiva) | "imagem"
//   brilho: cor do brilho radial (padrão âmbar), forca: 0..1 (0.18 padrão; abaixo de 0.15 some no H.264)
//   centro: [x, y] do brilho em fração do quadro
//   grao: opacidade do grão de filme (0.07 padrão; quebra o banding do H.264)
//   src: imagem (tipo "imagem"); empurrar: escala final do push lento (1.06)
//   arquivo: fonte do código mostrado (tipo "codigo"), velocidade: px por segundo
//   tinta: opacidade do código (0.20 padrão; atrás de legenda use 0.10 a 0.13 para o texto da frente ganhar)
//   calma: [y0, y1] faixa (fração da altura) com véu escuro em elipse (62%) atrás da legenda
export default async function fundo(ctx, c) {
  const { el, W, H, tl, EASE } = ctx;
  const p = c.props;
  const raiz = c.el;
  raiz.style.background = p.cor ?? "#0B0B0C";

  if (p.tipo === "imagem" && p.src) {
    const img = el("img", "", raiz, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" });
    img.src = p.src;
    await img.decode().catch(() => {});
    tl.fromTo(img, { scale: 1 }, { scale: p.empurrar ?? 1.06, duration: c.ate - c.de, ease: EASE.linear }, c.de);
  }

  if (p.tipo === "codigo") {
    const caixa = el("div", "", raiz, {
      position: "absolute", left: "-10%", right: "-10%", top: "-30%", bottom: "-5%",
      transform: "perspective(1100px) rotateX(24deg)", transformOrigin: "50% 100%",
      maskImage: "linear-gradient(to bottom, transparent 0%, #000 38%, #000 78%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 38%, #000 78%, transparent 100%)",
    });
    const pre = el("pre", "", caixa, {
      margin: "0", padding: "0 14%", font: "700 30px/1.55 'JetBrains Mono', monospace",
      color: `rgba(241,235,226,${p.tinta ?? 0.2})`, whiteSpace: "pre", position: "absolute", top: "0", left: "0", right: "0",
    });
    let texto = p.texto;
    if (!texto && p.arquivo) texto = await (await fetch(p.arquivo)).text();
    texto = (texto ?? "").split("\n").filter((l) => l.trim()).slice(0, 140).join("\n");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const kw = Math.min(0.45, (p.tinta ?? 0.2) * 2.25);
    pre.innerHTML = esc(texto).replace(/\b(tl|gsap|seek|const|return|await|ease|expo\.out|power3\.in)\b/g,
      `<span style="color:rgba(245,184,77,${kw})">$1</span>`);
    const v = p.velocidade ?? 70;
    ctx.aCada((t) => { pre.style.transform = `translateY(${-(t - c.de) * v}px)`; });
    if (p.calma) {
      // véu escuro em elipse (radial, pela regra da casa: gradiente linear largo faz banding no H.264)
      const [a, b] = p.calma.map((f) => f * 100);
      el("div", "", raiz, { position: "absolute", inset: "0",
        background: `radial-gradient(ellipse 62% ${(b - a) * 0.9}% at 50% ${(a + b) / 2}%, rgba(11,11,12,0.62) 0%, rgba(11,11,12,0.62) 45%, rgba(11,11,12,0) 100%)` });
    }
  }

  // brilho radial (radial não faz banding como o gradiente linear de tela cheia)
  const [cx, cy] = p.centro ?? [0.5, 0.45];
  const forca = p.forca ?? 0.18;
  const cor = p.brilho ?? "245,184,77";
  el("div", "", raiz, {
    position: "absolute", inset: "0",
    background: `radial-gradient(ellipse 75% 45% at ${cx * 100}% ${cy * 100}%, rgba(${cor},${forca}) 0%, rgba(${cor},${forca * 0.35}) 45%, rgba(${cor},0) 100%)`,
  });
  if (p.vinheta !== false) {
    el("div", "", raiz, { position: "absolute", inset: "0", background: "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" });
  }

  // grão de filme determinístico: 4 ladrilhos com semente, trocados por quadro
  const g = p.grao ?? 0.07;
  if (g > 0) {
    const ladrilhos = [];
    for (let k = 0; k < 4; k++) {
      const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      const x = cv.getContext("2d"); const im = x.createImageData(256, 256); const r = ctx.semente(911 + k);
      for (let i = 0; i < im.data.length; i += 4) { const v = (r() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); ladrilhos.push(`url(${cv.toDataURL()})`);
    }
    const grao = el("div", "", raiz, { position: "absolute", inset: "0", opacity: String(g), mixBlendMode: "overlay" });
    const r = ctx.semente(77);
    const offs = Array.from({ length: 64 }, () => [Math.floor(r() * 256), Math.floor(r() * 256)]);
    ctx.aCada((t) => {
      const q = Math.round(t * ctx.fps);
      grao.style.backgroundImage = ladrilhos[q % 4];
      const [ox, oy] = offs[q % 64];
      grao.style.backgroundPosition = `${ox}px ${oy}px`;
    });
  }
}
