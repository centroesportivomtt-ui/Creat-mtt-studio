// REVELAÇÃO: grão do filme inteiro, luz de segurança, preto inicial e textos latentes revelados pela frente radial.
// A frente é a MESMA do FX Python `revela` (o negativo é desenhado pelo FX, não aqui):
//   r(t) = rmax · (0,5 − 0,5·cos(π·prog(t, de, dur)))
// Cada latente recebe a máscara radial-gradient(circle at origem, #000 r−soft, transparent r) ("abre");
// no "fecha" (negativo crescendo a partir de baixo) o latente só fica visível FORA do raio.
// props:
//   grao: opacidade do grão (0.07), o filme inteiro (deixe esta camada por cima das outras para o grão cobrir o papel)
//   preto: {de, ate} breu #120D0A cobrindo tudo (a voz começa no escuro)
//   luz: [{de, ate, op}] luz de segurança: gradiente vertical #9E1B12 → transparente, 520 px a partir do topo
//   frentes: [{de, dur, modo: "abre"|"fecha", origem: [x, y], rmax, soft}] (padrões em revelacao_comum.js)
//   latentes: [{texto, x, y (topo da caixa), fonte, italico, tam, cor, entrelinha 0.95, tracking -0.01,
//               frente (índice em frentes; null = entra sozinho em `de`), de, sai (queima de 0,18 s), inverte, halo, largura}]
//             texto com " / " quebra linha; se a linha passar de x 940 o tamanho é reduzido para caber.
import { COR, normalizaFrente, mascaraFrente, grao, largura, vozAnimada } from "../revelacao_comum.js";

export default function revelacao(ctx, c) {
  const { el, W, H, clamp } = ctx;
  const p = c.props;
  const raiz = c.el;
  raiz.style.pointerEvents = "none";

  // 1) preto inicial
  if (p.preto) {
    const pr = el("div", "mk-preto", raiz, { position: "absolute", inset: "0", background: COR.breu });
    const { de = c.de, ate } = p.preto;
    ctx.aCada((t) => { pr.style.display = t >= de && t < ate ? "" : "none"; });
  }

  // 2) latentes
  const frentes = (p.frentes ?? []).map(normalizaFrente);
  (p.latentes ?? []).forEach((L) => {
    const fam = L.fonte ? `"${L.fonte}", Georgia, serif` : '"Instrument Serif", Georgia, serif';
    const italico = L.italico ?? true;
    let tam = L.tam ?? 150;
    const lh = L.entrelinha ?? 0.95, tr = L.tracking ?? -0.01;
    const linhas = String(L.texto).split(/\s*\/\s*/);
    const maxL = Math.min(L.largura ?? 1e9, 940 - L.x);
    const larg = Math.max(...linhas.map((l) => largura(l, fam, tam, italico, tr)));
    if (larg > maxL) tam = Math.floor(tam * (maxL / larg));
    const camada = el("div", "mk-latente", raiz, { position: "absolute", inset: "0" });
    const txt = el("div", "mk-latente-texto mk-texto", camada, {
      position: "absolute", left: L.x + "px", top: L.y + "px", font: `${italico ? "italic " : ""}400 ${tam}px/${lh} ${fam}`,
      letterSpacing: tr + "em", color: L.cor ?? COR.ouro, whiteSpace: "pre",
    });
    txt.textContent = linhas.join("\n");
    const halo = L.halo ?? "0 0 24px rgba(18,13,10,0.6)";
    // índice de frente que não existe é erro de EDL: sem isto o latente entraria inteiro no `de`, sem revelação e sem aviso
    if (L.frente != null && !frentes[L.frente]) throw new Error(`revelacao: frente ${L.frente} inexistente (há ${frentes.length})`);
    const f = L.frente != null ? frentes[L.frente] : null;
    const sai = L.sai ?? c.ate;
    if (f) {
      // revelado pela frente: o texto já está "impresso", a máscara decide onde ele existe
      txt.style.textShadow = halo;
      const corBase = L.cor ?? COR.ouro;
      const rgb = [1, 3, 5].map((i) => parseInt(corBase.slice(i, i + 2), 16));
      const branco = (k) => `rgb(${rgb.map((x) => Math.round(x + (255 - x) * k)).join(",")})`;
      ctx.aCada((t) => {
        const m = mascaraFrente(t, f, L.inverte);
        camada.style.webkitMaskImage = m; camada.style.maskImage = m;
        camada.style.display = t >= f.de && t < sai ? "" : "none";
        // saída "queima": 0,08 s a branco com brilho, 0,10 s até sumir
        const q1 = clamp((t - sai + 0.18) / 0.08), q2 = clamp((t - sai + 0.10) / 0.10);
        txt.style.color = q1 > 0 ? branco(q1) : corBase;
        txt.style.textShadow = q1 > 0 ? `0 0 ${(24 + 6 * q1).toFixed(1)}px rgba(255,255,255,${(0.95 * q1).toFixed(3)})` : halo;
        txt.style.opacity = String(1 - q2);
      });
    } else {
      const sombraBase = [[0, 0, 24, [18, 13, 10, 0.6]], [0, 0, 2, [18, 13, 10, 0]]];
      const anim = vozAnimada(txt, { de: L.de ?? c.de, ate: sai, cor: L.cor ?? COR.creme, sombraBase });
      ctx.aCada(anim);
    }
  });
  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-latente-texto`, de: c.de, ate: c.ate });

  // 3) luz de segurança (acende com uma piscada curta, apaga em 0,2 s)
  const luzes = p.luz ?? [];
  if (luzes.length) {
    const luz = el("div", "mk-luz", raiz, {
      position: "absolute", left: "0", top: "0", width: W + "px", height: "520px",
      background: "linear-gradient(to bottom, rgba(158,27,18,1) 0%, rgba(158,27,18,0.62) 30%, rgba(158,27,18,0.26) 62%, rgba(158,27,18,0.07) 85%, rgba(158,27,18,0) 100%)",
    });
    ctx.aCada((t) => {
      let op = 0;
      for (const l of luzes) {
        if (t < l.de || t >= l.ate) continue;
        const a = t - l.de;
        const acende = a < 0.04 ? a / 0.04 : a < 0.07 ? 0.45 : clamp((a - 0.07) / 0.05, 0.45, 1); // piscada de lâmpada
        const apaga = clamp((l.ate - t) / 0.2);
        op = Math.max(op, (l.op ?? 0.18) * Math.min(acende, apaga));
      }
      luz.style.opacity = op.toFixed(4);
      luz.style.display = op > 0 ? "" : "none";
    });
    for (const l of luzes) ctx.cue(l.de, "interruptor", -10);
  }

  // 4) grão por cima de tudo desta camada
  const g = p.grao ?? 0.07;
  if (g > 0) grao(ctx, raiz, g);

  for (const f of frentes) ctx.cue(f.de, f.modo === "fecha" ? "fecha" : "revela", -30);
  void H;
}
