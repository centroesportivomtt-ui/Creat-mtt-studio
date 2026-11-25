import { notFound } from 'next/navigation';
import Projeto from '@/componentes/Projeto';
import { motorJson } from '@/lib/motor';
import { exigirSessao, temSessao } from '@/lib/sessao';
import type { Projeto as TProjeto } from '@/lib/estados';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await temSessao())) return { title: 'Projeto' };        // sem senha, nem o nome do projeto vai no título
  const r = /^p_[a-z0-9]{4,40}$/.test(id) ? await motorJson<TProjeto>(`/v1/projetos/${id}`) : null;
  return { title: r?.ok ? r.dados.nome : 'Projeto' };
}

export default async function PaginaProjeto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirSessao(/^p_[a-z0-9]{4,40}$/.test(id) ? `/projetos/${id}` : '/projetos');
  if (!/^p_[a-z0-9]{4,40}$/.test(id)) notFound();
  const r = await motorJson<TProjeto>(`/v1/projetos/${id}`);
  if (!r.ok) {
    if (r.status === 404) notFound();
    return (
      <main className="pagina">
        <p className="erro" role="alert">Não deu para abrir o projeto: {r.erro}.</p>
      </main>
    );
  }
  const parteMB = Math.min(512, Math.max(5, Number(process.env.EDITOR_ENVIO_PARTE_MB) || 64));
  return <Projeto inicial={r.dados} parteMB={parteMB} />;
}
