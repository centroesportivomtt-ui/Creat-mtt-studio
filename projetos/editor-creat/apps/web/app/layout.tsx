import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'creat.PULO', template: '%s · creat.PULO' },
  description: 'O editor da creat.MTT. Sobe o material, fala o pedido, recebe o filme com pulo do gato em até 30 minutos.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icone.svg', apple: '/icone-192.png' },
  appleWebApp: { capable: true, title: 'PULO', statusBarStyle: 'black-translucent' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#131315' },
    { media: '(prefers-color-scheme: light)', color: '#ecebe7' },
  ],
};

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
