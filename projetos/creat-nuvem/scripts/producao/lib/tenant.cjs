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

function tenantDoPedido(pedido, preset, opc) {
  opc = opc || {};
  const M = motor();
  const f = fragmentoPrevia(pedido.previa);
  const t = M.montarTenantPrevia(preset, {
    nome: pedido.negocio, cidade: pedido.cidade, paleta: f.p, previa: false,
    agora: opc.agora || new Date(), slug: opc.slug
  });
  t.negocio.whatsapp = pedido.whatsapp_negocio;
  t.negocio.telefoneExibicao = M._puro.mascararWhats(pedido.whatsapp_negocio.slice(2));
  t.negocio.endereco = partesEndereco(pedido.endereco, pedido.cidade);
  t.funcionamento.semana = semanaDosHorarios(pedido.horarios);
  t.servicos = t.servicos.map((s) => Object.assign({}, s, { preco: null }));
  t.profissionais = [];
  t.avaliacoes = [];
  if (t.textos && (preset.textosPermitidos || []).includes('servicosNota')) t.textos.servicosNota = NOTA_SEM_PRECO;
  return t;
}

module.exports = { tenantDoPedido, NOTA_SEM_PRECO };
