'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type Publico = {
  titulo: string; versao: string; expira: string; resposta: 'aprovar' | 'ajuste' | null; texto: string | null;
  respondido: string | null; pode_responder: boolean; capa?: boolean;
};
// fuso fixo: o servidor (UTC) e o celular do cliente (Brasil) escrevem a mesma data, sem erro de hidratação
const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });

// O cliente assiste e responde uma vez: aprova (com confirmação) ou pede ajuste em poucas palavras.
export default function AprovacaoCliente({ token, inicial }: { token: string; inicial: Publico }) {
  const [p, setP] = useState(inicial);
  const [modo, setModo] = useState<'botoes' | 'confirmar' | 'ajuste'>('botoes');
  const [texto, setTexto] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [semVideo, setSemVideo] = useState(false);
  const router = useRouter();

  async function enviar(acao: 'aprovar' | 'ajuste') {
    setIndo(true); setErro('');
    try {
      const r = await fetch(`/api/cliente/${token}/responder`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao, texto: acao === 'ajuste' ? texto.trim() : undefined, nome: nome.trim() || undefined }),
      });
      const c = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(typeof c?.detail === 'string' ? c.detail : 'Não deu certo. Tente de novo.');
        if (r.status === 409 || r.status === 410 || r.status === 429) router.refresh();   // já respondido ou fechado: a página se atualiza
        return;
      }
      setP({ ...p, resposta: acao, texto: acao === 'ajuste' ? texto.trim() : null, respondido: c?.respondido ?? new Date().toISOString(), pode_responder: false });
    } catch {
      setErro('Sem conexão. Tente de novo.');
    } finally { setIndo(false); }
  }

  return (
    <div className="cliente__corpo" data-teste="cliente">
      {/* onda 5: o vídeo começa perto do topo (até 120 px); o título fica menor, logo abaixo dele */}
      <p className="sobretitulo cliente__para" style={{ margin: 0 }}>Para sua aprovação · versão {p.versao.replace(/^v/, '')}</p>
      <video className="player" controls playsInline preload="metadata" data-teste="cliente-player"
        src={`/api/cliente/${token}/video#t=0.1`} poster={p.capa ? `/api/cliente/${token}/capa` : undefined} aria-label={`Vídeo ${p.titulo}`} onError={() => setSemVideo(true)} />
      <h1 className="cliente__titulo" style={{ overflowWrap: 'anywhere' }}>{p.titulo}</h1>
      {semVideo && <p className="aviso" role="alert">O vídeo não carregou. Recarregue a página; se continuar, este link pode ter sido fechado: peça um novo a quem te mandou.</p>}

      {p.resposta === 'aprovar' && (
        <p className="aprovada cliente__resposta" data-teste="cliente-aprovado" role="status"><span className="claquete claquete--bateu" aria-hidden="true" />Aprovado! Sua resposta foi registrada e a equipe da creat.MTT vê no painel.</p>
      )}
      {p.resposta === 'ajuste' && (
        <div className="cliente__resposta" data-teste="cliente-ajuste-enviado" role="status">
          <p className="aprovada" style={{ color: 'var(--cor-ambar-tinta)' }}>Pedido de ajuste registrado. A equipe da creat.MTT vê no painel.</p>
          {p.texto && <p className="aviso" style={{ overflowWrap: 'anywhere' }}>“{p.texto}”</p>}
        </div>
      )}

      {!p.resposta && p.pode_responder && modo === 'botoes' && (
        <div className="cliente__botoes">
          <button className="botao botao--ok" type="button" data-teste="cliente-aprovar" onClick={() => setModo('confirmar')}>
            <span className="claquete" aria-hidden="true" />Aprovar
          </button>
          <button className="botao botao--fantasma" type="button" data-teste="cliente-pedir" onClick={() => setModo('ajuste')}>Pedir ajuste</button>
        </div>
      )}
      {!p.resposta && p.pode_responder && modo === 'confirmar' && (
        <div className="form" style={{ maxWidth: 'none', gap: 10 }}>
          <p>Aprovar esta versão como está? Sua resposta vai direto para o painel da creat.MTT.</p>
          <label className="campo">
            <span className="campo__rotulo">Seu nome (opcional)</span>
            <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" aria-describedby="uso-nome" />
          </label>
          <div className="cliente__botoes">
            <button className="botao botao--ok" type="button" disabled={indo} data-teste="cliente-confirmar" onClick={() => enviar('aprovar')}>
              <span className={`claquete${indo ? ' claquete--bateu' : ''}`} aria-hidden="true" />{indo ? 'Enviando…' : 'Sim, aprovar'}
            </button>
            <button className="botao botao--fantasma" type="button" disabled={indo} onClick={() => setModo('botoes')}>Voltar</button>
          </div>
        </div>
      )}
      {!p.resposta && p.pode_responder && modo === 'ajuste' && (
        <form className="form" style={{ maxWidth: 'none', gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (texto.trim().length >= 3) enviar('ajuste'); }}>
          <label className="campo">
            <span className="campo__rotulo">O que você quer ajustar?</span>
            <textarea className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} minLength={3} maxLength={600} required rows={4}
              placeholder="Ex.: trocar a música do final e mostrar o preço por mais tempo" data-teste="cliente-texto" />
          </label>
          <label className="campo">
            <span className="campo__rotulo">Seu nome (opcional)</span>
            <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" aria-describedby="uso-nome" />
          </label>
          <div className="cliente__botoes">
            <button className="botao botao--principal" type="submit" disabled={indo || texto.trim().length < 3} data-teste="cliente-enviar">{indo ? 'Enviando…' : 'Enviar pedido'}</button>
            <button className="botao botao--fantasma" type="button" disabled={indo} onClick={() => setModo('botoes')}>Voltar</button>
          </div>
        </form>
      )}
      {!p.resposta && !p.pode_responder && <p className="aviso">Este link não aceita mais respostas. Fale com quem te mandou.</p>}
      {erro && <p className="erro" role="alert" style={{ overflowWrap: 'anywhere' }}>{erro}</p>}
      {!p.resposta && modo !== 'botoes' && <p className="aviso cliente__validade" id="uso-nome">Seu nome e sua resposta ficam só com a equipe da creat.MTT, para saber quem respondeu.</p>}
      {!p.resposta && <p className="aviso cliente__validade">Link válido até {data(p.expira)}. Não repasse: quem tem este link consegue ver e responder.</p>}
    </div>
  );
}
