import Link from 'next/link';

export default function Topo() {
  return (
    <header className="topo">
      <Link className="topo__marca" href="/projetos" aria-label="Editor creat.MTT, ir para projetos">
        <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="" width={128} height={22} />
        <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="" width={128} height={22} />
        <span className="topo__editor" aria-hidden="true">Editor</span>
      </Link>
      <nav className="topo__nav" aria-label="Principal">
        <Link className="botao botao--fantasma botao--pequeno" href="/projetos">Projetos</Link>
        <Link className="botao botao--fantasma botao--pequeno" href="/caderno">Caderno</Link>
        <Link className="botao botao--fantasma botao--pequeno" href="/gastos">Gastos</Link>
        <form action="/api/sair" method="post">
          <button className="botao botao--fantasma botao--pequeno" type="submit">Sair</button>
        </form>
      </nav>
    </header>
  );
}
