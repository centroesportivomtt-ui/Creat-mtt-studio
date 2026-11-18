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
    return [{ source: '/:caminho*', headers: seguranca }];
  },
};
