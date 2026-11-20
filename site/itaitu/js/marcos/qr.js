// qr.js · QR code local, sem rede (qrcode-generator 2.0.4, MIT, em ../../vendor/, licença ao lado).
// Correção de erro M (DESIGN 8: M ou Q; com o endereço do parceiro dá 33 módulos). Preto puro no branco,
// margem de 4 módulos (zona de silêncio da norma).

// O marcos.html carrega ./vendor/qrcode-generator.js como script clássico (global `qrcode`). Não importamos
// o .mjs aqui porque servidor que não conhece .mjs (python -m http.server) manda application/octet-stream
// e o navegador recusa o módulo. No Node, o teste passa a fábrica com usarFabrica(import do .mjs).
let fabrica = null;
export function usarFabrica(f) { fabrica = f; }
function qrcode(tipo, correcao) {
  const f = fabrica || globalThis.qrcode;
  if (typeof f !== 'function') throw new Error('qrcode-generator não carregou');
  return f(tipo, correcao);
}

export const ZONA = 4;

// texto -> { n, escuro(l, c) -> bool, matriz: Uint8Array n*n }
export function matrizQR(texto, correcao = 'M') {
  const q = qrcode(0, correcao);
  q.addData(String(texto), 'Byte');
  q.make();
  const n = q.getModuleCount();
  const matriz = new Uint8Array(n * n);
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) matriz[l * n + c] = q.isDark(l, c) ? 1 : 0;
  return { n, matriz, escuro: (l, c) => matriz[l * n + c] === 1 };
}

// Desenha no canvas com módulos inteiros (sem borrão), centralizado. Devolve o tamanho do módulo em px.
export function desenharQR(canvas, texto, { lado = canvas.width, correcao = 'M' } = {}) {
  const { n, escuro } = matrizQR(texto, correcao);
  const total = n + ZONA * 2;
  const mod = Math.max(1, Math.floor(lado / total));
  const px = mod * total;
  canvas.width = px;
  canvas.height = px;
  const g = canvas.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, px, px);
  g.fillStyle = '#000000';
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (escuro(l, c)) g.fillRect((c + ZONA) * mod, (l + ZONA) * mod, mod, mod);
  canvas.dataset.modulos = String(n);
  canvas.dataset.modulo = String(mod);
  return { n, mod, px };
}

// Caminho SVG (um <path> só) com os módulos escuros, em unidades de módulo, sem a zona de silêncio.
export function caminhoSVG(texto, correcao = 'M') {
  const { n, escuro } = matrizQR(texto, correcao);
  const partes = [];
  for (let l = 0; l < n; l++) {
    let c = 0;
    while (c < n) {
      if (!escuro(l, c)) { c++; continue; }
      const ini = c;
      while (c < n && escuro(l, c)) c++;
      partes.push(`M${ini} ${l}h${c - ini}v1h${ini - c}z`);
    }
  }
  return { n, d: partes.join('') };
}

export function pngDoCanvas(canvas) {
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('png'))), 'image/png'));
}
