'use client';
// "O que a direção decidiu" (onda 2): conceito, gancho, o que foi além do pedido e a forma do filme em blocos, logo
// que o diretor termina. Os riscos ficam numa gaveta fechada. Tudo aqui é texto que o modelo escreveu: texto puro,
// sem HTML e sem link, e o Nimbus recebe isso como "de fora".
import type { DadosDecisao } from '@/lib/conversa';
import { quem } from '@/lib/equipe';
import { Avatar } from './Pecas';

const FUNCAO: Record<string, string> = {
  gancho: 'gancho', contexto: 'contexto', prova: 'prova', bastidor: 'bastidor', virada: 'virada', climax: 'clímax',
  emocao: 'emoção', oferta: 'oferta', convite: 'convite',
};
const FAISCA = quem('Faísca');
const CRIVO = quem('Crivo');

function critica(c: string): string {
  if (c === 'aplicada') return 'mexeu na direção e a versão revisada ficou';
  if (c === 'sem mudança') return 'leu e manteve a direção';
  if (c === 'não rodou') return 'não revisou desta vez';
  return c;
}

export default function CartaoDecisao({ d, versao }: { d: DadosDecisao; versao: string | null }) {
  const riscos = (d.riscos ?? []).filter(Boolean);
  return (
    <li className="decisao" data-teste="decisao">
      <p className="decisao__cabeca"><Avatar q={FAISCA} /> <span>O que a direção decidiu{versao ? ` · ${versao.toUpperCase()}` : ''}</span></p>
      <dl className="decisao__campos">
        {d.conceito && <><dt>Conceito</dt><dd data-teste="decisao-conceito">{d.conceito}</dd></>}
        {d.gancho && <><dt>Gancho</dt><dd data-teste="decisao-gancho">{d.gancho}</dd></>}
        {d.alem_do_pedido && <><dt>Além do pedido</dt><dd>{d.alem_do_pedido}</dd></>}
        {d.trilha?.clima && <><dt>Música</dt><dd>{d.trilha.clima}{d.trilha.drop_em ? ` · explode no ${d.trilha.drop_em}` : ''}</dd></>}
      </dl>
      {d.blocos && d.blocos.length > 0 && (
        <ol className="decisao__blocos" aria-label={`O filme em ${d.blocos.length} blocos`} data-teste="decisao-blocos">
          {d.blocos.map((b) => (
            <li key={b.id} className="decisao__bloco" data-drop={d.trilha?.drop_em === b.id ? 'sim' : undefined}>
              <span className="decisao__bloco-id">{b.id}</span> {FUNCAO[b.funcao] ?? b.funcao}
              {typeof b.intensidade === 'number' && (
                <span className="decisao__forca" aria-label={`força ${b.intensidade} de 5`}>
                  {[1, 2, 3, 4, 5].map((i) => <i key={i} data-cheio={i <= b.intensidade! ? 'sim' : undefined} />)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {d.critica && <p className="decisao__critica"><Avatar q={CRIVO} /> <span><b>Crivo</b> {critica(d.critica)}</span></p>}
      {riscos.length > 0 && (
        <details className="decisao__riscos">
          <summary>Riscos para a conferência olhar ({riscos.length})</summary>
          <ul>{riscos.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </details>
      )}
    </li>
  );
}
