'use client';
// Versão segurada pela conferência (onda 4, item 6): o dono ASSISTE aqui, com os motivos ao lado, e ela continua não entregue.
// Regra: versão não entregue nunca sai do editor: não baixa, não tem link e não vai para o cliente. Por isso o vídeo vem de uma
// rota própria do motor (no-store, inline, só com a sessão), o player não oferece baixar nem transmitir, o menu do botão
// direito não abre e uma faixa fixa diz "NÃO ENTREGUE" por cima do filme. Quem tem a sessão ainda consegue gravar a tela: aceito.
import { useCallback, useEffect, useRef, useState } from 'react';
import { irEntrar } from '@/lib/pendentes';

type Motivo = { id: string; titulo: string; frase: string; quando: number[] | null };
type Dados = { versao: string; video: string; duracao: number | null; motivos: Motivo[]; regra: string; nao_entregue: true };

export function tempoFilme(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export default function Segurada({ pid, versao, aberta, aoAbrir }: {
  pid: string; versao: string;
  /** aberta: o player da segurada está na tela; false mostra só o convite para assistir */
  aberta: boolean; aoAbrir: (sim: boolean) => void;
}) {
  const V = versao.toUpperCase();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const carregar = useCallback(async () => {
    setLendo(true); setErro('');
    try {
      const r = await fetch(`/api/motor/v1/projetos/${pid}/versoes/${versao}/segurada`, { cache: 'no-store' });
      const c = await r.json().catch(() => null);
      if (r.status === 401) { irEntrar(pid); return; }
      if (!r.ok) { setErro(typeof c?.detail === 'string' ? `Não deu para abrir: ${c.detail}.` : `Não deu para abrir a ${V} agora (erro ${r.status}).`); return; }
      setD(c as Dados);
    } catch { setErro('Sem conexão com o editor. Tente de novo.'); }
    finally { setLendo(false); }
  }, [pid, versao, V]);
  useEffect(() => { if (aberta && !d) void carregar(); }, [aberta, d, carregar]);

  const ir = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    v.focus({ preventScroll: true });
    v.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  };

  if (!aberta) {
    return (
      <div className="player-vazio segurada-convite" data-teste="segurada-convite">
        <p>A conferência segurou a {V}. Ela não foi entregue: não baixa, não tem link e não vai para o cliente.</p>
        <button type="button" className="botao botao--secundario" data-teste="assistir-segurada" data-versao={versao} onClick={() => aoAbrir(true)}>
          Assistir a {V} segurada
        </button>
      </div>
    );
  }
  return (
    <div className="segurada" data-teste="segurada" data-versao={versao}>
      {erro ? (
        <div className="player-vazio"><p role="alert">{erro}</p>
          <button type="button" className="botao botao--secundario" onClick={() => void carregar()}>Tentar de novo</button></div>
      ) : !d ? (
        <div className="player-vazio" aria-busy={lendo}><p>Abrindo a {V} segurada…</p></div>
      ) : (
        <>
          <div className="segurada__tela" onContextMenu={(e) => e.preventDefault()}>
            <video ref={video} className="player" controls playsInline preload="metadata" data-teste="player-segurada"
              controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback
              src={`/api/motor${d.video}#t=0.1`} aria-label={`${V} segurada pela conferência, não entregue`} />
            <p className="segurada__faixa" data-teste="segurada-faixa" aria-hidden="true"><b>Não entregue</b> · segurada pela conferência</p>
          </div>
          <section className="segurada__motivos" aria-labelledby={`seg-${versao}`}>
            <h3 className="segurada__titulo" id={`seg-${versao}`}>Por que a conferência segurou a {V}</h3>
            <ol className="segurada__lista" data-teste="segurada-motivos">
              {d.motivos.map((m) => (
                <li key={m.id} data-motivo={m.id}>
                  <strong>{m.titulo}</strong>
                  <span>{m.frase}.</span>
                  {m.quando && m.quando.length > 0 && (
                    <span className="segurada__tempos">
                      {m.quando.map((t) => (
                        <button key={t} type="button" className="botao botao--fantasma botao--pequeno segurada__ir" data-teste="segurada-ir" data-t={t}
                          onClick={() => ir(t)} aria-label={`Levar o vídeo a ${tempoFilme(t)}: ${m.titulo}`}>
                          aos {tempoFilme(t)}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
              {d.motivos.length === 0 && <li><span>A conferência não deixou motivo escrito. Veja a mesa ao vivo.</span></li>}
            </ol>
            <p className="segurada__regra" data-teste="segurada-regra">{d.regra}</p>
            <button type="button" className="botao botao--fantasma" onClick={() => aoAbrir(false)} data-teste="segurada-fechar">Fechar a {V}</button>
          </section>
        </>
      )}
    </div>
  );
}
