import Topo from '@/componentes/Topo';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  await exigirSessao('/sistema');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
