import Biblioteca from '@/componentes/Biblioteca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trilhas e efeitos' };

// Onda 4: a biblioteca de som sai do Caderno e vira tela própria.
export default function PaginaBiblioteca() {
  return (
    <main className="pagina caderno">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Som com licença</p>
          <h1 className="titulo">Trilhas e efeitos</h1>
        </div>
      </div>
      <section className="cartao" aria-labelledby="c-bib" id="biblioteca">
        <h2 className="cartao__titulo" id="c-bib">Biblioteca da casa</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Só toca no filme o que tiver licença registrada para uso em vídeo de cliente e anúncio. Cole o link do arquivo; o editor mede a duração e o andamento.</p>
        <Biblioteca />
      </section>
    </main>
  );
}
