import Topo from '@/componentes/Topo';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutCaderno({ children }: { children: React.ReactNode }) {
  await exigirSessao('/caderno');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
