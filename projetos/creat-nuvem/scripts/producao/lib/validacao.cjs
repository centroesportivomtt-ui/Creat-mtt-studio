/*
 * scripts/producao/lib/validacao.cjs · validação do TenantConfig v1 (schema + regras da casa)
 *
 * O schema/tenant.schema.json cobre forma e limites. Aqui ficam as regras que ele não
 * expressa (descrição do próprio schema) e as regras duras do briefing (seções 3 e 15.3):
 *  - whatsapp 55+DDD+número, nunca 5500000000000;
 *  - horários que parseiam e fecham depois de abrir;
 *  - preço número ou null;
 *  - nenhuma chave ocupacaoFicticia / demo (horário "ocupado" inventado);
 *  - avaliação sem origem (ou sem aprovadoEm) rejeitada;
 *  - textos acima do limite;
 *  - chave de textos fora da lista branca do preset;
 *  - termos proibidos: promessa de ganho, "garantido", antes e depois, prova social inventada,
 *    "agenda"/"agendamento", preço escrito em texto, link ou marcação HTML em texto, emoji;
 *  - (1C) domínio solto, entidade HTML, "@" e telefone diferente do WhatsApp do pedido em texto;
 *  - preço de procedimento de saúde (e qualquer preço em nicho de saúde);
 *  - pedido de horário sem dizer que o dono confirma pelo WhatsApp;
 *  - site entregue com texto de exemplo do preset ("exemplo", "Seu negócio").
 * Todo erro cita o campo. Sem rede.
 */
'use strict';
const { validador, REF, errosAjv, motor } = require('./comum.cjs');
const B = require('./bloqueio.cjs');

const NICHOS_SAUDE = ['saude', 'clinica', 'odontologia', 'fisioterapia', 'nutricao', 'estetica-clinica'];
const MARCADORES = ['nome', 'cidade', 'dia', 'hora', 'servico', 'profissional'];

/* mesmo desarme do portão (lib/bloqueio.cjs): NFKC, sem caractere de formato, sem acento, minúsculo */
const norm = B.norm;

/* [regex sobre texto normalizado (sem acento, minúsculo), motivo] */
const PROIBIDOS = [
  [/\bgarant(id[oa]s?|imos|e|ir|ia)\b/, 'promessa de garantia ("garantido")'],
  [/\b(lucr(o|os|e|ar|ativo)|fatur(e|ar|amento)|renda extra|enriquec\w*|ganh(e|ar|o) (mais )?dinheiro|dinheiro no bolso|retorno (financeiro|certo)|dobr\w* (o |a |seu |sua )?(faturamento|clientela|vendas|lucro)|mais clientes (todo|toda|por) )/, 'promessa de ganho financeiro'],
  [/\bantes e depois\b|\bantes\s*[x\/]\s*depois\b|\bantes & depois\b/, '"antes e depois"'],
  [/\b(\d+([.,]\d)? estrelas?|nota (\d|maxima|10)|avaliad[oa]s? (com|em)|clientes satisfeitos|mais de \d+ (clientes|atendimentos|cortes)|\d+ anos de (experiencia|mercado|tradicao)|desde (19|20)\d\d|premiad[oa]s?|o melhor (da|do|de) (cidade|bairro|regiao|brasil)|numero 1 (da|do)|eleit[oa] (a|o) melhor)/, 'prova social ou fato não informado no pedido (nota, anos, prêmio, "o melhor")'],
  [/\bagenda\b|\bagendamento\b/, 'a palavra "agenda"/"agendamento" (use "pedido de horário")'],
  [/r\$\s*\d|\d+\s*reais\b/, 'preço escrito em texto (preço só em servicos[].preco)'],
  [/https?:|www\.|<|>|javascript:/, 'link ou marcação HTML dentro de texto'],
  [/\b(sua|seu) (barbearia|salao|academia|negocio|studio) (esta|anda) (fechad|vazi|parad|morr)/, 'afirma estado negativo do leitor']
];
const PROCEDIMENTO_SAUDE = /\b(toxina botulinica|botox (facial|na testa|no rosto)|preenchimento (labial|facial|com acido)|acido hialuronico|harmonizacao (facial|orofacial)|bioestimulador\w*|peeling (quimico|de fenol)|microagulhamento|depilacao a laser|laser (facial|co2)|lipo\w*|criolipolise|fios? de pdo|fios de sustentacao|skinbooster|intradermoterapia|mesoterapia|carboxiterapia|fisioterapia|consulta (medica|nutricional)|nutricionista|odontolog\w*|clareamento dental)\b/;
const EMOJI = /\p{Extended_Pictographic}/u;

/* todos os textos livres do tenant, com o caminho do campo */
function textosDoTenant(t) {
  const out = [];
  const add = (campo, v) => { if (typeof v === 'string') out.push([campo, v]); };
  const n = t.negocio || {};
  add('negocio.nome', n.nome); add('negocio.nomeCurto', n.nomeCurto); add('negocio.bordao', n.bordao);
  add('pagina.titulo', t.pagina && t.pagina.titulo); add('pagina.descricao', t.pagina && t.pagina.descricao);
  (t.servicos || []).forEach((s, i) => { add(`servicos[${i}].nome`, s && s.nome); add(`servicos[${i}].descricao`, s && s.descricao); });
  (t.profissionais || []).forEach((p, i) => { add(`profissionais[${i}].especialidade`, p && p.especialidade); add(`profissionais[${i}].bio`, p && p.bio); });
  const tx = t.textos || {};
  for (const k of Object.keys(tx)) {
    if (k === 'faq' && Array.isArray(tx.faq)) tx.faq.forEach((f, i) => { add(`textos.faq[${i}].pergunta`, f && f.pergunta); add(`textos.faq[${i}].resposta`, f && f.resposta); });
    else add(`textos.${k}`, tx[k]);
  }
  add('agendamento.mensagem', t.agendamento && t.agendamento.mensagem);
  return out;
}

/* procura chaves proibidas em qualquer profundidade */
function chavesProibidas(o, caminho, out) {
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) {
    const c = caminho ? (Array.isArray(o) ? `${caminho}[${k}]` : `${caminho}.${k}`) : k;
    if (k === 'ocupacaoFicticia') out.push({ campo: c, mensagem: 'proibido: horário "ocupado" inventado não entra no motor (regra dura 1)' });
    else if (k === 'demo' && !caminho) out.push({ campo: c, mensagem: 'bloco demo proibido no tenant (dado de demonstração não entra no motor)' });
    chavesProibidas(o[k], c, out);
  }
  return out;
}

/* domínio solto ("loja.com.br", "x.app"): o regex de PROIBIDOS só pega http e www */
const DOMINIO = /\b[a-z0-9-]{2,}\.(com|net|org|br|io|app|me|site|online|store|shop|link|ly|co|info|biz|xyz|top|club|page|dev)\b/;

/*
 * Telefone em texto: qualquer sequência de 8 ou mais dígitos (com espaço, ponto, hífen, parênteses
 * ou +). CEP (00000-000) não conta. Devolve o número achado se não for o WhatsApp do pedido
 * (com ou sem 55, com ou sem DDD); null se não há telefone alheio.
 */
function telefoneAlheio(txt, whats) {
  const w = String(whats || '');
  const aceitos = w ? [w, w.slice(2), w.slice(4)] : [];
  const semCep = String(txt).replace(/\b\d{5}-\d{3}\b/g, ' ');
  for (const m of semCep.matchAll(/\+?\(?\d[\d\s().-]{6,}\d/g)) {
    const dig = m[0].replace(/\D/g, '');
    if (dig.length < 8) continue;
    if (!aceitos.includes(dig)) return m[0].trim();
  }
  return null;
}

function hmMin(h) { const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(h)); return m ? +m[1] * 60 + +m[2] : null; }

/*
 * validarTenant(tenant, { preset }) -> { ok, erros:[{campo, mensagem}] }
 * preset = objeto de motor/nichos/<nicho>.js (para a lista branca); sem preset, a lista é a do schema.
 */
function validarTenant(t, opc) {
  opc = opc || {};
  const erros = [];
  const e = (campo, mensagem) => erros.push({ campo, mensagem });
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { ok: false, erros: [{ campo: '(raiz)', mensagem: 'tenant precisa ser um objeto JSON' }] };

  // 1. regras duras com mensagem própria (antes do schema, para a mensagem certa aparecer primeiro)
  erros.push(...chavesProibidas(t, '', []));
  const neg = t.negocio || {};
  if ('whatsapp' in neg) {
    const w = String(neg.whatsapp);
    if (w === '5500000000000' || /^5500/.test(w)) e('negocio.whatsapp', `número de mentira (${w}) é proibido; use o WhatsApp real do negócio`);
    else if (!/^55\d{2}\d{8,9}$/.test(w)) e('negocio.whatsapp', 'só dígitos: 55 + DDD + 8 ou 9 números');
  }
  (Array.isArray(t.avaliacoes) ? t.avaliacoes : []).forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    if (!['dono', 'cliente_autorizado'].includes(a.origem)) e(`avaliacoes[${i}].origem`, 'avaliação sem origem (dono ou cliente_autorizado) é rejeitada: depoimento inventado é proibido');
    if (!a.aprovadoEm) e(`avaliacoes[${i}].aprovadoEm`, 'avaliação sem data de aprovação é rejeitada');
  });
  (Array.isArray(t.servicos) ? t.servicos : []).forEach((s, i) => {
    if (s && 'preco' in s && s.preco !== null && (typeof s.preco !== 'number' || !isFinite(s.preco))) e(`servicos[${i}].preco`, `preço precisa ser número ou null (sob consulta); veio ${JSON.stringify(s.preco)}`);
  });
  const sem = t.funcionamento && t.funcionamento.semana;
  if (sem && typeof sem === 'object') {
    for (let d = 0; d < 7; d++) {
      const h = sem[d];
      if (h === null || h === undefined) continue;
      const a = hmMin(h.abre), f = hmMin(h.fecha);
      if (a === null) e(`funcionamento.semana.${d}.abre`, `horário que não parseia (${JSON.stringify(h.abre)}); use HH:MM`);
      if (f === null) e(`funcionamento.semana.${d}.fecha`, `horário que não parseia (${JSON.stringify(h.fecha)}); use HH:MM`);
      if (a !== null && f !== null && f <= a) e(`funcionamento.semana.${d}`, `fecha (${h.fecha}) precisa ser depois de abre (${h.abre})`);
    }
    if (Object.keys(sem).length === 7 && [0, 1, 2, 3, 4, 5, 6].every((d) => sem[d] === null)) e('funcionamento.semana', 'os 7 dias estão fechados');
  }

  // 2. schema
  const v = validador(REF.tenant);
  if (!v(t)) {
    for (const x of errosAjv(v.errors)) {
      if (erros.some((y) => y.campo === x.campo || x.campo.startsWith(y.campo + '.'))) continue;
      if (/ocupacaoFicticia|^demo$/.test(x.campo)) continue;
      erros.push(x);
    }
  }

  // 3. lista branca do preset
  const preset = opc.preset || null;
  if (preset && t.textos && typeof t.textos === 'object') {
    const ok = new Set(preset.textosPermitidos || []);
    for (const k of Object.keys(t.textos)) if (!ok.has(k)) e(`textos.${k}`, `fora da lista branca do preset ${preset.id} (textosPermitidos)`);
  }
  if (preset && t.nicho && preset.id !== t.nicho) e('nicho', `o tenant é ${t.nicho} e o preset é ${preset.id}`);

  // 4. termos proibidos, emoji e marcadores
  const entregue = !!(t.meta && t.meta.previa === false);
  for (const [campo, txt] of textosDoTenant(t)) {
    const n = norm(txt);
    for (const [re, motivo] of PROIBIDOS) if (re.test(n)) { e(campo, `termo proibido: ${motivo}`); break; }
    // pacote 1C: nada de contato ou código escondido em texto (a página só fala pelo WhatsApp do pedido)
    if (DOMINIO.test(n)) e(campo, 'endereço de site dentro de texto (link só por código, nunca em texto)');
    if (/&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/.test(n)) e(campo, 'entidade HTML dentro de texto');
    if (B.limpar(txt).includes('@')) e(campo, '"@" dentro de texto (e-mail ou perfil não entram em texto)');
    const tel = telefoneAlheio(B.limpar(txt), neg.whatsapp);
    if (tel) e(campo, `telefone diferente do WhatsApp do pedido dentro de texto (${tel})`);
    if (EMOJI.test(txt)) e(campo, 'emoji não é aceito');
    const marc = String(txt).match(/\{(\w+)\}/g) || [];
    for (const m of marc) if (!MARCADORES.includes(m.slice(1, -1))) e(campo, `marcador desconhecido ${m} (aceitos: ${MARCADORES.map((x) => `{${x}}`).join(' ')})`);
    if (entregue && /\b(precos?|textos?|servicos?|nomes?|horarios?|dados?) de exemplo\b|\(exemplo\)/.test(n)) e(campo, 'texto de exemplo do preset num site entregue (troque pelo texto do negócio)');
  }
  if (entregue && /^seu negocio$/.test(norm(neg.nome || ''))) e('negocio.nome', 'nome de exemplo ("Seu negócio") num site entregue');

  // 5. saúde: nenhum preço de procedimento
  const saude = NICHOS_SAUDE.includes(String(t.nicho));
  (Array.isArray(t.servicos) ? t.servicos : []).forEach((s, i) => {
    if (!s || typeof s.preco !== 'number') return;
    if (saude) e(`servicos[${i}].preco`, 'nicho de saúde não publica preço de procedimento (use null)');
    else if (PROCEDIMENTO_SAUDE.test(norm(`${s.nome || ''} ${s.descricao || ''}`))) e(`servicos[${i}].preco`, `"${s.nome}" parece procedimento de saúde: não publique preço (use null) ou tire o serviço do site`);
  });
  if (!saude) (Array.isArray(t.servicos) ? t.servicos : []).forEach((s, i) => {
    if (s && PROCEDIMENTO_SAUDE.test(norm(`${s.nome || ''}`)) && t.nicho === 'salao') e(`servicos[${i}].nome`, 'procedimento de saúde fica fora do preset de salão (briefing 7.3)');
  });

  // 6. pedido de horário nunca promete confirmação
  const ag = t.agendamento || {};
  if (ag.modo !== 'link_externo' && t.textos) {
    const padrao = motor().TEXTOS_PADRAO || {};   // o motor usa o texto padrão quando a chave falta
    const nota = ['pedidoNota', 'confirmacaoTexto'].map((k) => t.textos[k] || padrao[k]).filter(Boolean).map(norm).join(' ');
    if (!/confirma\w* pelo whatsapp/.test(nota)) e('textos.pedidoNota', 'precisa dizer que o dono confirma pelo WhatsApp (pedidoNota ou confirmacaoTexto)');
    if (/\b(horario|vaga) (esta )?(confirmad|reservad)/.test(nota) && !/depois/.test(nota)) e('textos.confirmacaoTexto', 'não pode afirmar horário confirmado antes do dono responder');
  }

  return { ok: erros.length === 0, erros };
}

module.exports = { validarTenant, textosDoTenant, telefoneAlheio, PROIBIDOS, PROCEDIMENTO_SAUDE, NICHOS_SAUDE, norm };
