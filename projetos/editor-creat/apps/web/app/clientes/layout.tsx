import Topo from '@/componentes/Topo';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutClientes({ children }: { children: React.ReactNode }) {
  await exigirSessao('/clientes');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
