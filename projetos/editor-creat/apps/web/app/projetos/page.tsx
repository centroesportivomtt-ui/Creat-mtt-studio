import Link from 'next/link';
import { motorJson } from '@/lib/motor';
import { exigirSessao } from '@/lib/sessao';
import { CircleAlert, CircleCheck, Clock, Hand } from 'lucide-react';
import { monograma, quando, rotuloTipo, seloDoProjeto, type ResumoProjeto, type Selo } from '@/lib/estados';

const ICONE_SELO: Record<Selo['tipo'], React.ReactNode> = {
  espera: <Hand size={16} strokeWidth={2} aria-hidden="true" />,
  editando: <span className="ponto-vivo" aria-hidden="true" />,
  pronto: <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />,
  problema: <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />,
  aberto: <Clock size={16} strokeWidth={2} aria-hidden="true" />,
};

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projetos' };

export default async function Projetos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao('/projetos');
  const busca = await searchParams;
  const apagado = busca.apagado === '1';   // onda 3: volta do "Apagar para sempre"
  const r = await motorJson<ResumoProjeto[]>('/v1/projetos?limite=100');
  // resumo útil no topo (no lugar do "Ilha de edição" que não informava nada)
  const lista = r.ok ? r.dados : [];
  const esperando = lista.filter((p) => ['espera', 'problema'].includes(seloDoProjeto(p).tipo)).length;
  const editando = lista.filter((p) => seloDoProjeto(p).tipo === 'editando').length;
  const prontos = lista.filter((p) => seloDoProjeto(p).tipo === 'pronto').length;
  const resumo = [esperando && `${esperando} esperando você`, editando && `${editando} editando`, prontos && `${prontos} pronto${prontos > 1 ? 's' : ''} para ver`]
    .filter(Boolean).join(' · ') || (lista.length ? 'Tudo em dia' : 'Mesa vazia');
  return (
    <main className="pagina">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo" data-teste="projetos-resumo">{resumo}</p>
          <h1 className="titulo">Projetos</h1>
        </div>
        <Link className="botao botao--principal" href="/projetos/novo">Novo projeto</Link>
      </div>
      {apagado && (
        <p className="aviso-apagado" role="status" data-teste="projeto-apagado">Projeto apagado. Os arquivos somem do servidor em alguns minutos.</p>
      )}
      {!r.ok ? (
        <p className="erro" role="alert">Não deu para falar com o motor: {r.erro}.</p>
      ) : r.dados.length === 0 ? (
        <div className="vazio" data-teste="lista-vazia">
          <svg className="vazio__claquete" viewBox="0 0 96 80" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true">
            <rect x="10" y="32" width="76" height="40" rx="4" />
            <path d="M10 32 82 14l3 12-75 6Z" /><path d="m26 28 8-13M46 23l8-13M66 18l8-13" />
            <path d="M10 46h76" />
          </svg>
          <p className="vazio__titulo">Nenhum filme na mesa ainda.</p>
          <Link className="botao botao--principal" href="/projetos/novo">Começar o primeiro</Link>
          <ol className="vazio__passos">
            <li><b>1</b> sobe o bruto</li><li><b>2</b> diz o que quer</li><li><b>3</b> recebe em ~30 min</li>
          </ol>
        </div>
      ) : (
        <ul className="lista">
          {r.dados.map((p) => {
            const selo = seloDoProjeto(p);
            return (
            <li key={p.id}>
              <Link className="item-projeto" href={`/projetos/${p.id}`} data-selo={selo.tipo}>
                <span className="item-projeto__capa" aria-hidden="true">{monograma(p.nome)}</span>
                <span className="item-projeto__nome">{p.nome}</span>
                <span className="item-projeto__meta">
                  {rotuloTipo(p.tipo_video)} · {p.arquivos} vídeo{p.arquivos === 1 ? '' : 's'} · {quando(p.atualizado)}
                </span>
                <span className="selo-projeto" data-tipo={selo.tipo} data-teste={selo.tipo === 'espera' ? 'selo-espera' : 'selo-projeto'}>
                  {ICONE_SELO[selo.tipo]}{selo.texto}
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
