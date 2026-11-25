#!/usr/bin/env node
/*
 * marketing/trafego/validar-anuncio.cjs · validação tripla de todo anúncio antes de subir (regra 5 do dono)
 *
 * Por quê: nenhum anúncio liga sem as três colunas verdes, conferidas por máquina e não de olho:
 *   IDIOMA  pt-BR em título, texto, descrição e botão; sem palavra em inglês da lista abaixo; acentos íntegros;
 *           sem travessão, sem emoji e sem as frases proibidas da casa.
 *   MOEDA   todo valor escrito como "R$ 297" (com R$ e espaço), nunca US$ nem valor solto; cada valor igual ao
 *           de dados/precos.json E ao de checkout.config.js; a Abertura vigente e o plano Aberto terminam antes do
 *           caractere 125 do texto principal (o que o Feed mostra antes do "ver mais").
 *   LINK    a URL abre no endereço do site (o canônico de scripts/producao/lib/comum.cjs, https://nuvem.creatmtt.com.br;
 *           até 13/11 também o antigo creat-nuvem-404b1994.base44.app, com o aviso "antigo, redireciona": aí o link
 *           é aberto como está E com o host trocado pelo canônico, e os dois têm de passar), sem arquivo de CDN nem encurtador, com nicho, utm_source=meta,
 *           utm_medium=pago, utm_campaign = praça do conjunto, utm_content = código do anúncio e utm_term
 *           (o {{placement}} da Meta). Aberta de verdade em celular Android (agente de usuário real): 200,
 *           título da home, nicho do anúncio marcado, medição da Meta carregada depois do Aceitar, eventos
 *           PageView (Meta) e visita (contador próprio) saindo do navegador.
 *
 * Não suja nada: toda requisição ao site leva X-Conferencia: 1; o envio dos eventos à Meta é registrado e
 * cancelado; a contagem própria é registrada e respondida aqui com 204 (não chega ao servidor); o envio de
 * pedido (registrarPedido) é cancelado. Não paga, não envia formulário, não mexe na conta de anúncios.
 *
 * Uso:
 *   node marketing/trafego/validar-anuncio.cjs <anuncios.json> [--base https://...] [--sem-link] [--trava-provada]
 *        [--prazo-liberado] [--estrito-dobra] [--json saida.json] [--hoje AAAA-MM-DD]
 *   --hoje            data usada na janela do endereço antigo (padrão: hoje na Bahia); só para teste
 *   --sem-link        só idioma e moeda (rascunho); NUNCA vale para ligar anúncio
 *   --trava-provada   libera "inauguração" no texto (só com a trava das 20 vagas provada: textos-troca-unica.md, seção 1)
 *   --prazo-liberado  libera prazo em horas no texto (só depois do ensaio verde da onda 1)
 *   --estrito-dobra   o nicho fora da primeira tela (390x844) vira falha, não aviso
 *   --exemplo         imprime um JSON de exemplo e sai
 *
 * Entrada: { "anuncios": [ { "id", "nome", "titulo", "texto", "descricao", "botao", "url", "nicho", "praca",
 *            "utm_content" (opcional: sai do nome antes do " · "), "valores": { "abertura": 297, "plano": 147 } } ] }
 * Saída 0 = os três verdes em todos (tabela). Saída 1 = lista de cada falha: não sobe. Saída 2 = ambiente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const RAIZ = path.join(__dirname, '..', '..');
const C = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'));
const BASE = String(opt('--base', C.hostPadrao())).replace(/\/$/, '');
// endereço antigo conhecido: aceito como destino até ENDERECO.antigoAceitoAte (o ato de 13/11 troca os links)
const ANTIGO = new URL(C.ENDERECO.antigo);
const HOJE = /^\d{4}-\d{2}-\d{2}$/.test(String(opt('--hoje', ''))) ? opt('--hoje') : C.hojeNaBahia();
const ANTIGO_ACEITO = C.antigoAceito(HOJE);
const SEM_LINK = args.includes('--sem-link');
const TRAVA_PROVADA = args.includes('--trava-provada');
const PRAZO_LIBERADO = args.includes('--prazo-liberado');
const ESTRITO_DOBRA = args.includes('--estrito-dobra');
const ARQ_JSON = opt('--json', '');
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const CONF = { 'x-conferencia': '1' };
// valor que a Meta põe no lugar de {{placement}} no clique (o mais comum na conta: 94% Reels do Instagram)
const POSICIONAMENTO_SIMULADO = 'Instagram_Reels';

const EXEMPLO = {
  anuncios: [{
    id: '1', nome: 'A1-barbearia-v1 · feira',
    titulo: 'Veja o site da sua barbearia pronto',
    texto: 'Barbearia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir.',
    descricao: 'Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar.',
    botao: 'Saiba mais',
    url: BASE + '/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-barbearia-v1&utm_term={{placement}}',
    nicho: 'barbearia', praca: 'feira', valores: { abertura: 297, plano: 147 }
  }]
};
if (args.includes('--exemplo')) { console.log(JSON.stringify(EXEMPLO, null, 1)); process.exit(0); }

const arqEntrada = args.find((a, i) => !a.startsWith('--') && !['--base', '--json', '--hoje'].includes(args[i - 1]));
if (!arqEntrada) { console.error('uso: node marketing/trafego/validar-anuncio.cjs <anuncios.json> (veja --exemplo)'); process.exit(2); }

/* ---------------- listas ---------------- */
// palavras em inglês que já apareceram em anúncio traduzido pela metade ou em botão sem tradução
const INGLES = ['learn more', 'shop now', 'sign up', 'book now', 'buy now', 'order now', 'contact us', 'send message',
  'get offer', 'get started', 'click', 'free', 'website', 'booking', 'book', 'now', 'today', 'your', 'you', 'the', 'and',
  'with', 'get', 'best', 'here', 'more', 'new', 'offer', 'discount', 'sale', 'deal', 'limited', 'order', 'price', 'monthly',
  'plan', 'only', 'just', 'easy', 'fast', 'appointment', 'schedule', 'barber', 'barbershop', 'salon', 'beauty', 'gym', 'per month'];
// palavras que em pt-BR só existem com acento (sem ele, o texto saiu de um teclado ou exportação quebrada)
const SEM_ACENTO = ['nao', 'voce', 'voces', 'salao', 'saloes', 'horario', 'horarios', 'pagina', 'preco', 'precos', 'mes',
  'ate', 'servico', 'servicos', 'inauguracao', 'negocio', 'negocios', 'cartao', 'gratis', 'comeca', 'informacao', 'tambem',
  'ja', 'atras', 'conteudo', 'facil', 'rapido', 'minimo', 'credito', 'debito', 'numero', 'endereco'];
const MOJIBAKE = /\u00C3[\u0080-\u00BF]|\u00C3[\u00A1-\u00FF]|\u00C2[\s\u00A0]|\u00E2\u20AC|\uFFFD|&[a-z]+;|&#\d+;|\\u00[0-9a-f]{2}/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
const TRAVESSAO = /[\u2013\u2014]/;
// frases que a casa proibiu em anúncio (AN-02: promessa falsa; AN-01: sem lastro; seção 1 de textos-troca-unica.md)
const PROIBIDAS = [
  [/s[óo]\s+paga\s+se\s+gostar|paga\s+s[óo]\s+se\s+gostar/i, '"só paga se gostar" é falso: a Abertura é paga antes da produção (AN-02)'],
  [/em\s+(1|um)\s+minuto/i, '"em 1 minuto" não tem lastro: em segundos sai só a prévia (AN-01)'],
  [/\brestam?\s+\d+|\bvagas?\b|\bescassez\b/i, 'sem vagas, contador ou escassez até o contador sair do banco (textos-troca-unica.md, seção 1)']
];
// botão: rótulo como aparece em pt-BR, ou o tipo da API da Meta que vira esse rótulo
const BOTOES = { LEARN_MORE: 'Saiba mais', MESSAGE_PAGE: 'Enviar mensagem', WHATSAPP_MESSAGE: 'Enviar mensagem pelo WhatsApp',
  SIGN_UP: 'Cadastre-se', SHOP_NOW: 'Comprar agora', ORDER_NOW: 'Peça agora', CONTACT_US: 'Fale conosco', GET_OFFER: 'Obter oferta',
  SUBSCRIBE: 'Assinar', BOOK_NOW: 'Reservar', BOOK_TRAVEL: 'Reservar', SEE_MORE: 'Ver mais', CALL_NOW: 'Ligar agora' };
const ROTULOS_BOTAO = new Set(Object.values(BOTOES).map(s => s.toLowerCase()));
// hosts que nunca são destino de anúncio (regra 7 do dono: nunca arquivo de CDN, nunca encurtador)
const HOST_PROIBIDO = /(^|\.)(bit\.ly|tinyurl\.com|cutt\.ly|encurtador\.com\.br|t\.co|goo\.gl|is\.gd|linktr\.ee|wa\.me|cloudfront\.net|cdn\.jsdelivr\.net|unpkg\.com|storage\.googleapis\.com|supabase\.co|base44\.com|drive\.google\.com|dropbox\.com|dl\.dropboxusercontent\.com|r2\.dev|amazonaws\.com|imgur\.com)$|(^|\.)cdn\d*\./i;
const ARQUIVO = /\.(html?|png|jpe?g|webp|gif|svg|mp4|pdf|js|css|json)$/i;
const FORMATO_UTM = /^[A-Za-z0-9._-]{1,64}$/;

/* ---------------- fontes de verdade ---------------- */
function carregarFontes() {
  const precos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados', 'precos.json'), 'utf8'));
  const caixa = { window: {}, URL, console };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8'), caixa, { timeout: 2000 });
  const ck = caixa.window.CREAT_CHECKOUT;
  if (!ck) throw new Error('checkout.config.js não definiu CREAT_CHECKOUT');
  const inaug = precos.abertura && precos.abertura.inauguracao;
  const inaugAtiva = !!(inaug && inaug.ativa && Number(inaug.vagasRestantes) > 0);
  const abertura = inaugAtiva ? inaug.preco : precos.abertura.padrao;
  const aberturaCk = inaugAtiva ? ck.valorDosLinks.aberturaInauguracao : ck.valorDosLinks.aberturaPadrao;
  const divergencias = [];
  if (abertura !== aberturaCk) divergencias.push(`Abertura: precos.json ${abertura} x checkout.config.js ${aberturaCk}`);
  if (precos.planos.aberto !== ck.precosPadrao.planos.aberto) divergencias.push(`plano Aberto: precos.json ${precos.planos.aberto} x checkout.config.js ${ck.precosPadrao.planos.aberto}`);
  if (precos.planos.vitrine !== ck.precosPadrao.planos.vitrine) divergencias.push(`plano Vitrine: precos.json ${precos.planos.vitrine} x checkout.config.js ${ck.precosPadrao.planos.vitrine}`);
  if (precos.abertura.padrao !== ck.precosPadrao.abertura) divergencias.push(`Abertura padrão: precos.json ${precos.abertura.padrao} x checkout.config.js ${ck.precosPadrao.abertura}`);
  return {
    inaugAtiva, abertura, aberto: precos.planos.aberto, vitrine: precos.planos.vitrine, divergencias,
    permitidos: new Set([abertura, precos.planos.aberto, precos.planos.vitrine]),
    pracas: Object.keys(ck.linksPorPraca || {})
  };
}

/* ---------------- conferências de texto ---------------- */
const norm = s => String(s == null ? '' : s).normalize('NFC');
const rePalavra = w => new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/ /g, '\\s+') + '(?=$|[^\\p{L}\\p{N}])', 'iu');
const fmt = n => 'R$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function conferirIdioma(a) {
  const f = [];
  const campos = { título: a.titulo, texto: a.texto, descrição: a.descricao };
  for (const [nome, v] of Object.entries(campos)) {
    const t = norm(v);
    if (!t.trim()) { if (nome !== 'descrição') f.push(`${nome} vazio`); continue; }
    const ing = INGLES.filter(w => rePalavra(w).test(t));
    if (ing.length) f.push(`${nome} com inglês: ${ing.join(', ')}`);
    const sa = SEM_ACENTO.filter(w => rePalavra(w).test(t)).map(w => (t.match(rePalavra(w)) || [''])[0].trim());
    if (sa.length) f.push(`${nome} sem acento: ${[...new Set(sa)].join(', ')}`);
    if (MOJIBAKE.test(t)) f.push(`${nome} com acento quebrado: "${t.match(MOJIBAKE)[0]}"`);
    if (EMOJI.test(t)) f.push(`${nome} com emoji`);
    if (TRAVESSAO.test(t)) f.push(`${nome} com travessão`);
    for (const [re, motivo] of PROIBIDAS) if (re.test(t)) f.push(`${nome}: ${motivo}`);
    if (!PRAZO_LIBERADO && /\b\d+\s?(h|horas?)\b|\b\d+\s?dias?\s+úteis/i.test(t)) f.push(`${nome} promete prazo; só depois do ensaio verde (--prazo-liberado)`);
    if (!TRAVA_PROVADA && /inaugura/i.test(t)) f.push(`${nome} fala de inauguração; só com a trava das 20 vagas provada (--trava-provada)`);
  }
  const b = norm(a.botao).trim();
  if (!b) f.push('botão vazio');
  else if (/^[A-Z_]+$/.test(b)) { if (!BOTOES[b]) f.push(`botão ${b} sem rótulo pt-BR conhecido`); }
  else if (!ROTULOS_BOTAO.has(b.toLowerCase())) f.push(`botão "${b}" não é um rótulo pt-BR da Meta`);
  return f;
}

function conferirMoeda(a, F) {
  const f = [];
  if (F.divergencias.length) f.push('fontes de preço divergem: ' + F.divergencias.join('; '));
  if (!F.inaugAtiva) f.push(`a inauguração acabou (precos.json): o anúncio tem de usar ${fmt(F.abertura)} e sobe com utm_content v2`);
  for (const [nome, v] of Object.entries({ título: a.titulo, texto: a.texto, descrição: a.descricao })) {
    const t = norm(v);
    const estrangeira = t.match(/US\$|\bUSD\b|\bEUR\b|€|£|\bd[óo]lar(es)?\b|(^|[^R])\$\s?\d/i);
    if (estrangeira) f.push(`${nome} com moeda estrangeira: "${estrangeira[0].trim()}"`);
    if (/R\$\d/.test(t)) f.push(`${nome} com "R$" colado no número (escreva R$ 297)`);
    for (const m of t.matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g)) {
      const valor = Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2]) / 100 : 0);
      if (!F.permitidos.has(valor)) f.push(`${nome} com ${m[0]}, que não é preço vigente (vigentes: ${[...F.permitidos].map(fmt).join(', ')})`);
    }
    for (const p of F.permitidos) {
      const solto = new RegExp('(?<!R\\$\\s?)(?<![\\d.,])' + p + '(?!\\d|,\\d)', 'g');
      if (solto.test(t)) f.push(`${nome} com ${p} sem "R$"`);
    }
    if (/\breais\b/i.test(t)) f.push(`${nome} escreve "reais" por extenso; use R$`);
  }
  const texto = norm(a.texto);
  for (const [rotulo, v] of [['Abertura', F.abertura], ['plano Aberto', F.aberto]]) {
    const re = new RegExp('R\\$\\s' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\\.') + '(?!\\d|,\\d)');
    const m = texto.match(re);
    if (!m) f.push(`texto principal sem ${fmt(v)} (${rotulo})`);
    else if (m.index + m[0].length > 125) f.push(`${fmt(v)} termina no caractere ${m.index + m[0].length} do texto principal; tem de terminar até o 125`);
  }
  const dv = a.valores || {};
  if (dv.abertura !== undefined && Number(dv.abertura) !== F.abertura) f.push(`valores.abertura ${dv.abertura} diferente de precos.json e checkout.config.js (${F.abertura})`);
  if (dv.plano !== undefined && Number(dv.plano) !== F.aberto) f.push(`valores.plano ${dv.plano} diferente de precos.json e checkout.config.js (${F.aberto})`);
  return f;
}

function nomeDoCodigo(a) { return String(a.utm_content || String(a.nome || '').split('·')[0]).trim(); }

let ANUNCIOS = null, PRACAS = null, NICHOS = ['barbearia', 'salao', 'academia'];
function conferirUrl(a, F) {
  const f = [];
  let u;
  try { u = new URL(String(a.url || '').trim()); } catch (e) { return { f: ['URL inválida ou vazia'], abrir: null }; }
  const base = new URL(BASE);
  const av = [];
  let antigo = false;
  if (u.protocol !== 'https:') f.push('URL sem https');
  if (HOST_PROIBIDO.test(u.hostname)) f.push(`URL em CDN ou encurtador (${u.hostname}); destino é a página do site`);
  else if (u.hostname === ANTIGO.hostname && u.hostname !== base.hostname) {
    if (ANTIGO_ACEITO) { antigo = true; av.push(`endereço antigo: o link está em ${u.hostname}, aceito até ${C.ENDERECO.antigoAceitoAte}; no ato de 13/11 troque para ${base.hostname}${SEM_LINK ? '' : ' (o mesmo link no host novo também foi aberto)'}`); }
    else f.push(`URL no endereço antigo ${u.hostname} depois de ${C.ENDERECO.antigoAceitoAte}: troque para ${base.hostname} (docs/DOMINIO.md)`);
  }
  else if (u.hostname !== base.hostname) f.push(`URL em ${u.hostname}, esperado ${base.hostname}`);
  if (ARQUIVO.test(u.pathname)) f.push(`URL aponta para arquivo (${u.pathname}); destino é a rota da página`);
  else if (u.pathname !== '/') f.push(`URL em ${u.pathname}; o anúncio de site leva à home (/)`);
  if (u.hash) f.push('URL com # (o fragmento é da página, não do anúncio)');
  const q = u.searchParams;
  const codigo = nomeDoCodigo(a);
  const esperado = { nicho: a.nicho, utm_source: 'meta', utm_medium: 'pago', utm_campaign: a.praca, utm_content: codigo };
  for (const [k, v] of Object.entries(esperado)) {
    const todos = q.getAll(k);
    if (!todos.length) f.push(`${k} faltando (esperado ${v || '?'})`);
    else if (todos.length > 1) f.push(`${k} repetido`);
    else if (todos[0] !== v) f.push(`${k}=${todos[0]}, esperado ${v}`);
    else if (!FORMATO_UTM.test(todos[0])) f.push(`${k} fora do formato [A-Za-z0-9._-]`);
  }
  if (!NICHOS.includes(a.nicho)) f.push(`nicho ${a.nicho} fora de ${NICHOS.join(', ')}`);
  if (a.praca && !F.pracas.includes(a.praca)) f.push(`praça ${a.praca} sem link de pagamento em checkout.config.js`);
  if (a.praca && PRACAS && !PRACAS.includes(a.praca)) f.push(`praça ${a.praca} fora de PRACAS (schema/pedido-regras.mjs)`);
  if (codigo && ANUNCIOS && !ANUNCIOS.includes(codigo)) f.push(`utm_content ${codigo} fora de ANUNCIOS (schema/pedido-regras.mjs): o contador o conta como "outro"`);
  const seg = codigo.split('-');
  if (codigo !== 'video' && seg[1] && seg[1] !== 'geral' && seg[1] !== a.nicho) f.push(`utm_content ${codigo} é de ${seg[1]}, o anúncio é de ${a.nicho}`);
  const termo = q.getAll('utm_term');
  if (!termo.length) f.push('utm_term faltando (use {{placement}})');
  else if (termo[0] !== '{{placement}}' && !FORMATO_UTM.test(termo[0])) f.push(`utm_term ${termo[0]} fora do formato`);
  const conhecidos = new Set(['nicho', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
  const estranhos = [...q.keys()].filter(k => !conhecidos.has(k));
  if (estranhos.length) f.push(`parâmetro fora do contrato: ${[...new Set(estranhos)].join(', ')}`);
  const abrir = String(a.url).trim().replace('{{placement}}', POSICIONAMENTO_SIMULADO);
  // anúncio no antigo: abre como está (tem de chegar a uma página que funciona) e com o host do canônico
  let abrirNovo = null;
  if (antigo) { const n = new URL(abrir); n.protocol = base.protocol; n.host = base.host; abrirNovo = n.href; }
  return { f, av, abrir, abrirNovo };
}

/* ---------------- link aberto de verdade ---------------- */
async function abrirLink(nav, a, abrir, tituloHome) {
  const f = [], av = [];
  // origem do link e a canônica: o salto do antigo para o canônico (pacote H1) é o único caminho aceito para fora
  const ORIGEM = new URL(abrir).origin, CANON = new URL(BASE).origin;
  const ACEITAS = [...new Set([ORIGEM, CANON])];
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', userAgent: UA });
  await ctx.route(u => { try { return ACEITAS.includes(new URL(u).origin); } catch (e) { return false; } },
    route => route.continue({ headers: Object.assign({}, route.request().headers(), CONF) }));
  const pg = await ctx.newPage();
  const eventosMeta = [], contagens = [], erros = [], quebradas = [];
  let fbArquivo = false, pedidoCancelado = 0;
  pg.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 140)); });
  pg.on('pageerror', e => erros.push(String(e).slice(0, 140)));
  const docs = [];
  pg.on('response', r => {
    try { if (r.request().isNavigationRequest() && r.frame() === pg.mainFrame()) docs.push(r); } catch (e) { /* moldura fechada */ }
    const u = r.url();
    if (r.status() >= 400 && !/facebook\.com\/tr/.test(u)) quebradas.push(r.status() + ' ' + u.slice(0, 100));
    if (/connect\.facebook\.net\/.*fbevents\.js/.test(u) && r.status() === 200) fbArquivo = true;
  });
  await pg.route(/facebook\.com\/tr/, route => { const m = route.request().url().match(/[?&]ev=([^&]+)/); if (m) eventosMeta.push(m[1]); route.abort(); });
  await pg.route(/\/(api\/pa|functions)\/contar(\?|$)/, route => {
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* corpo não JSON */ }
    contagens.push(c); route.fulfill({ status: 204, body: '' });
  });
  await pg.route(/\/(api\/pa|functions)\/registrarPedido(\?|$)/, route => { pedidoCancelado++; route.abort(); });
  try {
    // o salto do antigo para o canônico troca o documento no meio do carregamento: "interrompida" não é erro
    let r = await pg.goto(abrir, { waitUntil: 'networkidle', timeout: 60000, referer: 'https://l.instagram.com/' }).catch(e => { if (/interrupted|ERR_ABORTED|detached/i.test(String(e))) return null; throw e; });
    if (ORIGEM !== CANON) {
      await pg.waitForURL(x => x.origin === CANON, { timeout: 8000 }).catch(() => {});
      await pg.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      if (new URL(pg.url()).origin === CANON) av.push(`antigo, redireciona: chegou em ${CANON}`);
      else av.push(`antigo, ainda sem salto para ${CANON} (a página nova ainda não está no ar); a página abriu no antigo`);
    }
    // com o salto, vale a última resposta de documento (a do canônico); sem salto, é a do próprio goto
    if (docs.length) r = docs[docs.length - 1];
    // cadeia de redirecionamento: só no próprio servidor, nunca por CDN
    const saltos = []; let req = r ? r.request().redirectedFrom() : null;
    while (req) { saltos.push(req.url()); req = req.redirectedFrom(); }
    const fora = saltos.filter(s => !ACEITAS.includes(new URL(s).origin));
    if (!r || r.status() !== 200) f.push(`status ${r ? r.status() : 'sem resposta'}`);
    if (fora.length) f.push(`redireciona por fora do site: ${fora[0].slice(0, 80)}`);
    if (!ACEITAS.includes(new URL(pg.url()).origin)) f.push(`terminou em ${new URL(pg.url()).origin}`);
    if (HOST_PROIBIDO.test(new URL(pg.url()).hostname)) f.push('terminou em CDN');
    await pg.waitForTimeout(1200);
    const tela = await pg.evaluate(() => {
      const h = document.querySelector('h1'); const hb = h ? h.getBoundingClientRect() : null;
      const ch = document.querySelector('input[name="nicho"]:checked'); const lb = ch ? ch.closest('label').getBoundingClientRect() : null;
      return { titulo: document.title, h1: h ? h.innerText.trim() : '', h1Dobra: !!hb && hb.top >= 0 && hb.bottom <= innerHeight,
        nicho: ch ? ch.value : null, rotulo: ch ? ch.closest('label').innerText.trim() : '', rotuloDobra: !!lb && lb.top >= 0 && lb.bottom <= innerHeight, rotuloY: lb ? Math.round(lb.top) : null,
        exemplo: (document.querySelector('#nome') || {}).placeholder || '', texto: document.body.innerText };
    });
    if (tituloHome && tela.titulo !== tituloHome) f.push(`título da página "${tela.titulo}", esperado "${tituloHome}"`);
    if (!tela.h1Dobra) f.push('título (h1) da home fora da primeira tela');
    if (tela.nicho !== a.nicho) f.push(`nicho marcado na página: ${tela.nicho || 'nenhum'}, esperado ${a.nicho}`);
    else if (!tela.rotuloDobra) {
      const msg = `o nicho "${tela.rotulo}" está marcado, mas fica abaixo da primeira tela (y=${tela.rotuloY} de 844)`;
      if (ESTRITO_DOBRA) f.push(msg); else av.push(msg);
    }
    if (a.nicho !== 'barbearia' && /barbearia/i.test(tela.exemplo)) av.push(`exemplo do campo de nome diz "${tela.exemplo}" no anúncio de ${a.nicho}`);
    if (!new RegExp('R\\$\\s?' + PRECO_ABERTURA).test(tela.texto)) f.push(`a página não mostra R$ ${PRECO_ABERTURA}`);
    // medição: o contador próprio sai sem aceite; a Meta só depois do Aceitar
    const visita = contagens.find(c => c && c.evento === 'visita');
    if (!visita) f.push('evento de visita do contador próprio não saiu');
    else {
      if (visita.nicho !== a.nicho) f.push(`visita contada com nicho ${visita.nicho}, esperado ${a.nicho}`);
      if (visita.praca !== a.praca) f.push(`visita contada com praça ${visita.praca}, esperado ${a.praca}`);
      if (visita.utm_content !== nomeDoCodigo(a)) f.push(`visita contada com utm_content ${visita.utm_content}, esperado ${nomeDoCodigo(a)}`);
    }
    await pg.evaluate(() => { const b = document.querySelector('[data-preferencias]'); if (b) b.click(); });
    await pg.waitForTimeout(400);
    const aceitou = await pg.evaluate(() => { const b = [...document.querySelectorAll('#consentimento button')].find(x => /Aceitar/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
    await pg.waitForTimeout(4500);
    const fbq = await pg.evaluate(() => !!(window.fbq && window.fbq.callMethod));
    if (!aceitou) f.push('aviso de medição sem o botão Aceitar');
    if (!(fbArquivo && fbq)) f.push(`medição da Meta não carregou (arquivo ${fbArquivo}, pronta ${fbq})`);
    if (!eventosMeta.includes('PageView')) f.push(`PageView não saiu para a Meta (eventos: ${eventosMeta.join(', ') || 'nenhum'})`);
    const errosReais = [...new Set(erros)].filter(e => !/net::ERR_FAILED|facebook\.com\/tr/.test(e));
    if (errosReais.length) f.push('erro de console: ' + errosReais.slice(0, 2).join(' ; '));
    if (quebradas.length) f.push('requisição quebrada: ' + [...new Set(quebradas)].slice(0, 2).join(' ; '));
  } catch (e) { f.push('não abriu: ' + String(e).slice(0, 140)); }
  await ctx.close();
  return { f, av, pedidoCancelado };
}
let PRECO_ABERTURA = 297;

/* ---------------- principal ---------------- */
(async () => {
  let entrada, F;
  try { entrada = JSON.parse(fs.readFileSync(arqEntrada, 'utf8')); } catch (e) { console.error('erro   não li o JSON de entrada: ' + e.message); process.exit(2); }
  const lista = Array.isArray(entrada) ? entrada : entrada.anuncios;
  if (!Array.isArray(lista) || !lista.length) { console.error('erro   o JSON não tem a lista "anuncios"'); process.exit(2); }
  try { F = carregarFontes(); } catch (e) { console.error('erro   fontes de preço: ' + e.message); process.exit(2); }
  PRECO_ABERTURA = F.abertura;
  try { const regras = await import(require('url').pathToFileURL(path.join(RAIZ, 'schema', 'pedido-regras.mjs')).href); ANUNCIOS = regras.ANUNCIOS; PRACAS = regras.PRACAS; NICHOS = regras.NICHOS || NICHOS; }
  catch (e) { console.error('erro   schema/pedido-regras.mjs: ' + e.message); process.exit(2); }
  let tituloHome = '';
  try { tituloHome = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo', 'home.json'), 'utf8')).seo.titulo; } catch (e) { /* sem título esperado: confere só que abriu */ }

  let nav = null;
  if (!SEM_LINK) {
    let chromium;
    try { ({ chromium } = require(path.join(RAIZ, 'node_modules', 'playwright'))); } catch (e) {
      try { ({ chromium } = require('playwright')); } catch (e2) { console.error('erro   playwright ausente (npm ci em projetos/creat-nuvem)'); process.exit(2); }
    }
    nav = await chromium.launch();
  }

  console.log(`Validação tripla · ${lista.length} anúncio(s) · site ${BASE}${ANTIGO_ACEITO ? ` (e o antigo ${ANTIGO.hostname}, aceito até ${C.ENDERECO.antigoAceitoAte})` : ''} · Abertura ${fmt(F.abertura)} · plano ${fmt(F.aberto)} (precos.json = checkout.config.js: ${F.divergencias.length ? 'NÃO' : 'sim'})\n`);
  const linhas = [];
  for (const a of lista) {
    const rotulo = `${a.id || '?'} ${a.nome || nomeDoCodigo(a)}`;
    const idioma = conferirIdioma(a);
    const moeda = conferirMoeda(a, F);
    const u = conferirUrl(a, F);
    let link = u.f.slice(), avisos = (u.av || []).slice(), cancelados = 0;
    if (SEM_LINK) link.push('NÃO VERIFICADO: rodada com --sem-link');
    else if (u.abrir) {
      const r = await abrirLink(nav, a, u.abrir, tituloHome); link = link.concat(r.f); avisos = avisos.concat(r.av); cancelados = r.pedidoCancelado;
      // anúncio no antigo: o mesmo link no canônico tem de passar inteiro (é para lá que ele vai no ato de 13/11)
      if (u.abrirNovo) { const n = await abrirLink(nav, a, u.abrirNovo, tituloHome); link = link.concat(n.f.map(x => `no canônico: ${x}`)); avisos = avisos.concat(n.av.map(x => `no canônico: ${x}`)); cancelados += n.pedidoCancelado; }
    }
    linhas.push({ rotulo, idioma, moeda, link, avisos, cancelados });
    console.log(`${rotulo}`);
    for (const [col, ff] of [['IDIOMA', idioma], ['MOEDA', moeda], ['LINK', link]]) {
      if (!ff.length) console.log(`  ok     ${col}`);
      else ff.forEach(x => console.log(`  FALHA  ${col} · ${x}`));
    }
    avisos.forEach(x => console.log(`  AVISO  LINK · ${x}`));
  }
  if (nav) await nav.close();

  const marca = ff => ff.length ? 'FALHA' : 'ok';
  const larg = Math.max(8, ...linhas.map(l => l.rotulo.length));
  console.log('\n' + 'anúncio'.padEnd(larg) + ' | idioma | moeda | link');
  console.log('-'.repeat(larg) + '-|--------|-------|------');
  linhas.forEach(l => console.log(l.rotulo.padEnd(larg) + ' | ' + marca(l.idioma).padEnd(6) + ' | ' + marca(l.moeda).padEnd(5) + ' | ' + marca(l.link)));
  const falhas = linhas.flatMap(l => [['IDIOMA', l.idioma], ['MOEDA', l.moeda], ['LINK', l.link]].flatMap(([c, ff]) => ff.map(x => `${l.rotulo} · ${c} · ${x}`)));
  const nAvisos = linhas.reduce((s, l) => s + l.avisos.length, 0);
  if (ARQ_JSON) fs.writeFileSync(ARQ_JSON, JSON.stringify({ base: BASE, hoje: HOJE, antigo_aceito: ANTIGO_ACEITO, data: new Date().toISOString(), anuncios: linhas, falhas }, null, 1));
  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s). Nenhum destes anúncios sobe nem liga até tudo ficar verde:`);
    falhas.forEach(x => console.error('  - ' + x));
    process.exit(1);
  }
  console.log(`\nok     ${lista.length} de ${lista.length} anúncios com idioma, moeda e link verdes${nAvisos ? ` · ${nAvisos} aviso(s) acima, que não bloqueiam` : ''}.`);
  process.exit(0);
})().catch(e => { console.error('erro  ', e); process.exit(2); });
