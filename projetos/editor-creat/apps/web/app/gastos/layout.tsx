import Topo from '@/componentes/Topo';
import { exigirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutGastos({ children }: { children: React.ReactNode }) {
  await exigirSessao('/gastos');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
