// comum.js · peças pequenas do app particular (frontend C, Pixel, 20/11/2026).
// Textos: usa a chave 'marcos.*' do textos.js quando o copywriter já escreveu; senão o texto daqui
// (lista no RELATORIO para o copywriter fechar). Nenhum console.info por chave ausente: a consulta é
// feita antes, direto no T.

import { T, t } from '../textos.js';
import { baixarArquivo } from '../util.js';
import * as banco from '../banco.js';
import { dataLocal, minutoDoDia, hhmm } from '../motor/nucleo.js';

const LOCAL = {
  titulo: 'Itaitu · Marcos',
  confirmar: 'Estou aqui: confirmar posição',
  confirmar_de_novo: 'Confirmar de novo',
  confirmando: 'Fazendo a média do GPS: {s} s. Fique parado.',
  confirmado: 'Posição confirmada: {n} leituras, precisão de {m} m.',
  precisao_ruim: 'Precisão de {m} m: acima de 30 m o pacote recusa. Vá para céu aberto e repita.',
  poucas_amostras: 'Só {n} leituras boas (o pacote pede 10). Vá para céu aberto e meça de novo.',
  precisao_agora: 'agora: precisão de {m} m · {n} leituras boas · {d} descartadas',
  distancia_antiga: 'A {m} m da posição que estava no mapa.',
  sem_gps: 'Este aparelho não deu acesso ao GPS. Libere a localização para esta página.',
  novo_ponto: 'Criar ponto novo',
  nome_obrigatorio: 'Dê um nome ao ponto.',
  salvo_local: 'Posição gravada neste celular. O mapa já mostra.',
  desfazer: 'Desfazer confirmação',
  desfeito: 'Confirmação desfeita. O ponto volta ao que estava no mapa.',
  estado_sem: 'sem coordenada',
  estado_aprox: 'posição aproximada',
  estado_media: 'confiança média',
  estado_baixa: 'confiança baixa',
  estado_alta: 'confiança alta',
  estado_local: 'confirmado em campo em {data}',
  estado_novo: 'ponto novo, criado em campo em {data}',
  nada_a_confirmar: 'Nenhum ponto pendente.',
  pacote: 'Exportar pacote de atualização',
  pacote_pronto: 'Pacote pronto: {pontos} pontos e {trilhas} trilhas.',
  pacote_vazio: 'Ainda não há nada para mandar: confirme um ponto ou grave uma trilha oficial.',
  pacote_resumo: '{pontos} pontos confirmados ou novos · {trilhas} trilhas oficiais',
  pacote_fora: '{n} itens ficaram fora por não passarem na regra do pacote:',
  vitrine: 'Vitrine',
  rodar_demo: 'Rodar demonstração',
  baixar_qr: 'Baixar QR em PNG',
  link_copiado: 'Link copiado.',
  placa_gerando: 'Montando a placa…',
  placa_pronta: 'Placa pronta: 15 x 20 cm, {px} px.',
  placa_falhou: 'Não deu para montar a placa agora. Abra uma vez com sinal para guardar a arte.',
  caderno: 'Caderno de vendas',
  caderno_vazio: 'Nenhum negócio ainda. Toque em Novo negócio.',
  negocio_obrigatorio: 'Escreva o nome do negócio.',
  kit_ok: 'Kit guardado neste celular.',
  kit_invalido: 'Este arquivo não é um kit de venda. Escolha o .json do kit (formato itaitu-kit, versão 1).',
  kit_vazio: 'Nenhum kit neste celular. Importe o .json que está no Dropbox.',
  pin_criar: 'Crie um PIN de 4 dígitos para travar a vitrine, o caderno e o kit.',
  pin_confirmar: 'Digite o PIN de novo.',
  pin_diferente: 'Os dois PIN não batem. Comece de novo.',
  pin_pedir: 'Digite o PIN de 4 dígitos.',
  pin_atual: 'Digite o PIN atual para trocar.',
  pin_errado: 'PIN errado. Tente de novo.',
  pin_espere: 'Muitas tentativas. Espere {s} s.',
  pin_formato: 'São 4 números.',
  pin_definido: 'PIN definido em {data}. Guardado só como hash (PBKDF2), nunca o número.',
  pin_nenhum: 'Sem PIN ainda. Ele é criado no primeiro uso da vitrine ou do caderno.',
  pin_sem_cripto: 'Este navegador não oferece a criptografia do aparelho (precisa de HTTPS). O PIN não funciona aqui.',
  pin_aviso: 'O PIN é proteção de uso, não cofre: impede que alguém saia da vitrine sem querer.',
  sair_vitrine: 'Toque e segure para sair da vitrine',
  url_invalida: 'Use um endereço https que termine em /.',
  url_salva: 'Endereço salvo.',
  so_aqui: 'Fica só neste celular. Nada vai para a internet.',
  gravador_ocupado: 'Já há uma gravação no painel Gravar trilha. Pare aquela primeiro.',
};

export function m(chave, vars = {}) {
  const v = T[`marcos.${chave}`];
  if (typeof v === 'string') return t(`marcos.${chave}`, vars);
  const base = LOCAL[chave] ?? chave;
  return base.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export const $ = (id) => document.getElementById(id);

export function hoje(ms = Date.now()) { return dataLocal(ms); }
export function horaDe(ms) { return hhmm(minutoDoDia(ms)); }
export function dataBR(iso) { return String(iso || '').slice(0, 10).split('-').reverse().join('/'); }

// ISO 8601 com o fuso da Bahia: 2026-11-20T17:40:00-03:00
export function isoBahia(ms = Date.now()) {
  const d = new Date(ms - 3 * 3600000).toISOString().slice(0, 19);
  return `${d}-03:00`;
}

export async function lerConfig(chave, padrao = null) {
  try { const r = await banco.obter('config', chave); return r ? r.valor ?? r : padrao; } catch (_) { return padrao; }
}
export async function gravarConfig(chave, valor) {
  await banco.gravar('config', { chave, valor });
}

// Web Share com arquivo quando o aparelho deixa; senão download.
export async function compartilharOuBaixar(blob, nome, titulo = '') {
  try {
    const arquivo = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: titulo || nome });
      return 'compartilhado';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
    console.info('[marcos] compartilhar falhou, baixando', e && e.name);
  }
  baixarArquivo(blob, nome);
  return 'baixado';
}

export function anunciar(texto) {
  const l = $('marcos-live');
  if (!l || !texto) return;
  l.textContent = '';
  setTimeout(() => { l.textContent = texto; }, 30);
}

export function avisar(texto) {
  if (window.Itaitu?.avisar) window.Itaitu.avisar(texto);
  anunciar(texto);
}

export function slugDe(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ponto';
}
