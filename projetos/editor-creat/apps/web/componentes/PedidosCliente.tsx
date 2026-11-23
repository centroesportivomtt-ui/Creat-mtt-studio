'use client';
import { useCallback, useEffect, useState } from 'react';
import { dataCurta, type LinkCliente } from '@/lib/cliente';

// Caderno: o que os clientes responderam pelos links de aprovação. Pedido de ajuste fica aqui até o dono resolver;
// só vira regra da casa se o dono reprovar a versão com o motivo dele.
export default function PedidosCliente() {
  const [lista, setLista] = useState<LinkCliente[] | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/motor/v1/clientes', { cache: 'no-store' });
      if (r.ok) setLista((await r.json()).respostas);
    } catch { /* próxima volta */ }
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 20000); return () => clearInterval(t); }, [carregar]);
  if (lista === null) return <p className="aviso">carregando…</p>;
  if (lista.length === 0) return <p className="aviso" data-teste="pedidos-cliente-vazio">Nenhum cliente respondeu ainda. O link sai do botão “Gerar link” na versão entregue.</p>;
  const abertos = lista.filter((l) => l.resposta === 'ajuste' && !l.tratado);
  return (
    <div style={{ display: 'grid', gap: 10 }} data-teste="pedidos-cliente">
      {abertos.length > 0 && <p className="aviso"><strong>{abertos.length}</strong> pedido{abertos.length > 1 ? 's' : ''} de ajuste esperando você.</p>}
      <ul className="caderno__lista" style={{ display: 'grid', gap: 10 }}>
        {lista.map((l) => (
          <li key={l.id} style={{ overflowWrap: 'anywhere' }}>
            <strong>{l.resposta === 'aprovar' ? 'Aprovou' : l.tratado ? 'Ajuste (resolvido)' : 'Pediu ajuste'}</strong>
            {' · '}<a className="link-toque" href={`/projetos/${l.projeto}`}>{l.projeto_nome || l.projeto} {l.versao}</a>
            {' · '}{dataCurta(l.respondido)}{l.nome ? ` · ${l.nome}` : ''}
            {l.texto && <><br />“{l.texto}”</>}
            {l.resposta === 'ajuste' && !l.tratado && (
              <div className="linha-acoes" style={{ marginTop: 6 }}>
                <button className="botao botao--fantasma botao--pequeno" type="button" data-teste="pedido-tratar" onClick={async () => {
                  setErro('');
                  try {
                    const r = await fetch(`/api/motor/v1/clientes/${l.id}/tratar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
                    if (!r.ok) setErro('Não deu para marcar. Tente de novo.'); else carregar();
                  } catch { setErro('Sem conexão. Tente de novo.'); }
                }}>Marcar como resolvido</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  );
}
