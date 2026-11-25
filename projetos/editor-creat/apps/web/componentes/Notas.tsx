'use client';
// "Suas notas" (onda 3, seção 10.6): o que o dono pediu para anotar na conversa (sempre com o toque dele no cartão).
// Só aparece se há nota. Mais recentes primeiro, as 10 últimas e "Ver todas". Texto puro: a nota pode repetir algo de fora.
import { useState } from 'react';
import { mmss } from '@/lib/conversa';

export type Nota = { id: string; texto: string; versao?: string; t?: number; em?: string; por?: string };

export function lerNotas(d: unknown): Nota[] {
  if (!Array.isArray(d)) return [];
  return d.filter((n): n is Nota => Boolean(n) && typeof (n as Nota).id === 'string' && typeof (n as Nota).texto === 'string');
}

export default function Notas({ notas }: { notas: Nota[] }) {
  const [todas, setTodas] = useState(false);
  if (!notas.length) return null;
  const ordem = [...notas].reverse();
  const lista = todas ? ordem : ordem.slice(0, 10);
  return (
    <section className="cartao notas" aria-labelledby="t-notas" data-teste="notas">
      <h2 className="cartao__titulo" id="t-notas">Suas notas</h2>
      <ul className="notas__lista">
        {lista.map((n) => (
          <li key={n.id} className="notas__item" data-teste="nota">
            {(typeof n.t === 'number' || n.versao) && (
              <span className="notas__onde">{[typeof n.t === 'number' ? mmss(n.t) : '', n.versao ? n.versao.toUpperCase() : ''].filter(Boolean).join(' · ')}</span>
            )}
            <p className="notas__texto">{n.texto}</p>
          </li>
        ))}
      </ul>
      {ordem.length > 10 && (
        <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setTodas((x) => !x)} data-teste="notas-todas">
          {todas ? 'Ver só as 10 últimas' : `Ver todas (${ordem.length})`}
        </button>
      )}
    </section>
  );
}
