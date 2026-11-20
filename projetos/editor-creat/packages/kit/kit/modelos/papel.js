// PAPEL: telas de papel fotográfico que cobrem o vídeo. Três modos, todos os tempos por props.
//
// modo "folha" (folha de contato):
//   {modo:"folha", cel:[180,320], gap:16, x0:156, y0:300, cols:4, base?: pasta das imagens,
//    imagens:["q_0000.jpg", "VELADO", ...], numeros?: [..] (padrão 01..N),
//    rabiscos:[{tipo:"circulo", idx:1, de, texto?}, {tipo:"palavra", idx:[4,6,9], de, texto}],
//    zoom:{idx:8, de, dur:0.45, escala:6}}
//   Imagem: caminho relativo ao kit, absoluto (/...), file://..., /@abs/..., http(s) ou data:. Com `base`, nomes
//   relativos são lidos de base/nome. "VELADO" = quadro preto #120D0A com faixa de véu laranja.
//   Cada quadro: borda preta de 10 px (26 px embaixo, com o número em Special Elite 18); área da foto em 9:16.
//   Fundo #EFE6D4 com fibra a 6%. Rabiscos a lápis #9E1B12. Zoom: escala até `escala` (6) com expo.in levando o centro
//   do quadro idx para (540, 960); termina em corte casado com o vídeo (o fim é `ate` da camada).
//
// modo "envelope" (tela do celular substituta):
//   {modo:"envelope", entrada:{de, dur:0.4}, aba:"Aba 71", topo:"ficha de revelação · 18.11", titulo:"Homenagem",
//    fita:{texto:"surpresa", de, ate},
//    itens:[{texto, y (linha de base), de (tinta 25%→100% em 0,2 s), sublinhas?:[{de, palavra?}], final?:true,
//            lapis?:{texto:"em aberto", de, ate}}],
//    apaga: tempo em que a luz apaga (fade para #120D0A em 0,12 s)}
//   Sem `sublinhas`, o item inteiro é sublinhado no próprio `de` (0,3 s). Item final: Instrument Serif Itálico 56 #9E1B12,
//   sem sublinhado, com o lápis ao lado. Entrada: escala 1,04 → 1 e giro −2,5° → 0 (expo.out).
//
// modo "cartao" (fecho):
//   {modo:"cartao", entrada:{de, dur:0.45}, pergunta:"Quer reconstruir a cena / de alguém querido?", pergunta_de,
//    resposta:"A gente faz.", resposta_de, cta:{texto:"manda **CENA** no direct", de, ate},
//    assinatura:{texto:"creat.MTT", de, ate}, carimbo:{texto:"EM REVELAÇÃO", de, x:600, y:1330, giro:-6}}
//   Pergunta em Instrument Serif Itálico 96 (base da 1ª linha em 700, entrelinha 1,05), resposta Instrument Serif 96
//   (base 960), CTA Special Elite 40 #2B3A67 (base 1100) datilografado, assinatura a lápis Caveat Brush 72 giro −4° (base 1240).
import { COR, FONTE, papel as fundoPapel, baseNoTopo, largura, datilografar, carimbo, lapis, vozAnimada } from "../revelacao_comum.js";

function urlImagem(src, base) {
  if (/^(https?:|data:|\/@abs\/)/.test(src)) return src;
  if (src.startsWith("file://")) return "/@abs" + decodeURIComponent(src.slice(7));
  if (src.startsWith("/")) return "/@abs" + src;
  if (base) {
    const b = base.replace(/\/$/, "");
    return urlImagem(`${b}/${src}`, null);
  }
  return src; // relativo ao kit (servido na raiz)
}

export default async function papel(ctx, c) {
  const p = c.props;
  c.el.style.pointerEvents = "none";
  if (p.modo === "folha") await folha(ctx, c, p);
  else if (p.modo === "envelope") envelope(ctx, c, p);
  else if (p.modo === "cartao") cartao(ctx, c, p);
  else throw new Error("papel: modo desconhecido " + p.modo);
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-texto`, de: c.de, ate: c.ate });
}

// entrada da folha inteira: escala e giro com expo.out
function entradaFolha(ctx, alvo, { de, dur = 0.4, escala = 1.04, giro = -2.5, dy = 0 }) {
  const e = ctx.ease("expo.out");
  ctx.aCada((t) => {
    const k = e(ctx.clamp((t - de) / dur));
    alvo.style.transform = k >= 1 ? "none" : `translateY(${(dy * (1 - k)).toFixed(2)}px) rotate(${(giro * (1 - k)).toFixed(3)}deg) scale(${(escala + (1 - escala) * k).toFixed(4)})`;
  });
}

function abaPapel(ctx, pai, texto = "Aba 71") {
  const a = ctx.el("div", "mk-aba-papel", pai, { position: "absolute", left: "96px", top: "300px", width: "210px", height: "64px", background: COR.luz,
    transform: "rotate(-2deg)", boxShadow: "0 2px 5px rgba(18,13,10,0.22)", display: "flex", alignItems: "center", justifyContent: "center" });
  const t = ctx.el("span", "mk-texto", a, { font: `400 30px/1 ${FONTE.arquivo}`, color: COR.papel, letterSpacing: "0.04em", whiteSpace: "pre" });
  t.textContent = texto;
  return a;
}

// texto posicionado pela linha de base
function textoBase(ctx, pai, { x, base, texto, fam, tam, italico = false, cor, lh = 1, cls = "" }) {
  const e = ctx.el("div", `mk-texto ${cls}`, pai, { position: "absolute", left: x + "px", top: base - baseNoTopo(fam, tam, italico, lh) + "px",
    font: `${italico ? "italic " : ""}400 ${tam}px/${lh} ${fam}`, color: cor, whiteSpace: "pre" });
  e.textContent = texto;
  return e;
}

// ------------------------------------------------------------------ folha de contato
async function folha(ctx, c, p) {
  const { el } = ctx;
  const [cw, ch] = p.cel ?? [180, 320];
  const gap = p.gap ?? 16, x0 = p.x0 ?? 156, y0 = p.y0 ?? 300, cols = p.cols ?? 4;
  const raiz = c.el;
  // dois transforms separados: a ENTRADA (giro e escala pelo centro) fica no invólucro de fora e o ZOOM de ampliador
  // (translate + scale pela origem 0 0) fica na folha; escrever os dois no mesmo elemento fazia um apagar o outro
  const envolve = el("div", "mk-folha-entrada", raiz, { position: "absolute", inset: "0", transformOrigin: "50% 50%" });
  const folhaEl = el("div", "mk-folha", envolve, { position: "absolute", inset: "0", transformOrigin: "0 0" });
  fundoPapel(ctx, folhaEl, {});
  const r = ctx.semente(1717);
  const cel = [];
  const espera = [];
  (p.imagens ?? []).forEach((src, i) => {
    const cx = x0 + (i % cols) * (cw + gap), cy = y0 + Math.floor(i / cols) * (ch + gap);
    const q = el("div", "mk-quadro", folhaEl, { position: "absolute", left: cx + "px", top: cy + "px", width: cw + "px", height: ch + "px",
      background: COR.breu, boxShadow: "0 1px 3px rgba(18,13,10,0.25)" });
    const foto = el("div", "", q, { position: "absolute", left: "10px", top: "10px", right: "10px", bottom: "26px", overflow: "hidden", background: COR.breu });
    if (String(src).toUpperCase() === "VELADO") {
      const ang = 95 + r() * 40, pos = 35 + r() * 30;
      el("div", "", foto, { position: "absolute", inset: "0",
        background: `linear-gradient(${ang.toFixed(0)}deg, rgba(200,116,47,0) ${pos - 22}%, rgba(200,116,47,0.45) ${pos - 8}%, rgba(236,150,70,0.8) ${pos}%, rgba(200,116,47,0.4) ${pos + 9}%, rgba(200,116,47,0) ${pos + 24}%)` });
    } else {
      const img = el("img", "", foto, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" });
      img.src = urlImagem(String(src), p.base);
      espera.push(img.decode().catch(() => console.warn("papel/folha: imagem não carregou " + src)));
    }
    const num = el("div", "", q, { position: "absolute", left: "10px", bottom: "4px", font: `400 18px/1 ${FONTE.arquivo}`, color: "rgba(239,230,212,0.82)", letterSpacing: "0.08em" });
    num.textContent = p.numeros?.[i] ?? String(i + 1).padStart(2, "0");
    cel.push({ x: cx, y: cy, w: cw, h: ch, cx: cx + cw / 2, cy: cy + ch / 2 });
  });
  await Promise.all(espera);

  // rabiscos a lápis (dentro da folha: acompanham o zoom)
  (p.rabiscos ?? []).forEach((rb, i) => {
    const ids = Array.isArray(rb.idx) ? rb.idx : [rb.idx];
    const alvos = ids.map((k) => cel[k]).filter(Boolean);
    if (!alvos.length) return;
    const cor = rb.cor ?? COR.lapisPapel;
    const dur = rb.dur ?? 0.4;
    if (rb.tipo === "circulo") {
      const a = alvos[0];
      lapis(ctx, folhaEl, { tipo: "elipse", de: rb.de, dur, pts: [[a.x - 18, a.y - 16], [a.x + a.w + 18, a.y + a.h + 16]], cor, some: rb.some }, cor, 40 + i);
      if (rb.texto) {
        const tam = rb.tam ?? 60, w = largura(rb.texto, FONTE.lapis, tam);
        const x = Math.min(Math.max(96, a.cx - w / 2), 940 - w);
        lapis(ctx, folhaEl, { tipo: "palavra", de: rb.de + dur * 0.8, dur: rb.durTexto ?? 0.4, pts: [[x, a.y + a.h + 58]], texto: rb.texto, tam, cor, giro: -3, some: rb.some,
          halo: "0 0 3px rgba(239,230,212,0.95), 0 0 10px rgba(239,230,212,0.8)" }, cor, 60 + i);
      }
    } else if (rb.tipo === "palavra") {
      // marca curta em cada quadro (0,16 s cada, em sequência) e a palavra escrita sobre o centro do grupo
      alvos.forEach((a, k) => lapis(ctx, folhaEl, { tipo: "elipse", de: rb.de + k * 0.16, dur: 0.18, pts: [[a.x - 8, a.y - 8], [a.x + a.w + 8, a.y + a.h + 8]], cor, espessura: 6, some: rb.some }, cor, 80 + i * 5 + k));
      const t0 = rb.de + alvos.length * 0.16;
      const mx = alvos.reduce((s, a) => s + a.cx, 0) / alvos.length, my = alvos.reduce((s, a) => s + a.cy, 0) / alvos.length;
      const tam = rb.tam ?? 76, w = largura(rb.texto, FONTE.lapis, tam);
      const x = Math.min(Math.max(96, mx - w / 2), 940 - w);
      // escrito por cima das fotos: halo de papel para ler sobre qualquer quadro
      lapis(ctx, folhaEl, { tipo: "palavra", de: t0, dur: rb.durTexto ?? 0.4, pts: [[x, my + tam * 0.3]], texto: rb.texto, tam, cor, giro: -4, some: rb.some,
        halo: "0 0 3px rgba(239,230,212,0.95), 0 0 10px rgba(239,230,212,0.8)" }, cor, 99 + i);
    } else {
      // qualquer outro tipo de lápis com pts absolutos
      lapis(ctx, folhaEl, { ...rb, cor }, cor, 120 + i);
    }
  });

  // zoom de ampliador no quadro idx
  if (p.zoom && cel[p.zoom.idx]) {
    const z = p.zoom, a = cel[z.idx], S = z.escala ?? 6, e = ctx.ease("expo.in");
    const alvo = z.centro ?? [540, 960];
    ctx.aCada((t) => {
      const k = e(ctx.clamp((t - z.de) / (z.dur ?? 0.45)));
      if (k <= 0) { folhaEl.style.transform = "none"; return; }
      const s = 1 + (S - 1) * k;
      const cx = a.cx + (alvo[0] - a.cx) * k, cy = a.cy + (alvo[1] - a.cy) * k;
      folhaEl.style.transform = `translate(${(cx - s * a.cx).toFixed(2)}px, ${(cy - s * a.cy).toFixed(2)}px) scale(${s.toFixed(4)})`;
    });
    ctx.cue(z.de, "whoosh-grave", -14);
  }
  if (p.entrada) entradaFolha(ctx, envolve, { ...p.entrada, de: p.entrada.de ?? c.de });
}

// ------------------------------------------------------------------ envelope (celular substituto)
function envelope(ctx, c, p) {
  const { el, clamp } = ctx;
  const raiz = c.el;
  const f = el("div", "mk-envelope", raiz, { position: "absolute", inset: "0", transformOrigin: "50% 50%" });
  fundoPapel(ctx, f, { vinheta: true });
  abaPapel(ctx, f, p.aba ?? "Aba 71");
  const topo = el("div", "mk-texto", f, { position: "absolute", left: "96px", top: "400px", font: `400 30px/1 ${FONTE.arquivo}`, color: COR.carimbo, whiteSpace: "pre" });
  topo.textContent = p.topo ?? "ficha de revelação · 18.11";
  textoBase(ctx, f, { x: 96, base: 570, texto: p.titulo ?? "Homenagem", fam: FONTE.voz, tam: 120, cor: COR.breu });

  // fita crepe: nasce em branco; nada desenhado por baixo dela
  const fita = el("div", "mk-fita", f, { position: "absolute", left: "96px", top: "600px", width: "560px", height: "92px", transform: "rotate(-3deg)",
    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" });
  const r = ctx.semente(303);
  const borda = (x, ida) => { const pts = []; for (let i = 0; i <= 9; i++) { const y = (i / 9) * 100; pts.push(`${(x + (ida ? 1 : -1) * r() * 2.2).toFixed(2)}% ${y.toFixed(1)}%`); } return ida ? pts : pts.reverse(); };
  el("div", "", fita, { position: "absolute", inset: "0", background: "repeating-linear-gradient(90deg, rgba(90,70,40,0.035) 0 2px, rgba(0,0,0,0) 2px 9px)",
    backgroundColor: COR.fita, opacity: "0.97", clipPath: `polygon(${[...borda(0.4, true), ...borda(99.6, false)].join(", ")})` });
  if (p.fita?.texto) {
    const tam = 64, w = largura(p.fita.texto, FONTE.lapis, tam);
    lapis(ctx, fita, { tipo: "palavra", de: p.fita.de, dur: Math.max(0.1, (p.fita.ate ?? p.fita.de + 0.45) - p.fita.de), pts: [[Math.max(28, (560 - w) / 2 - 40), 92 * 0.7]],
      texto: p.fita.texto, tam, cor: COR.lapisPapel, giro: -1 }, COR.lapisPapel, 7);
  }

  // fio
  el("div", "", f, { position: "absolute", left: "96px", top: "740px", width: "864px", height: "1px", background: "rgba(18,13,10,0.30)" });

  // itens latentes: a tinta vai de 25% a 100% em 0,2 s na palavra falada; o lápis sublinha a 7 px em 0,3 s
  (p.itens ?? []).forEach((it, i) => {
    const final = !!it.final;
    const fam = final ? FONTE.voz : FONTE.arquivo, tam = final ? 56 : 44, italico = final;
    const cor = final ? COR.lapisPapel : COR.breu;
    const e = textoBase(ctx, f, { x: 96, base: it.y, texto: "", fam, tam, italico, cor, cls: "mk-item" });
    const pal = String(it.texto).split(/(\s+)/).map((w) => { const s = el("span", "", e); s.textContent = w; return s; });
    ctx.aCada((t) => { const k = clamp((t - it.de) / 0.2); e.style.opacity = (0.25 + 0.75 * k).toFixed(4); });
    ctx.cue(it.de, "tinta", -26);
    const yb = it.y;
    const sublinhas = it.sublinhas ?? (final ? [] : [{ de: it.de }]);
    sublinhas.forEach((sb, k) => {
      let x0 = 96, x1 = 96 + e.offsetWidth;
      if (sb.palavra) {
        const alvo = pal.find((s) => s.textContent === sb.palavra);
        if (alvo) { x0 = 96 + alvo.offsetLeft; x1 = x0 + alvo.offsetWidth; }
      }
      lapis(ctx, f, { tipo: "sublinha", de: sb.de, dur: sb.dur ?? 0.3, pts: [[x0 - 6, yb + 13], [x1 + 8, yb + 11]], cor: COR.lapisPapel, espessura: 7 }, COR.lapisPapel, 200 + i * 7 + k);
    });
    if (it.lapis) {
      const tam2 = 64, w = largura(it.lapis.texto, FONTE.lapis, tam2);
      const x = Math.min(96 + e.offsetWidth + 34, 940 - w);
      lapis(ctx, f, { tipo: "palavra", de: it.lapis.de, dur: Math.max(0.1, (it.lapis.ate ?? it.lapis.de + 0.3) - it.lapis.de), pts: [[x, yb + 4]], texto: it.lapis.texto, tam: tam2, cor: COR.lapisPapel, giro: -3 }, COR.lapisPapel, 300 + i);
    }
  });

  entradaFolha(ctx, f, { de: p.entrada?.de ?? c.de, dur: p.entrada?.dur ?? 0.4, escala: 1.04, giro: -2.5 });

  if (p.apaga !== undefined) {
    const pr = el("div", "", raiz, { position: "absolute", inset: "0", background: COR.breu });
    ctx.aCada((t) => { const k = clamp((t - p.apaga) / 0.12); pr.style.opacity = k.toFixed(4); pr.style.display = k > 0 ? "" : "none"; });
    ctx.cue(p.apaga, "interruptor", -10);
  }
}

// ------------------------------------------------------------------ cartão (fecho)
function cartao(ctx, c, p) {
  const { el } = ctx;
  const raiz = c.el;
  const de0 = p.entrada?.de ?? c.de;
  const f = el("div", "mk-cartao", raiz, { position: "absolute", inset: "0", transformOrigin: "50% 60%" });
  fundoPapel(ctx, f, { vinheta: true });
  abaPapel(ctx, f, p.aba ?? "Aba 71");
  ctx.cue(de0, "papel-desliza", -16);

  // pergunta: itálico 96, base da 1ª linha em 700, entrelinha 1,05; reduz o corpo se uma linha passar de x 940
  const linhas = String(p.pergunta ?? "Quer reconstruir a cena / de alguém querido?").split(/\s*\/\s*/);
  let tam = 96;
  const maior = Math.max(...linhas.map((l) => largura(l, FONTE.voz, tam, true)));
  if (maior > 844) tam = Math.floor(tam * (844 / maior));
  const perg = el("div", "", f, { position: "absolute", left: "0", top: "0" });
  linhas.forEach((l, k) => textoBase(ctx, perg, { x: 96, base: 700 + k * tam * 1.05, texto: l, fam: FONTE.voz, tam, italico: true, cor: COR.breu, lh: 1.05 }));
  ctx.aCada(vozAnimada(perg, { de: p.pergunta_de ?? de0 + 0.12, cor: COR.breu, papel: true }));

  const resp = el("div", "", f, { position: "absolute", left: "0", top: "0" });
  textoBase(ctx, resp, { x: 96, base: 960, texto: p.resposta ?? "A gente faz.", fam: FONTE.voz, tam: 96, cor: COR.breu });
  ctx.aCada(vozAnimada(resp, { de: p.resposta_de ?? de0 + 0.3, cor: COR.breu, papel: true }));

  if (p.cta) {
    const dur = Math.max(0.1, (p.cta.ate ?? p.cta.de + 0.6) - p.cta.de);
    datilografar(ctx, f, { de: p.cta.de, x: 96, y: p.cta.y ?? 1100, linhas: [p.cta.texto], dur },
      { tira: false, cor: COR.carimbo, tam: p.cta.tam ?? 40, rot: 0, base: true, semente: 9 });
  }
  if (p.assinatura) {
    const a = p.assinatura;
    lapis(ctx, f, { tipo: "palavra", de: a.de, dur: Math.max(0.1, (a.ate ?? a.de + 0.5) - a.de), pts: [[a.x ?? 96, a.y ?? 1240]], texto: a.texto ?? "creat.MTT", tam: 72, giro: -4, cor: COR.lapisPapel }, COR.lapisPapel, 11);
  }
  if (p.carimbo) carimbo(ctx, f, { texto: "EM REVELAÇÃO", x: 600, y: 1330, giro: -6, ...p.carimbo }, { semente: 2 });
  if (p.arroba) {
    // o arroba confirmado do dono (regra c_arroba_fecho), datilografado como o CTA, embaixo à esquerda
    const r = typeof p.arroba === "string" ? { texto: p.arroba } : p.arroba;
    const de = r.de ?? de0 + 1.9;
    datilografar(ctx, f, { de, x: r.x ?? 96, y: r.y ?? 1440, linhas: [r.texto ?? "@creat.mtt"], dur: r.dur ?? 0.4, caixa: true },
      { tira: false, cor: COR.carimbo, tam: 40, rot: 0, base: true, semente: 13 });
  }

  entradaFolha(ctx, f, { de: de0, dur: p.entrada?.dur ?? 0.45, escala: 1.0, giro: -1.5, dy: 60 });
}
