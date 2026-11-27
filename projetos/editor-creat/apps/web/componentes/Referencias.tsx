'use client';
import { useCallback, useEffect, useState } from 'react';

type Ref = { id: string; url: string; autor?: string | null; titulo?: string | null; licao?: string; duracao_s?: number; planos?: number; plano_medio_s?: number };
type Andamento = { id: string; url: string; estado: string; erro?: string };

// Estudos de caso: cole o link de um Reel (ou TikTok, YouTube, Drive, Dropbox público). O editor baixa, mede ritmo e gancho,
// transcreve e o diretor passa a usar como referência.
export default function Referencias() {
  const [lista, setLista] = useState<Ref[]>([]);
  const [andamento, setAndamento] = useState<Andamento[]>([]);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/motor/v1/referencias', { cache: 'no-store' });
      if (r.ok) { const c = await r.json(); setLista(c.referencias ?? []); setAndamento(c.andamento ?? []); }
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); }, [carregar]);
  return (
    <div className="form" style={{ maxWidth: 'none', gap: 12 }}>
      <form className="form" style={{ maxWidth: 'none', gap: 8 }} data-teste="form-referencia" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const url = String(f.get('url') ?? '').trim();
        const nota = String(f.get('nota') ?? '').trim();
        if (!url) return;
        setIndo(true); setErro('');
        try {
          const r = await fetch('/api/motor/v1/referencias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, ...(nota ? { nota } : {}) }) });
          const c = await r.json().catch(() => null);
          if (!r.ok) setErro(typeof c?.detail === 'string' ? c.detail : 'Não deu para ler esse link.');
          else (e.target as HTMLFormElement).reset();
        } catch { setErro('Sem conexão. Tente de novo.'); }
        setIndo(false); carregar();
      }}>
        <label className="campo">
          <span className="campo__rotulo">Link do vídeo de referência</span>
          <input className="entrada" name="url" type="url" required maxLength={500} placeholder="https://www.instagram.com/reel/..." autoComplete="off" />
        </label>
        <label className="campo">
          <span className="campo__rotulo">O que você quer aprender dele? (opcional)</span>
          <input className="entrada" name="nota" maxLength={300} placeholder="Ex.: o gancho nos 2 primeiros segundos e as transições" autoComplete="off" />
        </label>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao botao--principal" type="submit" disabled={indo} data-teste="ler-referencia">{indo ? 'Mandando…' : 'Ler e aprender'}</button>
        <p className="aviso">Funciona com link público. Se a rede pedir login, baixe o vídeo pelo celular e suba como material.</p>
      </form>
      {andamento.length > 0 && (
        <ul className="caderno__lista" data-teste="referencias-andamento">
          {andamento.map((a) => <li key={a.id}><p>{a.estado === 'lendo' ? 'Lendo… ' : 'Não deu: '}{a.erro ?? a.url}</p></li>)}
        </ul>
      )}
      <ul className="caderno__lista" data-teste="referencias">
        {lista.length === 0 && <li><p className="aviso">Nenhum estudo de caso ainda.</p></li>}
        {lista.map((r) => (
          <li key={r.id}>
            <p>{r.licao}</p>
            <small><a className="ref-link" href={r.url} target="_blank" rel="noreferrer noopener">{r.autor ?? 'ver vídeo'}</a>{r.titulo ? ` · ${r.titulo.slice(0, 60)}` : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
