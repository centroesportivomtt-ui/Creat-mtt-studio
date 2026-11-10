// renderiza svg/<nome>.svg em png/<nome>.png (1024x1280), arquivo local, sem rede
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const nomes = process.argv.slice(2);
  fs.mkdirSync('png', { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1280 } });
  await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  for (const n of nomes) {
    await p.goto('file://' + path.resolve('svg/' + n + '.svg'));
    await p.screenshot({ path: 'png/' + n + '.png', clip: { x: 0, y: 0, width: 1024, height: 1280 } });
    console.log('png', n);
  }
  await b.close();
})();
