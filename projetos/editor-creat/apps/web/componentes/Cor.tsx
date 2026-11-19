'use client';

import { useState } from 'react';

type Medida = { p50?: number; estouro?: number; esmagado?: number; pele?: { angulo: number } | null; hist?: number[] };
type Item = {
  plano: string; t0: number; t1: number; look: string; look_nome: string;
  balanco?: { ganho: number[]; exp: number } | null; antes: Medida; depois: Medida; antes_chave: string; depois_chave: string;
};

const arq = (chave: string) => `/api/motor/v1/arquivos/${chave}`;
const pct = (x?: number) => (typeof x === 'number' ? `${(x * 100).toFixed(1).replace('.', ',')}%` : 'sem medida');

function Histograma({ h, rotulo }: { h?: number[]; rotulo: string }) {
  if (!h || h.length === 0) return null;
  const max = Math.max(...h, 1e-6);
  return (
    <svg className="cor__hist" viewBox={`0 0 ${h.length} 12`} preserveAspectRatio="none" role="img" aria-label={`Histograma de luz, ${rotulo}`}>
      {h.map((v, i) => <rect key={i} x={i} y={12 - (v / max) * 12} width={0.9} height={(v / max) * 12} />)}
    </svg>
  );
}

function Plano({ it }: { it: Item }) {
  const [pos, setPos] = useState(50);
  const pele = it.depois.pele?.angulo;
  return (
    <li className="cor__plano" data-teste="cor-plano">
      <div className="cor__quadro" style={{ ['--pos' as string]: `${pos}%` }}>
        <img src={arq(it.depois_chave)} alt={`Plano ${it.plano} depois da cor`} loading="lazy" />
        <img className="cor__antes" src={arq(it.antes_chave)} alt={`Plano ${it.plano} antes da cor`} loading="lazy" />
        <span className="cor__etq cor__etq--a">Antes</span>
        <span className="cor__etq cor__etq--d">Depois</span>
        <input className="cor__faixa" type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Comparar antes e depois do plano ${it.plano}`} />
      </div>
      <p className="cor__nome"><strong>{it.look_nome}</strong> · {it.t0.toFixed(1).replace('.', ',')} s</p>
      <div className="cor__hists"><Histograma h={it.antes.hist} rotulo="antes" /><Histograma h={it.depois.hist} rotulo="depois" /></div>
      <p className="aviso">
        Luz média {pct(it.antes.p50)} → {pct(it.depois.p50)} · estouro {pct(it.depois.estouro)}
        {typeof pele === 'number' ? ` · pele ${pele.toFixed(0)}° (natural: 105° a 145°)` : ' · sem pele no quadro'}
      </p>
    </li>
  );
}

// Revisão da cor de uma versão entregue: antes e depois de cada plano, com a medição. Carrega só quando o dono abre.
export default function Cor({ base }: { base: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [estado, setEstado] = useState<'fechado' | 'carregando' | 'aberto' | 'vazio'>('fechado');
  async function abrir() {
    if (estado === 'aberto') { setEstado('fechado'); return; }
    if (itens) { setEstado('aberto'); return; }
    setEstado('carregando');
    try {
      const r = await fetch(arq(`${base}/cor.json`), { cache: 'no-store' });
      const d = r.ok ? await r.json() : null;
      if (Array.isArray(d) && d.length > 0) { setItens(d as Item[]); setEstado('aberto'); } else setEstado('vazio');
    } catch { setEstado('vazio'); }
  }
  return (
    <div className="cor">
      <button className="botao botao--fantasma botao--pequeno" type="button" onClick={abrir} data-teste="ver-cor" aria-expanded={estado === 'aberto'}>
        {estado === 'aberto' ? 'Fechar a cor' : estado === 'carregando' ? 'Abrindo…' : 'Cor: antes e depois'}
      </button>
      {estado === 'vazio' && <p className="aviso" data-teste="cor-vazia">Esta versão foi montada antes da revisão de cor. A próxima já vem com o antes e depois.</p>}
      {estado === 'aberto' && itens && <ul className="cor__grade" data-teste="cor-grade">{itens.map((it) => <Plano key={it.plano} it={it} />)}</ul>}
    </div>
  );
}
