#!/usr/bin/env node
/* Gera os Reels "Atrás da placa" na nuvem: captura da página real -> palco quadro a quadro -> trilha
   sintetizada -> H.264 com ffmpeg. Órbita, 10/11/2026; versões orgânica e de anúncio (faixa de preço),
   variante com foto e saída fora do repositório em 11/11/2026.

   node marketing/trafego/video/gerar.cjs R8 --saida <pasta>             # captura, palco, som e as 2 versões
   node marketing/trafego/video/gerar.cjs R7 --variante foto --fotos <pasta das fotos aprovadas> --saida <pasta>
   node marketing/trafego/video/gerar.cjs R8 --so palco,video             # etapas: captura,palco,som,video
   node marketing/trafego/video/gerar.cjs R8 --versoes anuncio            # só uma versão (organico,anuncio)
   node marketing/trafego/video/gerar.cjs R8 --quadros 0,36,66            # só fotografa esses quadros (conferência)

   Saída: --saida <pasta> ou REELS_SAIDA; sem nenhum dos dois vai para <REELS_TMP>/saida. Nunca para o repositório
   (ele é público e não recebe vídeo novo). Quadros intermediários em /tmp/reels (REELS_TMP).
   Por arquivo final: "Reel R7 - Barbearia - A Mensagem das 23h (15s).mp4", o mesmo com " - anuncio com preco"
   e a capa "... (15s) - capa.png" (nomes sem acento, linhas.js nomeArquivo).
   Economia de render: a versão de anúncio só renderiza o cartão final (os quadros antes dele são os mesmos, ligados
   por hardlink) e a variante só renderiza até "difereAte"; o resto vem das versões já prontas.
   Requer: playwright (Chromium já instalado na nuvem do Claude Code) e /usr/bin/ffmpeg. */
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const L = require('./linhas.js');
const C = require('./captura.cjs');
const TMP = C.TMP;
const FFMPEG = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg', FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const reels = args.filter(a => /^R\d+$/.test(a)); if (!reels.length) reels.push(...L.REELS);
const etapas = (opt('--so') || 'captura,palco,som,video').split(',');
const soQuadros = opt('--quadros') ? opt('--quadros').split(',').map(Number) : null;
const versoes = (opt('--versoes') || 'organico,anuncio').split(',');
const variante = opt('--variante');
const SAIDA = path.resolve(opt('--saida') || process.env.REELS_SAIDA || path.join(TMP, 'saida'));
const FOTOS = opt('--fotos') || process.env.REELS_FOTOS || '';
if (SAIDA.startsWith(path.resolve(C.RAIZ))) { console.error('saída dentro do repositório (público): use --saida fora dele'); process.exit(2); }
for (const v of versoes) if (!L.VERSOES[v]) { console.error('versão desconhecida: ' + v); process.exit(2); }
const log = (...a) => console.log(...a);
const nq = f => String(f).padStart(4, '0') + '.png';

/* pasta de quadros de cada combinação; a variante usa sua própria subpasta */
const dirQuadros = (reel, versao, vari) => path.join(TMP, 'quadros', reel, (vari ? vari + '-' : '') + versao);

/* renderiza no palco os quadros [de, ate) (ou a lista soQuadros) da combinação pedida */
async function renderPalco(browser, base, reel, versao, vari, de, ate) {
  const R = L[reel], dir = dirQuadros(reel, versao, vari);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'no-preference' });
  await C.rotearFontes(ctx);
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', e => erros.push('script: ' + e.message)); pg.on('console', m => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
  let q = '?reel=' + reel + '&versao=' + versao;
  if (vari) q += '&variante=' + vari + '&foto=' + encodeURIComponent('/__tmp/fotos/' + reel + '-' + vari + '.png');
  await pg.goto(base + '/marketing/trafego/video/palco.html' + q, { waitUntil: 'load' });
  const info = await pg.evaluate(() => window.preparar());
  const total = Math.round(R.duracao * L.FPS);
  const f0 = Math.round(de * L.FPS), f1 = Math.min(total, Math.round(ate * L.FPS));
  const lista = soQuadros || [...Array(f1 - f0).keys()].map(k => k + f0);
  let cartao = null;
  for (const f of lista) {
    const t = f / L.FPS;
    await pg.evaluate(t => window.quadro(t), t);
    await pg.screenshot({ path: path.join(dir, nq(f)), type: 'png', animations: 'allow' });
    if (!cartao && t >= R.cartao + 1.2) cartao = await pg.evaluate(() => window.medirCartao());
    if (f % 60 === 0) log('  palco ' + reel + ' ' + (vari ? vari + '/' : '') + versao + ' ' + t.toFixed(1) + ' s');
  }
  await ctx.close();
  return { erros, info, cartao, quadros: lista.length };
}

/* liga (hardlink) os quadros [de, ate) de outra pasta já renderizada */
function ligar(deDir, paraDir, de, ate) {
  fs.mkdirSync(paraDir, { recursive: true });
  const f0 = Math.round(de * L.FPS), f1 = Math.round(ate * L.FPS);
  for (let f = f0; f < f1; f++) {
    const a = path.join(deDir, nq(f)), b = path.join(paraDir, nq(f));
    if (!fs.existsSync(a)) throw new Error('quadro que falta para ligar: ' + a);
    fs.rmSync(b, { force: true }); fs.linkSync(a, b);
  }
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
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', arq, '-map', '0:a:0', '-af', 'loudnorm=I=-14:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{')));
}
/* pico de amostra (volumedetect), o número pedido na conferência: tem de ficar abaixo de -1 dB */
function picoAmostra(arq) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', arq, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr), md = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
  return { max: m ? parseFloat(m[1]) : null, media: md ? parseFloat(md[1]) : null };
}

function montarVideo(reel, versao, vari) {
  const R = L[reel], dir = dirQuadros(reel, versao, vari);
  fs.mkdirSync(SAIDA, { recursive: true });
  const nome = L.nomeArquivo(R, versao, vari), mp4 = path.join(SAIDA, nome + '.mp4');
  const titulo = nome + ' · Creat Nuvem · Porta Aberta';
  const trilha = path.join(TMP, reel + '-trilha.wav');
  /* 2 passadas a taxa média: cabe em 8 MB com folga (15 s x ~3,4 Mb/s de vídeo + 160 kb/s de áudio) */
  const comum = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(L.FPS), '-i', path.join(dir, '%04d.png')];
  const v = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-b:v', '3400k', '-maxrate', '5000k', '-bufsize', '6800k',
    '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-tune', 'animation', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-vf', 'scale=1080:1920:flags=lanczos:out_color_matrix=bt709,format=yuv420p', '-r', String(L.FPS), '-threads', '2'];
  const log2 = path.join(TMP, reel + '-x264');
  execFileSync(FFMPEG, [...comum, ...v, '-pass', '1', '-passlogfile', log2, '-an', '-f', 'mp4', '/dev/null'], { cwd: TMP });
  execFileSync(FFMPEG, [...comum, '-i', trilha, ...v, '-pass', '2', '-passlogfile', log2, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', '-metadata', 'title=' + titulo, mp4], { cwd: TMP });
  /* pico real medido no MP4 (depois do AAC). Acima de -2 dBTP: abaixa o ganho da trilha e refaz só o áudio (vídeo copiado) */
  let m = medir(mp4), tentativas = 0, ganho = 0;
  while (parseFloat(m.input_tp) > -2.0 && tentativas < 4) {
    tentativas++;
    ganho += -2.15 - parseFloat(m.input_tp);
    const tmp = path.join(TMP, reel + '-remux.mp4');
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-i', trilha, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-af', 'volume=' + ganho.toFixed(2) + 'dB', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart',
      '-metadata', 'title=' + titulo, tmp]);
    fs.renameSync(tmp, mp4);
    m = medir(mp4);
  }
  const audio = { lufs: parseFloat(m.input_i), dbtp: parseFloat(m.input_tp), lra: parseFloat(m.input_lra), ajustes: tentativas, ganhoExtraDb: +ganho.toFixed(2), volumedetect: picoAmostra(mp4) };
  /* capa PNG 1080x1920 tirada de um quadro forte (uma por Reel: a versão orgânica sem variante) */
  let capa = null;
  if (versao === 'organico' && !vari) {
    capa = path.join(SAIDA, L.capaArquivo(R) + '.png');
    fs.copyFileSync(path.join(dir, nq(Math.round(R.capa * L.FPS))), capa);
  }
  const pr = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels', '-of', 'json', mp4]).toString());
  return { mp4, capa, probe: pr, audio };
}

(async () => {
  if (etapas.includes('captura') || etapas.includes('palco')) log('fontes:', C.garantirFontes(), 'arquivos');
  const srv = await C.servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
  const resumoArq = path.join(TMP, 'resumo.json');
  let resumo = {}; try { resumo = JSON.parse(fs.readFileSync(resumoArq, 'utf8')); } catch (e) {}
  try {
    for (const reel of reels) {
      const R = L[reel]; if (!R) throw new Error('Reel desconhecido: ' + reel);
      const VAR = variante ? (R.variantes || {})[variante] : null;
      if (variante && !VAR) throw new Error(reel + ' não tem a variante ' + variante);
      const r = resumo[reel] = resumo[reel] || {};
      const t0 = Date.now();
      if (etapas.includes('captura') && !variante) {
        log(reel + ': captura da página real (' + R.captura + ')');
        const dir = path.join(TMP, 'cap', reel); fs.rmSync(dir, { recursive: true, force: true });
        const fc = C.CAPTURAS[R.captura]; if (!fc) throw new Error('captura desconhecida: ' + R.captura);
        r.captura = await fc(browser, base, L, reel, dir, log);
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(r.captura, null, 1));
      }
      if (VAR) {
        if (!FOTOS) throw new Error('a variante ' + variante + ' precisa de --fotos <pasta> (ou REELS_FOTOS)');
        fs.mkdirSync(path.join(TMP, 'fotos'), { recursive: true });
        fs.copyFileSync(path.join(FOTOS, VAR.foto), path.join(TMP, 'fotos', reel + '-' + variante + '.png'));
      }
      if (etapas.includes('palco')) {
        r.palco = r.palco || {};
        for (const versao of versoes) {
          const chave = (variante ? variante + '-' : '') + versao, dir = dirQuadros(reel, versao, variante);
          if (!soQuadros) fs.rmSync(dir, { recursive: true, force: true });
          let de = 0, ate = R.duracao;
          /* anúncio: só o cartão final muda; variante: só o começo muda */
          const orgDir = dirQuadros(reel, 'organico', variante), baseDir = dirQuadros(reel, versao, null);
          if (soQuadros) { /* conferência: renderiza só os quadros pedidos */ }
          else if (variante && fs.existsSync(path.join(baseDir, nq(Math.round(R.duracao * L.FPS) - 1)))) { ate = VAR.difereAte; ligar(baseDir, dir, VAR.difereAte, R.duracao); }
          else if (versao !== 'organico' && fs.existsSync(path.join(orgDir, nq(Math.round(R.cartao * L.FPS) - 1)))) { de = R.cartao; ligar(orgDir, dir, 0, R.cartao); }
          log(reel + ': palco ' + chave + ' de ' + de + ' a ' + ate + ' s');
          r.palco[chave] = await renderPalco(browser, base, reel, versao, variante, de, ate);
          if (r.palco[chave].erros.length) log('  ERROS no palco:', r.palco[chave].erros);
        }
      }
      if (etapas.includes('som') && !variante) { log(reel + ': trilha'); r.som = await renderSom(browser, base, reel); log('  loudness', r.som); }
      if (etapas.includes('video') && !soQuadros) {
        r.video = r.video || {};
        for (const versao of versoes) {
          const chave = (variante ? variante + '-' : '') + versao;
          log(reel + ': ffmpeg ' + chave); r.video[chave] = montarVideo(reel, versao, variante); log('  ', JSON.stringify(r.video[chave].audio), path.basename(r.video[chave].mp4));
        }
      }
      log(reel + ' pronto em ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
  } finally { await browser.close(); srv.close(); }
  fs.writeFileSync(resumoArq, JSON.stringify(resumo, (k, v) => (k === 'ponteiro' || k === 'rolagemY' || k === 'precos' ? undefined : v), 1));
})().catch(e => { console.error(e); process.exit(1); });
