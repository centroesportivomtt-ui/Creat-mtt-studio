/** @type {import('next').NextConfig} */
// Content-Security-Policy (revisão de segurança, 25/11): o site mostra texto escrito por modelo e por gente de fora (falas,
// clientes). O React já escapa tudo; a CSP é a segunda trava. O Next usa script inline (sem nonce), por isso 'unsafe-inline'
// em script; 'unsafe-eval' só em desenvolvimento. Vídeo, capa e envio por partes vão ao R2 por URL assinada.
const R2 = 'https://*.r2.cloudflarestorage.com';
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${R2}`,
  `media-src 'self' blob: ${R2}`,
  `connect-src 'self' ${R2}${dev ? ' ws: wss:' : ''}`,
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const seguranca = [
  { key: 'Content-Security-Policy', value: csp },
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
  async headers() {
    const doCliente = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];
    // o último bloco que casa vence a mesma chave: a página do cliente e a rota dela não vazam o token pelo Referer
    return [{ source: '/:caminho*', headers: seguranca }, { source: '/c/:token', headers: doCliente }, { source: '/api/cliente/:caminho*', headers: doCliente }];
  },
};
