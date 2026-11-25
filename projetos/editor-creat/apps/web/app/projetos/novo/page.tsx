import NovoProjeto from '@/componentes/NovoProjeto';
import { exigirSessao } from '@/lib/sessao';

export const metadata = { title: 'Novo projeto' };

export const dynamic = 'force-dynamic';

export default async function Novo() {
  await exigirSessao('/projetos/novo');
  return (
    <main className="pagina">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Passo 1 de 3</p>
          <h1 className="titulo">Novo projeto</h1>
        </div>
      </div>
      <NovoProjeto />
    </main>
  );
}
