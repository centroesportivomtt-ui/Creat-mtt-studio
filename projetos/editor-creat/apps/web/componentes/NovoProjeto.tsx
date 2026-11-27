'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIPOS_VIDEO } from '@/lib/estados';

export default function NovoProjeto() {
  const router = useRouter();
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  // antes de a página ficar pronta, o toque faria o envio comum do navegador (recarrega e perde o nome digitado)
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get('nome') ?? '').trim();
    if (!nome) { setErro('Dê um nome ao projeto (ex.: Bastidor Mesa de Negócios).'); return; }
    setCriando(true); setErro('');
    try {
      const r = await fetch('/api/motor/v1/projetos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome, tipo_video: f.get('tipo') ?? 'auto' }),
      });
      const c = await r.json().catch(() => null);
      if (r.ok && c?.id) { router.push(`/projetos/${c.id}`); return; }
      setErro(typeof c?.detail === 'string' ? c.detail : 'Não deu para criar agora. Tente de novo.');
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    }
    setCriando(false);
  }

  return (
    <form className="form" method="post" onSubmit={criar} noValidate data-pronto={pronto ? 'sim' : undefined}>
      <label className="campo">
        <span className="campo__rotulo">Nome do projeto</span>
        <input className="entrada" name="nome" maxLength={120} placeholder="Ex.: Bastidor Mesa de Negócios" autoComplete="off" required />
      </label>
      <fieldset className="campo" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="campo__rotulo" style={{ marginBottom: 8 }}>Tipo de vídeo</legend>
        <div className="opcoes">
          {TIPOS_VIDEO.map((t, i) => (
            <label className="opcao" key={t.valor}>
              <input type="radio" name="tipo" value={t.valor} defaultChecked={i === 0} />
              <span>{t.rotulo}</span>
            </label>
          ))}
        </div>
        <p className="aviso" style={{ marginTop: 8 }}>Na dúvida, deixe o editor decidir: ele lê o material e escolhe.</p>
      </fieldset>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <button className="botao botao--principal" type="submit" disabled={criando || !pronto}>{criando ? 'Criando…' : 'Criar e subir material'}</button>
    </form>
  );
}
