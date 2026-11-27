'use client';
// Gaveta (bottom sheet) da "Mesa de corte": o Drawer do Base UI (gesto de arrastar para fechar, foco preso, Esc e toque
// fora fecham) vestido com os tokens da casa. Sobe do rodapé com a alça, vai até 85 dvh, tem o × de 44 px.
// Uso: <Gaveta aberta={a} aoMudar={setA} titulo="Pedir ajuste da V1" descricao="…">conteúdo</Gaveta>
// Sem `aoMudar` controlado por fora, use `gatilho` (o botão que abre).
import { Drawer } from '@base-ui/react/drawer';
import type { ReactElement, ReactNode, RefObject } from 'react';

type Props = {
  aberta?: boolean;
  aoMudar?: (aberta: boolean) => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  /** elemento que abre a gaveta (vira o Drawer.Trigger, sem perder classe nem data-teste) */
  gatilho?: ReactElement;
  /** data-teste do painel, para o aceite achar a gaveta aberta */
  teste?: string;
  /** mantém o conteúdo montado com a gaveta fechada (campos de formulário que precisam continuar valendo) */
  manterMontada?: boolean;
  /** depois de fechar (animação terminada): devolve o foco ou limpa estado */
  aoFechar?: () => void;
  /** campo que recebe o foco ao abrir (ex.: o texto do ajuste); sem ele, o primeiro elemento focável */
  focoInicial?: RefObject<HTMLElement | null>;
};

export default function Gaveta({ aberta, aoMudar, titulo, descricao, children, gatilho, teste, manterMontada, aoFechar, focoInicial }: Props) {
  return (
    <Drawer.Root open={aberta} onOpenChange={(a) => aoMudar?.(a)} onOpenChangeComplete={(a) => { if (!a) aoFechar?.(); }}>
      {gatilho && <Drawer.Trigger render={gatilho} />}
      <Drawer.Portal keepMounted={manterMontada}>
        <Drawer.Backdrop className="gaveta__fundo" />
        <Drawer.Viewport className="gaveta__vista">
          <Drawer.Popup className="gaveta" data-teste={teste} initialFocus={focoInicial}>
            <div className="gaveta__alca" aria-hidden="true" />
            <Drawer.Content className="gaveta__conteudo">
              <div className="gaveta__cabeca">
                <Drawer.Title className="gaveta__titulo">{titulo}</Drawer.Title>
                <Drawer.Close className="gaveta__fechar" aria-label="Fechar">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </Drawer.Close>
              </div>
              {descricao && <Drawer.Description className="gaveta__descricao">{descricao}</Drawer.Description>}
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
