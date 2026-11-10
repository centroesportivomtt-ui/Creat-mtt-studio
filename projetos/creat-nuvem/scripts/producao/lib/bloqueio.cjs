/*
 * scripts/producao/lib/bloqueio.cjs · portão de conteúdo antes do rascunho (pacote 1C, 10/11/2026)
 *
 * Roda sobre o que o cliente digitou (negócio, cidade, bairro, servicos_texto) e sobre todos os
 * textos do tenant depois que o redator escreveu. Se qualquer regra disparar, a produção PARA com
 * status "em_revisao": nada de rascunho, nada de dist/. Uma pessoa da Creat olha o motivo e decide.
 * O portão não corrige nem adivinha: só aponta o campo, a regra e o trecho.
 *
 * Antes de qualquer regra o texto é desarmado (norm): NFKC (letra e dígito de largura total viram
 * comuns, "․" vira "."), caracteres de formato (\p{Cf}: largura zero, inversão de texto, hífen
 * invisível) saem, acento sai, tudo em minúsculas. A presença de caractere de formato já é motivo
 * por si (categoria disfarce): texto de site não tem por que trazer um.
 *
 * Categorias:
 *   ofensa     palavrão e xingamento
 *   sexual     termo sexual ou de conteúdo adulto
 *   marca      marca conhecida dos nichos (produto, rede de academia, método registrado)
 *   saude      alegação de saúde, cura ou tratamento de doença
 *   ganho      promessa de ganho financeiro ou de resultado
 *   injecao    ordem dirigida a uma IA, em português ou inglês
 *   codigo     HTML, script ou entidade HTML
 *   contato    endereço de site, e-mail, "@" ou telefone dentro de texto, mesmo disfarçado
 *              ("exemplo[.]com", "golpe ponto com", dígitos por extenso, dígitos de largura total).
 *              O WhatsApp do próprio pedido pode aparecer (opc.whatsapp).
 *   disfarce   caractere invisível ou de inversão de texto
 *   formato    (checarNegocio) texto que cita outro negócio: título sem o nome do pedido, ou nome
 *              próprio de mais de uma palavra que não é do pedido (sobra de textos de outro cliente)
 * A lista é de propósito larga: falso positivo custa uma olhada humana; falso negativo vai ao ar.
 * Sem rede, sem segredo. Nenhum valor do pedido sai daqui além do trecho que disparou.
 */
'use strict';

const RE_FORMATO = /\p{Cf}/gu;
const RE_INVERSAO = /[‪-‮⁦-⁩‎‏؜]/u;

/* NFKC e sem caractere de formato, com maiúsculas e acentos (para nome próprio) */
function limpar(s) { return String(s == null ? '' : s).normalize('NFKC').replace(RE_FORMATO, ''); }
/* o texto que as regras comparam: limpo, sem acento, minúsculo */
function norm(s) { return limpar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

const TLD = '(?:com|net|org|br|io|app|me|site|online|store|shop|link|ly|co|info|biz|xyz|top|club|page|dev|tv|gg|bio|wa|tk|ml|ru|cn)';
/* "exemplo[.]com", "exemplo (ponto) com", "exemplo ponto com", "exemplo dot com" -> "exemplo.com"; idem para "@" */
function semDisfarce(n) {
  return n
    .replace(/\s*[[({<]\s*(?:\.|ponto|dot)\s*[\])}>]\s*/g, '.')
    .replace(new RegExp(`\\s+(?:ponto|dot)\\s+(?=${TLD}\\b)`, 'g'), '.')
    .replace(/\s*[[({<]\s*(?:@|arroba|at)\s*[\])}>]\s*/g, '@')
    .replace(/\s+arroba\s+/g, '@');
}

const NUM_EXTENSO = '(?:zero|um|uma|dois|duas|tres|quatro|cinco|seis|meia|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)';
/* 7 ou mais números por extenso seguidos (telefone ditado), com "e", vírgula, ponto ou hífen entre eles */
const RE_EXTENSO = new RegExp(`\\b${NUM_EXTENSO}(?:(?:\\s+e)?[\\s,.-]+${NUM_EXTENSO}){6,}\\b`);

/* [categoria, regex sobre o texto normalizado] */
const REGRAS = [
  ['ofensa', /\b(porra|caralh\w*|merd(a|as)|put(a|as|o|os)|putaria|fdp|foda(-se)?|fod(er|ido|ida)|arrombad\w*|vagabund\w*|desgracad\w*|viad(o|os|inho)|bich(a|inha)|buceta|cuzao|otari(o|a|os|as)|retardad\w*|corn(o|os)|babac(a|as)|cacete|vsf|vtnc|pqp)\b/],
  ['sexual', /\b(sexo|sexual\w*|sexy|erotic\w*|porn\w*|nudes?|nudez|pelad(o|a|os|as)|safad(o|a|os|as)|tesao|fetiche\w*|sensual\w*|massagem (tantrica|relaxante com final|nuru)|tantric\w*|acompanhantes?|garotas? de programa|programa adulto|conteudo adulto|onlyfans|privacy\.com|xxx|strip(tease)?|motel|prive)\b/],
  ['marca', /\b(botox|dysport|l ?'? ?oreal|wella|kerastase|redken|schwarzkopf|keune|truss|brae|alfaparf|lowell|joico|mac ?paul|gillette|bozzano|qod|nivea|natura|boticario|avon|mary ?kay|jequiti|smart ?fit|bodytech|bluefit|selfit|bio ritmo|crossfit|les mills|body ?pump|body ?combat|zumba|herbalife|growth supplements|max titanium|nike|adidas|puma|under armour)\b/],
  ['saude', /\b(cura(r|mos|ndo)?|cicatriza\w*|emagre\w*|perca \d+|perder \d+ ?(kg|quilos)|queim\w* gordura|elimin\w* (a )?(celulite|gordura|estrias?|flacidez)|sem dor|indolor|calvicie|alopecia|queda de cabelo|caspa|dermatite|psoriase|acne|espinhas?|ansiedade|depressao|diabete\w*|hipertens\w*|colesterol|imunidade|detox|anti-?inflamat\w*|remedios?|medicament\w*|receita medica|cientificamente comprovad\w*|clinicamente comprovad\w*|aprovad[oa] pela anvisa|tratamento (para|de|contra) (queda|calvicie|alopecia|caspa|dermatite|acne|doenca|dor)|fisioterap\w*|reabilita\w*|lesao|lesoes|hernia)\b/],
  ['ganho', /\b(lucr(o|os|e|ar|ativo)|fatur(e|ar|amento)|renda extra|enriquec\w*|fique ric[oa]|ganh(e|ar|o) (mais )?dinheiro|dinheiro no bolso|retorno (financeiro|certo|garantido)|dobr\w* (o |a |seu |sua )?(faturamento|clientela|vendas|lucro)|resultado garantido|garantia de resultado)\b/],
  ['injecao', new RegExp([
    // português
    /(ignore|ignorar|ignora|desconsidere|desconsiderar|esqueca|esquecer) (as |todas as |os |todos os |suas |tuas )?(instruc\w*|regras?|ordens|ordem|orientac\w*|comandos?|mensagens?) ?(anterior\w*|acima|previas?)?/.source,
    /\bsystem prompt\b|\bprompt\b|\bjailbreak\b|\b(aja|atue|finja|responda) como\b|\bvoce (e|agora e) (um|uma|o|a) (ia|assistente|modelo|chatbot|robo)\b|\bnova(s)? (regra|instruc)\w*\b|\bmodo (desenvolvedor|irrestrito|sem filtro)\b/.source,
    /\b(publique|publicar|poste|postar) (o site|isso|agora|tudo|sem aprovac\w*|direto)\b|\b(envie|enviar|mande|mandar|publique|publicar) [\w ]{0,20}sem (a )?aprovac\w*/.source,
    // inglês
    /\b(ignore|disregard|forget|override|bypass|skip)\b[\w ,]{0,30}\b(previous|prior|above|earlier|all|any|your|the)\b[\w ,]{0,20}\b(instructions?|rules|prompts?|guidelines|directions|messages?|context)\b/.source,
    /\bignore (all |the )?(previous|prior|above)\b|\bact as\b|\bpretend (to be|you are)\b|\byou are now\b|\bfrom now on,? you\b|\bnew instructions?\b|\bdeveloper mode\b|\bdo anything now\b|\bdan mode\b|\bunrestricted\b|\bno (restrictions|filters|limits)\b|\bunfiltered\b/.source,
    // marcadores de papel e de turno
    /(^|[\s.;!?])(system|assistant|developer|user|sistema)\s*:|\[\/?inst\]|<\|?\/?(system|user|assistant|im_start|im_end)\|?>|###/.source
  ].join('|'))],
  ['codigo', /<\s*\/?\s*[a-z!?]|javascript:|data:\s*text|on(load|error|click|mouseover|focus)\s*=|&(#\d+|#x[0-9a-f]+|[a-z]{2,8});|\{\{|\}\}|\$\{/]
];

const ROTULO = {
  ofensa: 'palavrão ou xingamento',
  sexual: 'termo sexual ou de conteúdo adulto',
  marca: 'marca conhecida (produto, rede ou método registrado)',
  saude: 'alegação de saúde ou de tratamento',
  ganho: 'promessa de ganho ou de resultado',
  injecao: 'ordem dirigida à IA (tentativa de injeção)',
  codigo: 'HTML, script ou código',
  contato: 'endereço de site, e-mail ou telefone dentro de texto (contato só por código, nunca em texto)',
  disfarce: 'caractere invisível ou de inversão de texto',
  formato: 'texto que cita outro negócio (o título e os textos falam só do negócio do pedido)'
};

/*
 * Telefone alheio: 8 ou mais dígitos (com espaço, ponto, hífen, parênteses ou +) que não são o
 * WhatsApp do pedido (com ou sem 55, com ou sem DDD). CEP (00000-000) não conta. Texto já em norm.
 */
function telefoneAlheio(n, whats) {
  const w = String(whats || '');
  const aceitos = w ? [w, w.slice(2), w.slice(4)] : [];
  const semCep = n.replace(/\b\d{5}-\d{3}\b/g, ' ');
  for (const m of semCep.matchAll(/\+?\(?\d[\d\s().-]{6,}\d/g)) {
    const dig = m[0].replace(/\D/g, '');
    if (dig.length < 8) continue;
    if (!aceitos.includes(dig)) return m[0].trim();
  }
  return null;
}

const RE_DOMINIO = new RegExp(`\\b[a-z0-9-]{2,}\\.${TLD}\\b|\\bwww\\.|https?:|:\\/\\/|\\bwa\\.me\\b`);

/* contato disfarçado; devolve o trecho ou null */
function contato(n, whats) {
  const d = semDisfarce(n);
  let m = d.match(RE_DOMINIO);
  if (m) return m[0];
  if (d.includes('@')) return '@';
  const tel = telefoneAlheio(d, whats);
  if (tel) return tel;
  m = n.match(RE_EXTENSO);
  if (m) return m[0];
  return null;
}

/*
 * checar([[campo, texto], ...], { whatsapp }?) -> { ok, motivos:[{campo, categoria, regra, trecho}] }
 * trecho: só o pedaço que disparou (até 40 caracteres), para a revisão humana.
 */
function checar(pares, opc) {
  opc = opc || {};
  const motivos = [];
  const add = (campo, categoria, trecho) => motivos.push({ campo, categoria, regra: ROTULO[categoria], trecho: String(trecho).slice(0, 40) });
  for (const [campo, texto] of pares || []) {
    if (typeof texto !== 'string' || !texto) continue;
    const cf = texto.match(RE_FORMATO);
    if (cf) add(campo, 'disfarce', cf.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' '));
    else if (RE_INVERSAO.test(texto)) add(campo, 'disfarce', 'inversão de texto');
    const n = norm(texto);
    for (const [categoria, re] of REGRAS) {
      const m = n.match(re);
      if (m) add(campo, categoria, m[0].trim());
    }
    const c = contato(n, opc.whatsapp);
    if (c) add(campo, 'contato', c);
  }
  return { ok: motivos.length === 0, motivos };
}

/* palavras que podem aparecer com maiúscula sem ser nome de outro negócio */
const COMUNS = new Set(('whatsapp pix instagram google maps cartao credito debito dinheiro ' +
  'domingo segunda terca quarta quinta sexta sabado feriado feriados ' +
  'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro ' +
  'a o as os um uma uns umas de da do das dos e em na no nas nos para pra pelo pela com sem sua seu suas seus ' +
  'aqui ali la so ja nao sim mais menos tudo todo toda cada este esta esse essa aberto fechado ' +
  'sp rj mg ba pe ce pr rs sc go df es pa am ma pb rn al se pi to ro ac ap rr ms mt ' +
  'cep rua avenida av travessa praca alameda estrada rodovia bairro centro').split(/\s+/));

/* sequência de 2 ou mais palavras com maiúscula, com "de/da/do/das/dos/e" no meio */
const RE_NOME_PROPRIO = /\p{Lu}[\p{L}'’-]*(?:\s+(?:(?:d[aeo]s?|e)\s+)?\p{Lu}[\p{L}'’-]*)+/gu;

/*
 * checarNegocio(tenant, { palavras }?) -> motivos (categoria formato)
 * 1. pagina.titulo, quando existe, contém o nome do negócio do pedido.
 * 2. Nenhum texto cita nome próprio de duas ou mais palavras com palavra que não é do pedido
 *    (nome, nome curto, cidade, bairro, serviços), nem comum (dias, meses, WhatsApp...), nem de
 *    opc.palavras (o vocabulário dos textos de partida do preset).
 * Pega o caso de textos escritos para outro pedido ("WhatsApp da Navalha Teste" num site de outro nome).
 */
function checarNegocio(t, opc) {
  opc = opc || {};
  const motivos = [];
  const add = (campo, trecho) => motivos.push({ campo, categoria: 'formato', regra: ROTULO.formato, trecho: String(trecho).slice(0, 40) });
  const neg = (t && t.negocio) || {};
  const nome = norm(neg.nome || '').replace(/\s+/g, ' ').trim();
  const titulo = t && t.pagina && t.pagina.titulo;
  if (nome && typeof titulo === 'string' && titulo && !norm(titulo).replace(/\s+/g, ' ').includes(nome)) add('pagina.titulo', titulo);
  const end = neg.endereco || {};
  const fontes = [neg.nome, neg.nomeCurto, t && t.cidade, neg.cidade, end.cidade, end.bairro, end.uf, ...((t && t.servicos) || []).map((s) => s && s.nome), ...(opc.palavras || [])];
  const ok = new Set();
  for (const f of fontes) if (typeof f === 'string') for (const p of norm(f).split(/[^\p{L}\p{N}]+/u)) if (p) ok.add(p);
  const proprios = new Set(['negocio.nome', 'negocio.nomeCurto']);
  const { textosDoTenant } = require('./validacao.cjs');
  for (const [campo, txt] of textosDoTenant(t || {})) {
    if (proprios.has(campo) || /^servicos\[\d+\]\.nome$/.test(campo) || typeof txt !== 'string') continue;
    const l = limpar(txt);
    for (const m of l.matchAll(RE_NOME_PROPRIO)) {
      const palavras = norm(m[0]).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      // começo de frase: a 1ª palavra tem maiúscula por gramática ("Escolha Corte + barba"), não entra na conta
      if (/(^|[.!?:·]\s*)$/.test(l.slice(0, m.index).replace(/\s+$/, ''))) palavras.shift();
      const estranha = palavras.find((p) => !ok.has(p) && !COMUNS.has(p));
      if (estranha) { add(campo, m[0]); break; }
    }
  }
  return motivos;
}

module.exports = { checar, checarNegocio, contato, telefoneAlheio, semDisfarce, limpar, norm, REGRAS, ROTULO, COMUNS };
