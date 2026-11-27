'use client';
import { useCallback, useEffect, useState } from 'react';

type Licenca = { tipo: string; fonte: string; autor?: string | null; termos_url?: string | null; atribuicao?: string | null };
type Som = { id: string; tipo: string; titulo: string; dur?: number; bpm?: number; clima?: string | null; ativo?: boolean; licenca?: Licenca | null; pode_tocar: boolean; problema?: string | null };
type Lista = { trilhas: Som[]; sfx: Som[]; tipos_licenca: Record<string, string>; nomes_sfx: string[]; andamento: { id: string; titulo: string; estado: string; erro?: string }[] };

const seg = (n?: number) => (typeof n === 'number' ? `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} s` : '');

// Trilhas e efeitos da casa: só toca no filme o que tem licença registrada para uso comercial.
export default function Biblioteca() {
  const [l, setL] = useState<Lista | null>(null);
  const [tipo, setTipo] = useState<'trilha' | 'sfx'>('trilha');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/motor/v1/biblioteca', { cache: 'no-store' });
      if (r.ok) setL(await r.json());
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 6000); return () => clearInterval(t); }, [carregar]);
  const itens = [...(l?.trilhas ?? []), ...(l?.sfx ?? [])].filter((s) => s.ativo !== false);
  return (
    <div className="form" style={{ maxWidth: 'none', gap: 12 }} data-teste="biblioteca">
      <ul className="caderno__lista" data-teste="biblioteca-lista">
        {itens.length === 0 && <li><p className="aviso">Nenhuma trilha ou efeito registrado ainda. Sem trilha da casa, o filme sai sem música; sem efeito, o editor usa um som sintético simples.</p></li>}
        {itens.map((s) => (
          <li key={`${s.tipo}-${s.id}`}>
            <p>{s.tipo === 'trilha' ? 'Trilha' : 'Efeito'} · <strong>{s.titulo}</strong>{s.tipo === 'sfx' ? ` (${s.id})` : ''} · {seg(s.dur)}{s.bpm ? ` · ${Math.round(s.bpm)} BPM` : ''}{s.clima ? ` · ${s.clima}` : ''}</p>
            <small>
              {s.pode_tocar ? '✓ pode tocar' : `✕ não toca: ${s.problema ?? 'áudio não encontrado'}`}
              {s.licenca ? ` · ${l?.tipos_licenca[s.licenca.tipo] ?? s.licenca.tipo} · ${s.licenca.fonte}` : ''}
              {s.licenca?.termos_url ? <> · <a className="ref-link" href={s.licenca.termos_url} target="_blank" rel="noreferrer noopener">termos</a></> : null}
            </small>
          </li>
        ))}
        {(l?.andamento ?? []).map((a) => <li key={a.id}><p>{a.estado === 'erro' ? `Não entrou «${a.titulo}»: ${a.erro}` : `Entrando: ${a.titulo}…`}</p></li>)}
      </ul>
      <form className="form" style={{ maxWidth: 'none', gap: 8 }} data-teste="form-biblioteca" onSubmit={async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const f = new FormData(form);
        const s = (k: string) => String(f.get(k) ?? '').trim();
        if (f.get('uso_comercial') !== 'on') { setErro('Só entra som que pode ser usado em vídeo de cliente e anúncio. Confirme a licença.'); return; }
        const corpo = {
          url: s('url'), tipo, titulo: s('titulo'), ...(tipo === 'sfx' ? { nome: s('nome') } : { clima: s('clima') || undefined }),
          licenca: { tipo: s('lic_tipo'), fonte: s('fonte'), autor: s('autor') || undefined, termos_url: s('termos') || undefined, uso_comercial: true },
        };
        setIndo(true); setErro('');
        try {
          const r = await fetch('/api/motor/v1/biblioteca', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
          const c = await r.json().catch(() => null);
          if (!r.ok) setErro(typeof c?.detail === 'string' ? c.detail : 'Confira os campos: link do Dropbox ou Drive, título, fonte e, no efeito, o nome.');
          else form.reset();
        } catch { setErro('Sem conexão. Tente de novo.'); }
        setIndo(false); carregar();
      }}>
        <fieldset className="campo" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="campo__rotulo">O que é?</legend>
          <div className="opcoes">
            <label className="opcao"><input type="radio" name="tipo" checked={tipo === 'trilha'} onChange={() => setTipo('trilha')} /><span>Trilha</span></label>
            <label className="opcao"><input type="radio" name="tipo" checked={tipo === 'sfx'} onChange={() => setTipo('sfx')} data-teste="bib-sfx" /><span>Efeito sonoro</span></label>
          </div>
        </fieldset>
        <label className="campo">
          <span className="campo__rotulo">Link do arquivo (Dropbox ou Drive, "qualquer pessoa com o link")</span>
          <input className="entrada" name="url" type="url" required maxLength={500} placeholder="https://www.dropbox.com/scl/fi/..." autoComplete="off" />
        </label>
        <label className="campo">
          <span className="campo__rotulo">Título</span>
          <input className="entrada" name="titulo" required minLength={2} maxLength={80} placeholder={tipo === 'trilha' ? 'Ex.: Mercado em festa' : 'Ex.: Pancada grave'} />
        </label>
        {tipo === 'sfx' ? (
          <label className="campo">
            <span className="campo__rotulo">Em que momento o editor usa este efeito?</span>
            <select className="entrada" name="nome" required defaultValue="">
              <option value="" disabled>Escolha</option>
              {(l?.nomes_sfx ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : (
          <label className="campo">
            <span className="campo__rotulo">Clima (opcional)</span>
            <input className="entrada" name="clima" maxLength={40} placeholder="Ex.: animado, emocionante, institucional" />
          </label>
        )}
        <label className="campo">
          <span className="campo__rotulo">Licença</span>
          <select className="entrada" name="lic_tipo" required defaultValue="comprada">
            {Object.entries(l?.tipos_licenca ?? { comprada: 'biblioteca paga' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="campo__rotulo">De onde veio (fonte)</span>
          <input className="entrada" name="fonte" required minLength={2} maxLength={120} placeholder="Ex.: Artlist, ElevenLabs Music, gravado na creat" />
        </label>
        <label className="campo">
          <span className="campo__rotulo">Autor (opcional)</span>
          <input className="entrada" name="autor" maxLength={120} />
        </label>
        <label className="campo">
          <span className="campo__rotulo">Link dos termos da licença (opcional)</span>
          <input className="entrada" name="termos" type="url" maxLength={300} placeholder="https://..." />
        </label>
        <div className="opcoes">
          <label className="opcao">
            <input type="checkbox" name="uso_comercial" data-teste="bib-comercial" />
            <span>Confirmo: a creat.MTT pode usar este som em vídeo de cliente e em anúncio</span>
          </label>
        </div>
        {erro && <p className="erro" role="alert" style={{ overflowWrap: 'anywhere' }}>{erro}</p>}
        <button className="botao botao--principal" type="submit" disabled={indo} data-teste="bib-enviar">{indo ? 'Mandando…' : 'Registrar na biblioteca'}</button>
      </form>
    </div>
  );
}
