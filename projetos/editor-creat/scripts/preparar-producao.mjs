#!/usr/bin/env node
// Separa o .env.local (todas as chaves) em dois arquivos, cada um só com o que aquele lugar precisa:
//   .env.modal   → cole no Secret "editor-creat" da Modal (motor: Anthropic, Gemini/Vertex, R2, tokens)
//   .env.vercel  → importe nas Variáveis de ambiente do projeto na Vercel (site: só endereço do motor e login)
// O site NÃO recebe as chaves da Anthropic, do Google nem do R2: se a Vercel vazar, essas contas ficam a salvo.
// Gera sozinho o que é nosso (MOTOR_TOKEN, segredo da sessão e o hash da senha do site).
//
// uso:  node scripts/preparar-producao.mjs caminho/do/.env.local "senha do site" [https://editor-creat-motor.modal.run]
// Os dois arquivos saem ao lado do .env.local, com nomes que o .gitignore já bloqueia. Nada vai para o git.
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [arquivo, senha = '', motorUrl = ''] = process.argv.slice(2);
if (!arquivo || !existsSync(arquivo)) {
  console.error('uso: node scripts/preparar-producao.mjs .env.local "senha do site" [url do motor na Modal]');
  process.exit(2);
}
if (senha.length < 10) {
  console.error('A senha do site precisa de pelo menos 10 caracteres.');
  process.exit(2);
}

const env = {};
for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
  if (!m || linha.trim().startsWith('#')) continue;
  env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const primeiro = (...nomes) => nomes.map((n) => env[n]).find((v) => v && v.trim()) ?? '';

// nomes que o .env.local pode ter usado → nomes que o motor lê
const contaR2 = primeiro('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID')
  || (/https:\/\/([a-f0-9]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com/.exec(primeiro('R2_ENDPOINT', 'R2_S3_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT')) ?? [])[1] || '';
const motorToken = primeiro('MOTOR_TOKEN') || randomBytes(32).toString('base64url');

const modal = {
  EDITOR_ARMAZENAMENTO: 'r2',
  R2_ACCOUNT_ID: contaR2,
  R2_ACCESS_KEY_ID: primeiro('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: primeiro('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  R2_BUCKET: primeiro('R2_BUCKET', 'R2_BUCKET_NAME') || 'creat-editor-midia',
  ...(primeiro('R2_ENDPOINT', 'R2_S3_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT').includes('.eu.') ? { R2_ENDPOINT: primeiro('R2_ENDPOINT', 'R2_S3_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT') } : {}),
  EDITOR_CEREBRO: 'anthropic',
  ANTHROPIC_API_KEY: primeiro('ANTHROPIC_API_KEY'),
  EDITOR_VISAO: 'gemini',
  EDITOR_GEMINI_VIA: 'vertex',
  GEMINI_API_KEY: primeiro('GEMINI_API_KEY', 'VERTEX_API_KEY', 'GOOGLE_VERTEX_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY'),
  EDITOR_RENDER: 'cpu',
  EDITOR_RENDER_WORKERS: '4',
  EDITOR_THREADS: '4',
  EDITOR_ENVIO_PARTE_MB: '64',
  MOTOR_TOKEN: motorToken,
  // o teste pago (tests/test_b_pago.py) continua exigindo EDITOR_AUTORIZADO_PAGO=1 à parte; produção não precisa
};

const N = 32768, r = 8, p = 1, sal = randomBytes(16);
const k = scryptSync(senha, sal, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
const vercel = {
  MOTOR_URL: motorUrl.replace(/\/+$/, '') || 'https://COLE-AQUI-A-URL-DO-MOTOR.modal.run',
  MOTOR_TOKEN: motorToken,
  EDITOR_ARMAZENAMENTO: 'r2',
  EDITOR_ENVIO_PARTE_MB: '64',
  EDITOR_SENHA_HASH: ['scrypt', N, r, p, sal.toString('base64'), k.toString('base64')].join(':'),
  EDITOR_SEGREDO_SESSAO: primeiro('EDITOR_SEGREDO_SESSAO') || randomBytes(32).toString('base64url'),
};

const escrever = (nome, obj, titulo) => {
  const destino = path.join(path.dirname(path.resolve(arquivo)), nome);
  const corpo = [`# ${titulo} · gerado por scripts/preparar-producao.mjs · NÃO vai para o git`,
    ...Object.entries(obj).map(([a, b]) => `${a}=${b}`), ''].join('\n');
  writeFileSync(destino, corpo, { mode: 0o600 });
  return destino;
};
const faltando = Object.entries(modal).filter(([, v]) => !v).map(([n]) => n);
const fm = escrever('.env.modal', modal, 'Modal > Secrets > editor-creat');
const fv = escrever('.env.vercel', vercel, 'Vercel > Settings > Environment Variables');
console.log(`ok: ${fm}`);
console.log(`ok: ${fv}`);
if (!motorUrl) console.log('falta: a URL do motor (aparece depois do primeiro deploy na Modal); rode de novo com ela.');
if (faltando.length) {
  console.log(`atenção, sem valor no .env.local: ${faltando.join(', ')}`);
  process.exitCode = 1;
}
