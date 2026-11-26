'use client';
// Clientes e marcas (onda 4, item 5): a logo de cada cliente e as poses do mascote. Com a logo cadastrada, o fecho do filme
// daquele cliente assina com ela sozinho (o diretor não precisa lembrar). A imagem é conferida e regravada pelo motor;
// a logo nunca vai para o git. Cada ficha mostra a logo num fundo xadrez, como no arquivo de design: dá para ver se o fundo
// é transparente de verdade antes de ela entrar no filme.
import { useCallback, useEffect, useRef, useState } from 'react';
import { nomeCliente } from '@/lib/estados';

export type Marca = { slug: string; nome: string; logo: boolean; atualizado: string | null; mascote: string[];
  medidas?: { w: number | null; h: number | null; alfa: boolean | null } | null };
export type ListaMarcas = { marcas: Marca[]; fixos: string[] };

const POSES: { id: string; rotulo: string }[] = [
  { id: 'espiada', rotulo: 'Espiada' }, { id: 'placa', rotulo: 'Com a placa' }, { id: 'aceno', rotulo: 'Acenando' },
  { id: 'moto', rotulo: 'De moto' }, { id: 'carro', rotulo: 'De carro' },
];
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITE = 8 * 1024 * 1024;

/** Mesma regra do motor e da página de entregas: "Super Kal" e "super_kal" viram "super-kal". */
export function slugCliente(t: string): string {
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

export async function lerMarcas(): Promise<ListaMarcas | null> {
  try {
    const r = await fetch('/api/motor/v1/marcas', { cache: 'no-store' });
    return r.ok ? ((await r.json()) as ListaMarcas) : null;
  } catch { return null; }
}

type Recado = { tipo: 'ok' | 'erro'; texto: string } | null;

export default function Marcas() {
  const [l, setL] = useState<ListaMarcas | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [novo, setNovo] = useState('');
  const [erroNovo, setErroNovo] = useState('');
  const carregar = useCallback(async () => {
    const c = await lerMarcas();
    if (c) { setL(c); setFalhou(false); } else setFalhou(true);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const cadastradas = new Map((l?.marcas ?? []).map((m) => [m.slug, m]));
  const slugs = [...new Set([...(l?.marcas ?? []).map((m) => m.slug), ...(l?.fixos ?? []), ...extras])];
  return (
    <div className="marcas" data-teste="marcas">
      {falhou && !l && <p className="erro" role="alert">Não deu para ler as marcas agora. Recarregue a página.</p>}
      {!l && !falhou && <p className="aviso" aria-busy="true">Lendo as marcas…</p>}
      {l && (
        <ul className="marcas__lista">
          {slugs.map((s) => <FichaMarca key={s} slug={s} m={cadastradas.get(s) ?? null} aoMudar={carregar} />)}
        </ul>
      )}
      <form className="marcas__novo" onSubmit={(e) => {
        e.preventDefault();
        const s = slugCliente(novo);
        if (!s) { setErroNovo('Escreva o nome do cliente com letras ou números.'); return; }
        setErroNovo('');
        setExtras((x) => (x.includes(s) || slugs.includes(s) ? x : [...x, s]));
        setNovo('');
        window.setTimeout(() => document.querySelector<HTMLElement>(`[data-teste=marca-${s}] [data-teste=marca-enviar] input`)?.focus(), 40);
      }}>
        <label className="campo">
          <span className="campo__rotulo">Outro cliente</span>
          <input className="entrada" value={novo} onChange={(e) => setNovo(e.currentTarget.value)} maxLength={60} placeholder="Ex.: Padaria Pão Quente"
            autoComplete="off" data-teste="marca-novo" />
        </label>
        <button className="botao botao--secundario" type="submit" data-teste="marca-novo-ok">Abrir a ficha</button>
        {erroNovo && <p className="erro" role="alert">{erroNovo}</p>}
      </form>
    </div>
  );
}

function FichaMarca({ slug, m, aoMudar }: { slug: string; m: Marca | null; aoMudar: () => Promise<void> }) {
  const [recado, setRecado] = useState<Recado>(null);
  const [indo, setIndo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const voltaFoco = useRef<HTMLButtonElement>(null);
  const nome = nomeCliente(slug, m?.nome);
  const versao = encodeURIComponent(m?.atualizado ?? '0');

  async function enviar(alvo: string, f: File | undefined, rotulo: string) {
    if (!f) return;
    if (!TIPOS.includes(f.type)) { setRecado({ tipo: 'erro', texto: 'Mande a imagem em PNG, JPEG ou WEBP (de preferência PNG com fundo transparente).' }); return; }
    if (f.size > LIMITE) { setRecado({ tipo: 'erro', texto: 'A imagem passa de 8 MB. Exporte menor e mande de novo.' }); return; }
    setIndo(alvo); setRecado(null);
    try {
      const r = await fetch(`/api/motor/v1/marcas/${slug}/${alvo}`, { method: 'POST', headers: { 'content-type': f.type }, body: f });
      const c = await r.json().catch(() => null);
      if (r.status === 401) setRecado({ tipo: 'erro', texto: 'A sessão venceu. Entre com a senha de novo.' });
      else if (!r.ok) setRecado({ tipo: 'erro', texto: `Não entrou: ${typeof c?.detail === 'string' ? c.detail : `erro ${r.status}`}.` });
      else {
        setRecado({ tipo: 'ok', texto: `${rotulo} de ${nome} cadastrada (${c.w} × ${c.h} px${c.alfa ? ', fundo transparente' : ', fundo cheio'}).` });
        await aoMudar();
      }
    } catch { setRecado({ tipo: 'erro', texto: 'Sem conexão. Tente de novo.' }); }
    setIndo(null);
  }
  async function apagar(alvo: string, rotulo: string) {
    setIndo(alvo); setRecado(null);
    try {
      const r = await fetch(`/api/motor/v1/marcas/${slug}/${alvo}/apagar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!r.ok) setRecado({ tipo: 'erro', texto: `Não apaguei agora (erro ${r.status}). Tente de novo.` });
      else { setRecado({ tipo: 'ok', texto: `${rotulo} de ${nome} apagada. Os próximos filmes saem com a marca da creat.MTT no fecho.` }); await aoMudar(); }
    } catch { setRecado({ tipo: 'erro', texto: 'Sem conexão. Tente de novo.' }); }
    setIndo(null); setConfirmar(false);
    window.setTimeout(() => voltaFoco.current?.focus(), 30);
  }
  const med = m?.medidas;
  return (
    <li className="marca" data-teste={`marca-${slug}`} data-logo={m?.logo ? 'sim' : 'nao'}>
      <div className="marca__xadrez">
        {m?.logo
          ? <img src={`/api/motor/v1/marcas/${slug}/logo?v=${versao}`} alt={`Logo de ${nome}`} width={96} height={96} data-teste="marca-previa" />
          : <span aria-hidden="true">{nome.slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="marca__corpo">
        <p className="marca__nome">{nome}</p>
        <p className="marca__estado">
          {m?.logo
            ? <>Logo cadastrada{med?.w ? ` · ${med.w} × ${med.h} px` : ''}{med?.alfa === true ? ' · fundo transparente' : med?.alfa === false ? ' · fundo cheio' : ''}. O fecho dos filmes de {nome} assina com ela.</>
            : slug === 'creat-mtt' ? <>A marca da casa: sem cliente no pedido, o fecho já assina com a creat.MTT.</>
              : <>Sem logo: o fecho dos filmes de {nome} sai com a marca da creat.MTT.</>}
        </p>
        <div className="marca__acoes">
          <label className="botao botao--secundario botao--pequeno marca__arquivo" data-teste="marca-enviar" aria-busy={indo === 'logo'}>
            {indo === 'logo' ? 'Conferindo a imagem…' : m?.logo ? 'Trocar a logo' : 'Enviar a logo'}
            <input className="so-leitor" type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(indo)}
              onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void enviar('logo', f, 'Logo'); }} />
          </label>
          {m?.logo && !confirmar && (
            <button ref={voltaFoco} type="button" className="botao botao--perigo botao--pequeno" disabled={Boolean(indo)} data-teste="marca-apagar"
              onClick={() => setConfirmar(true)}>Apagar a logo</button>
          )}
          {m?.logo && confirmar && (
            <span className="marca__confirmar" role="group" aria-label="Confirmar apagar a logo">
              <button type="button" className="botao botao--perigo-cheio botao--pequeno" disabled={Boolean(indo)} data-teste="marca-apagar-sim"
                onClick={() => void apagar('logo', 'Logo')}>Apagar mesmo</button>
              <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setConfirmar(false)}>Manter</button>
            </span>
          )}
        </div>
        {recado && <p className={recado.tipo === 'erro' ? 'erro' : 'marca__ok'} role={recado.tipo === 'erro' ? 'alert' : 'status'} data-teste="marca-recado">{recado.texto}</p>}
        <details className="marca__mascote">
          <summary>Mascote · {m?.mascote.length ?? 0} de {POSES.length} poses</summary>
          <p className="aviso">PNG com fundo transparente, a arte aprovada de cada pose. O editor nunca redesenha o mascote.</p>
          <ul className="marca__poses">
            {POSES.map((p) => {
              const tem = Boolean(m?.mascote.includes(p.id));
              return (
                <li key={p.id} className="marca__pose" data-pose={p.id}>
                  <div className="marca__xadrez marca__xadrez--pequeno">
                    {tem ? <img src={`/api/motor/v1/marcas/${slug}/mascote/${p.id}?v=${versao}`} alt={`Mascote de ${nome}: ${p.rotulo.toLowerCase()}`} width={64} height={64} loading="lazy" />
                      : <span aria-hidden="true">—</span>}
                  </div>
                  <span>{p.rotulo}</span>
                  <label className="botao botao--fantasma botao--pequeno marca__arquivo" aria-busy={indo === `mascote/${p.id}`}>
                    {indo === `mascote/${p.id}` ? 'Conferindo…' : tem ? 'Trocar' : 'Enviar'}
                    <span className="so-leitor"> a pose {p.rotulo.toLowerCase()}</span>
                    <input className="so-leitor" type="file" accept="image/png,image/webp" disabled={Boolean(indo)}
                      onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void enviar(`mascote/${p.id}`, f, `Pose “${p.rotulo}”`); }} />
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </li>
  );
}
