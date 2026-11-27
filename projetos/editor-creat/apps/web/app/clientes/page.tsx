import Marcas from '@/componentes/Marcas';
import PedidosCliente from '@/componentes/PedidosCliente';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clientes e marcas' };

// Onda 4: o que era o meio do Caderno vira tela própria. A logo de cada cliente e o que os clientes responderam.
export default function Clientes() {
  return (
    <main className="pagina caderno">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Quem recebe os filmes</p>
          <h1 className="titulo">Clientes</h1>
        </div>
      </div>
      <section className="cartao" aria-labelledby="c-clientes" id="clientes">
        <h2 className="cartao__titulo" id="c-clientes">O que os clientes responderam</h2>
        <PedidosCliente />
      </section>
      <section className="cartao" aria-labelledby="c-marcas" id="marcas">
        <h2 className="cartao__titulo" id="c-marcas">Marcas</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Com a logo do cliente aqui, o fim de cada filme dele assina com ela sozinho. Mande PNG com fundo transparente, de 512 a 2048 px. Sem logo, o fecho sai com a marca da creat.MTT.</p>
        <Marcas />
      </section>
    </main>
  );
}
