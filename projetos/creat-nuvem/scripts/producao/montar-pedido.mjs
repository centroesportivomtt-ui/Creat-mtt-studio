#!/usr/bin/env node
/*
 * scripts/producao/montar-pedido.mjs · a linha do leitor-pedido vira o PEDIDO v1 do produzir.mjs · Trilho · executor
 *
 * Uso (EXECUTOR.md, passo (e), item 1; de dentro de projetos/creat-nuvem):
 *   node scripts/producao/montar-pedido.mjs <pedido_id esperado> <$TMP/linha-<id>.json> <pedidos/<id>.json> > $TMP/log-montar-<id>.txt 2>&1; echo $?
 *
 * A linha vem do subagente leitor-pedido e traz texto do cliente. Este script é o único que a abre fora do
 * leitor e do produzir.mjs, e nunca imprime nada dela. Esquema fechado:
 *   - objeto JSON (não lista), até 64 KB;
 *   - só chaves de CAMPOS_TEXTO (EXECUTOR.md, seção 4); chave a mais = linha fora do esquema;
 *   - pedido_id igual ao id esperado (o primeiro argumento);
 *   - cada valor é texto (até 2000 caracteres; servicos_texto até 4000, o limite do 1A) ou null (= não informado).
 * Saída, uma linha só, sem texto do cliente:
 *   ok                  código 0, pedidos/<id>.json gravado
 *   faltam: <campos>    código 6, só os nomes dos campos que o comprador não informou (motivo faltam_dados)
 *   faltam: entrada     código 7, linha ilegível, fora do esquema ou de outro pedido (motivo leitor_falhou)
 * Qualquer erro, de qualquer tipo, cai em "faltam: entrada" com código 7: nenhuma mensagem de erro do Node
 * (que citaria o começo do arquivo) chega à tela.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const CAMPOS_TEXTO = ['pedido_id', 'plano', 'nicho', 'negocio', 'cidade', 'whatsapp', 'endereco', 'horarios', 'servicos_texto', 'aceite_em', 'termos_versao', 'utm_source', 'utm_campaign', 'utm_content'];
const LIMITE = { servicos_texto: 4000 };
const LIMITE_PADRAO = 2000;
const MAX_BYTES = 64 * 1024;
const RE_ID = /^PA-(?:[0-9A-HJKMNP-TV-Z]{8}|[0-9A-Z]{10})$/;
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* origem da prévia: o endereço canônico da fonte única (lib/comum.cjs, ENDERECO; CREAT_HOST volta atrás) */
const C = createRequire(import.meta.url)('./lib/comum.cjs');

class Entrada extends Error {}

/* devolve a linha limpa (sem os null) ou lança Entrada */
export function conferirLinha(linha, idEsperado) {
  if (typeof idEsperado !== 'string' || !RE_ID.test(idEsperado)) throw new Entrada();
  if (!linha || typeof linha !== 'object' || Array.isArray(linha)) throw new Entrada();
  const limpa = {};
  for (const k of Object.keys(linha)) {
    if (!CAMPOS_TEXTO.includes(k)) throw new Entrada();
    const v = linha[k];
    if (v === null) continue;
    if (typeof v !== 'string' || v.length > (LIMITE[k] || LIMITE_PADRAO)) throw new Entrada();
    limpa[k] = v;
  }
  if (limpa.pedido_id !== idEsperado) throw new Entrada();
  return limpa;
}

export async function montar(idEsperado, arqLinha, arqSaida) {
  if (typeof arqLinha !== 'string' || typeof arqSaida !== 'string' || !arqLinha || !arqSaida) throw new Entrada();
  const st = fs.statSync(arqLinha);
  if (!st.isFile() || st.size > MAX_BYTES) throw new Entrada();
  const linha = conferirLinha(JSON.parse(fs.readFileSync(arqLinha, 'utf8')), idEsperado);
  const R = await import(pathToFileURL(path.join(RAIZ, 'schema', 'pedido-regras.mjs')).href);
  const { entrada, faltam } = R.entradaDoRegistro(linha, C.hostPadrao());
  if (!entrada) throw new Entrada();
  // a sessão não lê e-mail nem nome do responsável: o produzir não usa os dois no site
  entrada.email = 'sem-email@pedido.invalid';
  entrada.responsavel = 'Responsavel do pedido';
  const falta = faltam.filter((k) => k !== 'responsavel' && /^[a-z_]{1,20}$/.test(k));
  if (linha.servicos_texto) entrada.servicos_texto = linha.servicos_texto;
  if (!falta.length) {
    fs.mkdirSync(path.dirname(path.resolve(arqSaida)), { recursive: true });
    fs.writeFileSync(arqSaida, JSON.stringify(entrada, null, 1));
  }
  return falta;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const sair = (linha, codigo) => { process.stdout.write(linha + '\n'); process.exitCode = codigo; };
  const [id, arqLinha, arqSaida] = process.argv.slice(2);
  montar(id, arqLinha, arqSaida).then(
    (falta) => (falta.length ? sair('faltam: ' + falta.join(','), 6) : sair('ok', 0)),
    () => sair('faltam: entrada', 7)
  );
}
