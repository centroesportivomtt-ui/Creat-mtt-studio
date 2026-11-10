#!/usr/bin/env node
/* Gera os Reels "Atrás da placa" na nuvem: captura da página real -> palco quadro a quadro -> trilha
   sintetizada -> H.264 com ffmpeg. Órbita, 10/11/2026.

   node marketing/trafego/video/gerar.cjs                 # R8 e R7, tudo
   node marketing/trafego/video/gerar.cjs R7              # só um
   node marketing/trafego/video/gerar.cjs R8 --so palco,video   # etapas: captura,palco,som,video
   node marketing/trafego/video/gerar.cjs R8 --quadros 0,36,66  # só fotografa esses quadros (conferência)

   Quadros intermediários ficam em /tmp/reels (REELS_TMP); no repositório só entram as saídas de saida/.
   Requer: playwright (Chromium já instalado na nuvem do Claude Code) e /usr/bin/ffmpeg. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const L = require('./linhas.js');
const C = require('./captura.cjs');
const TMP = C.TMP, SAIDA = path.join(__dirname, 'saida');
const FFMPEG = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg', FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');

const args = process.argv.slice(2);
const reels = args.filter(a => /^R\d+$/.test(a)); if (!reels.length) reels.push('R8', 'R7');
const iSo = args.indexOf('--so'), etapas = iSo > -1 ? args[iSo + 1].split(',') : ['captura', 'palco', 'som', 'video'];
const iQ = args.indexOf('--quadros'), soQuadros = iQ > -1 ? args[iQ + 1].split(',').map(Number) : null;
const log = (...a) => console.log(...a);

/* capa: o quadro mais forte de cada Reel (placa ABERTO com nome e legenda) */
const CAPA = { R8: 2.3, R7: 2.4 };

async function renderPalco(browser, base, reel) {
  const R = L[reel], dir = path.join(TMP, 'quadros', reel);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'no-preference' });
  await C.rotearFontes(ctx);
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push('script: ' + e.message)); pg.on('console', m => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
  await pg.goto(base + '/marketing/trafego/video/palco.html?reel=' + reel, { waitUntil: 'load' });
  const info = await pg.evaluate(() => window.preparar());
  const total = Math.round(R.duracao * L.FPS);
  const lista = soQuadros || [...Array(total).keys()];
  for (const f of lista) {
    const t = f / L.FPS;
    await pg.evaluate(t => window.quadro(t), t);
    await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), type: 'png', animations: 'allow' });
    if (f % 60 === 0) log('  palco ' + reel + ' ' + t.toFixed(1) + ' s');
  }
  /* guia de área segura, uma vez, para conferência */
  await ctx.close();
  return { erros, info };
}

async function renderSom(browser, base, reel) {
  const R = L[reel];
  const ctx = await browser.newContext();
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.goto(base + '/marketing/trafego/video/palco.html?reel=' + reel + '&som=1', { waitUntil: 'domcontentloaded' });
  await pg.addScriptTag({ path: path.join(__dirname, 'som.js') });
  const pcm = await pg.evaluate(async ({ eventos, dur }) => window.CreatTrilha.render(eventos, dur), { eventos: R.som, dur: R.duracao });
  await ctx.close();
  if (erros.length) throw new Error('som: ' + erros.join(' | '));
  /* WAV 48 kHz, estéreo, 32 bits float */
  const f32 = b => { const x = Buffer.from(b, 'base64'); return new Float32Array(x.buffer, x.byteOffset, x.length / 4); };
  pcm.L = f32(pcm.L); pcm.R = f32(pcm.R);
  const n = pcm.L.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(48000, 24); buf.writeUInt32LE(48000 * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(pcm.L[i], 44 + i * 8); buf.writeFloatLE(pcm.R[i], 48 + i * 8); }
  const bruto = path.join(TMP, reel + '-trilha-bruta.wav'); fs.writeFileSync(bruto, buf);
  /* loudness: duas passadas do loudnorm (EBU R128) para -13 LUFS, depois um limitador com 4x de sobreamostragem em
     -3 dBFS, que tira cerca de 1,4 LU dos transientes (sino, porta) e deixa o integrado entre -14,5 e -14,7 LUFS. O AAC sobe os
     picos depois do limitador, então a folga fica do lado de cá; o alvo é pico real abaixo de -2 dBTP no MP4.
     O número que vale é o medido no MP4 final (montarVideo), não no WAV. */
  const js = medir(bruto);
  const final = path.join(TMP, reel + '-trilha.wav');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', bruto, '-af',
    `loudnorm=I=-13:TP=-1.5:LRA=11:measured_I=${js.input_i}:measured_TP=${js.input_tp}:measured_LRA=${js.input_lra}:measured_thresh=${js.input_thresh}:offset=${js.target_offset}:linear=true,` + LIMITADOR,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', final]);
  const jc = medir(final);
  return { final, antes: js.input_i, depois: jc.input_i, pico: jc.input_tp };
}
const LIMITADOR = 'aresample=192000,alimiter=limit=0.7079:attack=1:release=60:level=false,aresample=48000';
/* mede loudness integrado e pico real (EBU R128) de qualquer arquivo com áudio */
function medir(arq) {
  const r = require('child_process').spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', arq, '-map', '0:a:0', '-af', 'loudnorm=I=-14:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{')));
}

function montarVideo(reel) {
  const R = L[reel], dir = path.join(TMP, 'quadros', reel);
  fs.mkdirSync(SAIDA, { recursive: true });
  const mp4 = path.join(SAIDA, R.arquivo + '.mp4');
  const trilha = path.join(TMP, reel + '-trilha.wav');
  /* 2 passadas a taxa média: cabe em 8 MB com folga (15 s x ~3,4 Mb/s de vídeo + 160 kb/s de áudio) */
  const comum = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(L.FPS), '-i', path.join(dir, '%04d.png')];
  const v = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-b:v', '3400k', '-maxrate', '5000k', '-bufsize', '6800k',
    '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-tune', 'animation', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-vf', 'scale=1080:1920:flags=lanczos:out_color_matrix=bt709,format=yuv420p', '-r', String(L.FPS)];
  const log2 = path.join(TMP, reel + '-x264');
  execFileSync(FFMPEG, [...comum, ...v, '-pass', '1', '-passlogfile', log2, '-an', '-f', 'mp4', '/dev/null'], { cwd: TMP });
  execFileSync(FFMPEG, [...comum, '-i', trilha, ...v, '-pass', '2', '-passlogfile', log2, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', '-metadata', 'title=' + R.arquivo + ' · Creat Nuvem · Porta Aberta', mp4], { cwd: TMP });
  /* pico real medido no MP4 (depois do AAC). Acima de -2 dBTP: abaixa o ganho da trilha e refaz só o áudio (vídeo copiado) */
  let m = medir(mp4), tentativas = 0, ganho = 0;
  while (parseFloat(m.input_tp) > -2.0 && tentativas < 4) {
    tentativas++;
    ganho += -2.15 - parseFloat(m.input_tp);
    const tmp = path.join(TMP, reel + '-remux.mp4');
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-i', trilha, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-af', 'volume=' + ganho.toFixed(2) + 'dB', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart',
      '-metadata', 'title=' + R.arquivo + ' · Creat Nuvem · Porta Aberta', tmp]);
    fs.renameSync(tmp, mp4);
    m = medir(mp4);
  }
  const audio = { lufs: parseFloat(m.input_i), dbtp: parseFloat(m.input_tp), lra: parseFloat(m.input_lra), ajustes: tentativas, ganhoExtraDb: +ganho.toFixed(2) };
  /* capa PNG 1080x1920 tirada de um quadro forte */
  const capa = path.join(SAIDA, R.arquivo + '-capa.png');
  fs.copyFileSync(path.join(dir, String(Math.round(CAPA[reel] * L.FPS)).padStart(4, '0') + '.png'), capa);
  const pr = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels', '-of', 'json', mp4]).toString());
  return { mp4, capa, probe: pr, audio };
}

(async () => {
  if (etapas.includes('captura') || etapas.includes('palco')) log('fontes:', C.garantirFontes(), 'arquivos');
  const srv = await C.servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
  const resumo = {};
  try {
    for (const reel of reels) {
      const r = resumo[reel] = {};
      const t0 = Date.now();
      if (etapas.includes('captura')) {
        log(reel + ': captura da página real');
        const dir = path.join(TMP, 'cap', reel); fs.rmSync(dir, { recursive: true, force: true });
        r.captura = reel === 'R8' ? await C.capturarR8(browser, base, L, dir, log) : await C.capturarR7(browser, base, L, dir, log);
      }
      if (etapas.includes('palco')) { log(reel + ': palco'); r.palco = await renderPalco(browser, base, reel); if (r.palco.erros.length) log('  ERROS no palco:', r.palco.erros); }
      if (etapas.includes('som')) { log(reel + ': trilha'); r.som = await renderSom(browser, base, reel); log('  loudness', r.som); }
      if (etapas.includes('video') && !soQuadros) { log(reel + ': ffmpeg'); r.video = montarVideo(reel); log('  ', JSON.stringify(r.video.probe)); }
      log(reel + ' pronto em ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
  } finally { await browser.close(); srv.close(); }
  fs.writeFileSync(path.join(TMP, 'resumo.json'), JSON.stringify(resumo, (k, v) => (k === 'ponteiro' ? undefined : v), 1));
})().catch(e => { console.error(e); process.exit(1); });
