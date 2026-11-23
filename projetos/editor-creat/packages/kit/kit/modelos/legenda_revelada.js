// LEGENDA REVELADA: a frase inteira (nunca palavra a palavra) em Instrument Serif, alinhada à esquerda e ancorada
// pela linha de base da ÚLTIMA linha. A palavra-chave muda só para itálico, na mesma cor (nenhuma palavra muda de cor).
// props:
//   frases: [{de, ate, texto, papel?}]   texto: "*palavra*" = itálico; " / " força a quebra; sem " / " quebra pela largura
//   x (96), base (1460: linha de base da última linha), largura (820), tam (68, entrelinha 1,06)
//   cor (#FFF6E6), corPapel (#120D0A: frase com papel:true, sem sombra e sem véu)
//   entrada (0,32 s, power2.out: desfoque 14→0, tracking .06em→0, opacidade, brilho quente que se apaga)
//   saida (0,18 s, "queima": 0,08 s a branco com brilho de 30 px + 0,10 s até sumir; termina em `ate`)
//   veu (true): elipse rgba(18,13,10,.30) de 980x420 centrada em (500, 1370) que entra e sai junto com a legenda
// Regras: no máximo 2 linhas (26 caracteres / 7 palavras por página é responsabilidade do roteiro; aqui o texto
// que passar de 2 linhas é avisado no console e cresce para cima) e texto dentro da zona segura (exigir).
import { COR, FONTE, largura, baseNoTopo, vozAnimada } from "../revelacao_comum.js";

// "falecido *avô*," -> [{t:"falecido", it:false}, {t:"avô", it:true}, {t:",", it:false, cola:true}]
function tokens(linha) {
  const out = [];
  let aberto = false;
  for (const bruta of linha.trim().split(/\s+/).filter(Boolean)) {
    let t = bruta;
    const abre = t.startsWith("*"); if (abre) { aberto = true; t = t.slice(1); }
    const m = t.match(/^(.*?)\*([^*]*)$/);
    if (m && aberto) {
      if (m[1]) out.push({ t: m[1], it: true });
      if (m[2]) out.push({ t: m[2], it: false, cola: true });
      aberto = false;
    } else out.push({ t, it: aberto });
  }
  return out;
}

export default function legenda_revelada(ctx, c) {
  const { el, clamp } = ctx;
  const p = c.props;
  const x = p.x ?? 96, base = p.base ?? 1460, larg = p.largura ?? 820, tam = p.tam ?? 68, lh = 1.06;
  const entrada = p.entrada ?? 0.32, saida = p.saida ?? 0.18;
  const fam = FONTE.voz;
  const bTopo = baseNoTopo(fam, tam, false, lh);
  const frases = (p.frases ?? []).slice().sort((a, b) => a.de - b.de);

  // véu: intervalos das frases sobre vídeo, colando as que têm vão menor que 0,25 s (o véu não pisca entre páginas)
  const veu = p.veu !== false;
  if (veu) {
    const iv = [];
    for (const f of frases.filter((f) => !f.papel)) {
      const u = iv[iv.length - 1];
      if (u && f.de - u[1] < 0.25) u[1] = Math.max(u[1], f.ate); else iv.push([f.de, f.ate]);
    }
    const v = el("div", "mk-veu", c.el, { position: "absolute", left: 500 - 490 + "px", top: 1370 - 210 + "px", width: "980px", height: "420px",
      background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(18,13,10,0.30) 0%, rgba(18,13,10,0.27) 45%, rgba(18,13,10,0.12) 75%, rgba(18,13,10,0) 100%)" });
    const ein = ctx.ease("power2.out");
    ctx.aCada((t) => {
      let op = 0;
      for (const [a, b] of iv) if (t >= a && t < b) op = Math.min(ein(clamp((t - a) / entrada)), clamp((b - t) / saida));
      v.style.opacity = op.toFixed(4);
      v.style.display = op > 0 ? "" : "none";
    });
  }

  const espaco = largura(" ", fam, tam);
  frases.forEach((f, n) => {
    // 1) linhas: quebra manual por " / " ou gulosa pela largura (medida na fonte certa de cada palavra)
    let linhas = [];
    const manuais = String(f.texto).split(/\s+\/\s+/);
    for (const m of manuais) {
      const tk = tokens(m);
      let atual = [], w = 0;
      for (const k of tk) {
        const wk = largura(k.t, fam, tam, k.it);
        const add = atual.length && !k.cola ? espaco + wk : wk;
        if (atual.length && !k.cola && w + add > larg) { linhas.push(atual); atual = [k]; w = wk; }
        else { atual.push(k); w += add; }
      }
      if (atual.length) linhas.push(atual);
    }
    if (linhas.length > 2) console.warn(`legenda_revelada: "${f.texto}" ocupa ${linhas.length} linhas (máximo 2)`);

    const papel = !!f.papel;
    const caixa = el("div", "mk-legr", c.el, { position: "absolute", left: x + "px", top: "0", width: larg + 40 + "px" });
    caixa.dataset.n = n;
    linhas.forEach((ln, k) => {
      const yb = base - (linhas.length - 1 - k) * tam * lh;
      const d = el("div", "mk-legr-linha mk-leg mk-texto", caixa, {
        position: "absolute", left: "0", top: yb - bTopo + "px", whiteSpace: "pre", font: `400 ${tam}px/${lh} ${fam}`,
      });
      ln.forEach((tk, j) => {
        if (j > 0 && !tk.cola) d.appendChild(document.createTextNode(" "));
        if (tk.it) { const s = el("span", "", d, { fontStyle: "italic" }); s.textContent = tk.t; }
        else d.appendChild(document.createTextNode(tk.t));
      });
    });
    ctx.aCada(vozAnimada(caixa, { de: f.de, ate: f.ate, entrada, saida, cor: papel ? (p.corPapel ?? COR.breu) : (p.cor ?? COR.creme), papel }));
    ctx.cue(f.de, papel ? "legenda-papel" : "legenda-entra", -14);
  });

  ctx.exigir({ tipo: "seguro", alvo: `[data-id="${c.id}"] .mk-legr-linha`, de: c.de, ate: c.ate });
}
