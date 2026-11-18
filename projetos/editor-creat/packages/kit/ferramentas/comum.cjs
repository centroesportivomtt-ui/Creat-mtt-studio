// Peças comuns das ferramentas: servidor local, navegador e montagem da composição.
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

function playwright() {
  try { return require("playwright"); } catch {}
  for (const p of ["/opt/node22/lib/node_modules/playwright", "/usr/local/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"]) {
    try { return require(p); } catch {}
  }
  throw new Error("Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium");
}

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".mp4": "video/mp4", ".txt": "text/plain" };

// serve a pasta do kit; caminhos /@abs/<caminho absoluto> servem arquivos de fora (imagens de projeto)
function servidor() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split("?")[0]);
      let arq = url.startsWith("/@abs/") ? url.slice(5) : path.join(RAIZ, url);
      if (!url.startsWith("/@abs/") && !arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
      fs.readFile(arq, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq).toLowerCase()] ?? "application/octet-stream" });
        res.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", () => ok(srv));
  });
}

// Chromium headless shell (o mesmo do Playwright) para a captura por HeadlessExperimental.beginFrame.
function cascaHeadless() {
  if (process.env.MK_CHROME) return process.env.MK_CHROME;
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", path.join(require("os").homedir(), ".cache", "ms-playwright")].filter(Boolean);
  for (const b of bases) {
    let dirs = [];
    try { dirs = fs.readdirSync(b).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse(); } catch { continue; }
    for (const d of dirs) {
      const exe = path.join(b, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

// abre a composição. bf=true (padrão): captura por beginFrame (pesquisa B: 299 -> ~60-120 ms/quadro, pixel-idêntico);
// sem o headless shell, ou com MK_BF=0, cai no screenshot do Playwright.
async function abrir(comp, { alfa = false, escala = 1, bf = process.env.MK_BF !== "0" } = {}) {
  const { chromium } = playwright();
  const srv = await servidor();
  const porta = srv.address().port;
  const base = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--font-render-hinting=none"];
  const exe = bf ? cascaHeadless() : null;
  const usarBF = !!exe;
  const browser = await chromium.launch(usarBF
    ? { executablePath: exe, args: [...base, "--deterministic-mode", "--enable-begin-frame-control", "--run-all-compositor-stages-before-draw"] }
    : { args: base });
  const W = comp.formato?.w ?? 1080, H = comp.formato?.h ?? 1920;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: escala });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  let cdp = null;
  if (usarBF) {
    cdp = await page.context().newCDPSession(page);
    if (alfa) await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }
  await page.goto(`http://127.0.0.1:${porta}/player.html`);
  await page.waitForFunction(() => window.__mkPronto === true, null, { timeout: 30000 });
  let info;
  try { info = await page.evaluate(([c, a]) => window.__mk.montar(c, { alfa: a }), [comp, alfa]); }
  catch (e) { throw new Error("falha ao montar a composição: " + e.message + "\n" + erros.join("\n")); }
  // tiro(t, {formato, qualidade}) -> Buffer. No beginFrame, quadro sem dano (nada mudou) devolve o último buffer.
  let ft = 1000, ultimo = null;
  async function tiro(t, { formato = alfa ? "png" : "jpeg", qualidade = 95 } = {}) {
    await page.evaluate((tt) => window.__mk.seek(tt), t);
    if (!usarBF) return formato === "png" ? page.screenshot({ type: "png", omitBackground: true }) : page.screenshot({ type: "jpeg", quality: qualidade });
    const shot = formato === "png" ? { format: "png", optimizeForSpeed: true } : { format: "jpeg", quality: qualidade, optimizeForSpeed: true };
    const r = await cdp.send("HeadlessExperimental.beginFrame", { frameTimeTicks: (ft += 1000 / (info.fps || 30)), interval: 1000 / (info.fps || 30), screenshot: shot });
    if (r.screenshotData) ultimo = Buffer.from(r.screenshotData, "base64");
    if (!ultimo) return formato === "png" ? page.screenshot({ type: "png", omitBackground: true }) : page.screenshot({ type: "jpeg", quality: qualidade });
    return ultimo;
  }
  return { browser, page, srv, info, erros, tiro, captura: usarBF ? "beginFrame" : "screenshot", async fechar() { await browser.close(); srv.close(); } };
}

function lerComp(arq) {
  const comp = JSON.parse(fs.readFileSync(arq, "utf8"));
  // caminhos de imagem relativos ao JSON viram /@abs/... para o servidor achar
  const base = path.dirname(path.resolve(arq));
  const fix = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && /^(src|imagem)$/.test(k) && !/^(https?:|data:|\/@abs\/|assets\/)/.test(v)) o[k] = "/@abs" + path.resolve(base, v);
      else fix(v);
    }
  };
  fix(comp.camadas);
  return comp;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { (o._ ??= []).push(a); continue; }
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}

module.exports = { RAIZ, abrir, lerComp, args, playwright, cascaHeadless };
