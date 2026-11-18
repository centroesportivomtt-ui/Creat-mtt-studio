import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <main className="entrar">
      <div className="entrar__caixa">
        <p className="entrar__tc">404</p>
        <h1 className="entrar__titulo">Corte <em>perdido</em></h1>
        <p className="aviso">Esse projeto ou página não existe.</p>
        <Link className="botao botao--principal" href="/projetos">Voltar aos projetos</Link>
      </div>
    </main>
  );
}
