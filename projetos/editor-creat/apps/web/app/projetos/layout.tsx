import Topo from '@/componentes/Topo';

export const dynamic = 'force-dynamic';

// A senha é conferida em CADA página daqui (exigirSessao), não no layout: o layout não sabe o endereço aberto e mandaria
// sempre para /projetos depois da senha. Página nova embaixo de /projetos chama exigirSessao com o próprio caminho.
export default async function LayoutProjetos({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
