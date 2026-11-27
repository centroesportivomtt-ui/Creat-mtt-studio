import Link from 'next/link';
import { motorJson } from '@/lib/motor';
import Referencias from '@/componentes/Referencias';
import MemoriaLista, { type ItemMemoria } from '@/componentes/MemoriaLista';
import type { ItemCaderno } from '@/lib/acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Caderno da casa' };

// onda 3 (R19): cada item ganha, opcionais, apagavel, de_onde e ao_apagar; o vocabulário ganha id
type Regra = ItemCaderno & { id: string; texto: string; origem?: string; data?: string; tipos?: string[] | null };
type Checagem = ItemCaderno & { id: string; descricao: string; origem?: string; gravidade?: string };
type Palavra = ItemCaderno & { de: string; para: string };
type Modo = { id: string; nome: string; descricao: string; sem_transicoes?: string[]; zoom_max?: number };
const NOME_FX: Record<string, string> = { whip: 'chicote', aba71: 'Aba 71', impacto: 'impacto', flash: 'flash', mascara: 'máscara' };
type Look = { id: string; nome: string; desc: string };
type Memoria = { regras: Regra[]; checagens: Checagem[]; vocabulario: Palavra[]; modos?: Modo[]; looks?: Look[] };

// O que o editor sabe: as regras que o dono ensinou (cada reprovação vira uma), o que ele confere antes de entregar e os modos de edição.
export default async function Caderno() {
  const r = await motorJson<Memoria>('/v1/memoria');
  if (!r.ok) return <main className="pagina"><p className="erro" role="alert">Não deu para abrir o caderno: {r.erro}.</p></main>;
  const { regras, checagens, vocabulario, modos = [], looks = [] } = r.dados;
  // do dono primeiro (as que dá para apagar), depois as fixas da casa
  const dono = (x: { apagavel?: boolean; id?: string }) => x.apagavel ?? Boolean(x.id?.startsWith('r_dono_'));
  const listaRegras: ItemMemoria[] = [...regras.filter(dono), ...regras.filter((x) => !dono(x))].map((x) => ({
    ...x, apagavel: dono(x), detalhe: `${x.origem ?? 'casa'}${x.tipos && x.tipos.length ? ` · vale para ${x.tipos.join(', ')}` : ''}`,
  }));
  const gravidade = (g?: string) => (g === 'bloqueia' ? 'segura a entrega' : g === 'observacao' ? 'em observação: por enquanto só avisa' : 'avisa');
  const listaChecagens: ItemMemoria[] = checagens.map((c) => ({
    ...c, texto: c.descricao, apagavel: Boolean(c.apagavel), detalhe: `${gravidade(c.gravidade)} · ${c.origem ?? 'casa'}`,
  }));
  const listaPalavras: ItemMemoria[] = vocabulario.map((v) => ({ ...v, id: v.id ?? `v-${v.de}`, texto: v.de, para: v.para, apagavel: Boolean(v.apagavel && v.id), detalhe: v.origem }));
  return (
    <main className="pagina caderno">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Treinamento do editor</p>
          <h1 className="titulo">Caderno da casa</h1>
          <p className="aviso" style={{ maxWidth: '62ch', marginTop: 8 }}>Tudo o que o editor segue ao montar um filme. Quando você pede um ajuste que vale como regra, ele entra aqui e passa a valer nas próximas peças. Você pode apagar as que nasceram dos seus ajustes.</p>
        </div>
      </div>

      {/* onda 4: índice no topo; clientes, trilhas e sistema viraram telas próprias (a página tinha 11 telas de rolagem) */}
      <nav className="indice" aria-label="Nesta página">
        <a href="#c-regras">Regras · {regras.length}</a>
        <a href="#c-checa">Conferências · {checagens.length}</a>
        {listaPalavras.length > 0 && <a href="#c-voc">Palavras · {listaPalavras.length}</a>}
        <a href="#c-modos">Modos · {modos.length}</a>
        {looks.length > 0 && <a href="#c-cor">Cor · {looks.length}</a>}
        <a href="#c-refs">Estudos de caso</a>
      </nav>
      <nav className="indice indice--outras" aria-label="Outras telas">
        <Link href="/clientes">Clientes e marcas</Link>
        <Link href="/biblioteca">Trilhas e efeitos</Link>
        <Link href="/sistema">Sistema e backup</Link>
      </nav>


      <MemoriaLista tipo="regra" num="03" titulo="Regras" idSecao="c-regras" teste="caderno-regras" itens={listaRegras}
        aviso="Aprendidas com os seus ajustes: {n}." irmas={checagens.map((c) => c.id)} />

      <MemoriaLista tipo="checagem" num="04" titulo="O que ele confere antes de entregar" idSecao="c-checa" teste="caderno-checagens" itens={listaChecagens} />

      {listaPalavras.length > 0 && (
        <MemoriaLista tipo="vocabulario" num="05" titulo="Palavras que a transcrição erra" idSecao="c-voc" teste="caderno-vocabulario" itens={listaPalavras} />
      )}

      <section className="cartao" aria-labelledby="c-modos">
        <details className="recolhido">
        <summary className="recolhido__linha"><h2 className="cartao__titulo" id="c-modos">Modos de edição</h2><span className="recolhido__resumo">{modos.length} modos</span><span className="recolhido__ver" aria-hidden="true">ver</span></summary>
        <ul className="caderno__grade" data-teste="caderno-modos">
          {modos.map((m) => (
            <li key={m.id} className="caderno__modo">
              <strong>{m.nome}</strong>
              <span>{m.descricao}</span>
              {m.sem_transicoes && m.sem_transicoes.length > 0 && <small>Não usa: {m.sem_transicoes.map((t) => NOME_FX[t] ?? t).join(', ')}</small>}
            </li>
          ))}
        </ul>
        </details>
      </section>

      {looks.length > 0 && (
        <section className="cartao" aria-labelledby="c-cor">
          <details className="recolhido">
          <summary className="recolhido__linha"><h2 className="cartao__titulo" id="c-cor">Cor por ambiente</h2><span className="recolhido__resumo">{looks.length} looks</span><span className="recolhido__ver" aria-hidden="true">ver</span></summary>
          <p className="aviso" style={{ maxWidth: '62ch' }}>Cada cena é medida (luz, branco e tom de pele) e ganha o look do lugar onde foi gravada. A pele fica protegida. Na versão, você vê o antes e o depois de cada plano.</p>
          <ul className="caderno__grade" data-teste="caderno-looks">
            {looks.map((l) => (
              <li key={l.id} className="caderno__modo">
                <strong>{l.nome}</strong>
                <span>{l.desc}</span>
              </li>
            ))}
          </ul>
          </details>
        </section>
      )}

      <section className="cartao" aria-labelledby="c-refs">
        <h2 className="cartao__titulo" id="c-refs"><span className="num">02</span> Estudos de caso</h2>
        <p className="aviso">Cole o link de um Reel que você admira. O editor mede o ritmo e o gancho e usa como referência nos próximos filmes.</p>
        <Referencias />
      </section>

    </main>
  );
}
