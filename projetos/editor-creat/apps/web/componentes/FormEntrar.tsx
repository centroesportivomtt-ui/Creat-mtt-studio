'use client';
import { useState } from 'react';

export default function FormEntrar() {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const senha = String(new FormData(e.currentTarget).get('senha') ?? '');
    if (!senha) { setErro('Digite a senha.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch('/api/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha }) });
      if (r.ok) { window.location.assign('/projetos'); return; }
      const c = await r.json().catch(() => null);
      setErro(c?.erro ?? 'Não deu para entrar agora. Tente de novo.');
    } catch {
      setErro('Sem conexão com o site. Confira a internet e tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <form className="entrar__form" onSubmit={entrar} noValidate>
      <input type="text" name="usuario" autoComplete="username" value="creat.MTT" readOnly hidden />
      <label className="campo">
        <span className="campo__rotulo">Senha da casa</span>
        <input className="entrada" name="senha" type="password" autoComplete="current-password" required
          aria-invalid={erro ? true : undefined} aria-describedby={erro ? 'erro-senha' : undefined} />
      </label>
      {erro && <p className="erro" id="erro-senha" role="alert">{erro}</p>}
      <button className="botao botao--principal botao--largo" type="submit" disabled={enviando}>
        {enviando ? 'Conferindo…' : 'Entrar'}
      </button>
    </form>
  );
}
