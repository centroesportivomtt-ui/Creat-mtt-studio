#!/usr/bin/env node
// Gera o EDITOR_SENHA_HASH (scrypt) e um EDITOR_SEGREDO_SESSAO novo. Uso: pnpm senha "minha senha forte"
// Cole a saída no .env.local (fora do git) ou nas variáveis do servidor. Nunca no repositório.
import { randomBytes, scryptSync } from 'node:crypto';

const senha = process.argv[2] ?? '';
if (senha.length < 10) { console.error('Use uma senha com pelo menos 10 caracteres: pnpm senha "minha senha forte"'); process.exit(2); }
const N = 32768, r = 8, p = 1, sal = randomBytes(16);
const k = scryptSync(senha, sal, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(`EDITOR_SENHA_HASH=${['scrypt', N, r, p, sal.toString('base64'), k.toString('base64')].join(':')}`);
console.log(`EDITOR_SEGREDO_SESSAO=${randomBytes(32).toString('base64url')}`);
