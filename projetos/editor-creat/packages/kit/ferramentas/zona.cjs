#!/usr/bin/env node
// QA de ZONA SEGURA do kit: para CADA modelo de kit/modelos, monta no Chromium headless (o mesmo de render.cjs, sem rede)
// uma cena com os casos de cenas/zona/casos.cjs (uma camada por caso, separadas no tempo) e mede as caixas REAIS do DOM
// em vários instantes da animação contra a zona segura única de kit/zona.json (a mesma do QA de entrega do motor).
//
//   node ferramentas/zona.cjs [--json saida.json] [--rapido] [--so gancho,chip] [--casos curto,longo] [--paralelo 3]
//   node ferramentas/zona.cjs --cena cenas/zona/negativo.json [--json r.json]     mede uma cena qualquer (todas as camadas)
//   node ferramentas/zona.cjs --gravar-cenas pasta/                               grava a cena de cada modelo (para render.cjs)
//   node ferramentas/zona.cjs --descobrir [--modelos-dir pasta]                   só confere se todo modelo tem casos
// Sai com 1 se houver vazamento, modelo sem casos, erro do navegador ou falha ao montar.
//
// O que é medido em cada instante (camada visível):
//   texto   todo nó de texto visível (opacidade acumulada > 0,05): caixas de Range.getClientRects() (já com transform),
//           reduzidas à TINTA da fonte (ascendente/descendente reais por measureText: Anton tem área de conteúdo de 1,5 em,
//           muito maior que a letra) e recortadas pelos ancestrais com overflow e clip-path inset/circle.
//   peca    só em modelos fora de "tela_cheia": img, svg e caixas com fundo ou borda sólidos (alfa >= alfa_minimo/255,
//           o mesmo limiar de alfa do QA de entrega). Gradientes (véus, brilhos) e sombras não contam.
//   declarada  elemento com data-mk-zona: caixa do que o modelo desenha em canvas (o texto em partículas do heroi).
// Vazamento = quanto a caixa passa de cada lado da zona; FORA quando passa de "tolerancia" px (16, igual ao motor:
// sombra do texto e cantoneiras encostadas no limite). Isentos (fundo, transicao) vêm de kit/zona.json.
// Instantes: a cada "amostra_quadros" quadros (3, como o motor), mais o início, o meio e o fim de cada tween da timeline
// e o último quadro da camada. --rapido: casos RAPIDOS de casos.cjs, a cada 9 quadros + tweens.
// Aviso (não reprova): "corte", texto recortado na horizontal por overflow (ex.: nome que some dentro da placa).
const fs = require("fs");
const path = require("path");
const { RAIZ, abrir, lerComp, args } = require("./comum.cjs");

const o = args(process.argv.slice(2));
const Z = JSON.parse(fs.readFileSync(path.join(RAIZ, "kit", "zona.json"), "utf8"));
const CASOS = require(path.join(RAIZ, "cenas", "zona", "casos.cjs"));
const FPS = 30;
const GAP = 0.2; // intervalo vazio entre casos na mesma cena

function descobrir(dir = path.join(RAIZ, "kit", "modelos")) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
}

function cenaDoModelo(modelo, { rapido = false, so = null } = {}) {
  const def = CASOS.MODELOS[modelo];
  let nomes = Object.keys(def.casos);
  if (rapido) {
    const r = nomes.filter((k) => CASOS.RAPIDOS.includes(k));
    nomes = r.length ? r : nomes.slice(0, 2);
  }
  if (so) nomes = nomes.filter((k) => so.includes(k));
  let t = 0;
  const camadas = [];
  for (const k of nomes) {
    const d = typeof def.dur === "function" ? def.dur(k) : def.dur ?? 3;
    const de = +t.toFixed(3), ate = +(t + d).toFixed(3);
    camadas.push({ id: `${modelo}__${k}`, modelo, de, ate, props: def.casos[k](de, ate) });
    t = ate + GAP;
  }
  return { nome: `zona-${modelo}`, formato: { w: Z.formato.w, h: Z.formato.h, fps: FPS }, duracao: +t.toFixed(3), cor: "#0B0B0C", camadas };
}

// roda na página: mede uma camada no instante já posicionado
function medirNaPagina([id, comPecas, alfaMin, alfaTexto]) {
  const palco = document.getElementById("palco");
  const raiz = document.querySelector(`.mk-camada[data-id="${CSS.escape(id)}"]`);
  if (!raiz || getComputedStyle(raiz).display === "none") return { itens: [], cortes: [] };
  const regua = (window.__mkRegua ??= document.createElement("canvas").getContext("2d"));
  const opac = (e) => {
    let a = 1;
    for (let n = e; n && n !== palco; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      a *= +cs.opacity;
    }
    return a;
  };
  const exibido = (e) => {
    for (let n = e; n && n !== palco; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return false; }
    return true;
  };
  const alfaCor = (cor) => { const v = (String(cor).match(/[\d.]+/g) || []).map(Number); return v.length < 3 ? 0 : v.length < 4 ? 1 : v[3]; };
  const ret = (b) => [b.left, b.top, b.right, b.bottom];
  const inter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const vazio = (b) => b[2] - b[0] < 0.5 || b[3] - b[1] < 0.5;
  const pct = (v, total) => (/%$/.test(v) ? (parseFloat(v) / 100) * total : parseFloat(v) || 0);
  // recorte do próprio elemento (clip-path) e dos ancestrais (overflow e clip-path) até a camada (exclusive)
  function recortes(e, incluiProprio) {
    const lista = [];
    for (let n = incluiProprio ? e : e.parentElement; n && n !== raiz && n !== palco; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const b = ret(n.getBoundingClientRect());
      if (n !== e && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) lista.push({ b, tipo: "overflow", x: cs.overflowX !== "visible", y: cs.overflowY !== "visible" });
      const cp = cs.clipPath;
      if (cp && cp !== "none") {
        const m = cp.match(/^inset\(([^)]*)\)/);
        if (m) {
          const v = m[1].replace(/round.*$/, "").trim().split(/\s+/);
          const [tp, rt, bt, lf] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
          const w = b[2] - b[0], h = b[3] - b[1];
          lista.push({ b: [b[0] + pct(lf, w), b[1] + pct(tp, h), b[2] - pct(rt, w), b[3] - pct(bt, h)], tipo: "clip", x: true, y: true });
        } else if (/^circle\(0px/.test(cp)) lista.push({ b: [0, 0, 0, 0], tipo: "clip", x: true, y: true });
      }
    }
    return lista;
  }
  function aplicar(b, lista) {
    let r = b, cortado = 0;
    if (vazio(r)) return { b: null, cortado };
    for (const c of lista) {
      const q = [c.x ? c.b[0] : -1e9, c.y ? c.b[1] : -1e9, c.x ? c.b[2] : 1e9, c.y ? c.b[3] : 1e9];
      const n = inter(r, q);
      if (c.x) cortado = Math.max(cortado, (r[2] - r[0]) - Math.max(0, n[2] - n[0]));
      r = n;
      if (vazio(r)) return { b: null, cortado };
    }
    return { b: r, cortado };
  }
  const itens = [], cortes = [];
  // 1) texto
  const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const txt = n.nodeValue;
    if (!txt.trim()) continue;
    const pai = n.parentElement;
    if (pai.closest("svg")) continue;
    const cs = getComputedStyle(pai);
    if (opac(pai) * alfaCor(cs.color) * 255 < alfaTexto) continue;
    regua.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const mostra = cs.textTransform === "uppercase" ? txt.toUpperCase() : cs.textTransform === "lowercase" ? txt.toLowerCase() : txt;
    const m = regua.measureText(mostra.trim());
    const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const lista = recortes(pai, true);
    for (const r of rg.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      const s = r.height / (fa + fd || r.height);
      // tinta: do topo da área de conteúdo, desce (ascendente da fonte - ascendente real) e para no descendente real
      const b = [r.left, r.top + Math.max(0, fa - m.actualBoundingBoxAscent) * s, r.right, r.top + Math.min(fa + fd, fa + m.actualBoundingBoxDescent) * s];
      const { b: v, cortado } = aplicar(b, lista);
      if (cortado > 2 + Math.max(0, parseFloat(cs.letterSpacing) || 0)) cortes.push({ txt: mostra.trim().slice(0, 40), px: Math.round(cortado) });
      if (v) itens.push({ tipo: "texto", txt: mostra.trim().slice(0, 40), b: v });
    }
  }
  // 2) peças sólidas e 3) caixas declaradas
  const solido = (cor, op) => alfaCor(cor) * op * 255 >= alfaMin;
  for (const e of raiz.querySelectorAll("*")) {
    const declarada = e.hasAttribute("data-mk-zona");
    if (!declarada && !comPecas) continue;
    if (!declarada && e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue;
    const cs = getComputedStyle(e);
    let peca = declarada;
    if (declarada) {
      // a caixa declarada vale enquanto o elemento estiver exibido (ela é invisível de propósito: quem desenha é o canvas)
      if (e.dataset.mkZonaAtiva === "0" || !exibido(e)) continue;
    } else {
      const op = opac(e);
      if (op * 255 < alfaMin) continue;
      const tag = e.tagName.toLowerCase();
      const borda = ["Top", "Right", "Bottom", "Left"].some((l) => parseFloat(cs[`border${l}Width`]) > 0 && cs[`border${l}Style`] !== "none" && solido(cs[`border${l}Color`], op));
      peca = tag === "img" || tag === "svg" || solido(cs.backgroundColor, op) || /url\(/.test(cs.backgroundImage) || borda;
    }
    if (!peca) continue;
    const { b } = aplicar(ret(e.getBoundingClientRect()), recortes(e, !declarada));
    if (b) itens.push({ tipo: declarada ? "declarada" : "peca", txt: (e.dataset.mkZona || e.className || e.tagName).toString().slice(0, 40), b });
  }
  return { itens, cortes };
}

// tempos de início, meio e fim de cada tween da timeline do palco, por camada
function temposNaPagina() {
  const g = window.gsap;
  if (!g) return {};
  const out = {};
  const raiz = g.globalTimeline.getChildren(false, false, true);
  for (const tl of raiz) {
    for (const tw of tl.getChildren(false, true, true)) {
      const alvos = tw.targets ? tw.targets() : [];
      const e = alvos.find((a) => a && a.nodeType === 1);
      const id = e?.closest?.(".mk-camada")?.dataset.id;
      if (!id) continue;
      const a = tw.startTime(), b = tw.endTime ? tw.endTime() : a + tw.duration();
      (out[id] ??= []).push(a, (a + b) / 2, b);
    }
  }
  return out;
}

function vazamento(b, W, H) {
  const zz = Z.zona;
  const lados = { esquerda: zz.esquerda - b[0], topo: zz.topo - b[1], direita: b[2] - (W - zz.direita), base: b[3] - (H - zz.base) };
  let lado = null, px = -Infinity;
  for (const [k, v] of Object.entries(lados)) if (v > px) { px = v; lado = k; }
  return { px: Math.round(px), lado };
}

async function medirCena(comp, { rapido = false, comPecas = () => true } = {}) {
  const sess = await abrir(comp, { escala: 0.25 });
  const { page, info } = sess;
  const W = info.w, H = info.h;
  const passo = (rapido ? 9 : Z.amostra_quadros) / FPS;
  // gsap exposto só para ler a timeline (import map da página)
  await page.evaluate(async () => { try { window.gsap = (await import("gsap")).gsap; } catch {} });
  const tempos = await page.evaluate(temposNaPagina);
  const res = {};
  for (const c of comp.camadas) {
    const ts = new Set();
    for (let t = c.de; t < c.ate - 1e-6; t += passo) ts.add(+t.toFixed(4));
    ts.add(+(c.ate - 1 / FPS).toFixed(4));
    for (const t of tempos[c.id] ?? []) if (t >= c.de && t < c.ate - 1e-6) ts.add(+Math.min(t, c.ate - 1 / FPS).toFixed(4));
    const instantes = [];
    const cortes = new Map();
    for (const t of [...ts].sort((a, b) => a - b)) {
      await page.evaluate((tt) => window.__mk.seek(tt), t);
      const r = await page.evaluate(medirNaPagina, [c.id, comPecas(c.modelo), Z.alfa_minimo, Z.alfa_texto_minimo ?? 128]);
      let pior = null;
      for (const it of r.itens) {
        const v = vazamento(it.b, W, H);
        if (!pior || v.px > pior.px) pior = { ...v, tipo: it.tipo, txt: it.txt, caixa: it.b.map(Math.round) };
      }
      for (const k of r.cortes) { const v = cortes.get(k.txt) ?? { px: 0, n: 0 }; v.px = Math.max(v.px, k.px); v.n++; cortes.set(k.txt, v); }
      instantes.push({ t: +(t - c.de).toFixed(3), medidos: r.itens.length, ok: !pior || pior.px <= Z.tolerancia, ...(pior ? { vazamento: pior } : {}) });
    }
    const fora = instantes.filter((i) => !i.ok);
    const pior = instantes.reduce((p, i) => (i.vazamento && (!p || i.vazamento.px > p.vazamento.px) ? i : p), null);
    res[c.id] = {
      modelo: c.modelo, ok: fora.length === 0, instantes_medidos: instantes.length, instantes_fora: fora.length,
      pior: pior ? { t: pior.t, ...pior.vazamento } : null,
      // corte permanente: o mesmo texto recortado em pelo menos metade dos instantes (revelação por máscara é passageira)
      cortes: [...cortes].filter(([, v]) => v.n >= instantes.length / 2).map(([txt, v]) => ({ txt, px: v.px, instantes: v.n })),
      instantes,
    };
  }
  const erros = [...sess.erros];
  await sess.fechar();
  return { camadas: res, erros };
}

async function emFila(tarefas, n) {
  const out = new Array(tarefas.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => {
    while (i < tarefas.length) { const k = i++; out[k] = await tarefas[k](); }
  }));
  return out;
}

function imprimir(rel) {
  const lin = [];
  for (const [m, r] of Object.entries(rel.modelos)) {
    if (r.isento) { lin.push(`· ${m.padEnd(10)} isento: ${r.isento}`); continue; }
    if (r.erro) { lin.push(`✗ ${m.padEnd(10)} ERRO: ${r.erro}`); continue; }
    const cs = Object.entries(r.casos);
    const ruins = cs.filter(([, c]) => !c.ok);
    lin.push(`${ruins.length ? "✗" : "✓"} ${m.padEnd(10)} ${cs.length - ruins.length}/${cs.length} casos dentro` +
      (ruins.length ? "  ← " + ruins.map(([k, c]) => (c.erro ? `${k} (ERRO: ${c.erro})` : `${k} (${c.pior.px} px ${c.pior.lado} em ${c.pior.t} s, "${c.pior.txt}")`)).join("; ") : ""));
    for (const [k, c] of cs) if (c.cortes.length) lin.push(`    aviso ${m}/${k}: texto recortado ${c.cortes.slice(0, 4).map((x) => `"${x.txt}" ${x.px} px`).join(", ")}${c.cortes.length > 4 ? ` (+${c.cortes.length - 4})` : ""}`);
  }
  if (rel.sem_casos.length) lin.push(`✗ modelos SEM casos em cenas/zona/casos.cjs: ${rel.sem_casos.join(", ")}`);
  lin.push(`\nmatriz: ${rel.resumo.modelos_medidos} modelos medidos × ${rel.resumo.casos} casos · ${rel.resumo.instantes} instantes · ` +
    `${rel.resumo.casos_fora} caso(s) fora, ${rel.resumo.instantes_fora} instante(s) fora · ${rel.resumo.isentos} isentos · ${rel.resumo.relogio_s} s`);
  console.log(lin.join("\n"));
}

(async () => {
  const t0 = Date.now();
  if (o.descobrir) {
    const ms = descobrir(o["modelos-dir"] || undefined);
    const sem = ms.filter((m) => !CASOS.MODELOS[m]);
    console.log(JSON.stringify({ modelos: ms, sem_casos: sem }));
    process.exit(sem.length ? 1 : 0);
  }
  if (o.cena) {
    // cena avulsa: mede todas as camadas que não são isentas
    const comp = lerComp(o.cena);
    comp.camadas = comp.camadas.filter((c) => !Z.isentos[c.modelo]);
    const r = await medirCena(comp, { comPecas: (m) => !Z.tela_cheia.includes(m) });
    const fora = Object.values(r.camadas).filter((c) => !c.ok);
    const rel = { cena: o.cena, zona: Z.zona, tolerancia: Z.tolerancia, camadas: r.camadas, erros: r.erros, ok: !fora.length && !r.erros.length };
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(rel, null, 1));
    for (const [id, c] of Object.entries(r.camadas)) console.log(`${c.ok ? "✓" : "✗"} ${id}` + (c.pior ? `  pior ${c.pior.px} px ${c.pior.lado} em ${c.pior.t} s ("${c.pior.txt}")` : ""));
    if (r.erros.length) console.log("erros do navegador:\n" + r.erros.join("\n"));
    process.exit(rel.ok ? 0 : 1);
  }
  const todos = descobrir();
  const so = o.so ? String(o.so).split(",") : null;
  const soCasos = o.casos ? String(o.casos).split(",") : null;
  const rapido = !!o.rapido;
  const sem_casos = todos.filter((m) => !CASOS.MODELOS[m]);
  const alvo = todos.filter((m) => CASOS.MODELOS[m] && (!so || so.includes(m)));
  const rel = { zona: Z.zona, tolerancia: Z.tolerancia, formato: Z.formato, rapido, sem_casos, modelos: {}, resumo: {} };
  const medir = [];
  for (const m of alvo) {
    if (Z.isentos[m]) { rel.modelos[m] = { isento: Z.isentos[m] }; continue; }
    if (!CASOS.MODELOS[m].casos) { rel.modelos[m] = { erro: "entrada sem casos nem isenção" }; continue; }
    medir.push(m);
  }
  if (o["gravar-cenas"]) {
    fs.mkdirSync(o["gravar-cenas"], { recursive: true });
    for (const m of medir) fs.writeFileSync(path.join(o["gravar-cenas"], `${m}.json`), JSON.stringify(cenaDoModelo(m, { rapido, so: soCasos }), null, 1));
    console.log(`cenas em ${o["gravar-cenas"]}`);
    return;
  }
  const par = Math.max(1, +(o.paralelo ?? Math.min(3, Math.max(1, require("os").cpus().length - 1))));
  const saidas = await emFila(medir.map((m) => async () => {
    const comp = cenaDoModelo(m, { rapido, so: soCasos });
    const opc = { rapido, comPecas: () => !Z.tela_cheia.includes(m) };
    try {
      return [m, await medirCena(comp, opc)];
    } catch (e) {
      // a montagem quebrou: mede caso a caso para dizer QUAL caso derruba o modelo
      const r = { camadas: {}, erros: [] };
      for (const c of comp.camadas) {
        try {
          const u = await medirCena({ ...comp, duracao: c.ate, camadas: [c] }, opc);
          Object.assign(r.camadas, u.camadas); r.erros.push(...u.erros);
        } catch (e2) {
          r.camadas[c.id] = { modelo: m, ok: false, erro: String(e2.message || e2).split("\n")[0].slice(0, 300), instantes_medidos: 0, instantes_fora: 0, pior: null, cortes: [], instantes: [] };
        }
      }
      return [m, r];
    }
  }), par);
  for (const [m, r] of saidas) {
    if (r.erro) { rel.modelos[m] = { erro: r.erro }; continue; }
    const casos = {};
    for (const [id, c] of Object.entries(r.camadas)) casos[id.split("__")[1]] = c;
    rel.modelos[m] = { ...(CASOS.MODELOS[m].semTexto ? { nota: CASOS.MODELOS[m].semTexto } : {}), casos, ...(r.erros.length ? { erros: r.erros.slice(0, 5) } : {}) };
  }
  const vals = Object.values(rel.modelos).filter((r) => r.casos);
  const cs = vals.flatMap((r) => Object.values(r.casos));
  rel.resumo = {
    modelos: todos.length, modelos_medidos: vals.length, isentos: Object.values(rel.modelos).filter((r) => r.isento).length,
    casos: cs.length, casos_fora: cs.filter((c) => !c.ok).length, casos_com_erro: cs.filter((c) => c.erro).length,
    instantes: cs.reduce((s, c) => s + c.instantes_medidos, 0), instantes_fora: cs.reduce((s, c) => s + c.instantes_fora, 0),
    casos_com_corte: cs.filter((c) => c.cortes.length).length,
    com_erro: Object.entries(rel.modelos).filter(([, r]) => r.erro || r.erros).map(([m]) => m),
    relogio_s: +((Date.now() - t0) / 1000).toFixed(1),
  };
  rel.ok = !rel.resumo.casos_fora && !sem_casos.length && !rel.resumo.com_erro.length;
  if (o.json) { fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true }); fs.writeFileSync(o.json, JSON.stringify(rel, null, 1)); }
  imprimir(rel);
  process.exit(rel.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
