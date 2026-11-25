'use client';
// A mesa no fio: as etapas que o motor já emite (etapa_*) viram linhas com quem faz e o verbo. Enquanto algo roda, o
// grupo fica aberto e a linha atualiza no lugar (o progresso não cria linha nova). Terminado, recolhe numa linha só:
// "Radar, Trilho · 8 passos · 0:41". Avisos e respostas do cliente entram como texto puro.
import { quem, rotuloEtapa } from '@/lib/equipe';
import { progressoDe, type LinhaMesa, type Progresso } from '@/lib/fio';
import { Avatares, decorrido, IconeEstado, useAgora } from './Pecas';

export default function GrupoMesa({ linhas, progresso, arquivos }: { linhas: LinhaMesa[]; progresso: Record<string, Progresso>; arquivos: string[] }) {
  const rodando = linhas.some((l) => l.k === 'etapa' && l.fase === 'rodando');
  const agora = useAgora(rodando);
  const etapas = linhas.filter((l): l is LinhaMesa & { k: 'etapa' } => l.k === 'etapa');
  const lista = (
    <ul className="mesa-fio__linhas">
      {linhas.map((l) => {
        if (l.k === 'nota') {
          return (
            <li key={l.id} className="mesa-linha mesa-linha--nota" data-tom={l.tom}>
              <IconeEstado fase={l.tom === 'alerta' ? 'erro' : 'feito'} />
              <p><span className="mesa-linha__quem">{l.tom === 'alerta' ? 'Aviso' : 'Cliente'}</span> {l.texto}</p>
            </li>
          );
        }
        const n = l.alvo ? arquivos.indexOf(l.alvo) + 1 : 0;
        const versao = l.alvo && /^v\d+$/.test(l.alvo) ? l.alvo : undefined;
        const r = rotuloEtapa(l.etapa, l.fase, { n: n > 0 ? n : undefined, versao });
        const p = l.fase === 'rodando' ? progressoDe(progresso, l.etapa, l.alvo) : null;
        return (
          <li key={l.id} className="mesa-linha" data-fase={l.fase} data-teste="mesa-linha" data-etapa={l.etapa}>
            <IconeEstado fase={l.fase} />
            <div className="mesa-linha__corpo">
              <p>
                <Avatares lista={r.agentes} trabalhando={l.fase === 'rodando'} />
                <span className="mesa-linha__quem">{r.agentes.map((a) => a.agente).join(', ')}</span>
                <span className="so-leitor"> · </span> {r.texto}
              </p>
              {l.fase !== 'feito' && l.mensagem && <p className="mesa-linha__msg">{l.mensagem}</p>}
              {p !== null && <div className="barra" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, p))})` }} /></div>}
            </div>
            <span className="mesa-linha__tempo" aria-hidden="true">{decorrido(l.inicio, l.fase === 'rodando' ? agora : (l.fim ?? l.inicio))}</span>
          </li>
        );
      })}
    </ul>
  );
  if (rodando || linhas.length === 1) return <li className="mesa-fio" data-teste="mesa-grupo" data-aberto="true">{lista}</li>;
  const nomes = [...new Set(etapas.flatMap((l) => rotuloEtapa(l.etapa, l.fase, {}).agentes.map((a) => a.agente)))];
  const inicio = etapas[0]?.inicio;
  const fim = etapas.reduce((m, l) => (l.fim && l.fim > m ? l.fim : m), inicio ?? '');
  const erro = etapas.some((l) => l.fase === 'erro');
  return (
    <li className="mesa-fio" data-teste="mesa-grupo" data-aberto="false">
      <details>
        <summary className="mesa-fio__resumo">
          <IconeEstado fase={erro ? 'erro' : 'feito'} />
          <Avatares lista={nomes.map(quem)} />
          <span className="mesa-fio__resumo-texto">
            <span className="mesa-linha__quem">{nomes.length ? nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` +${nomes.length - 3}` : '') : 'Mesa'}</span>
            {' · '}{linhas.length} passo{linhas.length === 1 ? '' : 's'}{inicio && fim ? ` · ${decorrido(inicio, fim)}` : ''}
          </span>
          <span className="mesa-fio__ver" aria-hidden="true">ver</span>
        </summary>
        {lista}
      </details>
    </li>
  );
}
