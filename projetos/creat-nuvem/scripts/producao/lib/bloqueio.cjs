/*
 * scripts/producao/lib/bloqueio.cjs · portão de conteúdo antes do rascunho (pacote 1C, 10/11/2026)
 *
 * Roda sobre o que o cliente digitou (negócio, cidade, bairro, servicos_texto) e sobre todos os
 * textos do tenant depois que o redator escreveu. Se qualquer regra disparar, a produção PARA com
 * status "em_revisao": nada de rascunho, nada de dist/. Uma pessoa da Creat olha o motivo e decide.
 * O portão não corrige nem adivinha: só aponta o campo, a regra e o trecho.
 *
 * Categorias (texto comparado sem acento e em minúsculas):
 *   ofensa     palavrão e xingamento
 *   sexual     termo sexual ou de conteúdo adulto
 *   marca      marca conhecida dos nichos (produto, rede de academia, método registrado)
 *   saude      alegação de saúde, cura ou tratamento de doença
 *   ganho      promessa de ganho financeiro ou de resultado
 *   injecao    ordem dirigida a uma IA ("ignore as instruções", "publique", "aja como")
 *   codigo     HTML, script ou entidade HTML
 * A lista é de propósito larga: falso positivo custa uma olhada humana; falso negativo vai ao ar.
 * Sem rede, sem segredo. Nenhum valor do pedido sai daqui além do trecho que disparou.
 */
'use strict';

function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/* [categoria, regex sobre o texto normalizado] */
const REGRAS = [
  ['ofensa', /\b(porra|caralh\w*|merd(a|as)|put(a|as|o|os)|putaria|fdp|foda(-se)?|fod(er|ido|ida)|arrombad\w*|vagabund\w*|desgracad\w*|viad(o|os|inho)|bich(a|inha)|buceta|cuzao|otari(o|a|os|as)|retardad\w*|corn(o|os)|babac(a|as)|cacete|vsf|vtnc|pqp)\b/],
  ['sexual', /\b(sexo|sexual\w*|sexy|erotic\w*|porn\w*|nudes?|nudez|pelad(o|a|os|as)|safad(o|a|os|as)|tesao|fetiche\w*|sensual\w*|massagem (tantrica|relaxante com final|nuru)|tantric\w*|acompanhantes?|garotas? de programa|programa adulto|conteudo adulto|onlyfans|privacy\.com|xxx|strip(tease)?|motel|prive)\b/],
  ['marca', /\b(botox|dysport|l ?'? ?oreal|wella|kerastase|redken|schwarzkopf|keune|truss|brae|alfaparf|lowell|joico|mac ?paul|gillette|bozzano|qod|nivea|natura|boticario|avon|mary ?kay|jequiti|smart ?fit|bodytech|bluefit|selfit|bio ritmo|crossfit|les mills|body ?pump|body ?combat|zumba|herbalife|growth supplements|max titanium|nike|adidas|puma|under armour)\b/],
  ['saude', /\b(cura(r|mos|ndo)?|cicatriza\w*|emagre\w*|perca \d+|perder \d+ ?(kg|quilos)|queim\w* gordura|elimin\w* (a )?(celulite|gordura|estrias?|flacidez)|sem dor|indolor|calvicie|alopecia|queda de cabelo|caspa|dermatite|psoriase|acne|espinhas?|ansiedade|depressao|diabete\w*|hipertens\w*|colesterol|imunidade|detox|anti-?inflamat\w*|remedios?|medicament\w*|receita medica|cientificamente comprovad\w*|clinicamente comprovad\w*|aprovad[oa] pela anvisa|tratamento (para|de|contra) (queda|calvicie|alopecia|caspa|dermatite|acne|doenca|dor)|fisioterap\w*|reabilita\w*|lesao|lesoes|hernia)\b/],
  ['ganho', /\b(lucr(o|os|e|ar|ativo)|fatur(e|ar|amento)|renda extra|enriquec\w*|fique ric[oa]|ganh(e|ar|o) (mais )?dinheiro|dinheiro no bolso|retorno (financeiro|certo|garantido)|dobr\w* (o |a |seu |sua )?(faturamento|clientela|vendas|lucro)|resultado garantido|garantia de resultado)\b/],
  ['injecao', /(ignore|ignorar|ignora|desconsidere|desconsiderar|esqueca|esquecer) (as |todas as |os |todos os |suas |tuas )?(instruc\w*|regras?|ordens|ordem|orientac\w*|comandos?|mensagens?) ?(anterior\w*|acima|previas?)?|\bignore (all |the )?(previous|prior|above)\b|\bsystem prompt\b|\bprompt\b|\bjailbreak\b|\b(aja|atue|finja|responda) como\b|\bact as\b|\bvoce (e|agora e) (um|uma|o|a) (ia|assistente|modelo|chatbot|robo)\b|\bnova(s)? (regra|instruc)\w*\b|\b(publique|publicar|poste|postar) (o site|isso|agora|tudo|sem aprovac\w*|direto)\b|\b(envie|enviar|mande|mandar|publique|publicar) [\w ]{0,20}sem (a )?aprovac\w*|\[\/?inst\]|<\|?\/?(system|user|assistant)\|?>|###/],
  ['codigo', /<\s*\/?\s*[a-z!?]|javascript:|on(load|error|click|mouseover)\s*=|&(#\d+|#x[0-9a-f]+|[a-z]{2,8});|\{\{|\}\}|\$\{/]
];

const ROTULO = {
  ofensa: 'palavrão ou xingamento',
  sexual: 'termo sexual ou de conteúdo adulto',
  marca: 'marca conhecida (produto, rede ou método registrado)',
  saude: 'alegação de saúde ou de tratamento',
  ganho: 'promessa de ganho ou de resultado',
  injecao: 'ordem dirigida à IA (tentativa de injeção)',
  codigo: 'HTML, script ou código'
};

/*
 * checar([[campo, texto], ...]) -> { ok, motivos:[{campo, categoria, regra, trecho}] }
 * trecho: só o pedaço que disparou (até 40 caracteres), para a revisão humana.
 */
function checar(pares) {
  const motivos = [];
  for (const [campo, texto] of pares || []) {
    if (typeof texto !== 'string' || !texto) continue;
    const n = norm(texto);
    for (const [categoria, re] of REGRAS) {
      const m = n.match(re);
      if (m) motivos.push({ campo, categoria, regra: ROTULO[categoria], trecho: m[0].slice(0, 40) });
    }
  }
  return { ok: motivos.length === 0, motivos };
}

module.exports = { checar, REGRAS, ROTULO, norm };
