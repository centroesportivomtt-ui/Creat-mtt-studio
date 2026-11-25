'use client';
// Regras, conferências e palavras do Caderno (onda 3, seção 10.4): o que nasceu de um ajuste do dono mostra de onde veio
// e tem "Apagar" (com confirmação no próprio item); o que é fixo da casa vem do código e não tem botão, porque voltaria
// no próximo deploy. Apagar não refaz filme nenhum (o motor não enfileira nada).
import { useEffect, useRef, useState } from 'react';
import * as A from '@/lib/acoes';

export type ItemMemoria = A.ItemCaderno & { id: string; texto: string; detalhe?: string; para?: string };
type Props = {
  tipo: A.TipoMemoria; titulo: string; num: string; idSecao: string; itens: ItemMemoria[];
  aviso?: string; irmas?: string[];          // regras: ids das conferências que nasceram junto (mesmo hash)
  vazio?: string; teste: string;
};
const APAGADA: Record<A.TipoMemoria, string> = { regra: 'Regra apagada.', checagem: 'Conferência apagada.', vocabulario: 'Palavra apagada.' };

function deOnde(d?: A.DeOnde): string {
  if (!d) return '';
  return ['De: ' + (d.nome || 'projeto apagado'), d.versao ? d.versao.toUpperCase() : '', A.dataBr(d.data)].filter(Boolean).join(' · ');
}

export default function MemoriaLista({ tipo, titulo, num, idSecao, itens: inicial, aviso, irmas = [], vazio, teste }: Props) {
  const [itens, setItens] = useState(inicial);
  const [abrindo, setAbrindo] = useState<string | null>(null);      // item com a confirmação aberta
  const [indo, setIndo] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [feito, setFeito] = useState('');
  const trava = useRef(false);
  const relogio = useRef<number | null>(null);
  useEffect(() => () => { if (relogio.current) window.clearTimeout(relogio.current); }, []);

  async function apagar(it: ItemMemoria) {
    if (trava.current) return;
    trava.current = true;
    setIndo(it.id);
    setErros((e) => { const n = { ...e }; delete n[it.id]; return n; });
    try {
      const r = await A.apagarMemoria(tipo, it.id);
      if (r.ok) {
        setItens((l) => l.filter((x) => x.id !== it.id));
        setAbrindo(null);
        setFeito(APAGADA[tipo]);
        if (relogio.current) window.clearTimeout(relogio.current);
        relogio.current = window.setTimeout(() => setFeito(''), 6000);
        return;
      }
      if (r.status === 401) { window.location.assign('/entrar'); return; }
      setErros((e) => ({ ...e, [it.id]: r.erro }));
    } finally { trava.current = false; setIndo(null); }
  }

  const doDono = itens.filter((x) => x.apagavel);
  return (
    <section className="cartao" aria-labelledby={idSecao} data-teste={teste}>
      <h2 className="cartao__titulo" id={idSecao}><span className="num">{num}</span> {titulo} ({itens.length})</h2>
      {aviso && doDono.length > 0 && <p className="aviso">{aviso.replace('{n}', String(doDono.length))}</p>}
      <p className="memoria__feito" role="status" data-teste="memoria-feito">{feito}</p>
      {itens.length === 0 && vazio && <p className="aviso">{vazio}</p>}
      <ol className={`caderno__lista memoria${tipo === 'vocabulario' ? ' memoria--voc' : ''}`}>
        {itens.map((x) => (
          <li key={x.id} className="memoria__item" data-teste="memoria-item" data-id={x.id} data-apagavel={x.apagavel ? 'sim' : 'nao'}>
            {tipo === 'vocabulario'
              ? <p className="memoria__voc"><s>{x.texto}</s> → <b>{x.para}</b></p>
              : <p>{x.texto}</p>}
            <small>{x.apagavel ? (deOnde(x.de_onde) || 'Nasceu de um ajuste seu') : `Fixa da casa${x.detalhe ? ` · ${x.detalhe}` : ''}`}</small>
            {x.apagavel && abrindo !== x.id && (
              <button type="button" className="botao botao--perigo botao--pequeno memoria__apagar" onClick={() => { setAbrindo(x.id); setErros({}); }}
                disabled={Boolean(indo)} data-teste="memoria-apagar">
                Apagar
              </button>
            )}
            {x.apagavel && abrindo === x.id && (
              <div className="memoria__confirma" role="group" aria-label={`Apagar: ${x.texto.slice(0, 60)}`} data-teste="memoria-confirma">
                <p>{x.ao_apagar}</p>
                {tipo === 'regra' && irmas.includes(x.id.replace(/^r_dono_/, 'c_dono_')) && (
                  <p className="aviso">A conferência que nasceu junto continua; apague na lista de conferências se quiser.</p>
                )}
                <div className="linha-acoes">
                  <button type="button" className="botao botao--perigo-cheio botao--pequeno" onClick={() => void apagar(x)} disabled={indo === x.id} data-teste="memoria-confirmar">
                    {indo === x.id ? 'Apagando…' : 'Apagar'}
                  </button>
                  <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setAbrindo(null)} disabled={indo === x.id} data-teste="memoria-cancelar">Cancelar</button>
                </div>
              </div>
            )}
            {erros[x.id] && <p className="erro" role="alert" data-teste="memoria-erro">{erros[x.id]}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
