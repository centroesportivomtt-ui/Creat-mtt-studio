// Sede viva · gera assets/sede-viva/negocios.json e as 6 miniaturas da galeria a partir dos sites-demonstração
// (sites/demo-*/tenant.json e sites/demo-*/galeria/<nicho>-1.webp e -2.webp). Órbita, 11/11.
//
// Uso:  node scripts/sede-viva-negocios.cjs          grava o JSON e as miniaturas (240x300, WebP q72, até 10 KB)
//       node scripts/sede-viva-negocios.cjs --json   grava só o JSON (sem abrir navegador)
// O teste scripts/testes/sede-viva-cena.test.mjs chama gerarNegocios() e compara com o arquivo gravado:
// negocios.json nunca é editado à mão. Trocou o tenant.json, rode de novo.
'use strict';
const fs = require('fs'), path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = path.join(RAIZ, 'assets', 'sede-viva');
const NICHOS = [['barbearia', 'demo-barbearia'], ['salao', 'demo-salao'], ['academia', 'demo-academia']];
const MINI = { w: 240, h: 300, q: 0.72, teto: 10 * 1024 };

// A mesma regra de motor/v1/motor.js (moeda): 0 vira "Grátis", inteiro sem centavos, pt-BR.
function moeda(v) {
  if (v === null || v === undefined || v === '' || isNaN(+v)) return 'Sob consulta';
  const n = +v, inteiro = Math.round(n) === n;
  if (n === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}

function gerarNegocios(raiz = RAIZ) {
  const negocios = {};
  for (const [nicho, slug] of NICHOS) {
    const t = JSON.parse(fs.readFileSync(path.join(raiz, 'sites', slug, 'tenant.json'), 'utf8'));
    negocios[nicho] = {
      slug,
      marca: t.negocio.nome,
      titulo: t.textos.heroTitulo,
      servicos: t.servicos.slice(0, 2).map((s) => ({ nome: s.nome, preco: moeda(s.preco) })),
      botao: t.textos.pedidoTitulo,
      cores: { fundo: t.cores.fundo, texto: t.cores.texto, destaque: t.cores.destaque, apoio: t.cores.apoio },
      galeria: [1, 2].map((i) => ({ src: `assets/sede-viva/galeria-${nicho}-${i}.webp`, w: MINI.w, h: MINI.h })),
    };
  }
  return { versao: 1, fonte: 'scripts/sede-viva-negocios.cjs a partir de sites/demo-*/tenant.json', negocios };
}

function textoJson(obj) { return JSON.stringify(obj, null, 1) + '\n'; }

async function miniaturas() {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent('<!doctype html><title>mini</title>');
  for (const [nicho, slug] of NICHOS) {
    for (const i of [1, 2]) {
      const fonte = path.join(RAIZ, 'sites', slug, 'galeria', `${nicho}-${i}.webp`);
      const dados = 'data:image/webp;base64,' + fs.readFileSync(fonte).toString('base64');
      let q = MINI.q, buf;
      for (;;) {
        const url = await pg.evaluate(async ({ dados, w, h, q }) => {
          const img = new Image(); img.src = dados; await img.decode();
          // recorte "cover" na proporção 4:5 e redução em duas etapas (fica mais nítido que uma só)
          const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          const sw = w / r, sh = h / r, sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
          const meio = document.createElement('canvas'); meio.width = w * 2; meio.height = h * 2;
          const gm = meio.getContext('2d'); gm.imageSmoothingQuality = 'high'; gm.drawImage(img, sx, sy, sw, sh, 0, 0, w * 2, h * 2);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(meio, 0, 0, w, h);
          return c.toDataURL('image/webp', q);
        }, { dados, w: MINI.w, h: MINI.h, q });
        buf = Buffer.from(url.split(',')[1], 'base64');
        if (buf.length <= MINI.teto || q <= 0.4) break;
        q = Math.round((q - 0.06) * 100) / 100;
      }
      const destino = path.join(SAIDA, `galeria-${nicho}-${i}.webp`);
      fs.writeFileSync(destino, buf);
      console.log('ok   ', path.relative(RAIZ, destino), buf.length, 'B', 'q' + q);
    }
  }
  await b.close();
}

if (require.main === module) {
  (async () => {
    fs.mkdirSync(SAIDA, { recursive: true });
    const destino = path.join(SAIDA, 'negocios.json');
    fs.writeFileSync(destino, textoJson(gerarNegocios()));
    console.log('ok   ', path.relative(RAIZ, destino), fs.statSync(destino).size, 'B');
    if (!process.argv.includes('--json')) await miniaturas();
  })().catch((e) => { console.error('falha', e && e.message); process.exit(1); });
}

module.exports = { gerarNegocios, textoJson, moeda, NICHOS };
