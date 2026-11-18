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

async function abrir(comp, { alfa = false, escala = 1 } = {}) {
  const { chromium } = playwright();
  const srv = await servidor();
  const porta = srv.address().port;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--font-render-hinting=none"] });
  const W = comp.formato?.w ?? 1080, H = comp.formato?.h ?? 1920;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: escala });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  await page.goto(`http://127.0.0.1:${porta}/player.html`);
  await page.waitForFunction(() => window.__mkPronto === true, null, { timeout: 30000 });
  let info;
  try { info = await page.evaluate(([c, a]) => window.__mk.montar(c, { alfa: a }), [comp, alfa]); }
  catch (e) { throw new Error("falha ao montar a composição: " + e.message + "\n" + erros.join("\n")); }
  return { browser, page, srv, info, erros, async fechar() { await browser.close(); srv.close(); } };
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

module.exports = { RAIZ, abrir, lerComp, args, playwright };
