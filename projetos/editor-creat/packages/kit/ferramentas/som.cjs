#!/usr/bin/env node
// Sound design automático a partir dos cues que os modelos registram (ctx.cue) durante o render.
// Regras da casa: SFX só nas MUDANÇAS; transiente 1 quadro DEPOIS da imagem (a luz chega antes do som);
// revezar amostras (o mesmo whoosh em todo corte é sinal de amador); silêncio curto em volta do impacto do logo;
// música por baixo; mix final em -14 LUFS integrado e pico real de -1,5 dBTP (loudnorm em duas passadas).
//   node ferramentas/som.cjs --video saida/demo.mp4 --cues saida/demo.cues.json --comp cenas/demo.json --out saida/demo_som.mp4
// Biblioteca: MK_SOM=<pasta com sfx/ e music/> (padrão: a biblioteca licenciada da creat.MTT na nuvem)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { args } = require("./comum.cjs");

const o = args(process.argv.slice(2));
const BIB = process.env.MK_SOM || "/tmp/claude-0/-home-user-Creat-nuvem-VIBE-CODE/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/assets/audio";
const comp = o.comp ? JSON.parse(fs.readFileSync(o.comp, "utf8")) : {};
const { cues, duracao, fps } = JSON.parse(fs.readFileSync(o.cues, "utf8"));
const QUADRO = 1 / (fps || 30);

// cue -> amostras (revezadas), ganho base e alinhamento
const MAPA = {
  risco:          { f: ["sfx/ui_click_003_kenney.wav", "sfx/ui_click_005_kenney.wav"], g: -8 },
  embaralha:      { f: ["sfx/glitch_micro_kenney_01.wav", "sfx/glitch_micro_kenney_03.wav"], g: -10 },
  impacto:        { f: ["sfx/impact_cinematic_02_tight.wav"], g: -1 },
  whip:           { f: ["sfx/whip_pan_01.wav", "sfx/whip_pan_02.wav", "sfx/whip_pan_03.wav"], g: -4 },
  "legenda-entra":{ f: ["sfx/ui_pop_01.wav"], g: -16 },
  chip:           { f: ["sfx/ui_pop_02.wav", "sfx/ui_pop_03.wav"], g: -10 },
  mascara:        { f: ["sfx/swish_whip_05.wav", "sfx/swish_whip_07.wav"], g: -6 },
  redemoinho:     { f: ["sfx/energy_swell_3s.wav"], g: -9 },
  forma:          { f: ["sfx/sub_boom_01.wav"], g: -4 },
  giro:           { f: ["sfx/swish_whip_03.wav", "sfx/swish_whip_09.wav"], g: -6 },
  mergulho:       { f: ["sfx/reverse_cymbal_2s.wav"], g: -8, fimEm: 0.3 }, // termina no corte
  abre:           { f: ["sfx/impact_cinematic_01.wav"], g: 0, silencio: [0.18, 0.5] }, // abre um vão na música
  logo:           null,
  cta:            { f: ["sfx/ui_pop_04.wav", "sfx/ui_pop_01.wav"], g: -12 },
};

const dur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim();
const rodizio = {};
const entradas = [], filtros = [], rotulos = [];
let nIn = 0; // índice de entrada do ffmpeg (0 = vídeo)
const silencios = [];
for (const c of cues) {
  const m = MAPA[c.som];
  if (!m) continue;
  const k = (rodizio[c.som] = (rodizio[c.som] ?? -1) + 1);
  const arq = path.join(BIB, m.f[k % m.f.length]);
  if (!fs.existsSync(arq)) { console.warn("sem amostra:", arq); continue; }
  let t = c.t + QUADRO;
  if (m.fimEm !== undefined) t = c.t + m.fimEm - dur(arq);
  if (m.silencio) silencios.push([c.t - m.silencio[0], c.t + m.silencio[1]]);
  const i = ++nIn;
  entradas.push("-i", arq);
  const ms = Math.max(0, Math.round(t * 1000));
  filtros.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${(m.g + (c.ganho ?? 0) * 0.5).toFixed(1)}dB,adelay=${ms}|${ms}[s${i}]`);
  rotulos.push(`[s${i}]`);
}
const mus = comp.som?.musica;
if (mus) {
  const i = ++nIn;
  entradas.push("-ss", String(mus.inicio ?? 0), "-t", String(duracao + 0.5), "-i", path.join(BIB, mus.arquivo));
  const vaos = silencios.map(([a, b]) => `volume=enable='between(t,${a.toFixed(3)},${b.toFixed(3)})':volume=0.25`).join(",");
  filtros.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${mus.ganho ?? -16}dB${vaos ? "," + vaos : ""},afade=t=in:d=0.25,afade=t=out:st=${(duracao - 1.4).toFixed(2)}:d=1.4[mus]`);
  rotulos.push("[mus]");
}
const base = `${filtros.join(";")};${rotulos.join("")}amix=inputs=${rotulos.length}:normalize=0:dropout_transition=0,atrim=0:${duracao},acompressor=threshold=-22dB:ratio=3:attack=4:release=140:makeup=4dB,alimiter=limit=0.4:attack=2:release=80:level=false`;
// compressor + limitador antes do loudnorm: sem isso os impactos travam o ganho e o mix fica abaixo de -14 LUFS
const tmp = o.out.replace(/\.mp4$/, "") + ".mix.wav";

// passada 1: mede
execFileSync("nice", ["-n", "10", "ffmpeg", "-hide_banner", "-y", "-v", "error", "-i", o.video, ...entradas, "-filter_complex", base + "[pre]", "-map", "[pre]", "-ar", "48000", tmp]);
let j = null;
try { j = JSON.parse(execFileSync("bash", ["-c", `ffmpeg -hide_banner -nostats -i '${tmp}' -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`]).toString()); } catch {}
// passada 2: normaliza com os valores medidos e junta com o vídeo
const ln = j ? `loudnorm=I=-14:TP=-2:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true` : "loudnorm=I=-14:TP=-2:LRA=11"; // alvo -2 dBTP para sobrar folga depois do AAC (entrega <= -1,5)
execFileSync("nice", ["-n", "10", "ffmpeg", "-hide_banner", "-y", "-v", "error", "-i", o.video, "-i", tmp, "-filter_complex", `[1:a]${ln},aresample=48000[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", o.out]);
fs.unlinkSync(tmp);
const fim = execFileSync("bash", ["-c", `ffmpeg -hide_banner -nostats -i '${o.out}' -af ebur128=peak=true -f null - 2>&1 | tail -12`]).toString();
const I = fim.match(/I:\s+(-?[\d.]+) LUFS/)?.[1], TP = fim.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1];
console.log(`som pronto: ${o.out} · ${rotulos.length - (mus ? 1 : 0)} SFX${mus ? " + música" : ""} · integrado ${I} LUFS · pico real ${TP} dBTP`);
if (mus?.credito) { fs.writeFileSync(o.out.replace(/\.mp4$/, "") + ".CREDITOS.txt", `Música: ${mus.credito}\nEfeitos: biblioteca da creat.MTT (CC0; Kenney, artisticdude e síntese própria). Detalhes em assets/audio/LICENSES.md.\n`); }
