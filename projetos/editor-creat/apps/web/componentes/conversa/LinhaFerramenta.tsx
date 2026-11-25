'use client';
// Uma ferramenta em uso, na língua do dono: "Radar · Lendo as falas do material · 0:06". A linha inteira abre os
// bastidores (nome técnico, quem, quanto durou e o pedido): é ali que o dono confere as ferramentas, como pediu.
import { segundos } from '@/lib/conversa';
import { rotuloFerramenta } from '@/lib/equipe';
import type { Ferr } from '@/lib/fio';
import { Avatar, decorrido, IconeEstado, useAgora } from './Pecas';

export default function LinhaFerramenta({ f }: { f: Ferr }) {
  const r = rotuloFerramenta(f.nome, f.fase, f.entrada, f.resumo);
  const rodando = f.fase === 'inicio';
  const agora = useAgora(rodando);
  const tempo = rodando ? decorrido(f.inicio, agora) : typeof f.s === 'number' ? segundos(f.s) : decorrido(f.inicio, f.fimTs ?? f.inicio);
  const entrada = f.entrada && Object.keys(f.entrada).length ? JSON.stringify(f.entrada, null, 2).split('\n') : null;
  return (
    <li className="ferr" data-fase={f.fase} data-teste="ferramenta" data-nome={f.nome} data-id={f.id}>
      <details className="ferr__detalhe">
        <summary className="ferr__linha">
          <IconeEstado fase={rodando ? 'rodando' : f.fase === 'erro' ? 'erro' : 'feito'} />
          <Avatar q={r} trabalhando={rodando} />
          <span className="ferr__texto">
            <span className="ferr__quem">{r.agente}</span>
            <span className="so-leitor"> · </span>
            <span>{r.texto}</span>
            <span className="so-leitor">{rodando ? ' (trabalhando)' : f.fase === 'erro' ? ' (não deu)' : ' (feito)'}. Toque para ver os detalhes.</span>
          </span>
          <span className="ferr__tempo" aria-hidden="true">{tempo}</span>
          <svg className="ferr__seta" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="ferr__bastidores">
          <dl className="detalhe-tecnico">
            <dt>ferramenta</dt><dd>{f.nome}</dd>
            <dt>quem</dt><dd>{r.agente} · {r.cargo}</dd>
            {typeof f.s === 'number' && <><dt>durou</dt><dd>{f.s.toLocaleString('pt-BR')} s</dd></>}
            <dt>estado</dt><dd>{rodando ? 'trabalhando' : f.fase === 'erro' ? 'não deu' : 'feito'}</dd>
            {f.resumo && <><dt>resultado</dt><dd>{f.resumo}</dd></>}
          </dl>
          {entrada && (
            <>
              <p className="detalhe-tecnico__rotulo">pedido</p>
              <pre className="detalhe-tecnico__json">{entrada.slice(0, 12).join('\n')}{entrada.length > 12 ? '\n…' : ''}</pre>
            </>
          )}
        </div>
      </details>
    </li>
  );
}
