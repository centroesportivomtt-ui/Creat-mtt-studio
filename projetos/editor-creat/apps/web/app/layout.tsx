import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Avisos } from '@/componentes/Avisos';

export const metadata: Metadata = {
  title: { default: 'Editor creat.MTT', template: '%s · Editor creat.MTT' },
  description: 'Sobe o material, escolhe o modo de edição, faz o pedido e recebe o filme pronto em até 30 minutos.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icone.svg', apple: '/icone-192.png' },
  appleWebApp: { capable: true, title: 'Editor', statusBarStyle: 'black-translucent' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111113' },
    { media: '(prefers-color-scheme: light)', color: '#f3f3f1' },
  ],
};

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Avisos />
      </body>
    </html>
  );
}
