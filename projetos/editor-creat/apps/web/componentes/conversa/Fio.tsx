'use client';
// O fio do projeto: a conversa com a mesa e a mesa trabalhando, num lugar só, na ordem em que aconteceu.
// Cada turno segue a mesma ordem: a fala do dono → "Entendi: …" → ferramentas (quem faz, o quê, quanto tempo) →
// resposta → pergunta ou cartão → rodapé com custo e tempo. O andamento e a resposta nunca ficam escondidos na dobra.
// role="log": o leitor de tela lê o que entra no fim; a resposta escrevendo fica aria-busy até chegar inteira.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mmss, segundos, usd, type DadosTurnoFim } from '@/lib/conversa';
import { quem } from '@/lib/equipe';
import type { Item } from '@/lib/fio';
import CartaoConfirma from './CartaoConfirma';
import CartaoPergunta from './CartaoPergunta';
import GrupoMesa from './GrupoMesa';
import LinhaFerramenta from './LinhaFerramenta';
import { Avatar, IconeEstado, TextoSimples, useAgora } from './Pecas';
import type { Conversa } from './useConversa';

export type Palco = { nome: string; estado: string; rotuloEstado: string; classeEstado: string; tc: string; correndo: boolean };
const NIMBUS = quem('Nimbus');
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Fio({ c, palco, arquivos }: { c: Conversa; palco: Palco; arquivos: string[] }) {
  const { montado, fio } = c;
  const rascunho = fio.rascunho;
  const rodando = montado.rodando;
  const fimRef = useRef<HTMLDivElement>(null);
  const teto = c.estadoChave?.teto ?? 3;
  const [novidades, setNovidades] = useState(0);
  const [alerta, setAlerta] = useState('');
  // "Nimbus está pensando · 4 s": conta do momento em que ESTE aparelho viu o turno começar (sem depender do relógio do servidor)
  const [pensandoDesde, setPensandoDesde] = useState<number | null>(null);
  useEffect(() => { setPensandoDesde(rodando ? Date.now() : null); }, [rodando]);
  const agora = useAgora(Boolean(rodando));

  const blocosFeitos = useMemo(() => {
    const s = new Set<string>();
    for (const it of montado.itens) if (it.k === 'editor') s.add(`${it.d.turno}|${it.d.bloco}`);
    return s;
  }, [montado.itens]);
  const rascunhoVivo = rodando && rascunho && rascunho.turno === rodando && !blocosFeitos.has(`${rascunho.turno}|${rascunho.bloco}`) ? rascunho : null;
  const ferrRodando = montado.itens.some((it) => it.k === 'ferramenta' && it.f.fase === 'inicio' && it.f.turno === rodando);
  const retomarAtivo = new Set(montado.itens.filter((it) => it.k === 'retomar' && it.ativo).map((it) => (it as Item & { k: 'retomar' }).turno));

  // rolar junto só quando o dono está perto do fim; se ele subiu para ler, nada se mexe e aparece "↓ novidades"
  const perto = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
  const ultimoId = montado.itens[montado.itens.length - 1]?.id ?? 0;
  const assinatura = `${ultimoId}|${rascunhoVivo?.v ?? 0}|${c.saindo.length}|${rodando ?? ''}`;
  const anterior = useRef(assinatura);
  const estavaPerto = useRef(true);
  useEffect(() => {
    const medir = () => { estavaPerto.current = perto(); if (estavaPerto.current) setNovidades(0); };
    window.addEventListener('scroll', medir, { passive: true });
    return () => window.removeEventListener('scroll', medir);
  }, []);
  useLayoutEffect(() => {
    if (anterior.current === assinatura) return;
    anterior.current = assinatura;
    if (estavaPerto.current) fimRef.current?.scrollIntoView({ block: 'end' });
    else setNovidades((n) => n + 1);
  }, [assinatura]);
  // o fio cresceu sem item novo (resposta escrevendo, progresso da mesa, cartão abrindo): acompanha se o dono está no fim
  const listaRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let alt = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const nova = el.getBoundingClientRect().height;
      if (nova > alt && estavaPerto.current) fimRef.current?.scrollIntoView({ block: 'end' });
      alt = nova;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ao abrir: vai até a pergunta pendente, ou até o fim
  useEffect(() => {
    const alvo = montado.espera ? document.getElementById(`${montado.espera.tipo}-${montado.espera.tool_use_id}`) : null;
    (alvo ?? fimRef.current)?.scrollIntoView({ block: alvo ? 'center' : 'end' });
    estavaPerto.current = !alvo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // pergunta, cartão e erro que chegam ao vivo (depois de a conversa abrir) vão também para uma região de alerta
  const ultimoAlertado = useRef(montado.itens[montado.itens.length - 1]?.id ?? 0);
  useEffect(() => {
    for (const it of montado.itens) {
      if (it.id <= ultimoAlertado.current) continue;
      ultimoAlertado.current = it.id;
      if (!fio.carregado) continue;
      if (it.k === 'pergunta' && !it.r) setAlerta(`Nimbus pergunta: ${it.d.texto}`);
      else if (it.k === 'confirmacao' && !it.r) setAlerta(`Antes de seguir, preciso do seu toque: ${it.d.titulo}`);
      else if (it.k === 'fim' && ['erro', 'teto'].includes(it.d.stop)) setAlerta(textoParada(it.d, teto).titulo);
    }
  }, [montado.itens, fio.carregado, teto]);

  const gasto = c.estadoChave;
  const perto80 = gasto ? gasto.gasto >= gasto.teto * 0.8 : false;
  let turnoAnterior: string | null = null;
  let donoAnterior: string | null = null;

  return (
    <section className="fio" id="fio" aria-labelledby="fio-titulo" data-teste="fio">
      <header className="fio__faixa">
        <button type="button" className="fio__voltar" onClick={c.fechar} data-teste="fio-fechar" aria-label="Voltar ao projeto">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Projeto
        </button>
        <div className="fio__faixa-meio">
          <h2 className="fio__titulo" id="fio-titulo">{palco.nome}</h2>
          <p className="fio__faixa-dado">
            <span className={palco.classeEstado}>{palco.rotuloEstado}</span>
            {palco.correndo && <span className="fio__tc" aria-label={`Tempo de edição ${palco.tc}`}>{palco.tc}</span>}
          </p>
        </div>
        <span className="ao-vivo fio__vivo" data-conectado={fio.conectado}>{fio.conectado ? 'ao vivo' : 'reconectando…'}</span>
      </header>
      {gasto && (
        <p className="fio__gasto" data-teste="fio-gasto" data-perto={perto80}>
          Conversa hoje: <b>{usd(gasto.gasto)}</b> de {usd(gasto.teto)}{perto80 && gasto.gasto < gasto.teto ? ' · perto do teto do dia' : ''}
        </p>
      )}

      <ol ref={listaRef} className="fio__lista" role="log" aria-label="Conversa com a mesa" aria-live="polite" data-teste="fio-lista">
        {!montado.temConversa && c.saindo.length === 0 && (
          <li className="fio__vazio" data-teste="fio-vazio">
            <Avatar q={NIMBUS} />
            <div>
              <p><strong>Nimbus, da mesa.</strong> Pergunte, peça um ajuste da versão pronta ou mude o pedido.</p>
              <p className="aviso">Nada roda sem o seu toque. Pode escrever ou gravar um áudio aqui embaixo.</p>
            </div>
          </li>
        )}
        {montado.itens.map((it) => {
          const cabecaNimbus = it.k === 'editor' && turnoAnterior !== `${it.d.turno}:nimbus`;
          if (it.k === 'editor') turnoAnterior = `${it.d.turno}:nimbus`;
          else if (it.k === 'dono') turnoAnterior = null;
          switch (it.k) {
            case 'mesa':
              return <GrupoMesa key={`m${it.id}`} linhas={it.linhas} progresso={fio.progresso} arquivos={arquivos} />;
            case 'dono': {
              const mostraHora = !donoAnterior || Date.parse(it.ts) - Date.parse(donoAnterior) > 5 * 60_000;
              donoAnterior = it.ts;
              return (
                <li key={it.id} className="fala-dono" data-teste="fala-dono" data-via={it.d.via} data-id={it.id}>
                  {mostraHora && <time className="fala-dono__hora" dateTime={it.ts}>{hhmm(it.ts)}</time>}
                  <p className="fala-dono__balao">
                    {it.d.via === 'audio' && <IconeMic />}
                    <span className="so-leitor">Você{it.d.via === 'audio' ? ', por áudio' : ''}: </span>
                    {it.d.texto}
                  </p>
                  {it.d.na_fila && <span className="fala-dono__etiqueta">na fila · entra no próximo passo</span>}
                </li>
              );
            }
            case 'editor':
              return (
                <li key={it.id} className="fala-editor" data-teste="fala-editor" data-id={it.id}>
                  {cabecaNimbus && <p className="fala-editor__quem"><Avatar q={NIMBUS} /> Nimbus</p>}
                  <div className="texto-nimbus"><TextoSimples texto={it.d.texto} /></div>
                </li>
              );
            case 'ferramenta':
              return <LinhaFerramenta key={it.id} f={it.f} />;
            case 'pergunta':
              return <CartaoPergunta key={it.id} d={it.d} r={it.r} ocupado={c.ocupado === it.d.tool_use_id} erro={c.erroCartao[it.d.tool_use_id]}
                respondendo={c.respondendo === it.d.tool_use_id}
                aoEscolher={(id) => void c.escolher(it.d.tool_use_id, id)} aoMeuJeito={() => c.responderDoMeuJeito(it.d.tool_use_id)} />;
            case 'confirmacao':
              return <CartaoConfirma key={it.id} d={it.d} r={it.r} ocupado={c.ocupado === it.d.tool_use_id} erro={c.erroCartao[it.d.tool_use_id]}
                aoDecidir={(sim) => void c.decidir(it.d, sim)} />;
            case 'mostrar':
              return (
                <li key={it.id} className="fio__mostrar">
                  <button type="button" className="botao botao--secundario" onClick={() => c.mostrar(it.d)} data-teste="fio-mostrar">
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg>
                    Ver {it.d.versao ? `a ${it.d.versao.toUpperCase()} ` : ''}{typeof it.d.tempo_s === 'number' ? `em ${mmss(it.d.tempo_s)}` : 'no player'}
                  </button>
                </li>
              );
            case 'retomar':
              return it.ativo ? (
                <li key={it.id} className="fio__parou" data-teste="fio-retomar">
                  <p><strong>A conversa foi interrompida.</strong> O editor reiniciou no meio da resposta; nada do que já estava pronto se perdeu.</p>
                  <button type="button" className="botao botao--secundario" onClick={() => void c.retomarTurno()} disabled={c.retomando} data-teste="fio-retomar-botao">
                    {c.retomando ? 'Retomando…' : 'Tentar de novo'}
                  </button>
                </li>
              ) : null;
            case 'fim':
              return <RodapeTurno key={it.id} d={it.d} mesaRodando={montado.mesaRodando} temRetomar={retomarAtivo.has(it.d.turno)}
                esperando={Boolean(montado.espera && montado.itens.some((x) => x.id === montado.espera?.id && 'd' in x && (x.d as { turno?: string }).turno === it.d.turno))}
                teto={teto}
                aoTentar={() => c.tentarTurno(it.d.turno)} aoSeguir={() => c.mandarTexto('Pode seguir.')} />;
            default:
              return null;
          }
        })}

        {c.saindo.map((m) => (
          <li key={m.cmid} className="fala-dono" data-teste="fala-saindo" data-estado={m.falhou ? 'falhou' : 'indo'}>
            <p className="fala-dono__balao">{m.via === 'audio' && <IconeMic />}{m.texto}</p>
            {m.falhou ? (
              <span className="fala-dono__falhou">
                <span role="alert">Não enviada: {m.falhou}</span>
                <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => c.tentarSaindo(m.cmid)} data-teste="saindo-tentar">Tentar de novo</button>
                <button type="button" className="botao botao--perigo botao--pequeno" onClick={() => c.descartarSaindo(m.cmid)}>Apagar</button>
              </span>
            ) : <span className="fala-dono__etiqueta">{m.ok ? 'enviada' : 'enviando…'}</span>}
          </li>
        ))}

        {rodando && (
          <li className="fala-editor fala-editor--vivo" aria-busy="true" data-teste="fio-rodando">
            {!montado.itens.some((it) => it.k === 'editor' && it.d.turno === rodando) && rascunhoVivo?.texto && <p className="fala-editor__quem"><Avatar q={NIMBUS} trabalhando /> Nimbus</p>}
            {rascunhoVivo?.andamento && <p className="fio__andamento">{rascunhoVivo.andamento}</p>}
            {rascunhoVivo?.texto ? (
              <div className="texto-nimbus" data-teste="fio-rascunho"><TextoSimples texto={rascunhoVivo.texto} /></div>
            ) : !ferrRodando && (
              <p className="fio__pensando" data-teste="fio-pensando">
                <Avatar q={NIMBUS} trabalhando /> Nimbus está pensando
                <span aria-hidden="true"> · {pensandoDesde ? Math.max(0, Math.round((agora - pensandoDesde) / 1000)) : 0} s</span>
                {pensandoDesde && agora - pensandoDesde > 20_000 && <span className="fio__pensando-longo">Ainda pensando. É uma decisão grande.</span>}
              </p>
            )}
            <button type="button" className="botao botao--secundario fio__parar" onClick={() => void c.pararTurno()} disabled={c.parando} data-teste="conversa-parar">
              <span className="quadrado" aria-hidden="true" />{c.parando ? 'Parando…' : 'Parar a resposta'}
            </button>
          </li>
        )}
      </ol>
      <div ref={fimRef} className="fio__fim" aria-hidden="true" />
      <div className="so-leitor" role="alert">{alerta}</div>
      {novidades > 0 && (
        <button type="button" className="fio__novidades" onClick={() => { fimRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); setNovidades(0); }}>
          ↓ {novidades === 1 ? '1 novidade' : `${novidades} novidades`}
        </button>
      )}
    </section>
  );
}

function IconeMic() {
  return (
    <svg className="fala-dono__mic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  );
}

export function textoParada(d: DadosTurnoFim, teto = 3): { titulo: string; texto?: string } {
  switch (d.stop) {
    case 'parado': return { titulo: 'Você parou aqui.' };
    case 'erro': return { titulo: 'A resposta parou.', texto: d.detalhe ? primeira(d.detalhe) : 'Algo deu errado na resposta; tente de novo.' };
    case 'teto': return { titulo: `Chegou no teto de hoje (${usd(teto)}).`, texto: 'A conversa volta à meia-noite. A mesa e os botões continuam funcionando.' };
    case 'recusa': return { titulo: 'Não consigo fazer isso.', texto: 'Diga de outro jeito o que você quer.' };
    case 'limite': return { titulo: 'Parei depois de 8 passos.', texto: 'Para não gastar à toa. Quer que eu siga?' };
    default: return { titulo: '' };
  }
}
const primeira = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : s);

function RodapeTurno({ d, mesaRodando, temRetomar, teto, esperando, aoTentar, aoSeguir }: {
  d: DadosTurnoFim; mesaRodando: boolean; temRetomar: boolean; teto: number; esperando: boolean; aoTentar: () => void; aoSeguir: () => void;
}) {
  const t = textoParada(d, teto);
  const custo = `${d.estimado ? '≈ ' : ''}${usd(d.custo_usd)} · ${segundos(d.s)}${d.estimado ? ' · estimado' : ''}`;
  return (
    <li className="rodape-turno" data-teste="turno-fim" data-stop={d.stop} data-turno={d.turno}>
      {d.stop === 'parado' && d.texto_parcial && <div className="texto-nimbus texto-nimbus--parcial"><TextoSimples texto={d.texto_parcial} /></div>}
      {t.titulo && !(d.stop === 'erro' && temRetomar) && (
        <div className="rodape-turno__parada" data-tom={d.stop === 'parado' ? 'neutro' : 'alerta'}>
          <p><strong>{t.titulo}</strong>{t.texto ? ` ${t.texto}` : ''}</p>
          {d.stop === 'parado' && mesaRodando && <p className="aviso">A mesa termina o passo atual.</p>}
          {d.stop === 'erro' && !temRetomar && <button type="button" className="botao botao--secundario" onClick={aoTentar} data-teste="turno-tentar">Tentar de novo</button>}
          {d.stop === 'recusa' && <p className="aviso">Nada foi feito.</p>}
          {d.stop === 'limite' && <button type="button" className="botao botao--secundario" onClick={aoSeguir}>Seguir</button>}
        </div>
      )}
      <p className="rodape-turno__custo" data-teste="turno-custo">{custo}{d.stop === 'pausa' && esperando ? ' · esperando você' : ''}</p>
    </li>
  );
}
