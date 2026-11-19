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
