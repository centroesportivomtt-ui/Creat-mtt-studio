'use client';
import { useCallback, useEffect, useState } from 'react';
import { dataCurta, type LinkCliente as TLink } from '@/lib/cliente';

const DIAS = [3, 7, 15, 30];

// Na versão entregue: o dono gera um link exclusivo para o cliente aprovar ou pedir ajuste. O link aparece uma vez só
// (o motor guarda só a impressão digital dele); gerar outro desliga o anterior.
export default function LinkCliente({ pid, versao }: { pid: string; versao: string }) {
  const [links, setLinks] = useState<TLink[]>([]);
  const [novo, setNovo] = useState<{ url: string; expira: string } | null>(null);
  const [dias, setDias] = useState(7);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const base = `/api/motor/v1/projetos/${pid}`;

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${base}/links-cliente`, { cache: 'no-store' });
      if (r.ok) setLinks(((await r.json()).links as TLink[]).filter((l) => l.versao === versao));
    } catch { /* próxima volta */ }
  }, [base, versao]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t); }, [carregar]);

  async function postar(url: string, corpo?: unknown) {
    setIndo(true); setErro('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });
      const c = await r.json().catch(() => null);
      if (!r.ok) { setErro(typeof c?.detail === 'string' ? c.detail : 'Não deu certo. Tente de novo.'); return null; }
      return c;
    } catch { setErro('Sem conexão. Tente de novo.'); return null; } finally { setIndo(false); }
  }
  async function gerar() {
    const c = await postar(`${base}/versoes/${versao}/link-cliente`, { dias });
    if (c?.caminho) { setNovo({ url: `${window.location.origin}${c.caminho}`, expira: c.expira }); setCopiado(false); carregar(); }
  }
  async function copiar() {
    if (!novo) return;
    try { await navigator.clipboard.writeText(novo.url); setCopiado(true); } catch { setErro('Não deu para copiar sozinho: toque e segure o link acima para copiar.'); }
  }
  const ativo = links.find((l) => l.ativo);
  const respondidos = links.filter((l) => l.resposta);
  const zap = novo ? `https://wa.me/?text=${encodeURIComponent(`Seu vídeo está pronto para aprovação: ${novo.url}`)}` : '';

  return (
    <div className="link-cliente" data-teste="link-cliente">
      <strong style={{ fontSize: 14 }}>Link para o cliente aprovar</strong>
      {novo && (
        <>
          <p className="link-cliente__url" data-teste="link-cliente-url">{novo.url}</p>
          <p className="aviso">Copie agora: por segurança ele não aparece de novo. Vale até {dataCurta(novo.expira)}.</p>
          <div className="linha-acoes" style={{ marginTop: 0 }}>
            <button className="botao botao--principal botao--pequeno" type="button" onClick={copiar} data-teste="link-cliente-copiar">{copiado ? 'Copiado ✓' : 'Copiar link'}</button>
            <a className="botao botao--fantasma botao--pequeno" href={zap} target="_blank" rel="noopener noreferrer">Mandar no WhatsApp</a>
          </div>
        </>
      )}
      {!novo && ativo && (
        <p className="aviso" data-teste="link-cliente-estado">
          Link ativo até {dataCurta(ativo.expira)} · {ativo.vistas > 0 ? `aberto ${ativo.vistas}× (último ${dataCurta(ativo.visto_em)})` : 'ainda não aberto'}
          {!ativo.resposta && ' · aguardando resposta'}
        </p>
      )}
      {respondidos.map((l) => (
        <p key={l.id} className={l.resposta === 'aprovar' ? 'aprovada' : 'aviso'} data-teste="link-cliente-resposta" style={{ overflowWrap: 'anywhere', margin: 0 }}>
          {l.resposta === 'aprovar' ? `Cliente${l.nome ? ` (${l.nome})` : ''} aprovou em ${dataCurta(l.respondido)}.`
            : `Cliente${l.nome ? ` (${l.nome})` : ''} pediu ajuste em ${dataCurta(l.respondido)}: “${l.texto}”`}
        </p>
      ))}
      {respondidos.some((l) => l.resposta === 'ajuste') && (
        <p className="aviso">Para virar correção, use “Reprovar com motivo” com o que vale para a casa. O pedido do cliente sozinho não vira regra.</p>
      )}
      <div className="linha-acoes" style={{ marginTop: 0, alignItems: 'center' }}>
        <label className="aviso" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Validade
          <select className="entrada" style={{ minHeight: 44, width: 'auto' }} value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Validade do link">
            {DIAS.map((d) => <option key={d} value={d}>{d} dias</option>)}
          </select>
        </label>
        <button className="botao botao--fantasma botao--pequeno" type="button" disabled={indo} onClick={gerar} data-teste="link-cliente-gerar">
          {ativo || novo ? 'Gerar outro (desliga o atual)' : 'Gerar link'}
        </button>
        {ativo && (
          <button className="botao botao--perigo botao--pequeno" type="button" disabled={indo} data-teste="link-cliente-desligar"
            onClick={async () => { if (await postar(`/api/motor/v1/clientes/${ativo.id}/revogar`)) { setNovo(null); carregar(); } }}>Desligar</button>
        )}
      </div>
      {erro && <p className="erro" role="alert" style={{ overflowWrap: 'anywhere' }}>{erro}</p>}
    </div>
  );
}
