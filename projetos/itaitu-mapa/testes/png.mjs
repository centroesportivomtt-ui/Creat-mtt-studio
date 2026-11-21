// png.mjs · decodificador mínimo de PNG para os testes (Forja, backend, 20/11/2026).
// Só o que os tiles Terrarium usam: 8 bits por canal, RGB (tipo 2) ou RGBA (tipo 6), sem entrelaçamento.
// Escrito à parte do leitor do motor (nucleo.js) de propósito: o teste não pode reaproveitar o código que confere.
// Node 22, só módulos nativos (node:zlib).
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// bytes: Buffer | Uint8Array  ->  { largura, altura, canais, rgba: Uint8Array(largura*altura*4) }
export function decodificarPNG(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 8; i++) if (b[i] !== ASSINATURA[i]) throw new Error('PNG: assinatura inválida');
  let p = 8, largura = 0, altura = 0, profundidade = 0, tipo = -1, entrelacamento = 0, viuIHDR = false;
  const idat = [];
  while (p + 8 <= b.length) {
    const tam = b.readUInt32BE(p);
    const nome = b.toString('latin1', p + 4, p + 8);
    const ini = p + 8, fim = ini + tam;
    if (fim + 4 > b.length) throw new Error(`PNG: bloco ${nome} cortado`);
    if (nome === 'IHDR') {
      largura = b.readUInt32BE(ini); altura = b.readUInt32BE(ini + 4);
      profundidade = b[ini + 8]; tipo = b[ini + 9]; entrelacamento = b[ini + 12]; viuIHDR = true;
    } else if (nome === 'IDAT') idat.push(b.subarray(ini, fim));
    else if (nome === 'IEND') break;
    p = fim + 4;                                  // pula o CRC
  }
  if (!viuIHDR) throw new Error('PNG: sem IHDR');
  if (profundidade !== 8) throw new Error(`PNG: profundidade ${profundidade} não suportada (só 8 bits)`);
  if (tipo !== 2 && tipo !== 6) throw new Error(`PNG: tipo de cor ${tipo} não suportado (só RGB e RGBA)`);
  if (entrelacamento !== 0) throw new Error('PNG: entrelaçado não suportado');
  const canais = tipo === 6 ? 4 : 3;
  const linha = largura * canais;
  const cru = inflateSync(Buffer.concat(idat));
  if (cru.length < altura * (linha + 1)) throw new Error('PNG: dados comprimidos curtos demais');

  const px = new Uint8Array(altura * linha);      // já sem o byte de filtro
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const src = y * (linha + 1) + 1, dst = y * linha, cima = dst - linha;
    for (let i = 0; i < linha; i++) {
      const x = cru[src + i];
      const a = i >= canais ? px[dst + i - canais] : 0;            // esquerda
      const bb = y > 0 ? px[cima + i] : 0;                          // acima
      const c = y > 0 && i >= canais ? px[cima + i - canais] : 0;   // acima à esquerda
      let v;
      switch (filtro) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + bb; break;
        case 3: v = x + Math.floor((a + bb) / 2); break;
        case 4: { // Paeth
          const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c);
          break;
        }
        default: throw new Error(`PNG: filtro ${filtro} desconhecido na linha ${y}`);
      }
      px[dst + i] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(largura * altura * 4);
  for (let k = 0, j = 0; k < largura * altura; k++, j += canais) {
    rgba[k * 4] = px[j]; rgba[k * 4 + 1] = px[j + 1]; rgba[k * 4 + 2] = px[j + 2];
    rgba[k * 4 + 3] = canais === 4 ? px[j + 3] : 255;
  }
  return { largura, altura, canais, rgba };
}

export function lerPNG(caminho) {
  return decodificarPNG(readFileSync(caminho));
}
