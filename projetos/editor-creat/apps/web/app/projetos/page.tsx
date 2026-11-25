import Link from 'next/link';
import { motorJson } from '@/lib/motor';
import { classeEstado, quando, ROTULO_ESTADO, rotuloTipo, type ResumoProjeto } from '@/lib/estados';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projetos' };

export default async function Projetos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const busca = await searchParams;
  const apagado = busca.apagado === '1';   // onda 3: volta do "Apagar para sempre"
  const r = await motorJson<ResumoProjeto[]>('/v1/projetos?limite=100');
  return (
    <main className="pagina">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Ilha de edição</p>
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
        <div className="vazio">
          <p style={{ fontWeight: 700, fontSize: 18 }}>Nenhum projeto ainda.</p>
          <p className="aviso">Crie um projeto, suba o material do dia e diga o que quer. O resto é com o editor.</p>
          <Link className="botao botao--principal" href="/projetos/novo">Começar o primeiro</Link>
        </div>
      ) : (
        <ul className="lista">
          {r.dados.map((p) => (
            <li key={p.id}>
              <Link className="item-projeto" href={`/projetos/${p.id}`}>
                <span className="item-projeto__nome">{p.nome}</span>
                <span className={classeEstado(p.estado)}>{ROTULO_ESTADO[p.estado] ?? p.estado}</span>
                {p.espera && (
                  <span className="selo-espera" data-teste="selo-espera">
                    <span className="ponto-espera" aria-hidden="true" />Precisa de você{p.espera === 'confirmacao' ? ' · um toque' : ' · uma pergunta'}
                  </span>
                )}
                <span className="item-projeto__meta">
                  {rotuloTipo(p.tipo_video)} · {p.arquivos} arquivo{p.arquivos === 1 ? '' : 's'} · {quando(p.atualizado)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
