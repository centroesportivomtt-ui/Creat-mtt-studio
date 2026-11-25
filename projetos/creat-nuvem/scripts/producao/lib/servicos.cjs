/*
 * scripts/producao/lib/servicos.cjs · servicos_texto (texto livre do cliente) -> serviços estruturados
 *
 * Parser de REGRA, sem IA: só a saída estruturada (nome, preço, minutos) chega ao redator.
 * Uma linha por serviço (ou separados por ";"), no formato
 *     <nome> [- <preço>] [- <duração>]
 * preço: "R$ 45", "R$45,00", "45 reais", "sob consulta", "grátis" (= 0; com ou sem acento, qualquer caixa)
 * duração: "30 min", "1h", "1h30", "90 minutos"
 * Exemplos aceitos: "Corte - R$ 45 - 40 min", "Barba: 30 min", "Corte + barba | R$ 85",
 * "Avaliação - grátis", "Funcional 100% - R$ 90" (o sinal % entra no nome, 10/11/2026).
 * Linha que não casa com o formato vai para "recusadas" com o motivo, e a produção para em revisão
 * (o portão de conteúdo decide). Nada é adivinhado. Máximo de 15 serviços.
 */
'use strict';

const MAX = 15;
const NOME = /^[\p{L}][\p{L}\p{N} &+'/.,()%-]{1,39}$/u;
const SEP = /\s*(?:\s[-–—]\s|\s?[|:]\s?)\s*/;            // " - ", " – ", "|", ":"

function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

function slugId(nome, usados) {
  let base = norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '') || 'servico';
  let id = base, i = 2;
  while (usados.has(id)) id = `${base}-${i++}`;
  usados.add(id);
  return id;
}

/* "R$ 45,50" -> 45.5 ; "sob consulta" -> null ; "grátis" / "gratis" / "GRÁTIS" -> 0 ; outra coisa -> undefined */
function lerPreco(p) {
  const n = norm(p);
  if (/^sob consulta$|^a combinar$|^consulte$/.test(n)) return null;
  if (/^gratis$/.test(n)) return 0;
  const m = n.match(/^(?:r\$\s*(\d{1,5})(?:[.,](\d{2}))?|(\d{1,5})(?:[.,](\d{2}))?\s*reais)$/);
  if (!m) return undefined;
  const inteiro = Number(m[1] || m[3]), cent = Number(m[2] || m[4] || 0);
  const v = inteiro + cent / 100;
  return v >= 0 && v <= 100000 ? v : undefined;
}

/* "40 min" | "1h" | "1h30" | "1 h 30 min" | "90 minutos" -> minutos ; outra coisa -> undefined */
function lerDuracao(d) {
  const n = norm(d).replace(/\s+/g, ' ');
  let m = n.match(/^(\d{1,3}) ?(min|mins|minuto|minutos)$/);
  if (m) return Number(m[1]);
  m = n.match(/^(\d{1,2}) ?(h|hr|hora|horas)(?: ?e? ?(\d{1,2}) ?(min|mins|minutos)?)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[3] || 0);
  return undefined;
}

/*
 * analisar(texto) -> { servicos:[{id, nome, preco, duracaoMin}], recusadas:[{linha, texto, motivo}] }
 * duracaoMin null quando a linha não traz duração (o tenant usa 30 e o redator não escreve duração).
 */
function analisar(texto) {
  const servicos = [], recusadas = [], usados = new Set();
  if (typeof texto !== 'string') return { servicos, recusadas: [{ linha: 0, texto: '', motivo: 'servicos_texto precisa ser texto' }] };
  if (texto.length > 4000) return { servicos, recusadas: [{ linha: 0, texto: texto.slice(0, 40), motivo: 'servicos_texto acima de 4000 caracteres (limite do marcarPedido do 1A)' }] };
  const linhas = texto.replace(/\r/g, '').split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  linhas.forEach((l, i) => {
    const rec = (motivo) => recusadas.push({ linha: i + 1, texto: l.slice(0, 60), motivo });
    if (servicos.length >= MAX) return rec(`mais de ${MAX} serviços`);
    const partes = l.split(SEP).map((x) => x.trim()).filter(Boolean);
    const nome = partes.shift();
    if (!nome || !NOME.test(nome)) return rec('nome do serviço fora do formato (letras, números e & + / . , ( ) % -, até 40 caracteres)');
    let preco, duracaoMin;
    for (const p of partes) {
      const pr = lerPreco(p), du = lerDuracao(p);
      if (pr !== undefined && preco === undefined) preco = pr;
      else if (du !== undefined && duracaoMin === undefined) duracaoMin = du;
      else return rec(`trecho que não é preço nem duração: "${p.slice(0, 30)}"`);
    }
    if (duracaoMin !== undefined && (duracaoMin < 5 || duracaoMin > 600)) return rec('duração fora de 5 a 600 minutos');
    servicos.push({ id: slugId(nome, usados), nome: nome.replace(/\s+/g, ' '), preco: preco === undefined ? null : preco, duracaoMin: duracaoMin === undefined ? null : duracaoMin });
  });
  if (!linhas.length) recusadas.push({ linha: 0, texto: '', motivo: 'servicos_texto vazio' });
  return { servicos, recusadas };
}

module.exports = { analisar, lerPreco, lerDuracao, MAX };
