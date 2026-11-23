import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const seguranca = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
];

export default {
  // SSE e vídeo passam pelo proxy: compressão do Next seguraria o fluxo (e vídeo não comprime).
  compress: false,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  // apps/web é instalado isolado (pnpm-workspace.yaml próprio): o rastreio de arquivos da Vercel parte daqui, não da
  // raiz do monorepo (evita aviso de "vários lockfiles" e função levando node_modules de outras frentes).
  outputFileTracingRoot: AQUI,
  // SDK da AWS (R2) e tus ficam fora do bundle: carregados do node_modules na função (menos build, sem quebrar
  // os módulos dinâmicos do SDK). Nada aqui grava em disco no build.
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@tus/server', '@tus/file-store'],
  async headers() {
    return [{ source: '/:caminho*', headers: seguranca }];
  },
};
