'use client';
// Interruptor do som da claquete (onda 4). Fica neste aparelho (o editor é usado em evento e na rua: desligado por padrão).
import { useEffect, useState } from 'react';
import { baterClaquete, ligarSom, somLigado } from '@/lib/som';

export default function SomClaquete() {
  const [ligado, setLigado] = useState<boolean | null>(null);
  useEffect(() => { setLigado(somLigado()); }, []);
  return (
    <>
      <button type="button" role="switch" aria-checked={Boolean(ligado)} className="chave chave--cartao" disabled={ligado === null} data-teste="som-claquete"
        onClick={() => { const novo = !ligado; ligarSom(novo); setLigado(novo); if (novo) baterClaquete(true); }}>
        <span className="chave__texto">
          <span className="chave__nome">Batida da claquete ao aprovar</span>
          <span className="chave__estado">{ligado ? 'Ligada neste aparelho' : 'Desligada'}</span>
        </span>
        <span className="chave__trilho" aria-hidden="true"><span className="chave__bola" /></span>
      </button>
      <p className="aviso" style={{ marginTop: 12, maxWidth: '62ch' }}>Um som curto e baixo quando você aprova uma versão. Nada toca na ilha ao vivo.</p>
    </>
  );
}
