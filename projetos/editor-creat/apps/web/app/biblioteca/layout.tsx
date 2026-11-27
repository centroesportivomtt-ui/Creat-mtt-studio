import Topo from '@/componentes/Topo';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutBiblioteca({ children }: { children: React.ReactNode }) {
  await exigirSessao('/biblioteca');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
