import { redirect } from 'next/navigation';
import Topo from '@/componentes/Topo';
import { temSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function LayoutCaderno({ children }: { children: React.ReactNode }) {
  if (!(await temSessao())) redirect('/entrar');
  return (
    <>
      <Topo />
      {children}
    </>
  );
}
