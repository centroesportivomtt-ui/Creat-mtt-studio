/*
 * scripts/producao/lib/tenant.cjs · PEDIDO v1 validado + preset do nicho -> TenantConfig v1 parcial
 *
 * Reaproveita CreatMotor.montarTenantPrevia (motor/v1/motor.js) e o preset de motor/nichos/
 * sem copiar dado nenhum. Só entra o que o pedido traz; o resto vem do preset.
 * Decisão (sem inventar nada): o PEDIDO v1 não traz preços, então todo preço vira null
 * ("sob consulta") e servicosNota diz isso; os preços do preset são só de exemplo da prévia.
 */
'use strict';
const { motor } = require('./comum.cjs');
const { semanaDosHorarios, partesEndereco, fragmentoPrevia } = require('./pedido.cjs');

const NOTA_SEM_PRECO = 'Valores sob consulta: pergunte no WhatsApp da casa antes de pedir o horário.';
const NOTA_COM_PRECO = 'Valores informados pela casa. Confira no WhatsApp ao pedir o horário.';
const NICHOS_SAUDE = ['saude', 'clinica', 'odontologia', 'fisioterapia', 'nutricao', 'estetica-clinica'];

/*
 * opc.servicos (pacote 1C): saída de lib/servicos.cjs (servicos_texto do cliente, já por regra).
 * Quando vem, substitui os serviços do preset: nome e preço do cliente, duração do cliente ou 30 min,
 * descrição vazia (o redator escreve). Nicho de saúde nunca publica preço.
 */
function servicosDoCliente(lista, nicho) {
  return lista.map((s) => ({ id: s.id, nome: s.nome, preco: NICHOS_SAUDE.includes(nicho) ? null : s.preco, duracaoMin: s.duracaoMin || 30, descricao: '' }));
}

/*
 * Slug reservado (achado da conferência, 10/11/2026): o .gitignore versiona as pastas sites/demo-(nome) e o repositório
 * é público. Um cliente real chamado "Demo Studio" geraria sites/demo-studio-<cidade>/pedido.json com
 * e-mail, WhatsApp e endereço numa pasta que o git não ignora. Por isso, fora de --demonstracao, todo
 * slug que começa com demo-, teste- ou ensaio- (vindo do nome ou de --slug) ganha o prefixo "cliente-".
 */
const RE_SLUG_RESERVADO = /^(demo|teste|ensaio)(-|$)/;
function slugSeguro(slug, demonstracao) {
  const s = String(slug || '');
  if (demonstracao || !RE_SLUG_RESERVADO.test(s)) return s;
  return ('cliente-' + s).slice(0, 40).replace(/-+$/, '');
}

function tenantDoPedido(pedido, preset, opc) {
  opc = opc || {};
  const M = motor();
  const f = fragmentoPrevia(pedido.previa);
  const t = M.montarTenantPrevia(preset, {
    nome: pedido.negocio, cidade: pedido.cidade, paleta: f.p, previa: false,
    agora: opc.agora || new Date(), slug: opc.slug
  });
  t.slug = slugSeguro(t.slug, opc.demonstracao);
  t.negocio.whatsapp = pedido.whatsapp_negocio;
  t.negocio.telefoneExibicao = M._puro.mascararWhats(pedido.whatsapp_negocio.slice(2));
  t.negocio.endereco = partesEndereco(pedido.endereco, pedido.cidade);
  t.funcionamento.semana = semanaDosHorarios(pedido.horarios);
  t.servicos = Array.isArray(opc.servicos) && opc.servicos.length ? servicosDoCliente(opc.servicos, pedido.nicho) : t.servicos.map((s) => Object.assign({}, s, { preco: null }));
  t.profissionais = [];
  t.avaliacoes = [];
  const todosComPreco = t.servicos.every((s) => typeof s.preco === 'number');
  if (t.textos && (preset.textosPermitidos || []).includes('servicosNota')) t.textos.servicosNota = todosComPreco ? NOTA_COM_PRECO : NOTA_SEM_PRECO;
  return t;
}

module.exports = { tenantDoPedido, slugSeguro, RE_SLUG_RESERVADO, NOTA_SEM_PRECO, NOTA_COM_PRECO };
