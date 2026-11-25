'use client';
// Topo de 56 px (marca e saúde: o topo só informa) + navegação no polegar: Projetos · Novo · Caderno · Mais.
// No celular a navegação é uma barra fixa embaixo; no desktop a mesma navegação fica no topo, à direita (CSS).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ChaveConversa from './conversa/ChaveConversa';
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
  sair: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </svg>
  ),
};

export default function Topo() {
  const rota = usePathname() ?? '';
  const mais = useRef<HTMLDetailsElement>(null);
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
  const fecharMais = () => { if (mais.current) mais.current.open = false; };

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

  // "Mais" é um <details> nesta etapa (vira gaveta depois): fecha ao trocar de tela, ao tocar fora e com Esc.
  useEffect(() => {
    if (mais.current) mais.current.open = false;
  }, [rota]);
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const d = mais.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      const d = mais.current;
      if (e.key === 'Escape' && d?.open) { d.open = false; d.querySelector('summary')?.focus(); }
    };
    // Tab para fora do menu também fecha (não fica pairando sobre o conteúdo)
    const focoSaiu = (e: FocusEvent) => {
      const d = mais.current;
      if (d?.open && e.relatedTarget instanceof Node && !d.contains(e.relatedTarget)) d.open = false;
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    mais.current?.addEventListener('focusout', focoSaiu);
    const d = mais.current;
    return () => {
      document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc);
      d?.removeEventListener('focusout', focoSaiu);
    };
  }, []);

  return (
    <header className="topo">
      <Link className="topo__marca" href="/projetos" aria-label="Editor creat.MTT, ir para projetos">
        <img className="topo__logo logo-claro" src="/marca/logo_creatMTT_claro.png" alt="" width={128} height={22} />
        <img className="topo__logo logo-escuro" src="/marca/logo_creatMTT_escuro.png" alt="" width={128} height={22} />
        <span className="topo__editor" aria-hidden="true">Editor</span>
      </Link>
      <Link className="topo__saude" href="/caderno#backup" data-saude={saude ?? undefined}
        aria-label={saude === 'ok' ? 'Sistema no ar: ver backup e saúde no Caderno' : saude === 'falha' ? 'Sistema com problema: ver no Caderno' : 'Conferindo o sistema: ver no Caderno'}
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
        <details className="nav__mais" ref={mais}>
          <summary className="nav__item" aria-current={atual(rota.startsWith('/gastos'))}>
            <span className="nav__icone">{Icone.mais}</span>Mais
          </summary>
          <div className="nav__menu">
            <ChaveConversa variante="menu" />
            <Link className="nav__menu-item" href="/gastos" onClick={fecharMais}>{Icone.gastos}Gastos do mês</Link>
            <form action="/api/sair" method="post">
              <button className="nav__menu-item nav__menu-item--sair" type="submit">{Icone.sair}Sair</button>
            </form>
          </div>
        </details>
      </nav>
    </header>
  );
}
