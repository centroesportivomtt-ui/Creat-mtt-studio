// LABORATÓRIO: tiras datilografadas, carimbos, lápis dermatográfico e código de borda do filme.
// props:
//   tiras: [{de, x, y (topo), linhas: [..], cps 28, dur?, tempos?: [início de cada linha], ate?, caixa?}]
//          Special Elite 38, tinta #120D0A sobre tira #EFE6D4 a 92%, padding 14/22, giro −1,5°; sempre em minúsculas
//          (caixa:true mantém). Um caractere a cada 1/cps s (±12 ms, ±1 px, tinta 0,75–1). `dur` calcula o cps para
//          a linha acabar em de+dur. `tempos` dita o início de cada linha (linha digitada na fala). `ate`: a tira sai.
//   carimbos: [{de, texto, x, y (CENTRO), giro −6, tam 44, cor #2B3A67, op .85, ate?}]
//          caixa alta, tracking .12em, borda dupla de 4 px, tinta gasta; escala 1,25→1 em 0,08 s (expo.in).
//          O centro é empurrado para dentro da zona de texto se a caixa girada sair dela e, se cobrir uma tira desta camada,
//          vai para a direita dela ou logo abaixo (evitar:false desliga).
//   lapis: [{tipo: elipse|circulo|seta|risco|sublinha|palavra, de, dur 0.4, pts, r?, texto?, tam 60, giro?,
//           cor? (#E0442F sobre vídeo; sobre:"papel" usa #9E1B12), espessura 7, some?, someDur 0.2, passes?}]
//          traço SVG com stroke-dashoffset 1→0 (power1.inOut), ponta redonda, jitter ±1,5 px e textura de cera.
//          some: tempo absoluto em que a marca apaga; valor menor que `de` conta a partir do fim do traço.
//   borda: [{de, ate?, texto, x 72, y 1440 (início, embaixo), rolar?: {de, ate, ate_num}}]
//          Special Elite 26, tracking .18em, vertical (−90°, lê de baixo para cima), #E3B341 a 85%.
//          "▸" é desenhado em CSS (a fonte não tem o glifo). Na rolagem o último número troca por corte seco a cada 0,1 s.
// Cues para o som: tecla, campainha, carimbo, lapis, tique.
import { COR, FONTE, datilografar, carimbo, lapis } from "../revelacao_comum.js";

export default function laboratorio(ctx, c) {
  const { el } = ctx;
  const p = c.props;
  const raiz = c.el;
  raiz.style.pointerEvents = "none";

  const tiras = (p.tiras ?? []).flatMap((s, i) => datilografar(ctx, raiz, s, { semente: i + 1, tam: s.tam ?? 38 }));
  // caixas das tiras (sem o giro de 1,5°, com folga de 6 px) para o carimbo não cobrir o texto
  const caixas = tiras.map(({ el: e }) => [e.offsetLeft - 6, e.offsetTop - 6, e.offsetLeft + e.offsetWidth + 6, e.offsetTop + e.offsetHeight + 6]);
  (p.carimbos ?? []).forEach((s, i) => carimbo(ctx, raiz, s, { semente: i + 1, evitar: s.evitar === false ? [] : caixas }));
  (p.lapis ?? []).forEach((s, i) => lapis(ctx, raiz, s, s.sobre === "papel" ? COR.lapisPapel : COR.lapisVideo, i + 1));

  (p.borda ?? []).forEach((b) => {
    const de = b.de ?? c.de, ate = b.ate ?? c.ate;
    const e = el("div", "mk-borda mk-texto", raiz, {
      position: "absolute", left: (b.x ?? 72) + "px", top: (b.y ?? 1440) + "px", transformOrigin: "0 0", transform: "rotate(-90deg)",
      font: `400 26px/1 ${FONTE.arquivo}`, letterSpacing: "0.18em", color: COR.ouro, opacity: "0.85", whiteSpace: "pre",
    });
    const m = String(b.texto).match(/^(.*?)(\d+)\s*$/);
    const prefixo = m ? m[1] : String(b.texto), num0 = m ? m[2] : null;
    for (const parte of prefixo.split(/(▸)/)) {
      if (parte === "▸") el("span", "", e, { display: "inline-block", width: "0", height: "0", borderLeft: "0.5em solid currentColor",
        borderTop: "0.3em solid transparent", borderBottom: "0.3em solid transparent", margin: "0 0.3em 0 0.1em", verticalAlign: "0.02em" });
      else if (parte) e.appendChild(document.createTextNode(parte));
    }
    const ns = num0 ? el("span", "", e) : null;
    if (ns) ns.textContent = num0;
    const r = b.rolar;
    if (r && num0) {
      const n0 = parseInt(num0, 10), pad = num0.length;
      for (let n = n0 + 1, t = r.de; n <= r.ate_num; n++, t += 0.1) ctx.cue(t, "tique", -24);
      ctx.aCada((t) => {
        let n = n0;
        if (t >= r.de) n = Math.min(r.ate_num, n0 + 1 + Math.floor((t - r.de) / 0.1 + 1e-6));
        if (t >= r.ate) n = r.ate_num;
        ns.textContent = String(n).padStart(pad, "0");
      });
    }
    ctx.aCada((t) => { e.style.display = t >= de && t < ate ? "" : "none"; });
  });

  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-texto`, de: c.de, ate: c.ate });
}
