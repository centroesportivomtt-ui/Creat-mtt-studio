'use client';
// Avisos (toasts) da "Mesa de corte": uma linha, no máximo 2 na tela, somem em 4 s, arrastam para o lado.
// Ficam acima da barra de comando e da navegação (o polegar não cobre). Sonner, vestido com os tokens da casa.
// Os erros de verdade continuam também na própria tela (role="alert" junto do botão): o aviso é retorno, não o único lugar.
import { Toaster, toast } from 'sonner';

export function Avisos() {
  return (
    <Toaster
      position="bottom-center"
      visibleToasts={2}
      duration={4000}
      gap={8}
      offset={{ bottom: 'var(--avisos-baixo)' }}
      mobileOffset={{ bottom: 'var(--avisos-baixo)', left: '16px', right: '16px' }}
      swipeDirections={['left', 'right']}
      containerAriaLabel="Avisos"
      toastOptions={{ className: 'aviso-toast' }}
      style={{
        // as variáveis do Sonner apontam para os tokens (claro e escuro já vêm do :root)
        ['--normal-bg' as string]: 'var(--cor-superficie)',
        ['--normal-border' as string]: 'var(--cor-linha)',
        ['--normal-text' as string]: 'var(--cor-tinta)',
        ['--success-bg' as string]: 'var(--cor-superficie)',
        ['--success-border' as string]: 'var(--cor-linha)',
        ['--success-text' as string]: 'var(--cor-tinta)',
        ['--error-bg' as string]: 'var(--cor-superficie)',
        ['--error-border' as string]: 'var(--cor-alerta)',
        ['--error-text' as string]: 'var(--cor-tinta)',
        ['--border-radius' as string]: '12px',
        ['--width' as string]: 'min(420px, calc(100vw - 32px))',
      }}
    />
  );
}

/** Retorno curto de uma ação (sucesso, informação ou erro com "Tentar de novo"). */
export const avisar = {
  ok: (texto: string) => toast.success(texto),
  info: (texto: string) => toast(texto),
  erro: (texto: string, tentar?: () => void) =>
    toast.error(texto, tentar ? { action: { label: 'Tentar de novo', onClick: tentar }, duration: 6000 } : undefined),
};
