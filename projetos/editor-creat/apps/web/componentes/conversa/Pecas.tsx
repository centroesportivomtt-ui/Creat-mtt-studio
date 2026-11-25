'use client';
// Peças pequenas do fio: avatar do agente (disco com cor e inicial até a arte aprovada chegar), ícones de estado em
// traço (nunca emoji) e o relógio que corre enquanto algo trabalha.
import { useEffect, useState } from 'react';
import type { Quem } from '@/lib/equipe';

export function Avatar({ q, trabalhando = false }: { q: Quem; trabalhando?: boolean }) {
  return (
    <span className="avatar" data-trabalhando={trabalhando} aria-hidden="true" style={{ ['--cor-agente' as string]: q.cor }}>
      {q.inicial}
    </span>
  );
}

export function Avatares({ lista, trabalhando = false }: { lista: Quem[]; trabalhando?: boolean }) {
  return (
    <span className="avatares" aria-hidden="true">
      {lista.slice(0, 4).map((q) => <Avatar key={q.agente} q={q} trabalhando={trabalhando} />)}
    </span>
  );
}

export function IconeEstado({ fase }: { fase: 'rodando' | 'feito' | 'erro' | 'esperando' }) {
  if (fase === 'rodando') return <svg className="icone-estado icone-estado--rodando" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" strokeLinecap="round" /></svg>;
  if (fase === 'feito') return <svg className="icone-estado icone-estado--feito" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (fase === 'erro') return <svg className="icone-estado icone-estado--erro" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v5.5M8 12.2v.3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  return <svg className="icone-estado icone-estado--esperando" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4v8M10 4v8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
}

/** Agora em ms, atualizado a cada segundo só enquanto `ativo` (nada de relógio rodando à toa). */
export function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo]);
  return agora;
}

/** 0:06 · 1:12 · 12:04 (minutos:segundos), com piso em zero (relógio do aparelho diferente do servidor). */
export function decorrido(desdeIso: string, ate: number | string): string {
  const fim = typeof ate === 'number' ? ate : Date.parse(ate);
  const s = Math.max(0, Math.round((fim - Date.parse(desdeIso)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Texto do Nimbus: texto puro com **negrito** e listas curtas. Sem HTML, sem imagem, sem link automático. */
export function TextoSimples({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = (k: string) => {
    if (lista.length) blocos.push(<ul key={`l${k}`} className="texto-nimbus__lista">{lista.map((l, i) => <li key={i}>{negrito(l)}</li>)}</ul>);
    lista = [];
  };
  texto.split('\n').forEach((linha, i) => {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(linha);
    if (m) { lista.push(m[1]); return; }
    fecharLista(String(i));
    if (linha.trim()) blocos.push(<p key={`p${i}`}>{negrito(linha)}</p>);
  });
  fecharLista('fim');
  return <>{blocos}</>;
}
function negrito(t: string): React.ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((parte, i) => (/^\*\*[^*]+\*\*$/.test(parte) ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte));
}
