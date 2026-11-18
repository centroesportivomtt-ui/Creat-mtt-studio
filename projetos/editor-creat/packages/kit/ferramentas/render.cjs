#!/usr/bin/env node
// Renderizador do kit: Chromium (Playwright) avança o tempo quadro a quadro e entrega os quadros ao ffmpeg.
//
// Vídeo final 1080x1920 30 fps H.264:
//   node ferramentas/render.cjs cenas/demo.json --out saida/demo.mp4
// Overlay transparente (sem as camadas de fundo):
//   node ferramentas/render.cjs cenas/demo.json --alfa prores --out saida/overlay.mov     (ProRes 4444 com alfa)
//   node ferramentas/render.cjs cenas/demo.json --alfa png --out saida/overlay_png/       (sequência PNG RGBA)
// Overlay já aplicado sobre uma gravação (corta e enquadra 9:16 sozinho):
//   node ferramentas/render.cjs cenas/legenda.json --sobre bruto.mp4 --out saida/com_legenda.mp4
// Folha de contato (8 fps, 25%, tempo escrito em cada quadro) para OLHAR depois de cada mudança:
//   node ferramentas/render.cjs cenas/demo.json --folha --out saida/folha.jpg [--de 2 --ate 6]
// Quadros soltos em tamanho cheio:
//   node ferramentas/render.cjs cenas/demo.json --quadros 0,1.2,5.5 --out saida/quadros/
// Opções: --de/--ate (s), --fps, --escala (0.25..1), --sub N (blur de movimento por N subquadros, obturador 180°),
//         --crf (16), --colunas (folha, 8)
// Captura: HeadlessExperimental.beginFrame no chrome-headless-shell (padrão; MK_BF=0 volta ao screenshot do Playwright).
// Paralelo (só sequência PNG): --workers N divide o intervalo em N processos (um Chromium cada); os quadros saem com
//   índice GLOBAL (quadro_<round(t*fps)>.png) e quadro idêntico ao anterior vira link físico (não ocupa disco nem PNG novo).
//   --json imprime no fim uma linha "MKSTATS {...}" com quadros, ms/quadro por worker e ms efetivos (relógio / quadros).
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { abrir, lerComp, args } = require("./comum.cjs");

const o = args(process.argv.slice(2));
const arqComp = o._?.[0] ?? o.comp;
if (!arqComp || !o.out) { console.error("uso: render.cjs <comp.json> --out <saida> [--alfa png|prores] [--folha] [--quadros t1,t2] [--sobre video] [--de s --ate s] [--sub N]"); process.exit(2); }
const comp = lerComp(arqComp);
const FOLHA = !!o.folha;
const ALFA = o.alfa === true ? "prores" : o.alfa || (o.sobre ? "png" : null);
const fps = FOLHA ? +(o.fps ?? 8) : +(o.fps ?? comp.formato?.fps ?? 30);
const escala = FOLHA ? +(o.escala ?? 0.25) : +(o.escala ?? 1);
const sub = Math.max(1, +(o.sub ?? 1));
const ffmpeg = (a, inherit = true) => spawn("nice", ["-n", "10", "ffmpeg", "-hide_banner", "-v", "error", "-y", ...a], { stdio: ["pipe", inherit ? "inherit" : "pipe", "inherit"] });
const escrever = (proc, buf) => new Promise((ok, erro) => {
  if (proc.exitCode !== null || proc.morreu) return erro(new Error("ffmpeg parou antes do fim (veja o erro acima)"));
  if (proc.stdin.write(buf)) return ok();
  const fim = () => erro(new Error("ffmpeg parou antes do fim (veja o erro acima)"));
  proc.once("close", fim);
  proc.stdin.once("drain", () => { proc.off("close", fim); ok(); });
});
const fechar = (proc) => new Promise((ok, erro) => { proc.on("close", (c) => (c === 0 ? ok() : erro(new Error("ffmpeg saiu com " + c)))); proc.stdin.end(); });

// --workers N: divide o intervalo entre N processos filhos (só para sequência PNG)
async function emParalelo(nw) {
  const info = { duracao: comp.duracao, fps: comp.formato?.fps ?? 30 };
  const de = +(o.de ?? 0), ate = Math.min(+(o.ate ?? info.duracao), info.duracao);
  const a = Math.round(de * fps), b = Math.round(ate * fps), passo = Math.ceil((b - a) / nw);
  fs.mkdirSync(o.out, { recursive: true });
  const t0 = Date.now();
  const partes = [];
  for (let k = 0; k < nw; k++) {
    const x = a + k * passo, y = Math.min(b, x + passo);
    if (y <= x) continue;
    const av = ["--alfa", "png", "--out", o.out, "--de", String(x / fps), "--ate", String(y / fps), "--fps", String(fps), "--json", "--filho", "--workers", "1"];
    partes.push(new Promise((ok, erro) => {
      const p = spawn(process.execPath, [__filename, arqComp, ...av], { stdio: ["ignore", "pipe", "inherit"] });
      let saida = "";
      p.stdout.on("data", (d) => (saida += d));
      p.on("close", (c) => {
        const m = saida.match(/MKSTATS (\{.*\})/);
        if (c !== 0 || !m) return erro(new Error(`worker ${k} saiu com ${c}:\n${saida.slice(-800)}`));
        ok(JSON.parse(m[1]));
      });
    }));
  }
  const st = await Promise.all(partes);
  const N = st.reduce((s, x) => s + x.quadros, 0), rel = Date.now() - t0;
  const r = { quadros: N, ms_quadro: +(st.reduce((s, x) => s + x.ms_quadro * x.quadros, 0) / N).toFixed(1), ms_efetivo: +(rel / N).toFixed(1),
    workers: st.length, repetidos: st.reduce((s, x) => s + x.repetidos, 0), captura: st[0].captura, erros: st.reduce((s, x) => s + x.erros, 0), relogio_s: +(rel / 1000).toFixed(1) };
  fs.writeFileSync(o.out.replace(/\/$/, "") + ".cues.json", JSON.stringify({ duracao: comp.duracao, fps: info.fps, cues: [] }, null, 1));
  console.log(`pronto: ${o.out} · ${N} quadros · ${r.workers} workers · ${r.ms_quadro} ms/quadro em cada · ${r.ms_efetivo} ms/quadro efetivos · ${r.repetidos} repetidos`);
  if (o.json) console.log("MKSTATS " + JSON.stringify(r));
}

(async () => {
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  const nw = Math.max(1, +(o.workers ?? 1));
  if (nw > 1) {
    if (!(ALFA === "png" && !o.sobre && !FOLHA && !o.quadros)) console.error("aviso: --workers só vale para --alfa png (sequência); seguindo com 1 worker");
    else return emParalelo(nw);
  }
  const sess = await abrir(comp, { alfa: !!ALFA, escala });
  const { page, info } = sess;
  const de = +(o.de ?? 0), ate = Math.min(+(o.ate ?? info.duracao), info.duracao);
  const W = Math.round(info.w * escala), H = Math.round(info.h * escala);
  const tiro = (t) => sess.tiro(t, { formato: ALFA ? "png" : "jpeg", qualidade: FOLHA ? 85 : 95 });
  const base = o.out.replace(/\/$/, "").replace(/\.[a-z0-9]+$/i, "");
  if (!o.filho) fs.writeFileSync(base + ".cues.json", JSON.stringify({ duracao: info.duracao, fps: info.fps, cues: info.cues }, null, 1));

  // quadros soltos
  if (o.quadros) {
    fs.mkdirSync(o.out, { recursive: true });
    for (const t of String(o.quadros).split(",").map(Number)) {
      const buf = await tiro(t);
      fs.writeFileSync(path.join(o.out, `q_${t.toFixed(2).padStart(6, "0")}.${ALFA ? "png" : "jpg"}`), buf);
    }
    console.log(`quadros em ${o.out}`);
    if (sess.erros.length) console.log("erros do navegador:\n" + sess.erros.join("\n"));
    return sess.fechar();
  }

  const i0 = Math.round(de * fps);
  const N = Math.max(1, Math.round(ate * fps) - i0);
  let proc = null;
  const dirPng = ALFA === "png" && !o.sobre ? o.out : null;
  if (dirPng) fs.mkdirSync(dirPng, { recursive: true });
  // codec da entrada explícito: um quadro inicial todo liso gera um JPEG mínimo que o ffmpeg não reconhece sozinho
  const entrada = ["-f", "image2pipe", "-c:v", ALFA ? "png" : "mjpeg", "-framerate", String(fps * sub), "-i", "-"];
  const mb = sub > 1 ? [`tmix=frames=${sub}`, `select='eq(mod(n\\,${sub})\\,${sub - 1})'`, `setpts=N/(${fps}*TB)`] : [];
  const x264 = ["-c:v", "libx264", "-preset", "medium", "-crf", String(o.crf ?? 16), "-pix_fmt", "yuv420p", "-profile:v", "high", "-x264-params", "aq-mode=3", "-threads", "2", "-r", String(fps), "-movflags", "+faststart"];

  if (FOLHA) {
    const colunas = +(o.colunas ?? 8), linhas = Math.ceil(N / colunas);
    const fonte = path.join(__dirname, "..", "assets", "fonts", "JetBrainsMono-Bold.ttf");
    const vf = [`drawbox=x=0:y=ih-34:w=iw:h=34:color=black@0.7:t=fill`, `drawtext=fontfile=${fonte}:text='%{pts\\:hms\\:${de}}  q%{eif\\:n*${info.fps}/${fps}+${Math.round(de * info.fps)}\\:d}':x=8:y=h-28:fontsize=20:fontcolor=white`, `tile=${colunas}x${linhas}:padding=4:color=0x222222`];
    proc = ffmpeg([...entrada, "-vf", vf.join(","), "-frames:v", "1", "-q:v", "3", o.out]);
  } else if (o.sobre) {
    // gravação embaixo (cortada e enquadrada 9:16), overlay PNG com alfa por cima
    const vf = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[b];[1:v]${mb.length ? mb.join(",") + "," : ""}format=rgba[o];[b][o]overlay=0:0:shortest=1,format=yuv420p[v]`;
    proc = ffmpeg(["-ss", String(de), "-t", String(ate - de), "-i", o.sobre, ...entrada, "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", "-c:a", "aac", "-b:a", "256k", ...x264, o.out]);
  } else if (ALFA === "prores") {
    proc = ffmpeg([...entrada, ...(mb.length ? ["-vf", mb.join(",")] : []), "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0", "-threads", "2", "-r", String(fps), o.out]);
  } else if (!dirPng) {
    proc = ffmpeg([...entrada, ...(mb.length ? ["-vf", mb.join(",")] : []), ...x264, o.out]);
  }

  if (proc) proc.on("close", () => (proc.morreu = true));
  const t0 = Date.now();
  const obturador = 0.5; // 180°
  let hashAnt = null, arqAnt = null, repetidos = 0;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < sub; k++) {
      const t = (i0 + i) / fps + (sub > 1 ? ((k - (sub - 1)) / sub) * (obturador / fps) : 0);
      const buf = await tiro(Math.max(0, t));
      if (dirPng) {
        const arq = path.join(dirPng, `quadro_${String(i0 + i).padStart(5, "0")}.png`);
        const h = crypto.createHash("md5").update(buf).digest("hex");
        try { fs.unlinkSync(arq); } catch {}
        if (h === hashAnt && arqAnt) { fs.linkSync(arqAnt, arq); repetidos++; }
        else { fs.writeFileSync(arq, buf); hashAnt = h; arqAnt = arq; }
      } else await escrever(proc, buf);
    }
    if (!FOLHA && (i % 60 === 59 || i === N - 1)) process.stdout.write(`\r${i + 1}/${N} quadros · ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms/quadro   `);
  }
  if (proc) await fechar(proc);
  const ms = (Date.now() - t0) / N;
  console.log(`\npronto: ${o.out} · ${N} quadros · ${ms.toFixed(0)} ms/quadro${sub > 1 ? ` (sub ${sub})` : ""} · captura ${sess.captura}${dirPng ? ` · ${repetidos} repetidos` : ""}`);
  if (o.json) console.log("MKSTATS " + JSON.stringify({ quadros: N, ms_quadro: +ms.toFixed(1), ms_efetivo: +ms.toFixed(1), workers: 1, repetidos, captura: sess.captura, erros: sess.erros.length }));
  if (sess.erros.length) console.log("erros do navegador:\n" + sess.erros.join("\n"));
  await sess.fechar();
})().catch((e) => { console.error(e); process.exit(1); });
