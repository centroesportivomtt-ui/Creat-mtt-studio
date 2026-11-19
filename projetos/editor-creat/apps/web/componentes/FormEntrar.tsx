'use client';
import { useState } from 'react';

// modo 'senha': senha única da casa. modo 'supabase': e-mail + senha (conta do Supabase liberada na lista do site).
export default function FormEntrar({ modo = 'senha' }: { modo?: 'senha' | 'supabase' }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const comEmail = modo === 'supabase';

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const senha = String(dados.get('senha') ?? '');
    const email = String(dados.get('email') ?? '').trim();
    if (comEmail && !email) { setErro('Digite o e-mail.'); return; }
    if (!senha) { setErro('Digite a senha.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch('/api/entrar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(comEmail ? { email, senha } : { senha }),
      });
      if (r.ok) { window.location.assign('/projetos'); return; }
      const c = await r.json().catch(() => null);
      setErro(c?.erro ?? 'Não deu para entrar agora. Tente de novo.');
    } catch {
      setErro('Sem conexão com o site. Confira a internet e tente de novo.');
    }
    setEnviando(false);
  }

  const descreve = erro ? 'erro-entrar' : undefined;
  return (
    <form className="entrar__form" onSubmit={entrar} noValidate>
      {comEmail ? (
        <label className="campo">
          <span className="campo__rotulo">E-mail</span>
          <input className="entrada" name="email" type="email" inputMode="email" autoComplete="username" required
            autoCapitalize="none" spellCheck={false} aria-invalid={erro ? true : undefined} aria-describedby={descreve} />
        </label>
      ) : (
        <input type="text" name="usuario" autoComplete="username" value="creat.MTT" readOnly hidden />
      )}
      <label className="campo">
        <span className="campo__rotulo">{comEmail ? 'Senha' : 'Senha da casa'}</span>
        <input className="entrada" name="senha" type="password" autoComplete="current-password" required
          aria-invalid={erro ? true : undefined} aria-describedby={descreve} />
      </label>
      {erro && <p className="erro" id="erro-entrar" role="alert">{erro}</p>}
      <button className="botao botao--principal botao--largo" type="submit" disabled={enviando}>
        {enviando ? 'Conferindo…' : 'Entrar'}
      </button>
    </form>
  );
}
