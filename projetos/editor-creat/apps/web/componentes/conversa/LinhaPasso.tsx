'use client';
// Um passo da mesa (onda 2): quem faz, o quê, quanto tempo e, se foi pago, quanto custou. O achado (o que ele viu,
// em números do motor) fica à vista; a gaveta "bastidores" guarda o técnico: ferramenta, modelo, esforço, tokens e a conta.
// Texto do passo vem do código (equipe.json + números do evento); o achado pode ter texto de modelo: sempre texto puro.
import { segundos, usd } from '@/lib/conversa';
import { rotuloPasso } from '@/lib/equipe';
import type { PassoMesa } from '@/lib/fio';
import { Avatar, decorrido, IconeEstado, useAgora } from './Pecas';

const ESFORCO: Record<string, string> = { low: 'baixo', medium: 'médio', high: 'alto' };
const n = (v: number) => v.toLocaleString('pt-BR');

export function custoTexto(c: number | undefined, estimado?: boolean): string | null {
  if (!c || c <= 0) return null;
  return `${estimado ? '≈ ' : ''}${usd(c)}`;
}

export default function LinhaPasso({ p, bastidores }: { p: PassoMesa; bastidores: boolean }) {
  const r = rotuloPasso(p.chave, p.fase, p.numeros, p.s);
  const rodando = p.fase === 'inicio';
  const agora = useAgora(rodando);
  const tempo = rodando ? decorrido(p.inicio, agora) : typeof p.s === 'number' ? segundos(p.s) : decorrido(p.inicio, p.fimTs ?? p.inicio);
  const custo = custoTexto(p.custo_usd, p.estimado);
  const fase = rodando ? 'rodando' : p.fase === 'fim' ? 'feito' : p.fase === 'erro' ? 'erro' : 'esperando';
  const tk = p.tokens;
  return (
    <li className="passo-mesa" data-fase={p.fase} data-teste="mesa-passo" data-chave={p.chave} data-id={p.id}>
      {/* key: o modo Bastidores abre (ou fecha) todas as gavetas de uma vez; o toque de cada uma continua valendo */}
      <details className="passo-mesa__gaveta" open={bastidores} key={bastidores ? 'b' : 'n'}>
        <summary className="passo-mesa__linha">
          <IconeEstado fase={fase} />
          <Avatar q={r} trabalhando={rodando} />
          <span className="passo-mesa__texto">
            <span className="passo-mesa__quem">{r.agente}</span>
            <span className="so-leitor"> · </span>
            <span data-teste="mesa-passo-texto">{r.texto}</span>
            {p.achado && <span className="passo-mesa__achado" data-teste="mesa-achado">{p.achado}</span>}
            <span className="so-leitor">{rodando ? ' (trabalhando agora)' : p.fase === 'interrompido' ? ' (interrompido)' : ''}. Toque para ver os bastidores.</span>
          </span>
          <span className="passo-mesa__dado" aria-hidden="true">
            <span>{tempo}</span>
            {custo && <span className="passo-mesa__custo" data-teste="mesa-passo-custo">{custo}</span>}
          </span>
        </summary>
        <dl className="detalhe-tecnico passo-mesa__bastidores" data-teste="mesa-bastidores">
          <dt>quem</dt><dd>{r.agente} · {r.cargo}</dd>
          {p.ferramenta && <><dt>ferramenta</dt><dd>{p.ferramenta}</dd></>}
          {p.modelo && <><dt>modelo</dt><dd>{p.modelo}{p.esforco ? ` · esforço ${ESFORCO[p.esforco] ?? p.esforco}` : ''}</dd></>}
          <dt>tempo</dt><dd>{rodando ? `trabalhando há ${tempo}` : tempo}</dd>
          {tk && <><dt>tokens</dt><dd>{n(tk.entrada)} novos · {n(tk.cache_lida)} do cache · {n(tk.cache_escrita)} no cache · {n(tk.saida)} de saída</dd></>}
          {custo && <><dt>custo</dt><dd>{custo}{p.estimado ? ' (estimado)' : ''}</dd></>}
          {p.conta && <><dt>a conta</dt><dd>{p.conta}</dd></>}
          <dt>passo</dt><dd>{p.chave}</dd>
        </dl>
      </details>
    </li>
  );
}
