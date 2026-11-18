import NovoProjeto from '@/componentes/NovoProjeto';

export const metadata = { title: 'Novo projeto' };

export default function Novo() {
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
