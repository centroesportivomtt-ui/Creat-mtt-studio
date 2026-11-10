// Porta Aberta · regras puras do pedido, da confirmação, do contador e da aprovação (pacote 1A, 10/11/2026).
// Este arquivo é copiado BYTE A BYTE para o app Base44 6aefffe66b684db9404b1994 em src/lib/pa/regras.js.
// O revisor compara: sha256sum schema/pedido-regras.mjs  ==  sha256sum src/lib/pa/regras.js (no sandbox do app).
// Sem import, sem rede, sem banco e sem relógio próprio: a hora sempre entra por parâmetro (milissegundos UTC).
// Contrato completo: docs/PEDIDO-API.md.

export const VERSAO_REGRAS = 'pa-regras-1A-2026-11-10e';

/* ---------- Vocabulário fechado ---------- */

export const ESTADOS = Object.freeze([
  'aguardando_pagamento', 'pago', 'a_conferir', 'recusado', 'em_revisao', 'em_producao',
  'rascunho_enviado', 'aprovado', 'no_ar', 'desistiu', 'teste_ok'
]);

// Catálogo do servidor. O valor do pedido sai daqui, nunca do navegador.
// pa-teste é a compra real de R$ 1 do ensaio: grava com eh_teste e nunca vira pago (vira teste_ok).
export const PRODUTOS = Object.freeze({
  'pa-abertura-inauguracao-2026-11': Object.freeze({ valor: 297, teste: false, inauguracao: true, nome: 'Abertura do site (preço de inauguração)' }),
  'pa-abertura-2026-11': Object.freeze({ valor: 497, teste: false, inauguracao: false, nome: 'Abertura do site' }),
  'pa-teste': Object.freeze({ valor: 1, teste: true, inauguracao: false, nome: 'Compra de teste' })
});

export const PRACAS = Object.freeze(['feira', 'salvador-rms', 'fortaleza', 'recife', 'petrolina-juazeiro', 'aracaju']);
export const PRACAS_CONTADOR = Object.freeze(['feira', 'salvador-rms']);
export const NICHOS = Object.freeze(['barbearia', 'salao', 'academia']);
export const PLANOS = Object.freeze(['aberto', 'vitrine', 'aberto_anual', 'vitrine_anual']);
export const EVENTOS = Object.freeze(['visita', 'previa', 'ida_pagamento', 'clique_pagar']);

// Códigos de anúncio conhecidos (utm_content de marketing/utm.md, marketing/trafego/*.md). Qualquer outro valor conta como 'outro'.
// Lista fechada de propósito: cada código vira no máximo uma linha por dia em ContadorDia (ninguém enche a entidade
// inventando códigos). O teste 'todo utm_content dos textos de marketing está na lista' falha quando um anúncio novo
// aparece nos textos sem entrar aqui. v2 = rodada da troca de preço (textos-troca-unica.md).
export const ANUNCIOS = Object.freeze([
  'A1-barbearia-v1', 'A1-salao-v1', 'A1-academia-v1', 'A1-barbearia-v2', 'A1-salao-v2', 'A1-academia-v2',
  'A2-barbearia-v1', 'A3-barbearia-v1', 'A4-barbearia-v1', 'A4-salao-v1', 'A5-geral-v1', 'A6-barbearia-v1',
  'B1-salao-v1', 'B1-barbearia-v1', 'B1-salao-v2', 'B1-barbearia-v2', 'C1-barbearia-v1', 'C4-geral-v1',
  'F0-geral-v1', 'F1-barbearia-v1', 'F1-barbearia-v2', 'F1-salao-v1', 'F1-academia-v1',
  'G3-barbearia-v1', 'G4-salao-v1', 'G5-academia-v1',
  'R1-barbearia-v1', 'R1-salao-v1', 'R1-academia-v1', 'R2-barbearia-v1', 'R2-salao-v1', 'R3-geral-v1', 'R4-barbearia-v1',
  'R7-barbearia-v1', 'R7-salao-v1', 'R8-academia-v1', 'R9-salao-v1',
  'T1-barbearia-v1', 'T1-salao-v1', 'T1-academia-v1', 'V1-geral-v1', 'V2-geral-v1',
  'video', 'video-barbearia-v1', 'video-salao-v1', 'video-academia-v1',
  'W0-barbearia-v1', 'W0-salao-v1', 'W0-academia-v1', 'W1-barbearia-v1', 'W1-salao-v1', 'W1-academia-v1', 'W2-geral-v1'
]);

// Versão dos termos aceita -> sha256 do conteudo/termos.md publicado com essa versão.
// termos-v1: commit 29bddd5. termos-v2: commit ab5a4b4 (cabeçalho "Versão 2 (termos-v2) · 10/11/2026").
// As duas continuam aceitas: pedido antigo e página que ainda manda v1 são registrados com o hash da v1.
export const TERMOS = Object.freeze({
  'termos-v1': '44bbc0ef9c115fcadf11dc581238ddbf20d906ecd627c5ae8db1b63ae3ba8c17',
  'termos-v2': '7ae67e835b8d745b00eb49dc9167bf43f8b50688123393d217cdefc6eb3fb612'
});

export const LIMITES = Object.freeze({
  corpoBytes: 2048,
  janelaRegra3Ms: 6 * 3600 * 1000,
  janelaRegra2Ms: 7 * 24 * 3600 * 1000,
  candidatosRegra2: 20,
  // portaAbertaVerificar (1B) aceita, por origem e por hora, 60 respostas SEM pagamento aprovado (acima disso só o
  // pagamento aprovado do Porta Aberta é respondido; o resto é 429) e 600 chamadas no total (teto duro, que barra
  // tudo). O servidor do Porta Aberta é UMA origem para todos os clientes. Por confirmação: 1 chamada sem e-mail e,
  // na Regra 2, UMA chamada com a lista de até 5 e-mails distintos (emails_candidatos do 1B, contrato c3).
  // Cache: aprovado 1 h; negativo SEM e-mail 15 s; negativo COM e-mail nunca (Pix pendente que compensa tem de virar
  // pago na consulta seguinte: politicaCacheVerificar, contrato c2).
  verificacoesRegra2: 4,
  candidatosLista: 5,
  // Orçamento por hora de chamadas ao portaAbertaVerificar (orcamentoVerificar, contrato c3, fecho 2 de 10/11):
  //  verificarHora: teto de todas as chamadas, bem abaixo do teto duro de 600 do 1B (que barraria até o aprovado).
  //  verificarAnonHora: tentativas anônimas que NÃO voltaram aprovado:true (falsas, 429, 5xx, rede), todas as origens.
  //    aprovado:true nunca gasta nada, e o total de chamadas NÃO entra nesta conta: os ids inventados de um endereço
  //    não fecham a porta para a origem de onde vem o aviso do Mercado Pago.
  //  verificarAnonOrigemHora: com verificarAnonHora esgotado, cada origem ainda tem estas tentativas falsas por hora.
  //    O aviso do Mercado Pago só chama a confirmação com pagamento aprovado, então a origem dele nunca gasta a sua.
  //  verificarFalsosTetoHora: teto global das tentativas anônimas falsas (protege o teto duro do 1B). Para alcançá-lo,
  //    são precisos 57 endereços diferentes na mesma hora (30 + 3 por endereço novo).
  verificarHora: 400,
  verificarAnonHora: 30,
  verificarAnonOrigemHora: 3,
  verificarFalsosTetoHora: 200,
  cacheVerificarMs: 3600 * 1000,
  cacheNegativoMs: 15 * 1000,
  // Confirmação anônima que ficou em 202 (passageiro): Operacao pendente_<payment_id>, sem dado pessoal. A rotina
  // refaz a confirmação pela faixa do servidor (não disputa o orçamento anônimo) e alerta a partir de 2 h.
  pendentesNovosHora: 60,
  pendentesPorRotina: 10,
  pendenteValidadeMs: 7 * 24 * 3600 * 1000,
  alertaPendenteMs: 2 * 3600 * 1000,
  // a_conferir: alerta na rotina a partir de 2 h, um aviso por dia por pagamento; registro em Operacao por 30 dias.
  alertaConferirMs: 2 * 3600 * 1000,
  conferirRegistroMs: 30 * 24 * 3600 * 1000,
  registrarHora: 30,
  registrarGlobalHora: 300,
  registrarGlobalDuroHora: 900,
  consultarHora: 600,
  purgaTeto: 2000,
  aceiteTacitoMs: 7 * 24 * 3600 * 1000,
  prazoHoras: 72,
  alertaAntesMs: 12 * 3600 * 1000,
  aprovacaoValidadeMs: 14 * 24 * 3600 * 1000,
  aprovacaoTentativas: 5,
  purgaDias: 30,
  alertaLinhas: 5000,
  emailsDia: 20
});

export const RE = Object.freeze({
  // Id gravado pelo servidor: PA- e 10 caracteres. O PEDIDO v1 antigo (8 Crockford) só vale em schema/pedido.schema.json.
  pedidoId: /^PA-[0-9A-Z]{10}$/,
  paymentId: /^\d{6,14}$/,
  // 128 bits em base64url sem preenchimento: 22 caracteres, o último em [AQgw].
  segredo: /^[A-Za-z0-9_-]{21}[AQgw]$/,
  hex64: /^[0-9a-f]{64}$/,
  // Pasta do rascunho: <slug>--r-<id>. O hífen duplo nunca aparece num slug final (slugSeguro), e por isso o robots.txt
  // da raiz barra /sites/*--r- sem barrar site final com "-r-" no nome (fecho 2 de 10/11).
  slugRascunho: /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?--r-[a-z0-9]{12,32}$/,
  utm: /^[A-Za-z0-9._-]{1,64}$/,
  email: /^[^\s@:;<>"',]{1,64}@[^\s@:;<>"',.]{1,63}(\.[^\s@:;<>"',.]{1,63})+$/,
  // 55 + DDD (dois dígitos de 1 a 9) + celular (9 e mais 8) ou fixo (2 a 5 e mais 7).
  whatsapp: /^55[1-9][1-9](9\d{8}|[2-5]\d{7})$/,
  negocio: /^[\p{L}\p{N} &.'-]{1,40}$/u,
  cidade: /^[\p{L}\p{N} .'-]{1,40}$/u,
  // Opcionais do registro (o mesmo formato do PEDIDO v1, schema/pedido.schema.json $defs/PedidoEntrada).
  responsavel: /^[\p{L} .'-]{2,60}$/u,
  horarios: /^seg=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);ter=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);qua=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);qui=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);sex=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);sab=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d);dom=(fechado|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)$/
});

/* ---------- Entrada ---------- */

// Coage id e número de pagamento a texto. Objeto, lista, booleano ou nulo viram null (resposta 4xx).
export function comoTexto(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0) return String(v);
  return null;
}

export function idValido(v) { const s = comoTexto(v); return s !== null && RE.pedidoId.test(s) ? s : null; }
export function paymentIdValido(v) { const s = comoTexto(v); return s !== null && RE.paymentId.test(s) ? s : null; }
export function segredoValido(v) { return typeof v === 'string' && RE.segredo.test(v) ? v : null; }

const CHAVES_REGISTRO = Object.freeze([
  'id', 'segredo', 'produto', 'valor', 'praca', 'plano', 'nicho', 'negocio', 'cidade', 'whatsapp', 'email',
  'utm_source', 'utm_campaign', 'utm_content', 'termos_versao', 'consentimento_dados', 'hp', 'teste', 'aceite_em',
  'responsavel', 'endereco', 'horarios'
]);

function texto(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length && s.length <= max ? s : null;
}

// Valida o corpo de registrarPedido (schema/pedido.schema.json, $defs/PedidoRegistro).
// Devolve { ok: true, pedido, teste, isca } ou { ok: false, campo }.
// 'aceite_em' do navegador é aceito e IGNORADO: a hora do aceite é a do servidor.
export function validarRegistro(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { ok: false, campo: 'corpo' };
  for (const k of Object.keys(corpo)) if (!CHAVES_REGISTRO.includes(k)) return { ok: false, campo: k };
  const id = idValido(corpo.id);
  if (!id) return { ok: false, campo: 'id' };
  const segredo = segredoValido(corpo.segredo);
  if (!segredo) return { ok: false, campo: 'segredo' };
  const produto = typeof corpo.produto === 'string' && Object.prototype.hasOwnProperty.call(PRODUTOS, corpo.produto) ? corpo.produto : null;
  if (!produto) return { ok: false, campo: 'produto' };
  const valor = typeof corpo.valor === 'number' ? corpo.valor : (typeof corpo.valor === 'string' && /^\d{1,5}$/.test(corpo.valor) ? Number(corpo.valor) : NaN);
  if (valor !== PRODUTOS[produto].valor) return { ok: false, campo: 'valor' };
  let praca = null;
  if (corpo.praca !== undefined && corpo.praca !== null && corpo.praca !== '') {
    if (!PRACAS.includes(corpo.praca)) return { ok: false, campo: 'praca' };
    praca = corpo.praca;
  }
  let plano = null;
  if (corpo.plano !== undefined && corpo.plano !== null && corpo.plano !== '') {
    if (!PLANOS.includes(corpo.plano)) return { ok: false, campo: 'plano' };
    plano = corpo.plano;
  }
  if (!NICHOS.includes(corpo.nicho)) return { ok: false, campo: 'nicho' };
  const negocio = texto(corpo.negocio, 40);
  if (!negocio || !RE.negocio.test(negocio)) return { ok: false, campo: 'negocio' };
  const cidade = texto(corpo.cidade, 40);
  if (!cidade || !RE.cidade.test(cidade)) return { ok: false, campo: 'cidade' };
  const whatsapp = typeof corpo.whatsapp === 'string' ? corpo.whatsapp.replace(/\D/g, '') : '';
  if (!RE.whatsapp.test(whatsapp)) return { ok: false, campo: 'whatsapp' };
  const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (email.length > 120 || !RE.email.test(email)) return { ok: false, campo: 'email' };
  const utm = {};
  for (const k of ['utm_source', 'utm_campaign', 'utm_content']) {
    const v = corpo[k];
    if (v === undefined || v === null || v === '') { utm[k] = null; continue; }
    if (typeof v !== 'string' || !RE.utm.test(v)) return { ok: false, campo: k };
    utm[k] = v;
  }
  if (typeof corpo.termos_versao !== 'string' || !Object.prototype.hasOwnProperty.call(TERMOS, corpo.termos_versao)) return { ok: false, campo: 'termos_versao' };
  if (corpo.consentimento_dados !== true) return { ok: false, campo: 'consentimento_dados' };
  if (corpo.hp !== undefined && typeof corpo.hp !== 'string') return { ok: false, campo: 'hp' };
  if (corpo.teste !== undefined && typeof corpo.teste !== 'boolean') return { ok: false, campo: 'teste' };
  if (corpo.aceite_em !== undefined && (typeof corpo.aceite_em !== 'string' || corpo.aceite_em.length > 40)) return { ok: false, campo: 'aceite_em' };
  // Opcionais: quem cuida do negócio, endereço (uma linha) e horários. Com os três, o executor produz sem pedir nada
  // ao cliente pelo WhatsApp (entradaDoRegistro). Vazio ou ausente: null.
  const opcional = (k, max, re) => {
    const v = corpo[k];
    if (v === undefined || v === null || v === '') return { v: null };
    const t = texto(v, max);
    return t && (!re || re.test(t)) && t.length >= (k === 'endereco' ? 8 : 2) ? { v: t } : { erro: k };
  };
  const extras = {};
  for (const [k, max, re] of [['responsavel', 60, RE.responsavel], ['endereco', 160, null], ['horarios', 200, RE.horarios]]) {
    const r = opcional(k, max, re);
    if (r.erro) return { ok: false, campo: r.erro };
    extras[k] = r.v;
  }
  return {
    ok: true,
    teste: corpo.teste === true,
    isca: typeof corpo.hp === 'string' && corpo.hp.length > 0,
    segredo,
    pedido: {
      id, produto, valor, praca, plano, nicho: corpo.nicho, negocio, cidade, whatsapp, email,
      utm_source: utm.utm_source, utm_campaign: utm.utm_campaign, utm_content: utm.utm_content,
      termos_versao: corpo.termos_versao, termos_hash: TERMOS[corpo.termos_versao],
      eh_teste: PRODUTOS[produto].teste,
      responsavel: extras.responsavel, endereco: extras.endereco, horarios: extras.horarios
    }
  };
}

/* ---------- Pagamento ---------- */

// external_reference da preferência do Mercado Pago -> produto e praça.
// Aceita o id do produto, a variante por praça (pa-abertura-inauguracao-<praça>-2026-11) e o link de teste.
export function produtoDaReferencia(ref) {
  if (typeof ref !== 'string' || ref.length > 80) return null;
  if (Object.prototype.hasOwnProperty.call(PRODUTOS, ref)) return { produto: ref, praca: null };
  const m = /^pa-abertura-inauguracao-([a-z-]{3,30})-2026-11$/.exec(ref);
  if (m && PRACAS.includes(m[1])) return { produto: 'pa-abertura-inauguracao-2026-11', praca: m[1] };
  if (/^pa-teste(-[a-z0-9-]{1,30})?$/.test(ref)) return { produto: 'pa-teste', praca: null };
  return null;
}

// Lê a resposta de portaAbertaVerificar (pacote 1B). Só confia em {aprovado:true, valor, external_reference}.
// valor fora do catálogo, referência desconhecida ou qualquer outra forma: null (recusa).
export function pagamentoConfiavel(v) {
  if (!v || typeof v !== 'object' || v.aprovado !== true) return null;
  const ref = produtoDaReferencia(v.external_reference);
  if (!ref) return null;
  const valor = typeof v.valor === 'number' ? v.valor : NaN;
  if (Math.abs(valor - PRODUTOS[ref.produto].valor) > 0.001) return null;
  const aprovadoEm = typeof v.aprovado_em === 'string' && !Number.isNaN(Date.parse(v.aprovado_em)) ? Date.parse(v.aprovado_em) : null;
  return { produto: ref.produto, praca: ref.praca, valor: PRODUTOS[ref.produto].valor, teste: PRODUTOS[ref.produto].teste, aprovadoEmMs: aprovadoEm };
}

// Classifica a resposta de portaAbertaVerificar para a resposta pública de confirmarPagamento.
//  'aprovado'          pagamento aprovado de um produto do catálogo deste servidor (pg preenchido)
//  'fora_do_catalogo'  aprovado pelo 1B como Porta Aberta, mas referência ou valor que este catálogo não vende
//                      (Bastidores, anuais, combos): o suporte é avisado e nada é promovido
//  'nao_aprovado'      inexistente, pendente (Pix ainda não compensado), recusado ou de outro negócio: AINDA CONFERINDO
export function classificarPagamento(v) {
  if (!v || typeof v !== 'object' || v.aprovado !== true) return { tipo: 'nao_aprovado', pg: null };
  const pg = pagamentoConfiavel(v);
  return pg ? { tipo: 'aprovado', pg } : { tipo: 'fora_do_catalogo', pg: null };
}

// Quais e-mails de candidatos da Regra 2 vale perguntar ao portaAbertaVerificar.
// candidatos: pedidos já filtrados por pedidoCasa, do mais recente para o mais antigo.
// E-mails iguais contam uma vez só (é a mesma pessoa; a resposta vale para todos os pedidos dela).
// Devolve { emails: [até max, mais recentes primeiro], sobra: e-mails distintos que ficaram sem pergunta }.
export function escolherVerificacoes(candidatos, max) {
  const vistos = [];
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    const e = c && typeof c.email === 'string' ? c.email.trim().toLowerCase() : '';
    if (e && !vistos.includes(e)) vistos.push(e);
  }
  const n = Number.isInteger(max) && max >= 0 ? max : LIMITES.verificacoesRegra2;
  return { emails: vistos.slice(0, n), sobra: Math.max(0, vistos.length - n) };
}

// Monta a entrada da Regra 2 perguntando ao portaAbertaVerificar só o necessário.
// candidatos: pedidos que casam (pedidoCasa), mais recentes primeiro. verificar(email): função da rota que chama o 1B
// e devolve { confere: true|false } ou { transitorio: true } (429, 5xx, rede, tempo). Para no primeiro e-mail que confere
// (e-mails distintos: só um pode ser o do pagador). Devolve { regra2, chamadas, transitorio }.
//  transitorio: alguma pergunta falhou e nenhuma conferiu; a rota responde 202 e não muda nada.
export async function montarRegra2(candidatos, verificar, max) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const { emails } = escolherVerificacoes(lista, max);
  const resposta = new Map();
  let chamadas = 0, transitorio = false, achou = false;
  for (const e of emails) {
    if (achou) break;
    chamadas++;
    const r = await verificar(e);
    if (r && r.transitorio) { transitorio = true; continue; }
    const ok = !!(r && r.confere === true);
    resposta.set(e, ok);
    if (ok) achou = true;
  }
  const regra2 = lista.map(p => {
    const e = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
    if (resposta.has(e)) return { pedido: p, emailConfere: resposta.get(e) };
    // Não perguntado (teto ou parou ao achar): com achado, não pode ser do pagador (outro e-mail).
    return { pedido: p, emailConfere: achou ? false : null };
  });
  return { regra2, chamadas, transitorio: transitorio && !achou };
}

/* ---------- Verificação: cache, orçamento e uma pergunta com regras (c2 e c3 do fecho de 10/11) ---------- */

// Quanto tempo guardar uma resposta firme do portaAbertaVerificar. comEmail: a pergunta levou email_candidato.
//  aprovado:true              1 h (não muda mais)
//  aprovado:false sem e-mail  15 s (segura a rajada do mesmo número; a consulta seguinte, 20 s depois, já pergunta
//                             de novo, e por isso o Pix que compensa 30 s depois vira pago nela: contrato c2)
//  aprovado:false com e-mail  0: NÃO guarda. O 1B devolve aprovado:false para o Pix pendente; se ficasse guardado,
//                             a Regra 2 do aviso que chega quando o Pix compensa leria "não aprovado" e mandaria a
//                             a_conferir quem pagou certo.
export function politicaCacheVerificar(d, comEmail) {
  if (!d || typeof d !== 'object' || typeof d.aprovado !== 'boolean') return 0;
  if (d.aprovado === true) return LIMITES.cacheVerificarMs;
  return comEmail ? 0 : LIMITES.cacheNegativoMs;
}

// Uma resposta guardada pode ser usada? Negativa com e-mail nunca (inclusive linha antiga gravada antes desta regra).
// Negativa sem e-mail só dentro da validade de 15 s (a rota confere pela validade da linha; aqui, pelo carimbo
// "em" quando existe, para que linha antiga de 2 min não segure o Pix que compensou).
export function cacheVerificarUtil(d, comEmail, agoraMs) {
  if (!d || typeof d !== 'object' || typeof d.aprovado !== 'boolean') return false;
  if (d.aprovado === true) return true;
  if (comEmail) return false;
  if (Number.isFinite(agoraMs)) {
    const em = typeof d.em === 'number' ? d.em : NaN;
    if (!Number.isFinite(em) || agoraMs - em > LIMITES.cacheNegativoMs) return false;
  }
  return true;
}

// Pode chamar o portaAbertaVerificar agora? Contadores da hora corrente:
//  total: chamadas feitas (todas as faixas);
//  falsosAnon: tentativas anônimas que NÃO voltaram aprovado:true (falsas e passageiras), todas as origens;
//  falsosAnonOrigem: as mesmas, só da origem desta chamada.
// autenticado: veio com o segredo certo do pedido, ou é a rotina do servidor (admin). pagamentoReal: esta confirmação
// já viu o pagamento aprovado:true (pergunta da Regra 2). Esses dois nunca disputam o orçamento anônimo.
// O total NÃO fecha a faixa anônima (era o defeito do fecho 1: 40 chamadas inventadas de 5 endereços fechavam a porta
// para o aviso do Mercado Pago). A faixa anônima fecha só por tentativa falsa: global, e depois por origem.
// Devolve { ok, motivo?, faixa? }.
export function orcamentoVerificar({ autenticado = false, pagamentoReal = false, total = 0, falsosAnon = 0, falsosAnonOrigem = 0 } = {}) {
  if (total >= LIMITES.verificarHora) return { ok: false, motivo: 'orcamento' };
  if (autenticado) return { ok: true, faixa: 'autenticado' };
  if (pagamentoReal) return { ok: true, faixa: 'pagamento_real' };
  if (falsosAnon >= LIMITES.verificarFalsosTetoHora) return { ok: false, motivo: 'orcamento_anonimo' };
  if (falsosAnon < LIMITES.verificarAnonHora) return { ok: true, faixa: 'anonimo' };
  if (falsosAnonOrigem < LIMITES.verificarAnonOrigemHora) return { ok: true, faixa: 'anonimo_por_origem' };
  return { ok: false, motivo: 'orcamento_anonimo' };
}

function resumoVerificar(d, agoraMs) {
  // Guarda só o que a regra usa. Nunca e-mail nem nome (o 1B também não devolve).
  const resumo = { aprovado: d.aprovado };
  for (const k of ['valor', 'external_reference', 'email_confere', 'aprovado_em', 'meio', 'email_confere_indice']) if (d[k] !== undefined) resumo[k] = d[k];
  if (Number.isFinite(agoraMs)) resumo.em = agoraMs;
  return resumo;
}

// Uma pergunta ao portaAbertaVerificar com cache e orçamento. Todo I/O entra por io (a rota liga ao banco e à rede):
//  io.chave(payment_id, email)  -> texto     io.lerCache(chave) -> resposta guardada ou null
//  io.gravarCache(chave, d, ms)              io.contadores() -> { total, falsosAnon, falsosAnonOrigem }
//  io.somar(nome) para 'total' | 'falso_anon'  io.chamar(corpo) -> { d } | { transitorio, motivo }
//  io.agora() -> ms (opcional)
// Devolve { d, guardado? } (resposta firme) ou { transitorio, motivo } (a rota responde 202 e não muda nada).
// Tentativa anônima que não volta aprovado:true (falsa OU passageira: 429 do 1B, 5xx, rede) gasta 1 do orçamento
// anônimo; sem isso, quem passasse do limite do 1B ganharia chamadas de graça até o teto total.
export async function verificarComRegras(io, { payment_id, email_candidato, autenticado = false, pagamentoReal = false }) {
  const email = typeof email_candidato === 'string' ? email_candidato.trim().toLowerCase() : '';
  const comEmail = email.length > 0;
  const agoraMs = typeof io.agora === 'function' ? io.agora() : Date.now();
  const chave = await io.chave(payment_id, email);
  try {
    const g = await io.lerCache(chave);
    if (cacheVerificarUtil(g, comEmail, agoraMs)) return { d: g, guardado: true };
  } catch { /* sem cache: segue */ }
  const anonimo = !autenticado && !pagamentoReal;
  const orc = orcamentoVerificar({ autenticado, pagamentoReal, ...(await io.contadores()) });
  if (!orc.ok) return { transitorio: true, motivo: orc.motivo };
  await io.somar('total');
  const corpo = { payment_id };
  if (comEmail) corpo.email_candidato = email;
  const r = await io.chamar(corpo);
  if (!r || r.transitorio || !r.d || typeof r.d.aprovado !== 'boolean') {
    if (anonimo) { try { await io.somar('falso_anon'); } catch { /* melhor esforço */ } }
    return { transitorio: true, motivo: (r && r.motivo) || 'formato' };
  }
  const resumo = resumoVerificar(r.d, agoraMs);
  if (anonimo && resumo.aprovado === false) {
    try { await io.somar('falso_anon'); } catch { /* melhor esforço */ }
  }
  const ms = politicaCacheVerificar(resumo, comEmail);
  if (ms > 0) { try { await io.gravarCache(chave, resumo, ms); } catch { /* melhor esforço */ } }
  return { d: resumo };
}

// Regra 2 numa chamada só (contrato c3): manda ao 1B a lista de até 5 e-mails distintos (emails_candidatos) de um
// pagamento JÁ visto aprovado:true (faixa pagamentoReal, fora do orçamento anônimo) e lê email_confere_indice.
//  io: o mesmo de verificarComRegras (contadores, somar, chamar); nada é guardado (a lista tem e-mail).
//  candidatos: pedidos que casam (pedidoCasa), mais recentes primeiro.
// Devolve { regra2, chamadas, transitorio } no mesmo formato de montarRegra2:
//  e-mail que confere: true; os outros perguntados: false; os que passaram do teto (sobra): null (nunca promove).
export async function montarRegra2Lista(io, { payment_id, candidatos, autenticado = false, max }) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const n = Number.isInteger(max) && max >= 1 ? Math.min(max, LIMITES.candidatosLista) : LIMITES.candidatosLista;
  const { emails } = escolherVerificacoes(lista, n);
  const vazio = { regra2: lista.map(p => ({ pedido: p, emailConfere: null })), chamadas: 0, transitorio: false };
  if (!emails.length) return vazio;
  const orc = orcamentoVerificar({ autenticado, pagamentoReal: true, ...(await io.contadores()) });
  if (!orc.ok) return { ...vazio, transitorio: true };
  await io.somar('total');
  const r = await io.chamar({ payment_id, emails_candidatos: emails });
  if (!r || r.transitorio || !r.d || typeof r.d.aprovado !== 'boolean') return { ...vazio, chamadas: 1, transitorio: true };
  const i = r.d.aprovado === true && Number.isInteger(r.d.email_confere_indice) ? r.d.email_confere_indice : -1;
  const certo = i >= 0 && i < emails.length ? emails[i] : null;
  const perguntados = new Set(emails);
  const regra2 = lista.map(p => {
    const e = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
    if (certo) return { pedido: p, emailConfere: e === certo };
    return { pedido: p, emailConfere: perguntados.has(e) ? false : null };
  });
  return { regra2, chamadas: 1, transitorio: false };
}

/* ---------- Confirmação pendente (aviso que ficou em 202; fecho 2 de 10/11) ---------- */

// Registro em Operacao pendente_<payment_id>: só número, horas e contagem. Nada de pedido nem e-mail.
// prev: registro anterior (ou null). n conta quantas vezes o mesmo pagamento voltou em 202 (o aviso real volta:
// 1 + 3 novas tentativas do 1B + reenvios do Mercado Pago), e por isso sobe na fila da rotina.
export function registroPendente(prev, { payment_id, motivo, agoraMs }) {
  const p = prev && typeof prev === 'object' && prev.payment_id === payment_id ? prev : null;
  return {
    payment_id,
    desde: p && typeof p.desde === 'string' ? p.desde : new Date(agoraMs).toISOString(),
    ultimo: new Date(agoraMs).toISOString(),
    n: (p && Number.isInteger(p.n) ? p.n : 0) + 1,
    motivo: typeof motivo === 'string' ? motivo.replace(/[^a-z0-9_]/g, '').slice(0, 30) : null,
    tentativas_rotina: p && Number.isInteger(p.tentativas_rotina) ? p.tentativas_rotina : 0
  };
}

// Quais pendentes a rotina refaz nesta rodada. Ordem: os que a rotina tentou menos vezes primeiro (rodízio: número
// inventado que o 1B segura em 429 não ocupa a fila para sempre); depois os mais repetidos (o aviso real se repete;
// a conta para em 5, para repetição comprada não furar a fila); depois os mais antigos.
export function escolherPendentes(registros, max) {
  const n = Number.isInteger(max) && max >= 0 ? max : LIMITES.pendentesPorRotina;
  const rep = r => Math.min(5, Number.isInteger(r.n) ? r.n : 0);
  const tent = r => (Number.isInteger(r.tentativas_rotina) ? r.tentativas_rotina : 0);
  return (Array.isArray(registros) ? registros : [])
    .filter(r => r && typeof r.payment_id === 'string' && RE.paymentId.test(r.payment_id))
    .slice()
    .sort((a, b) => tent(a) - tent(b) || rep(b) - rep(a) || Date.parse(a.desde) - Date.parse(b.desde))
    .slice(0, n);
}

// Depois de a rotina refazer a confirmação: o que fazer com o registro.
//  resultado: 'confirmado' (pago, teste_ok, a_conferir, já usado), 'firme' (fora do catálogo), 'nao_aprovado'
//  (o 1B disse aprovado:false: número inventado ou pagamento que não foi aprovado) ou 'passageiro'.
// Devolve { apagar, alerta }: alerta = continua passageiro há 2 h ou mais (vai à resposta da rotina e ao suporte).
export function destinoPendente(reg, resultado, agoraMs) {
  if (resultado === 'confirmado' || resultado === 'firme' || resultado === 'nao_aprovado') return { apagar: true, alerta: false };
  const desde = msDe(reg && reg.desde);
  return { apagar: false, alerta: desde !== null && agoraMs - desde >= LIMITES.alertaPendenteMs };
}

/* ---------- a_conferir na rotina (c4 do fecho de 10/11) ---------- */

// Registro de um pagamento que foi a a_conferir (Operacao conferir_<payment_id>, sem dado pessoal).
// teste: pagamento ou pedido de teste (aparece na rotina, nunca gera aviso).
export function registroAConferir({ payment_id, pedido_id, candidatos, regra, teste, agoraMs }) {
  return {
    payment_id,
    teste: teste === true,
    pedido_id: typeof pedido_id === 'string' ? pedido_id : null,
    candidatos: (Array.isArray(candidatos) ? candidatos : []).filter(c => typeof c === 'string' && RE.pedidoId.test(c)).slice(0, 20),
    regra: Number.isInteger(regra) ? regra : null,
    desde: new Date(agoraMs).toISOString()
  };
}

// Junta os pedidos em a_conferir e os registros de pagamento a conferir sem pedido marcado.
//  pedidos: linhas de PedidoPortaAberta com status a_conferir
//  registros: registroAConferir(...) lidos de Operacao (os já resolvidos a rota tira antes)
//  avisadosHoje: payment_id ou pedido_id que já tiveram aviso no dia (Bahia)
// Devolve { itens, avisar }: itens = todos, com horas e alerta (>= 2 h); avisar = os com alerta, sem aviso hoje e
// que não são teste. Pedido de teste aparece na lista (teste:true), mas nunca gera aviso.
export function itensAConferir({ pedidos, registros, avisadosHoje, agoraMs }) {
  const avisados = new Set(Array.isArray(avisadosHoje) ? avisadosHoje : []);
  const porPagamento = new Map();
  for (const r of Array.isArray(registros) ? registros : []) if (r && r.payment_id) porPagamento.set(r.payment_id, r);
  const itens = [];
  const usados = new Set();
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    if (!p || p.status !== 'a_conferir') continue;
    const reg = p.payment_id ? porPagamento.get(p.payment_id) : null;
    if (reg) usados.add(reg.payment_id);
    const desde = msDe(reg && reg.desde) ?? msDe(p.updated_date) ?? msDe(p.created_date) ?? msDe(p.criado_em) ?? agoraMs;
    itens.push({ ref: p.payment_id || p.pedido_id, pedido_id: p.pedido_id, payment_id: p.payment_id || null, desde: new Date(desde).toISOString(), teste: !!p.eh_teste || !!(reg && reg.teste), candidatos: reg ? reg.candidatos : [p.pedido_id], ms: agoraMs - desde });
  }
  for (const [pid, r] of porPagamento) {
    if (usados.has(pid)) continue;
    const desde = msDe(r.desde) ?? agoraMs;
    itens.push({ ref: pid, pedido_id: null, payment_id: pid, desde: new Date(desde).toISOString(), teste: r.teste === true, candidatos: r.candidatos || [], ms: agoraMs - desde });
  }
  for (const i of itens) { i.horas = Math.floor(Math.max(0, i.ms) / 360000) / 10; i.alerta = i.ms >= LIMITES.alertaConferirMs; delete i.ms; }
  itens.sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde));
  const avisar = itens.filter(i => i.alerta && !i.teste && !avisados.has(i.ref));
  return { itens, avisar };
}

function msDe(v) { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : t; }

// O pedido pode receber este pagamento? Mesmo produto, mesmo valor, criado ANTES da aprovação
// (sem hora da aprovação, antes de agora), ainda sem pagamento e em estado que espera pagamento.
export function pedidoCasa(pedido, pg, agoraMs) {
  if (!pedido || !pg) return false;
  if (pedido.produto !== pg.produto || Number(pedido.valor) !== pg.valor) return false;
  if (pedido.payment_id) return false;
  if (pedido.status !== 'aguardando_pagamento' && pedido.status !== 'a_conferir') return false;
  const criado = msDe(pedido.criado_em);
  if (criado === null) return false;
  const limite = pg.aprovadoEmMs !== null && pg.aprovadoEmMs !== undefined ? pg.aprovadoEmMs : agoraMs;
  return criado <= limite;
}

// Decide o que fazer com um pagamento confirmado. Entrada já buscada pela função (I/O fora daqui):
//  pg: pagamentoConfiavel(...) ou null
//  regra1: { pedido, emailConfere } quando veio pedido_id com segredo certo; senão null
//  regra2: pedidos aguardando_pagamento do mesmo produto e valor, cada um com emailConfere:
//          true (confere), false (não confere) ou null (não perguntado: passou do teto de verificações)
//  agoraMs: hora do servidor
// Saída: { acao: 'recusar'|'pago'|'teste_ok'|'a_conferir'|'sem_pedido', regra, pedido?, candidatos? }
// Regra 3 (só valor na janela de 6 h) NUNCA promove: a_conferir, sem recibo e sem produção.
export function decidirConfirmacao({ pg, regra1, regra2, agoraMs }) {
  if (!pg) return { acao: 'recusar', regra: 0 };
  const promover = (pedido, regra) => ({ acao: pg.teste || pedido.eh_teste ? 'teste_ok' : 'pago', regra, pedido });
  if (regra1 && regra1.pedido && pedidoCasa(regra1.pedido, pg, agoraMs)) {
    if (regra1.emailConfere === true) return promover(regra1.pedido, 1);
    return { acao: 'a_conferir', regra: 1, pedido: regra1.pedido, candidatos: [regra1.pedido.pedido_id] };
  }
  const lista = Array.isArray(regra2) ? regra2.filter(c => c && c.pedido && pedidoCasa(c.pedido, pg, agoraMs)) : [];
  const comEmail = lista.filter(c => c.emailConfere === true);
  if (comEmail.length === 1) return promover(comEmail[0].pedido, 2);
  if (comEmail.length > 1) return { acao: 'a_conferir', regra: 2, candidatos: comEmail.map(c => c.pedido.pedido_id) };
  // Algum candidato ficou sem pergunta e nenhum perguntado conferiu: pode ser ele. Nunca promove; vai ao suporte.
  const semPergunta = lista.filter(c => c.emailConfere === null || c.emailConfere === undefined);
  if (semPergunta.length) return { acao: 'a_conferir', regra: 2, candidatos: lista.map(c => c.pedido.pedido_id) };
  const naJanela = lista.filter(c => agoraMs - msDe(c.pedido.criado_em) <= LIMITES.janelaRegra3Ms);
  if (naJanela.length === 1) return { acao: 'a_conferir', regra: 3, pedido: naJanela[0].pedido, candidatos: [naJanela[0].pedido.pedido_id] };
  if (naJanela.length > 1) return { acao: 'a_conferir', regra: 3, candidatos: naJanela.map(c => c.pedido.pedido_id) };
  return { acao: 'sem_pedido', regra: 3, candidatos: [] };
}

/* ---------- Prazo (72 h, horário de atendimento em America/Bahia, UTC-3 o ano todo) ---------- */
// Regra dos termos v2, cláusula 5: o prazo conta da confirmação do pagamento; pagou fora do horário de atendimento,
// a confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).

const BAHIA_MS = -3 * 3600 * 1000;
const HORA = 3600 * 1000;
const HORA_CONFIRMACAO_FORA = 11;

// Segunda a sábado, 9h às 19h (America/Bahia).
export function emHorarioComercial(ms) {
  const d = new Date(ms + BAHIA_MS);
  const dia = d.getUTCDay(), h = d.getUTCHours();
  return dia !== 0 && h >= 9 && h < 19;
}

// Quando o relógio de 72 h começa: na hora da confirmação, se ela cai no horário de atendimento;
// fora dele, às 11h do próximo dia de atendimento (o instante que os termos fixam para a confirmação).
// Madrugada de segunda a sábado: 11h do mesmo dia. Depois das 19h: 11h do dia seguinte. Domingo pula para segunda.
export function inicioDoRelogio(ms) {
  if (emHorarioComercial(ms)) return ms;
  const d = new Date(ms + BAHIA_MS);
  let dia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (d.getUTCHours() >= 19 || d.getUTCDay() === 0) dia += 24 * HORA;
  if (new Date(dia).getUTCDay() === 0) dia += 24 * HORA;
  return dia + HORA_CONFIRMACAO_FORA * HORA - BAHIA_MS;
}

export function prazoFim(confirmadoMs) { return inicioDoRelogio(confirmadoMs) + LIMITES.prazoHoras * HORA; }

// Entrega prevista com a fila: até capacidade_dia pedidos à frente, vale o prazo; cada lote a mais soma 1 dia.
export function entregaPrevista(confirmadoMs, posicaoNaFila, capacidadeDia) {
  const cap = Number.isInteger(capacidadeDia) && capacidadeDia >= 1 && capacidadeDia <= 50 ? capacidadeDia : 3;
  const pos = Number.isInteger(posicaoNaFila) && posicaoNaFila >= 0 ? posicaoNaFila : 0;
  return prazoFim(confirmadoMs) + Math.floor(pos / cap) * 24 * HORA;
}

export function alertaDePrazoDevido(prazoFimMs, agoraMs) { return agoraMs >= prazoFimMs - LIMITES.alertaAntesMs; }

// Data e hora em America/Bahia para texto (ex.: 13/11/2026 às 15:00).
export function dataHoraBahia(ms) {
  const d = new Date(ms + BAHIA_MS), z = n => String(n).padStart(2, '0');
  return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}
export function dataBahia(ms) {
  const d = new Date(ms + BAHIA_MS), z = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
}

// Mesmo texto da cláusula 5 dos termos v2 e das páginas (home, FAQ, /abrir/, /obrigado/), com prazoHoras = 72.
export const TEXTO_REGRA_PRAZO = 'O prazo de 72 h conta da confirmação do pagamento. ' +
  'Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. ' +
  'Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).';

/* ---------- Contador ---------- */

// Normaliza um evento do contador. Evento fora da lista: null (descartado sem gravar).
// Conferência no ar (utm_content=conferencia): { conferencia: true } (descartado sem gravar).
export function normalizarContagem(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return null;
  if (!EVENTOS.includes(corpo.evento)) return null;
  const anuncioBruto = typeof corpo.anuncio === 'string' ? corpo.anuncio : (typeof corpo.utm_content === 'string' ? corpo.utm_content : '');
  if (anuncioBruto === 'conferencia' || corpo.utm_content === 'conferencia') return { conferencia: true };
  return {
    conferencia: false,
    evento: corpo.evento,
    nicho: NICHOS.includes(corpo.nicho) ? corpo.nicho : 'outro',
    praca: PRACAS_CONTADOR.includes(corpo.praca) ? corpo.praca : 'outro',
    anuncio: ANUNCIOS.includes(anuncioBruto) ? anuncioBruto : 'outro'
  };
}

/* ---------- Estados do executor ---------- */

export const TRANSICOES = Object.freeze({
  aguardando_pagamento: ['recusado', 'desistiu'],
  a_conferir: ['pago', 'recusado', 'aguardando_pagamento', 'desistiu'],
  pago: ['em_revisao', 'em_producao', 'desistiu'],
  em_revisao: ['em_producao', 'desistiu'],
  em_producao: ['rascunho_enviado', 'em_revisao', 'desistiu'],
  // rascunho_enviado -> no_ar é o aceite tácito: só com aceiteTacitoPermitido (7 dias sem resposta) e cláusula nos termos.
  rascunho_enviado: ['em_producao', 'desistiu', 'no_ar'],
  aprovado: ['no_ar', 'em_producao', 'desistiu'],
  no_ar: ['desistiu'],
  recusado: [],
  desistiu: [],
  teste_ok: []
});

export function transicaoPermitida(de, para) { return Object.prototype.hasOwnProperty.call(TRANSICOES, de) && TRANSICOES[de].includes(para); }

// Aceite tácito: rascunho enviado há 7 dias ou mais, sem aprovação. A hora do envio é rascunho_em
// (gravarRascunho grava); sem ela, deduz de aprovacao_expira_em (envio + 14 dias).
export function aceiteTacitoPermitido(pedido, agoraMs) {
  if (!pedido || pedido.status !== 'rascunho_enviado' || pedido.aprovado_em) return false;
  let enviado = msDe(pedido.rascunho_em);
  if (enviado === null) {
    const expira = msDe(pedido.aprovacao_expira_em);
    if (expira === null) return false;
    enviado = expira - LIMITES.aprovacaoValidadeMs;
  }
  return agoraMs - enviado >= LIMITES.aceiteTacitoMs;
}

// Campos que o executor (docs/EXECUTOR.md) grava no pedido, além dos do servidor. Todos opcionais.
export const CAMPOS_EXECUTOR = Object.freeze({
  motivo_revisao: 'texto', rascunho_em: 'data', no_ar_em: 'data', aprovacao_tacita_em: 'data',
  garantia_mes_gratis: 'booleano', desistiu_em: 'data', estorno_prazo_em: 'data', estorno_feito_em: 'data',
  mensalidade_link_em: 'data', lembrete_d3_em: 'data', lembrete_d7_em: 'data', assinatura_confirmada_em: 'data'
});

// Valida campos do executor para marcarPedido. Devolve { ok, dados } ou { ok: false, campo }.
export function validarCamposExecutor(campos) {
  const dados = {};
  for (const [k, v] of Object.entries(campos || {})) {
    const tipo = CAMPOS_EXECUTOR[k];
    if (!tipo) return { ok: false, campo: k };
    if (v === null) { dados[k] = null; continue; }
    if (tipo === 'data' && !(typeof v === 'string' && v.length <= 40 && msDe(v) !== null)) return { ok: false, campo: k };
    if (tipo === 'booleano' && typeof v !== 'boolean') return { ok: false, campo: k };
    if (tipo === 'texto' && !(typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v))) return { ok: false, campo: k };
    dados[k] = v;
  }
  return { ok: true, dados };
}

/* ---------- Do registro do servidor para o PEDIDO v1 do produzir.mjs (pacote 1C) ---------- */

// p: linha de PedidoPortaAberta (como listarPedidosPagos devolve). origemSite: endereço do site, sem barra no fim.
// Devolve { entrada, faltam }. entrada segue schema/pedido.schema.json $defs/PedidoEntrada; faltam lista os campos
// que o comprador não informou no registro (responsavel, endereco, horarios, plano) e que o produzir exige.
// Nada é inventado: campo ausente fica fora de entrada e entra em faltam.
export function entradaDoRegistro(p, origemSite) {
  const faltam = [];
  if (!p || typeof p !== 'object') return { entrada: null, faltam: ['pedido'] };
  const utm = [['utm_source', p.utm_source], ['utm_campaign', p.utm_campaign], ['utm_content', p.utm_content]]
    .filter(([, v]) => typeof v === 'string' && RE.utm.test(v)).map(([k, v]) => k + '=' + v);
  const base = typeof origemSite === 'string' && /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(origemSite) ? origemSite : ORIGEM;
  const entrada = {
    formato: 'PEDIDO v1',
    id: p.pedido_id,
    nicho: p.nicho,
    negocio: p.negocio,
    cidade: p.cidade,
    whatsapp_negocio: p.whatsapp,
    email: p.email,
    origem: utm.length ? utm.join(';') : 'direto',
    previa: base + '/previa/#k=' + encodeURIComponent(p.nicho || '') + '&n=' + encodeURIComponent(p.negocio || '') +
      (p.cidade ? '&c=' + encodeURIComponent(p.cidade) : '') + '&p=1',
    aceite_termos: (p.aceite_em || '') + ' ' + (p.termos_versao || '')
  };
  for (const k of ['plano', 'responsavel', 'endereco', 'horarios']) {
    if (typeof p[k] === 'string' && p[k].length) entrada[k] = p[k];
    else faltam.push(k);
  }
  return { entrada, faltam };
}

/* ---------- Comparação e hash ---------- */

export function iguaisTempoConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const n = Math.max(a.length, b.length);
  let dif = a.length ^ b.length;
  // charCodeAt fora do tamanho dá NaN, e NaN | 0 é 0: o laço sempre percorre o maior tamanho.
  for (let i = 0; i < n; i++) dif |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return dif === 0;
}

export async function sha256Hex(textoEntrada) {
  const dados = new TextEncoder().encode(String(textoEntrada));
  const h = await globalThis.crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Modelos de e-mail (texto fixo, sem dado digitado pelo cliente no assunto) ---------- */

const ORIGEM = 'https://creat-nuvem-404b1994.base44.app';
const reais = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// p é o registro PedidoPortaAberta (pedido_id é o número público; o id interno do Base44 nunca aparece no texto).
// No modelo 'rascunho', p.token_rascunho (opcional, nunca gravado) vai no fragmento do link: #t=<token>.
export function modeloEmailCliente(modelo, p) {
  const num = p.pedido_id || '';
  const prod = PRODUTOS[p.produto] ? PRODUTOS[p.produto].nome : 'Abertura do site';
  if (modelo === 'recibo') {
    return {
      assunto: 'Pagamento confirmado: pedido ' + num,
      corpo: [
        'Recebemos o seu pagamento. Obrigado.', '',
        'Pedido: ' + num,
        'Produto: ' + prod,
        'Valor: ' + reais(p.valor),
        'Meio: ' + (p.meio || 'Mercado Pago'),
        'Número do pagamento: ' + (p.payment_id || '-'),
        'Prazo: até ' + (p.prazo_fim ? dataHoraBahia(Date.parse(p.prazo_fim)) : '-') + ' (horário da Bahia).', '',
        TEXTO_REGRA_PRAZO, '',
        'Acompanhe o pedido em ' + ORIGEM + '/obrigado/ neste mesmo aparelho.',
        'Termos do serviço: ' + ORIGEM + '/termos/', '',
        'Creat Nuvem'
      ].join('\n')
    };
  }
  if (modelo === 'rascunho') {
    return {
      assunto: 'Seu site está pronto para aprovar: pedido ' + num,
      corpo: [
        'O rascunho do seu site está pronto.', '',
        'Veja e aprove aqui: ' + ORIGEM + '/sites/' + p.slug_rascunho + '/' + (typeof p.token_rascunho === 'string' && RE.segredo.test(p.token_rascunho) ? '#t=' + p.token_rascunho : ''),
        'O link vale por 14 dias.', '',
        'Termos do serviço: ' + ORIGEM + '/termos/', '',
        'Creat Nuvem'
      ].join('\n')
    };
  }
  if (modelo === 'mensalidade') {
    return {
      assunto: 'Seu site está no ar: pedido ' + num,
      corpo: [
        'Seu site está no ar.', '',
        'Plano mensal escolhido: ' + (p.plano || 'a confirmar') + '.',
        'Valores e regras do plano: ' + ORIGEM + '/termos/', '',
        'Creat Nuvem'
      ].join('\n')
    };
  }
  return null;
}
