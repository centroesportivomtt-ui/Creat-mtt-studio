#!/usr/bin/env node
// Verificador do kit: percorre a composição quadro a quadro e mede as regras da casa que os modelos declararam
// com ctx.exigir(). Sai com código 1 se alguma regra falhar.
//   node ferramentas/checar.cjs cenas/demo.json [--fps 30] [--json saida/checar.json]
// Regras:
//   legenda-clara   a palavra ativa da legenda (a última que entrou) tem luminância >= minimo e opacidade 1 em todo quadro
//   parado          título pousado não se move mais que 0,5 px (regra: o que pousa fica parado)
//   seguro          texto dentro da zona segura única da casa (ZONA de kit/nucleo.js: y 285 a 1480, x 60 a 960)
//   sem-colisao     (sempre ligada, não precisa de exigir) em todo quadro, nenhum texto visível (.mk-display, .mk-leg,
//                   .mk-chip com as cantoneiras) encosta numa peça visível do HUD (.mk-hud). O HUD é isento da zona
//                   segura por ser decorativo, mas não pode sobrepor texto. Camadas de transição ficam fora da conta
//                   (cobrem a tela de propósito). A div da camada (.mk-camada.mk-hud, .mk-camada.mk-chip) não conta. Visível = display/visibility ligados e opacidade acumulada > 0,05.
//   cta             o CTA fica visível e parado por no mínimo N segundos
//   legivel-no-inicio  o gancho já está legível (opacidade 1, sem blur) no primeiro quadro
const fs = require("fs");
const { abrir, lerComp, args } = require("./comum.cjs");

const o = args(process.argv.slice(2));
const arq = o._?.[0];
if (!arq) { console.error("uso: checar.cjs <comp.json> [--fps 30] [--json saida.json]"); process.exit(2); }

(async () => {
  const comp = lerComp(arq);
  const sess = await abrir(comp, { escala: 0.25 });
  const { page, info } = sess;
  const fps = +(o.fps ?? info.fps);
  const N = Math.round(info.duracao * fps);
  const falhas = [];
  const medidas = {};
  const zona = info.zona ?? { topo: 285, base: 440, direita: 120, esquerda: 60 };
  const colisao = { regra: "sem-colisao", alvo: ".mk-display, .mk-leg, .mk-chip x .mk-hud", quadros: 0, comHud: 0, colisoes: 0 };
  const reg = (r, t, msg) => { if (falhas.filter((f) => f.regra === r.tipo && f.alvo === r.alvo).length < 5) falhas.push({ regra: r.tipo, alvo: r.alvo, t: +t.toFixed(3), msg }); };
  const posAnterior = new Map();

  for (let i = 0; i <= N; i++) {
    const t = Math.min(i / fps, info.duracao - 1e-3);
    const r = await page.evaluate(([tt, regras, Z]) => {
      window.__mk.seek(tt);
      const lum = (cor) => {
        const m = cor.match(/[\d.]+/g).map(Number);
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      const visivel = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return false; } return true; };
      const opac = (e) => { let a = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) a *= +getComputedStyle(n).opacity; return a; };
      const out = [];
      for (const g of regras) {
        if (g.em !== undefined ? Math.abs(tt - g.em) > 1e-3 : (tt < g.de || tt >= g.ate)) { out.push(null); continue; }
        const els = [...document.querySelectorAll(g.alvo)].filter(visivel);
        if (g.tipo === "legenda-clara") {
          // palavra ativa = a de maior data-i já começada
          const ativos = els.filter((e) => +e.dataset.i <= tt + 1e-4 && tt < +e.dataset.f);
          if (!ativos.length) { out.push({ vazio: true }); continue; }
          const a = ativos.sort((x, y) => +y.dataset.i - +x.dataset.i)[0];
          out.push({ lum: lum(getComputedStyle(a).color), op: opac(a), txt: a.textContent });
        } else if (g.tipo === "parado") {
          out.push(els.map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
        } else if (g.tipo === "seguro") {
          const W = document.getElementById("palco").offsetWidth, H = document.getElementById("palco").offsetHeight;
          const fora = els.filter((e) => opac(e) > 0.05).map((e) => { const b = e.getBoundingClientRect(); return { b: [b.left, b.top, b.right, b.bottom].map(Math.round), txt: e.textContent.slice(0, 20) }; })
            .filter(({ b }) => b[1] < Z.topo || b[3] > H - Z.base || b[2] > W - Z.direita || b[0] < Z.esquerda);
          out.push(fora);
        } else if (g.tipo === "cta" || g.tipo === "legivel-no-inicio") {
          out.push(els.map((e) => ({ op: opac(e), blur: getComputedStyle(e).filter })));
        }
      }
      // sem-colisao: texto x HUD, em todo quadro
      const vis = (e) => visivel(e) && opac(e) > 0.05;
      const ret = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const comCantos = (e) => { let b = ret(e); for (const k of e.querySelectorAll(".mk-canto")) { if (!vis(k)) continue; const d = ret(k); b = [Math.min(b[0], d[0]), Math.min(b[1], d[1]), Math.max(b[2], d[2]), Math.max(b[3], d[3])]; } return b; };
      const hud = [...document.querySelectorAll(".mk-hud:not(.mk-camada)")].filter(vis).map((e) => ({ b: ret(e), txt: (e.textContent || e.className).slice(0, 18) })).filter(({ b }) => b[2] > b[0] && b[3] > b[1]);
      const txt = [...document.querySelectorAll(".mk-display, .mk-leg, .mk-chip")]
        .filter((e) => !e.classList.contains("mk-camada"))
        .filter((e) => !e.closest(".mk-hud") && !e.closest(".mk-transicao") && vis(e))
        .map((e) => ({ b: e.classList.contains("mk-chip") ? comCantos(e) : ret(e), txt: e.textContent.trim().slice(0, 24) }))
        .filter(({ b }) => b[2] > b[0] && b[3] > b[1]);
      const batidas = [];
      for (const a of txt) for (const h of hud) if (a.b[0] < h.b[2] && h.b[0] < a.b[2] && a.b[1] < h.b[3] && h.b[1] < a.b[3]) batidas.push({ texto: a.txt, hud: h.txt, t: a.b.map(Math.round), h: h.b.map(Math.round) });
      out.push({ colisao: batidas, temHud: hud.length > 0 });
      return out;
    }, [t, info.qa, zona]);
    const col = r.pop();
    colisao.quadros++;
    if (col.temHud) colisao.comHud++;
    if (col.colisao.length) {
      colisao.colisoes++;
      if (falhas.filter((f) => f.regra === "sem-colisao").length < 5) falhas.push({ regra: "sem-colisao", t: +t.toFixed(3), msg: `texto "${col.colisao[0].texto}" ${JSON.stringify(col.colisao[0].t)} bate no HUD "${col.colisao[0].hud}" ${JSON.stringify(col.colisao[0].h)}` + (col.colisao.length > 1 ? ` (+${col.colisao.length - 1})` : "") });
    }

    info.qa.forEach((g, k) => {
      const v = r[k];
      if (v === null) return;
      const m = (medidas[k] ??= { regra: g.tipo, alvo: g.alvo, quadros: 0 });
      m.quadros++;
      if (g.tipo === "legenda-clara" && !v.vazio) {
        m.lumMin = Math.min(m.lumMin ?? 1, v.lum); m.opMin = Math.min(m.opMin ?? 1, v.op);
        if (v.lum < (g.minimo ?? 0.5) || v.op < 0.99) reg(g, t, `palavra ativa "${v.txt}" escura: luminância ${v.lum.toFixed(2)}, opacidade ${v.op.toFixed(2)}`);
      }
      if (g.tipo === "parado") {
        const ant = posAnterior.get(k);
        if (ant) {
          let d = 0; v.forEach((b, j) => { if (ant[j]) d = Math.max(d, ...b.map((x, q) => Math.abs(x - ant[j][q]))); });
          m.maxMov = Math.max(m.maxMov ?? 0, d);
          if (d > 0.5) reg(g, t, `título pousado se moveu ${d.toFixed(1)} px`);
        }
        posAnterior.set(k, v);
      }
      if (g.tipo === "seguro" && v.length) { m.foraDaZona = (m.foraDaZona ?? 0) + 1; reg(g, t, `fora da zona segura: ${JSON.stringify(v[0])}`); }
      if (g.tipo === "cta") {
        const ok = v.length && v.every((e) => e.op > 0.99 && (e.blur === "none" || /blur\(0px\)/.test(e.blur)));
        m.visivel = (m.visivel ?? 0) + (ok ? 1 / fps : 0);
      }
      if (g.tipo === "legivel-no-inicio") {
        const ok = v.length && v.every((e) => e.op > 0.99 && (e.blur === "none" || /blur\(0px\)/.test(e.blur)));
        m.ok = ok; if (!ok) reg(g, t, "gancho não está legível no primeiro quadro");
      }
    });
  }
  info.qa.forEach((g, k) => {
    if (g.tipo === "cta") {
      const s = medidas[k]?.visivel ?? 0;
      if (s < (g.minimo ?? 2)) falhas.push({ regra: "cta", alvo: g.alvo, msg: `CTA visível só ${s.toFixed(2)} s (mínimo ${g.minimo ?? 2} s)` });
    }
  });
  if (sess.erros.length) falhas.push({ regra: "console", msg: sess.erros.slice(0, 3).join(" | ") });
  const rel = { comp: arq, quadros: N + 1, fps, zona, medidas: [...Object.values(medidas), colisao], falhas };
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(rel, null, 1));
  for (const m of rel.medidas) console.log(`· ${m.regra.padEnd(18)} ${m.alvo}  ${JSON.stringify(Object.fromEntries(Object.entries(m).filter(([k]) => !["regra", "alvo"].includes(k)).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(3) : v])))}`);
  console.log(falhas.length ? `\n${falhas.length} falha(s):\n` + falhas.map((f) => `  ✗ [${f.regra}] ${f.t ?? ""} ${f.msg}`).join("\n") : "\ntudo dentro das regras.");
  await sess.fechar();
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
