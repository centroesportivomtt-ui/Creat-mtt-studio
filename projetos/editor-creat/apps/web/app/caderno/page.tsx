import { motorJson } from '@/lib/motor';
import Referencias from '@/componentes/Referencias';
import Backup from '@/componentes/Backup';
import Biblioteca from '@/componentes/Biblioteca';
import Marcas from '@/componentes/Marcas';
import PedidosCliente from '@/componentes/PedidosCliente';
import ChaveConversa from '@/componentes/conversa/ChaveConversa';
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
    ...x, apagavel: Boolean(x.apagavel), detalhe: `${x.origem ?? 'casa'}${x.tipos && x.tipos.length ? ` · vale para ${x.tipos.join(', ')}` : ''}`,
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
          <p className="aviso" style={{ maxWidth: '62ch', marginTop: 8 }}>Tudo o que o editor segue ao montar um filme. Quando você reprova uma versão, o motivo entra aqui como regra nova e passa a valer nas próximas peças. Você pode apagar as que nasceram dos seus ajustes.</p>
        </div>
      </div>

      <ChaveConversa variante="cartao" />

      <section className="cartao" aria-labelledby="c-modos">
        <h2 className="cartao__titulo" id="c-modos"><span className="num">01</span> Modos de edição</h2>
        <ul className="caderno__grade" data-teste="caderno-modos">
          {modos.map((m) => (
            <li key={m.id} className="caderno__modo">
              <strong>{m.nome}</strong>
              <span>{m.descricao}</span>
              {m.sem_transicoes && m.sem_transicoes.length > 0 && <small>Não usa: {m.sem_transicoes.map((t) => NOME_FX[t] ?? t).join(', ')}</small>}
            </li>
          ))}
        </ul>
      </section>

      {looks.length > 0 && (
        <section className="cartao" aria-labelledby="c-cor">
          <h2 className="cartao__titulo" id="c-cor"><span className="num">01b</span> Cor por ambiente</h2>
          <p className="aviso" style={{ maxWidth: '62ch' }}>Cada cena é medida (luz, branco e tom de pele) e ganha o look do lugar onde foi gravada. A pele fica protegida. Na versão, você vê o antes e o depois de cada plano.</p>
          <ul className="caderno__grade" data-teste="caderno-looks">
            {looks.map((l) => (
              <li key={l.id} className="caderno__modo">
                <strong>{l.nome}</strong>
                <span>{l.desc}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cartao" aria-labelledby="c-marcas" id="marcas">
        <h2 className="cartao__titulo" id="c-marcas"><span className="num">01c</span> Clientes e marcas</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Com a logo do cliente aqui, o fim de cada filme dele assina com ela sozinho. Mande PNG com fundo transparente, de 512 a 2048 px. Sem logo, o fecho sai com a marca da creat.MTT.</p>
        <Marcas />
      </section>

      <section className="cartao" aria-labelledby="c-clientes" id="clientes">
        <h2 className="cartao__titulo" id="c-clientes"><span className="num">01d</span> O que os clientes responderam</h2>
        <PedidosCliente />
      </section>

      <section className="cartao" aria-labelledby="c-refs">
        <h2 className="cartao__titulo" id="c-refs"><span className="num">02</span> Estudos de caso</h2>
        <p className="aviso">Cole o link de um Reel que você admira. O editor mede o ritmo e o gancho e usa como referência nos próximos filmes.</p>
        <Referencias />
      </section>

      <MemoriaLista tipo="regra" num="03" titulo="Regras" idSecao="c-regras" teste="caderno-regras" itens={listaRegras}
        aviso="Aprendidas com as suas reprovações: {n}." irmas={checagens.map((c) => c.id)} />

      <MemoriaLista tipo="checagem" num="04" titulo="O que ele confere antes de entregar" idSecao="c-checa" teste="caderno-checagens" itens={listaChecagens} />

      {listaPalavras.length > 0 && (
        <MemoriaLista tipo="vocabulario" num="05" titulo="Palavras que a transcrição erra" idSecao="c-voc" teste="caderno-vocabulario" itens={listaPalavras} />
      )}
      <section className="cartao" aria-labelledby="c-bib" id="biblioteca">
        <h2 className="cartao__titulo" id="c-bib"><span className="num">05b</span> Trilhas e efeitos da casa</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Só toca no filme o que tiver licença registrada para uso em vídeo de cliente e anúncio. Cole o link do arquivo; o editor mede a duração e o andamento.</p>
        <Biblioteca />
      </section>

      <section className="cartao" aria-labelledby="c-backup" id="backup">
        <h2 className="cartao__titulo" id="c-backup"><span className="num">06</span> Backup</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Uma vez por dia, o que não se refaz (projetos, pedidos, direções, relatórios, regras e casos da casa) sai do servidor e fica guardado no Cloudflare e, se você salvar o link, numa pasta do seu Dropbox.</p>
        <Backup />
      </section>
    </main>
  );
}
