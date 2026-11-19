import { motorJson } from '@/lib/motor';
import Referencias from '@/componentes/Referencias';
import Backup from '@/componentes/Backup';
import Biblioteca from '@/componentes/Biblioteca';
import PedidosCliente from '@/componentes/PedidosCliente';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Caderno da casa' };

type Regra = { id: string; texto: string; origem?: string; data?: string; tipos?: string[] | null };
type Checagem = { id: string; descricao: string; origem?: string; gravidade?: string };
type Modo = { id: string; nome: string; descricao: string; sem_transicoes?: string[]; zoom_max?: number };
const NOME_FX: Record<string, string> = { whip: 'chicote', aba71: 'Aba 71', impacto: 'impacto', flash: 'flash', mascara: 'máscara' };
type Look = { id: string; nome: string; desc: string };
type Memoria = { regras: Regra[]; checagens: Checagem[]; vocabulario: { de: string; para: string }[]; modos?: Modo[]; looks?: Look[] };

// O que o editor sabe: as regras que o dono ensinou (cada reprovação vira uma), o que ele confere antes de entregar e os modos de edição.
export default async function Caderno() {
  const r = await motorJson<Memoria>('/v1/memoria');
  if (!r.ok) return <main className="pagina"><p className="erro" role="alert">Não deu para abrir o caderno: {r.erro}.</p></main>;
  const { regras, checagens, vocabulario, modos = [], looks = [] } = r.dados;
  const doDono = regras.filter((x) => x.id.startsWith('r_dono_'));
  const daCasa = regras.filter((x) => !x.id.startsWith('r_dono_'));
  return (
    <main className="pagina caderno">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Treinamento do editor</p>
          <h1 className="titulo">Caderno da casa</h1>
          <p className="aviso" style={{ maxWidth: '62ch', marginTop: 8 }}>Tudo o que o editor segue ao montar um filme. Quando você reprova uma versão, o motivo entra aqui como regra nova e passa a valer nas próximas peças.</p>
        </div>
      </div>

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

      <section className="cartao" aria-labelledby="c-clientes" id="clientes">
        <h2 className="cartao__titulo" id="c-clientes"><span className="num">01c</span> O que os clientes responderam</h2>
        <PedidosCliente />
      </section>

      <section className="cartao" aria-labelledby="c-refs">
        <h2 className="cartao__titulo" id="c-refs"><span className="num">02</span> Estudos de caso</h2>
        <p className="aviso">Cole o link de um Reel que você admira. O editor mede o ritmo e o gancho e usa como referência nos próximos filmes.</p>
        <Referencias />
      </section>

      <section className="cartao" aria-labelledby="c-regras">
        <h2 className="cartao__titulo" id="c-regras"><span className="num">03</span> Regras ({regras.length})</h2>
        {doDono.length > 0 && <p className="aviso">Aprendidas com as suas reprovações: {doDono.length}.</p>}
        <ol className="caderno__lista" data-teste="caderno-regras">
          {[...doDono, ...daCasa].map((x) => (
            <li key={x.id}>
              <p>{x.texto}</p>
              <small>{x.origem ?? 'casa'}{x.tipos && x.tipos.length ? ` · vale para ${x.tipos.join(', ')}` : ''}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="cartao" aria-labelledby="c-checa">
        <h2 className="cartao__titulo" id="c-checa"><span className="num">04</span> O que ele confere antes de entregar ({checagens.length})</h2>
        <ul className="caderno__lista">
          {checagens.map((c) => (
            <li key={c.id}>
              <p>{c.descricao}</p>
              <small>{c.gravidade === 'bloqueia' ? 'segura a entrega' : c.gravidade === 'observacao' ? 'em observação: por enquanto só avisa' : 'avisa'} · {c.origem ?? 'casa'}</small>
            </li>
          ))}
        </ul>
      </section>

      {vocabulario.length > 0 && (
        <section className="cartao" aria-labelledby="c-voc">
          <h2 className="cartao__titulo" id="c-voc"><span className="num">05</span> Palavras que a transcrição erra</h2>
          <ul className="caderno__voc">
            {vocabulario.map((v) => <li key={v.de}><s>{v.de}</s> → <b>{v.para}</b></li>)}
          </ul>
        </section>
      )}
      <section className="cartao" aria-labelledby="c-bib" id="biblioteca">
        <h2 className="cartao__titulo" id="c-bib"><span className="num">05b</span> Trilhas e efeitos da casa</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Só toca no filme o que tiver licença registrada para uso em vídeo de cliente e anúncio. Cole o link do arquivo; o editor mede a duração e o andamento.</p>
        <Biblioteca />
      </section>

      <section className="cartao" aria-labelledby="c-backup" id="backup">
        <h2 className="cartao__titulo" id="c-backup"><span className="num">06</span> Backup</h2>
        <p className="aviso" style={{ maxWidth: '62ch' }}>Uma vez por dia, o que não se refaz (projetos, pedidos, direções, relatórios, regras e casos da casa) vai para uma pasta do seu Dropbox.</p>
        <Backup />
      </section>
    </main>
  );
}
