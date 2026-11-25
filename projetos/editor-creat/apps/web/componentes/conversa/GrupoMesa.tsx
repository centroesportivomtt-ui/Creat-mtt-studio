'use client';
// A mesa no fio: cada etapa do motor (etapa_*) vira uma linha com quem faz e o verbo, e, desde a onda 2, os passos de
// dentro dela (passo início/fim): o diretor, o crítico, cada checagem da Lupa, a voz, os planos… com tempo, custo e achado.
// Enquanto algo roda, o grupo fica aberto e a linha atualiza no lugar (o progresso não cria linha nova). Terminado,
// recolhe numa linha só: "Faísca, Cirro, Crivo · 4 passos · 0:41 · US$ 0,24". O cartão da decisão fica sempre à vista.
// Erro e interrupção não recolhem: o motivo fica na tela, com o detalhe técnico numa gaveta.
import { segundos, usd } from '@/lib/conversa';
import { agenteDoPasso, quem, rotuloEtapa, rotuloPasso, type Quem } from '@/lib/equipe';
import { progressoDe, type LinhaMesa, type Progresso } from '@/lib/fio';
import CartaoDecisao from './CartaoDecisao';
import LinhaPasso, { custoTexto } from './LinhaPasso';
import { Avatar, Avatares, decorrido, IconeEstado, useAgora } from './Pecas';

type Etapa = LinhaMesa & { k: 'etapa' };
const unicos = (l: Quem[]) => l.filter((q, i) => l.findIndex((x) => x.agente === q.agente) === i);

function quemNaEtapa(l: Etapa, n: number | undefined, versao: string | undefined) {
  const r = rotuloEtapa(l.etapa, l.fase === 'interrompido' ? 'erro' : l.fase, { n, versao });
  // com passos, os avatares são de quem trabalhou de verdade (na ordem em que entrou)
  const agentes = l.passos.length ? unicos(l.passos.map((p) => agenteDoPasso(p.chave))) : r.agentes;
  let texto = r.texto;
  if (l.raiz && l.fase === 'feito') texto = rotuloPasso(l.raiz.chave, 'fim', l.raiz.numeros, l.raiz.s).texto || texto;
  if (l.fase === 'interrompido') texto = `${rotuloEtapa(l.etapa, 'rodando', { n, versao }).texto}: interrompido`;
  return { agentes, texto };
}

export function custoDaEtapa(l: Etapa): { custo: number; estimado: boolean } {
  const filhos = l.passos.reduce((s, p) => s + (Number(p.custo_usd) || 0), 0);
  const custo = l.raiz?.custo_total_usd ?? filhos + (Number(l.raiz?.custo_usd) || 0);
  return { custo, estimado: Boolean(l.raiz?.estimado || l.passos.some((p) => p.estimado)) };
}

function LinhaEtapa({ l, progresso, arquivos, bastidores, agora }: { l: Etapa; progresso: Record<string, Progresso>; arquivos: string[]; bastidores: boolean; agora: number }) {
  const n = l.alvo ? arquivos.indexOf(l.alvo) + 1 : 0;
  const versao = l.alvo && /^v\d+$/.test(l.alvo) ? l.alvo : undefined;
  const { agentes, texto } = quemNaEtapa(l, n > 0 ? n : undefined, versao);
  const p = l.fase === 'rodando' ? progressoDe(progresso, l.etapa, l.alvo) : null;
  const { custo, estimado } = custoDaEtapa(l);
  const ct = custoTexto(custo, estimado);
  const fimTempo = l.fase === 'rodando' ? agora : (l.fim ?? l.inicio);
  return (
    <li className="mesa-linha" data-fase={l.fase} data-teste="mesa-linha" data-etapa={l.etapa} data-id={l.id}>
      <IconeEstado fase={l.fase === 'interrompido' ? 'esperando' : l.fase} />
      <div className="mesa-linha__corpo">
        <p>
          {/* com passos, só pulsa quem tem passo aberto agora (o diretor que já terminou fica parado) */}
          {l.passos.length && l.fase === 'rodando' ? (
            <span className="avatares" aria-hidden="true">
              {agentes.slice(0, 4).map((a) => <Avatar key={a.agente} q={a} trabalhando={l.passos.some((x) => x.fase === 'inicio' && agenteDoPasso(x.chave).agente === a.agente)} />)}
            </span>
          ) : <Avatares lista={agentes} trabalhando={l.fase === 'rodando'} />}
          <span className="mesa-linha__quem">{agentes.map((a) => a.agente).join(', ')}</span>
          <span className="so-leitor"> · </span> {texto}
        </p>
        {l.fase === 'rodando' && l.progressoMsg && <p className="mesa-linha__msg">{l.progressoMsg}</p>}
        {l.fase === 'erro' && (l.mensagem || l.raiz?.achado) && (
          <p className="mesa-linha__msg mesa-linha__msg--alerta" data-teste="mesa-erro">{l.mensagem ?? l.raiz?.achado}</p>
        )}
        {l.fase === 'interrompido' && <p className="mesa-linha__msg">O editor reiniciou no meio deste passo. A mesa pega de novo sozinha.</p>}
        {/* o achado do raiz só aparece quando diz algo além do rótulo ("Passou em 8 de 9" não se repete) */}
        {l.fase === 'feito' && l.raiz?.achado && !l.raiz.achado.startsWith(texto.slice(0, 14)) && <p className="mesa-linha__msg" data-teste="mesa-achado-etapa">{l.raiz.achado}</p>}
        {l.detalhe && (
          <details className="mesa-linha__detalhe">
            <summary>ver o detalhe técnico</summary>
            <p className="detalhe-tecnico__json">{l.detalhe}</p>
          </details>
        )}
        {p !== null && <div className="barra" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, p))})` }} /></div>}
      </div>
      <span className="mesa-linha__tempo" aria-hidden="true">
        {l.raiz && typeof l.raiz.s === 'number' && l.fase !== 'rodando' ? segundos(l.raiz.s) : decorrido(l.inicio, fimTempo)}
        {ct && <span className="mesa-linha__custo" data-teste="mesa-etapa-custo">{ct}</span>}
      </span>
      {/* os passos ocupam a largura toda da linha (no celular, aninhar dentro do texto deixava 90 px para ler) */}
      {l.passos.length > 0 && (
        <ul className="mesa-passos" aria-label={`Passos de ${agentes.map((a) => a.agente).join(', ')}`}>
          {l.passos.map((x) => <LinhaPasso key={x.passo} p={x} bastidores={bastidores} />)}
        </ul>
      )}
    </li>
  );
}

export default function GrupoMesa({ linhas, progresso, arquivos, bastidores = false }: { linhas: LinhaMesa[]; progresso: Record<string, Progresso>; arquivos: string[]; bastidores?: boolean }) {
  const etapas = linhas.filter((l): l is Etapa => l.k === 'etapa');
  const rodando = etapas.some((l) => l.fase === 'rodando');
  const agora = useAgora(rodando);
  const problema = etapas.some((l) => l.fase === 'erro' || l.fase === 'interrompido');
  // 'tudo' (aberto), 'sem_decisao' (dentro da gaveta recolhida) e 'so_decisao' (o cartão fica à vista, fora da gaveta)
  const lista = (modo: 'tudo' | 'sem_decisao' | 'so_decisao') => (
    <ul className="mesa-fio__linhas">
      {linhas.map((l) => {
        if (l.k === 'decisao') return modo === 'sem_decisao' ? null : <CartaoDecisao key={`d${l.id}`} d={l.d} versao={l.versao} />;
        if (modo === 'so_decisao') return null;
        if (l.k === 'nota') {
          return (
            <li key={l.id} className="mesa-linha mesa-linha--nota" data-tom={l.tom} data-teste="mesa-nota">
              <IconeEstado fase={l.tom === 'alerta' ? 'erro' : 'feito'} />
              <div className="mesa-linha__corpo">
                <p><span className="mesa-linha__quem">{l.tom === 'alerta' ? 'Aviso' : 'Cliente'}</span> {l.texto}</p>
                {l.detalhe && (
                  <details className="mesa-linha__detalhe">
                    <summary>ver o detalhe técnico</summary>
                    <p className="detalhe-tecnico__json">{l.detalhe}</p>
                  </details>
                )}
              </div>
            </li>
          );
        }
        return <LinhaEtapa key={l.id} l={l} progresso={progresso} arquivos={arquivos} bastidores={bastidores} agora={agora} />;
      })}
    </ul>
  );
  const contas = etapas.reduce((s, l) => s + Math.max(1, l.passos.length), 0) + linhas.filter((l) => l.k === 'nota').length;
  const semDentro = linhas.length === 1 && !(etapas[0]?.passos.length);
  if (rodando || problema || bastidores || semDentro) return <li className="mesa-fio" data-teste="mesa-grupo" data-aberto="true">{lista('tudo')}</li>;
  const nomes = unicos(etapas.flatMap((l) => quemNaEtapa(l, undefined, undefined).agentes));
  // uma etapa só (a mesa ao vivo do projeto agrupa por etapa): o resumo diz o que ela fez ("Passou em 8 de 9")
  const so = etapas.length === 1 ? etapas[0] : null;
  const nSo = so?.alvo ? arquivos.indexOf(so.alvo) + 1 : 0;
  const textoSo = so ? quemNaEtapa(so, nSo > 0 ? nSo : undefined, so.alvo && /^v\d+$/.test(so.alvo) ? so.alvo : undefined).texto : '';
  const inicio = etapas[0]?.inicio;
  const fim = etapas.reduce((m, l) => (l.fim && l.fim > m ? l.fim : m), inicio ?? '');
  const custo = etapas.reduce((s, l) => s + custoDaEtapa(l).custo, 0);
  const estimado = etapas.some((l) => custoDaEtapa(l).estimado);
  const temDecisao = linhas.some((l) => l.k === 'decisao');
  return (
    <li className="mesa-fio" data-teste="mesa-grupo" data-aberto="false">
      <details>
        <summary className="mesa-fio__resumo">
          <IconeEstado fase="feito" />
          <Avatares lista={nomes.length ? nomes : [quem('Nimbus')]} />
          <span className="mesa-fio__resumo-texto">
            <span className="mesa-linha__quem">{nomes.length ? nomes.slice(0, 3).map((a) => a.agente).join(', ') + (nomes.length > 3 ? ` +${nomes.length - 3}` : '') : 'Mesa'}</span>
            {textoSo ? ` ${textoSo}` : ''}
            {' · '}{contas} passo{contas === 1 ? '' : 's'}{inicio && fim ? ` · ${so?.raiz && typeof so.raiz.s === 'number' ? segundos(so.raiz.s) : decorrido(inicio, fim)}` : ''}
            {custo > 0 && <span data-teste="mesa-grupo-custo">{` · ${estimado ? '≈ ' : ''}${usd(custo)}`}</span>}
          </span>
          <span className="mesa-fio__ver" aria-hidden="true">ver</span>
        </summary>
        {lista('sem_decisao')}
      </details>
      {temDecisao && lista('so_decisao')}
    </li>
  );
}
