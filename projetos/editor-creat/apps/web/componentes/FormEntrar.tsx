'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { voltaSegura } from '@/lib/volta';

export default function FormEntrar({ volta = '/projetos' }: { volta?: string }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mostrar, setMostrar] = useState(false);   // onda 5: "mostrar senha" (digitar às cegas é o erro mais comum no celular)
  // Antes de o JavaScript da página carregar (4G lento), tocar em Entrar faria o envio comum do navegador, com a senha no
  // endereço. O botão só acende depois de a página estar pronta; e o form é POST, para nunca pôr a senha na URL.
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const senha = String(new FormData(e.currentTarget).get('senha') ?? '');
    if (!senha) { setErro('Digite a senha.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch('/api/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha }) });
      if (r.ok) { await correrRelogio(); window.location.assign(voltaSegura(volta)); return; }
      const c = await r.json().catch(() => null);
      setErro(c?.erro ?? 'Não deu para entrar agora. Tente de novo.');
    } catch {
      setErro('Sem conexão com o site. Confira a internet e tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <form className="entrar__form" method="post" onSubmit={entrar} noValidate data-pronto={pronto ? 'sim' : undefined}>
      <input type="text" name="usuario" autoComplete="username" value="creat.MTT" readOnly hidden />
      <div className="campo">
        <label className="campo__rotulo" htmlFor="campo-senha">Senha da casa</label>
        <span className="senha">
          <input className="entrada" id="campo-senha" name="senha" type={mostrar ? 'text' : 'password'} autoComplete="current-password" required
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
            aria-invalid={erro ? true : undefined} aria-describedby={erro ? 'erro-senha' : undefined} />
          <button type="button" className="senha__olho" aria-pressed={mostrar} aria-label="Mostrar a senha"
            data-teste="mostrar-senha" onClick={() => setMostrar((m) => !m)}>
            {mostrar ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}
          </button>
        </span>
      </div>
      {erro && <p className="erro" id="erro-senha" role="alert">{erro}</p>}
      <button className="botao botao--principal botao--largo" type="submit" disabled={enviando || !pronto}>
        {enviando ? 'Conferindo…' : 'Entrar'}
      </button>
    </form>
  );
}

// Senha aceita: o timecode da tela corre 1 segundo enquanto a próxima tela carrega (um gesto, nada com movimento reduzido).
function correrRelogio(): Promise<void> {
  const el = document.querySelector<HTMLElement>('.entrar__tc');
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  el.dataset.correndo = 'sim';
  const t0 = performance.now();
  const passo = (t: number) => {
    const ms = Math.min(1000, t - t0);
    const quadro = Math.floor((ms / 1000) * 30);
    el.textContent = `00:00:${ms >= 1000 ? '01:00' : `00:${String(quadro).padStart(2, '0')}`} / 30:00`;
    if (ms < 1000) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return new Promise((r) => setTimeout(r, 1000));
}
