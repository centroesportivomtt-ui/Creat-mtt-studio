'use client';
// Mesa ao vivo (onda 2): a linha do tempo do filme na tela do projeto, no lugar do antigo "Diário da ilha" (12 linhas
// escondidas). Responde, sem rolar: quem está trabalhando agora, fazendo o quê, há quanto tempo, quanto já custou e o
// que cada um achou. É a MESMA linha do tempo do fio da conversa (lib/fio.ts, um SSE só): aqui aparece só a mesa; no
// fio, a mesa e a conversa intercaladas. Assistir é de graça: nada aqui chama o Claude.
import { useCallback, useEffect, useState } from 'react';
import { usd } from '@/lib/conversa';
import { agenteDoPasso, quem, rotuloEtapa, rotuloPasso } from '@/lib/equipe';
import type { Fio, LinhaMesa, PassoMesa, Progresso } from '@/lib/fio';
import GrupoMesa from './GrupoMesa';
import { Avatar, Avatares, decorrido, useAgora } from './Pecas';

const CHAVE_BASTIDORES = 'editor:bastidores';
const EVENTO = 'editor:bastidores';

/** Modo Bastidores (todas as gavetas abertas), lembrado por aparelho. Sem armazenamento, só vale nesta tela. */
export function useBastidores(): [boolean, (v: boolean) => void] {
  const [b, setB] = useState(false);
  useEffect(() => {
    const ler = () => { try { setB(localStorage.getItem(CHAVE_BASTIDORES) === '1'); } catch { /* sem armazenamento */ } };
    ler();
    window.addEventListener(EVENTO, ler);
    return () => window.removeEventListener(EVENTO, ler);
  }, []);
  const mudar = useCallback((v: boolean) => {
    setB(v);
    try { localStorage.setItem(CHAVE_BASTIDORES, v ? '1' : '0'); } catch { /* sem armazenamento */ }
    try { window.dispatchEvent(new Event(EVENTO)); } catch { /* sem janela */ }
  }, []);
  return [b, mudar];
}

function rotuloAgora(p: PassoMesa) {
  if (p.pai || p.passo.startsWith('ps_')) return rotuloPasso(p.chave, 'inicio', p.numeros);
  const r = rotuloEtapa(p.chave, 'rodando', { versao: typeof p.numeros?.versao === 'string' ? p.numeros.versao : undefined });
  return { ...r.agentes[0], texto: r.texto };
}

/** "Trabalhando agora": até 3 linhas (avatar com anel + quem + verbo + tempo); o resto vira "+N". */
export function AgoraNaMesa({ agora, compacto = false }: { agora: PassoMesa[]; compacto?: boolean }) {
  const t = useAgora(agora.length > 0);
  if (!agora.length) return null;
  const lista = agora.map((p) => ({ p, r: rotuloAgora(p) }));
  if (compacto) {
    const { p, r } = lista[lista.length - 1];
    return (
      <p className="agora agora--compacto" data-teste="agora-compacto">
        <Avatares lista={lista.map((x) => quem(x.r.agente))} trabalhando />
        <span><b>{r.agente}</b> {r.texto.replace(/^./, (c) => c.toLowerCase())}</span>
        <span className="agora__tempo" aria-hidden="true">{decorrido(p.inicio, t)}</span>
      </p>
    );
  }
  return (
    <div className="agora" data-teste="agora">
      <p className="agora__titulo">Trabalhando agora</p>
      <ul className="agora__lista">
        {lista.slice(-3).map(({ p, r }) => (
          <li key={p.passo} data-teste="agora-linha">
            <Avatar q={quem(r.agente)} trabalhando />
            <span className="agora__texto"><b>{r.agente}</b> <span>{r.texto}</span></span>
            <span className="agora__tempo">{decorrido(p.inicio, t)}</span>
          </li>
        ))}
      </ul>
      {lista.length > 3 && <p className="agora__mais">+{lista.length - 3} trabalhando junto</p>}
    </div>
  );
}

/** Taxímetro: o que este filme já custou (mesa paga + conversa), e o placar por agente ao toque. */
function Taximetro({ montado }: { montado: Fio }) {
  const [aberto, setAberto] = useState(false);
  const total = montado.custoMesa + montado.custoConversa;
  const porAgente = new Map<string, number>();
  for (const x of montado.porAgente) {
    const a = agenteDoPasso(x.chave).agente;
    porAgente.set(a, (porAgente.get(a) ?? 0) + x.custo);
  }
  const placar = [...porAgente.entries()].sort((a, b) => b[1] - a[1]);
  if (total <= 0) return <p className="taximetro taximetro--zero" data-teste="taximetro">Custo até aqui: {usd(0)} · assistir é de graça</p>;
  return (
    <div className="taximetro" data-teste="taximetro">
      <button type="button" className="taximetro__botao" aria-expanded={aberto} aria-controls="placar" onClick={() => setAberto((v) => !v)} data-teste="taximetro-botao">
        <span>Este filme: <b data-teste="taximetro-total">{usd(total)}</b></span>
        <span className="taximetro__parte">mesa {usd(montado.custoMesa)} · conversa {usd(montado.custoConversa)}</span>
      </button>
      {aberto && (
        <ul className="taximetro__placar" id="placar" data-teste="taximetro-placar">
          {placar.map(([a, c]) => (
            <li key={a}><Avatar q={quem(a)} /><span>{a}</span><b>{usd(c)}</b></li>
          ))}
          {montado.custoConversa > 0 && <li><Avatar q={quem('Nimbus')} /><span>Nimbus, na conversa</span><b>{usd(montado.custoConversa)}</b></li>}
        </ul>
      )}
    </div>
  );
}

export default function MesaAoVivo({ montado, progresso, arquivos, conectado, aoAbrirConversa }: {
  montado: Fio; progresso: Record<string, Progresso>; arquivos: string[]; conectado: boolean; aoAbrirConversa: () => void;
}) {
  const [bastidores, setBastidores] = useBastidores();
  // no cartão do projeto, um grupo por etapa (a decisão e os avisos vão junto da etapa em que chegaram): cada etapa
  // recolhe numa linha com o que fez quando termina, e a que está rodando fica aberta
  const linhas = montado.itens.flatMap((it) => (it.k === 'mesa' ? it.linhas : []));
  const grupos: { id: number; linhas: LinhaMesa[] }[] = [];
  for (const l of linhas) {
    if (l.k === 'etapa' || !grupos.length) grupos.push({ id: l.id, linhas: [l] });
    else grupos[grupos.length - 1].linhas.push(l);
  }
  if (!grupos.length && !montado.temConversa) return null;
  return (
    <section className="cartao bloco-mesa" id="mesa" aria-labelledby="t-mesa" data-teste="mesa-ao-vivo">
      <h2 className="cartao__titulo" id="t-mesa">
        Mesa ao vivo
        <span className="ao-vivo" data-conectado={conectado} style={{ marginLeft: 'auto' }}>{conectado ? 'ao vivo' : 'reconectando…'}</span>
      </h2>
      <AgoraNaMesa agora={montado.agora} />
      {!montado.agora.length && grupos.length > 0 && <p className="agora agora--parado">Ninguém trabalhando agora. {montado.mesaRodando ? '' : 'A mesa espera o próximo passo.'}</p>}
      <div className="bloco-mesa__ferramentas">
        <Taximetro montado={montado} />
        <button type="button" className="chip-alternar" aria-pressed={bastidores} onClick={() => setBastidores(!bastidores)} data-teste="bastidores">
          Bastidores {bastidores ? 'abertos' : ''}
        </button>
      </div>
      {grupos.length > 0 && (
        <ol className="bloco-mesa__lista" aria-label="O que a mesa fez neste filme" data-teste="mesa-lista">
          {grupos.map((g) => <GrupoMesa key={`m${g.id}`} linhas={g.linhas} progresso={progresso} arquivos={arquivos} bastidores={bastidores} />)}
        </ol>
      )}
      {montado.temConversa && (
        <button type="button" className="botao botao--fantasma bloco-mesa__conversa" onClick={aoAbrirConversa} data-teste="mesa-abrir-conversa">
          Ver a mesa junto da conversa ({montado.falas} fala{montado.falas === 1 ? '' : 's'})
        </button>
      )}
    </section>
  );
}
