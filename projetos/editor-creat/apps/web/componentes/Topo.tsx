'use client';
// Topo de 56 px (marca e saúde: o topo só informa) + navegação no polegar: Projetos · Novo · Caderno · Mais.
// No celular a navegação é uma barra fixa embaixo; no desktop a mesma navegação fica no topo, à direita (CSS).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ChaveConversa from './conversa/ChaveConversa';
import Gaveta from './Gaveta';
import { limparAparelho } from '@/lib/pendentes';
import { chave, EVENTO_CONVERSA, type EstadoChave } from '@/lib/conversa';

const Icone = {
  projetos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 4l2 5M14 4l2 5" />
    </svg>
  ),
  novo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  caderno: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6" />
    </svg>
  ),
  mais: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
    </svg>
  ),
  gastos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.5a6 6 0 0 1 3 5.5" />
    </svg>
  ),
  biblioteca: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />
    </svg>
  ),
  sistema: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" />
    </svg>
  ),
  sair: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </svg>
  ),
};

export default function Topo() {
  const rota = usePathname() ?? '';
  const noProjeto = /^\/projetos\/p_/.test(rota);
  const atual = (sim: boolean) => (sim ? ('page' as const) : undefined);
  // Ponto de saúde: só fica verde depois de perguntar ao motor (/api/saude). Motor fora do ar ou backup com falha = coral.
  // Enquanto não sabe, fica neutro (um anel), nunca verde de enfeite.
  const [saude, setSaude] = useState<'ok' | 'falha' | null>(null);
  useEffect(() => {
    let vivo = true;
    const conferir = async () => {
      if (document.visibilityState === 'hidden') return;
      const r = await fetch('/api/saude', { cache: 'no-store' }).catch(() => null);
      const c = (await r?.json().catch(() => null)) as { motor?: string; backup?: { estado?: string } } | null;
      if (!vivo) return;
      const backupFalhou = ['falha', 'sem destino'].includes(String(c?.backup?.estado ?? ''));
      setSaude(r?.ok && c?.motor === 'ok' && !backupFalhou ? 'ok' : 'falha');
    };
    void conferir();
    const t = window.setInterval(conferir, 120_000);
    document.addEventListener('visibilitychange', conferir);
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener('visibilitychange', conferir); };
  }, []);

  // Quem espera o dono (pergunta ou cartão da conversa): número no item Projetos e título da aba. Lido ao abrir, ao voltar
  // a página para visível, a cada 30 s com ela visível e sempre que a conversa avisa que mudou (sem push nesta etapa).
  const [esperando, setEsperando] = useState<EstadoChave['esperando']>([]);
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      if (document.visibilityState === 'hidden') return;
      const r = await chave();
      if (vivo && r.ok) setEsperando(Array.isArray(r.dados.esperando) ? r.dados.esperando : []);
    };
    void ler();
    const t = window.setInterval(ler, 30_000);
    const f = () => void ler();
    document.addEventListener('visibilitychange', f);
    window.addEventListener(EVENTO_CONVERSA, f);
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener('visibilitychange', f); window.removeEventListener(EVENTO_CONVERSA, f); };
  }, []);
  const base = useRef('');
  const nosso = useRef('');
  // título da aba: dentro do projeto que espera, "● Precisa de você · <nome>"; fora, "(N) Precisa de você · Editor"
  useEffect(() => {
    const PREFIXO = /^(● Precisa de você · |\(\d+\) Precisa de você · )/;
    const aplicar = () => {
      // o título que o Next pôs é a base; o nosso só vai por cima e sai quando ninguém mais espera
      if (document.title !== nosso.current) base.current = document.title.replace(PREFIXO, '');
      const pid = /^\/projetos\/(p_[a-z0-9]+)/.exec(rota)?.[1];
      const aqui = pid ? esperando.find((x) => x.projeto === pid) : undefined;
      const novo = aqui ? `● Precisa de você · ${aqui.nome}` : esperando.length ? `(${esperando.length}) Precisa de você · Editor` : base.current;
      nosso.current = novo;
      if (document.title !== novo) document.title = novo;
    };
    aplicar();
    // o Next troca o título ao navegar: reaplica quando o <title> muda
    const alvo = document.querySelector('title');
    const mo = alvo ? new MutationObserver(aplicar) : null;
    if (alvo && mo) mo.observe(alvo, { childList: true, characterData: true, subtree: true });
    return () => { mo?.disconnect(); };
  }, [esperando, rota]);

  // "Mais" é uma gaveta (onda 2): fecha ao trocar de tela; Esc, toque fora e arrastar para baixo fecham (Base UI).
  const [maisAberto, setMaisAberto] = useState(false);
  useEffect(() => { setMaisAberto(false); }, [rota]);
  const fecharMais = () => setMaisAberto(false);
  // a gaveta trava a rolagem e devolve a posição antiga quando fecha: o link só navega DEPOIS de ela fechar,
  // senão o salto para a âncora (#backup) é desfeito
  const router = useRouter();
  const destino = useRef<string | null>(null);
  const irDepois = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    destino.current = e.currentTarget.getAttribute('href');
    setMaisAberto(false);
  };

  return (
    <header className="topo">
      <Link className="topo__marca" href="/projetos" aria-label="Editor creat.MTT, ir para projetos">
        <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="" width={128} height={22} />
        <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="" width={128} height={22} />
        <span className="topo__editor" aria-hidden="true">Editor</span>
      </Link>
      <Link className="topo__saude" href="/sistema" data-saude={saude ?? undefined}
        aria-label={saude === 'ok' ? 'Sistema no ar: ver backup e saúde' : saude === 'falha' ? 'Sistema com problema: ver o que houve' : 'Conferindo o sistema'}
        title={saude === 'ok' ? 'Sistema no ar' : saude === 'falha' ? 'Sistema com problema' : 'Conferindo o sistema'} />
      {/* dentro do projeto e no próprio Novo, o âmbar é do botão da tela: o "Novo" da navegação fica calmo */}
      <nav className="nav" aria-label="Principal" data-calmo={noProjeto || rota === '/projetos/novo'}>
        <Link className="nav__item" href="/projetos" aria-current={atual(rota === '/projetos' || noProjeto)}>
          <span className="nav__icone">{Icone.projetos}{esperando.length > 0 && <span className="nav__numero" data-teste="nav-esperando">{esperando.length}</span>}</span>Projetos
          {esperando.length > 0 && <span className="so-leitor">, {esperando.length} esperando você</span>}
        </Link>
        <Link className="nav__item nav__item--novo" href="/projetos/novo" aria-current={atual(rota === '/projetos/novo')}>
          <span className="nav__icone">{Icone.novo}</span>Novo
        </Link>
        <Link className="nav__item" href="/caderno" aria-current={atual(rota.startsWith('/caderno'))}>
          <span className="nav__icone">{Icone.caderno}</span>Caderno
        </Link>
        <button type="button" className="nav__item" data-teste="nav-mais" aria-haspopup="dialog" aria-expanded={maisAberto}
          aria-current={atual(/^\/(gastos|clientes|biblioteca|sistema)(\/|$)/.test(rota))} onClick={() => setMaisAberto(true)}>
          <span className="nav__icone">{Icone.mais}</span>Mais
        </button>
        <Gaveta aberta={maisAberto} aoMudar={setMaisAberto} titulo="Mais" teste="gaveta-mais"
          aoFechar={() => { const d = destino.current; destino.current = null; if (d) router.push(d); }}>
          <div className="nav__menu">
            <ChaveConversa variante="menu" />
            <Link className="nav__menu-item" href="/gastos" onClick={irDepois}>{Icone.gastos}Gastos do mês</Link>
            <Link className="nav__menu-item" href="/clientes" onClick={irDepois}>{Icone.clientes}Clientes e marcas</Link>
            <Link className="nav__menu-item" href="/biblioteca" onClick={irDepois}>{Icone.biblioteca}Trilhas e efeitos</Link>
            <Link className="nav__menu-item" href="/sistema" onClick={irDepois}>{Icone.sistema}Sistema e backup</Link>
            <form action="/api/sair" method="post" onSubmit={(e) => {
              // antes de sair, o aparelho esquece o que a conversa guardou; depois o formulário segue normal
              const f = e.currentTarget;
              if (f.dataset.limpo === '1') return;
              e.preventDefault();
              void limparAparelho().finally(() => { f.dataset.limpo = '1'; f.requestSubmit(); });
            }}>
              <button className="nav__menu-item nav__menu-item--sair" type="submit">{Icone.sair}Sair</button>
            </form>
          </div>
        </Gaveta>
      </nav>
    </header>
  );
}
