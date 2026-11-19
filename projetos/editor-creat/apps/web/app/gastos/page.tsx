import Link from 'next/link';
import { motorJson } from '@/lib/motor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gastos do mês' };

type Linha = { id: string; nome?: string; custo_usd: number; chamadas: number };
type Resumo = {
  mes: string; meses: string[]; total_usd: number; chamadas: number; estimado_usd: number;
  por_tipo: Linha[]; por_projeto: Linha[]; por_dia: { dia: string; custo_usd: number }[];
  ultimas: { quando: string; o_que: string; projeto: string | null; projeto_nome?: string; versao: string | null; modelo: string | null; custo_usd: number; estimado?: boolean }[];
  fora_do_editor: string;
};

const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 3 : 2).replace('.', ',')}`;
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1] ?? m} de ${m.slice(0, 4)}`;
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bahia' });

function Barras({ itens }: { itens: Linha[] }) {
  const max = Math.max(...itens.map((i) => i.custo_usd), 1e-9);
  return (
    <ul className="gastos__barras">
      {itens.map((i) => (
        <li key={i.id}>
          <span className="gastos__nome">{i.nome ?? i.id}</span>
          <span className="gastos__barra" aria-hidden="true"><span style={{ width: `${Math.max(2, (i.custo_usd / max) * 100)}%` }} /></span>
          <span className="gastos__valor">{usd(i.custo_usd)} <small>· {i.chamadas}×</small></span>
        </li>
      ))}
    </ul>
  );
}

// Quanto o editor gastou de serviço pago no mês (só o que passa pelo editor: Claude na direção, na leitura e na revisão).
export default async function Gastos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const valido = mes && /^20\d\d-(0[1-9]|1[0-2])$/.test(mes) ? mes : undefined;
  const r = await motorJson<Resumo>(`/v1/gastos${valido ? `?mes=${valido}` : ''}`);
  if (!r.ok) return <main className="pagina"><p className="erro" role="alert">Não deu para abrir os gastos: {r.erro}.</p></main>;
  const g = r.dados;
  return (
    <main className="pagina gastos">
      <div className="cabeca-pagina">
        <div>
          <p className="sobretitulo">Painel de gastos</p>
          <h1 className="titulo">Gastos de {nomeMes(g.mes)}</h1>
        </div>
      </div>
      {g.meses.length > 1 && (
        <nav className="linha-acoes" aria-label="Outros meses" style={{ marginTop: 0 }}>
          {g.meses.map((m) => (
            <Link key={m} className={`botao botao--pequeno ${m === g.mes ? 'botao--principal' : 'botao--fantasma'}`} href={`/gastos?mes=${m}`} aria-current={m === g.mes ? 'page' : undefined}>
              {nomeMes(m)}
            </Link>
          ))}
        </nav>
      )}
      <section className="cartao" aria-labelledby="g-total">
        <h2 className="cartao__titulo" id="g-total"><span className="num">01</span> Total do mês</h2>
        <p className="gastos__total" data-teste="gastos-total">{usd(g.total_usd)}</p>
        <p className="aviso">{g.chamadas} chamada(s) paga(s){g.estimado_usd > 0 ? `; ${usd(g.estimado_usd)} estimado (chamada que falhou depois de cobrada)` : ''}. {g.fora_do_editor}</p>
      </section>
      {g.chamadas > 0 && (
        <>
          <section className="cartao" aria-labelledby="g-tipo">
            <h2 className="cartao__titulo" id="g-tipo"><span className="num">02</span> Por tipo de gasto</h2>
            <Barras itens={g.por_tipo} />
          </section>
          <section className="cartao" aria-labelledby="g-proj">
            <h2 className="cartao__titulo" id="g-proj"><span className="num">03</span> Por projeto</h2>
            <Barras itens={g.por_projeto.map((p) => ({ ...p, nome: p.id === 'sem projeto' ? 'autotestes e manutenção' : (p.nome ?? p.id) }))} />
          </section>
          <section className="cartao" aria-labelledby="g-ult">
            <h2 className="cartao__titulo" id="g-ult"><span className="num">04</span> Últimas chamadas</h2>
            <ul className="caderno__lista" data-teste="gastos-ultimas">
              {g.ultimas.map((u, i) => (
                <li key={i}>
                  <p>{usd(u.custo_usd)}{u.estimado ? ' (estimado)' : ''} · {g.por_tipo.find((t) => t.id === u.o_que)?.nome ?? u.o_que}</p>
                  <small>{quando(u.quando)}{u.projeto ? ` · ${u.projeto_nome ?? u.projeto}${u.versao ? ` ${u.versao}` : ''}` : ''}{u.modelo ? ` · ${u.modelo}` : ''}</small>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
