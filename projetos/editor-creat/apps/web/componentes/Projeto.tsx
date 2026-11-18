'use client';
// Mesa do projeto: material, pedido, status ao vivo (SSE do motor pelo proxy), relógio dos 30 minutos e versões.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Envio from './Envio';
import {
  bytesLegiveis, classeEstado, ESTADOS, ETAPA_DO_ESTADO, EXPLICA_ESTADO, ROTULO_ESTADO, rotuloTipo,
  type Evento, type Projeto as TProjeto, type Versao,
} from '@/lib/estados';

const TETO_MS = 30 * 60 * 1000;
const ESTADOS_ABERTOS = ['recebendo', 'lendo'];

function tc(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dois(m)}:${dois(ss)}` : `${dois(m)}:${dois(ss)}`;
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function lerQa(qa: unknown): { aprovado?: boolean; checagens: { id: string; ok: boolean }[] } | null {
  let v = qa;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || !Array.isArray((v as { checagens?: unknown }).checagens)) return null;
  return v as { aprovado?: boolean; checagens: { id: string; ok: boolean }[] };
}
const NOME_CHECAGEM: Record<string, string> = {
  frase_repetida: 'frase repetida', tom_sala_sem_voz: 'tom de sala', logo_100: 'logo a 100%', lufs: 'LUFS', true_peak: 'pico',
  quadros_pretos: 'quadro preto', legenda_x_fala: 'legenda x fala', zona_segura: 'zona segura', legenda_sobre_rosto: 'legenda x rosto',
  formato: 'formato', duracao: 'duração', sincronia: 'sincronia', telas_desfocadas: 'telas', regra_memoria: 'regras da casa',
};

export default function Projeto({ inicial, parteMB }: { inicial: TProjeto; parteMB: number }) {
  const [p, setP] = useState(inicial);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [conectado, setConectado] = useState(false);
  const [agora, setAgora] = useState<number | null>(null); // só no navegador: evita diferença servidor x cliente
  const [erro, setErro] = useState('');
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoEstado = useRef<{ estado: string; t: number } | null>(null);

  const recarregar = useCallback(() => {
    if (recarga.current) clearTimeout(recarga.current);
    recarga.current = setTimeout(async () => {
      const pedidoEm = performance.now();
      const r = await fetch(`/api/motor/v1/projetos/${inicial.id}`, { cache: 'no-store' }).catch(() => null);
      if (r?.ok) {
        const novo = (await r.json()) as TProjeto;
        // Resposta atrasada não desfaz um estado que chegou depois pelo SSE.
        const u = ultimoEstado.current;
        if (u && u.t > pedidoEm) novo.estado = u.estado;
        setP(novo);
      } else if (r?.status === 401) window.location.assign('/entrar');
    }, 250);
  }, [inicial.id]);

  // Status ao vivo: EventSource reconecta sozinho e manda Last-Event-ID (o proxy repassa ao motor).
  useEffect(() => {
    const fonte = new EventSource(`/api/motor/v1/projetos/${inicial.id}/eventos`);
    const vistos = new Set<number>();
    const receber = (m: MessageEvent) => {
      let e: Evento;
      try { e = JSON.parse(m.data); } catch { return; }
      if (vistos.has(e.id)) return;
      vistos.add(e.id);
      setEventos((l) => [...l, e].slice(-400));
      if (e.estado) {
        ultimoEstado.current = { estado: e.estado, t: performance.now() };
        setP((x) => ({ ...x, estado: e.estado! }));
      }
      if (['arquivo_recebido', 'etapa_fim', 'estado', 'versao_pronta', 'entregue', 'qa_reprovado', 'etapa_erro'].includes(e.tipo)) recarregar();
    };
    for (const t of ['projeto_criado', 'arquivo_recebido', 'etapa_inicio', 'etapa_progresso', 'etapa_fim', 'etapa_erro', 'estado', 'versao_pronta', 'qa_reprovado', 'entregue', 'message']) {
      fonte.addEventListener(t, receber as EventListener);
    }
    fonte.onopen = () => setConectado(true);
    fonte.onerror = () => setConectado(false);
    return () => fonte.close();
  }, [inicial.id, recarregar]);

  // ---------- relógio dos 30 minutos ----------
  const marcas = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of eventos) {
      const est = e.tipo === 'entregue' ? 'entregue' : e.tipo === 'estado' ? e.estado : null;
      if (est && !(est in m)) m[est] = Date.parse(e.ts);
    }
    return m;
  }, [eventos]);
  const inicioRelogio = useMemo(() => {
    const fechado = typeof p.dados?.envio_fechado_em === 'string' ? Date.parse(p.dados.envio_fechado_em) : NaN;
    if (!Number.isNaN(fechado)) return fechado;
    if (!p.dados?.envio_fechado) return null;
    return marcas.lendo ?? marcas.dirigindo ?? null;
  }, [p.dados, marcas]);
  const fimRelogio = p.estado === 'entregue' ? (marcas.entregue ?? Date.parse(p.atualizado)) : null;
  const correndo = inicioRelogio !== null && fimRelogio === null && !['erro', 'reprovado_qa'].includes(p.estado);
  useEffect(() => {
    setAgora(Date.now());
    if (!correndo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [correndo]);
  const decorrido = inicioRelogio === null ? 0 : fimRelogio !== null ? fimRelogio - inicioRelogio : agora === null ? 0 : agora - inicioRelogio;

  // ---------- trilha ----------
  const indiceAtual = Math.max(0, ESTADOS.indexOf(p.estado as (typeof ESTADOS)[number]));
  const ultimaPorEstado = useMemo(() => {
    const m: Record<string, Evento> = {};
    for (const e of eventos) {
      const est = e.etapa ? ETAPA_DO_ESTADO[e.etapa] : e.estado ?? (e.tipo === 'entregue' ? 'entregue' : null);
      if (est && e.mensagem) m[est] = e;
    }
    return m;
  }, [eventos]);

  // ---------- ações ----------
  async function postar(caminho: string, corpo?: unknown) {
    setErro('');
    const r = await fetch(`/api/motor/v1/projetos/${p.id}${caminho}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo ?? {}),
    }).catch(() => null);
    if (!r) { setErro('Sem conexão com o site. Tente de novo.'); return null; }
    const c = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 401) { window.location.assign('/entrar'); return null; }
      setErro(typeof c?.detail === 'string' ? c.detail : Array.isArray(c?.detail) ? c.detail.map((d: { msg: string }) => d.msg).join('; ') : 'O motor recusou. Tente de novo.');
      return null;
    }
    recarregar();
    return c;
  }

  const aberto = ESTADOS_ABERTOS.includes(p.estado);
  const fechado = Boolean(p.dados?.envio_fechado);
  const versoes = [...(p.versoes ?? [])].reverse();
  const assistir = versoes.find((v) => v.video) ?? null;
  const diario = [...eventos].filter((e) => e.mensagem).slice(-12).reverse();

  return (
    <main className="pagina">
      <div className="cabeca-pagina">
        <div style={{ minWidth: 0 }}>
          <p className="sobretitulo">{rotuloTipo(p.tipo_video)} · {p.arquivos.length} arquivo{p.arquivos.length === 1 ? '' : 's'}</p>
          <h1 className="titulo" style={{ overflowWrap: 'anywhere' }}>{p.nome}</h1>
        </div>
        <span className={classeEstado(p.estado)} data-teste="estado" data-estado={p.estado}>{ROTULO_ESTADO[p.estado] ?? p.estado}</span>
      </div>

      {erro && <p className="erro" role="alert" style={{ marginBottom: 16 }}>{erro}</p>}

      <div className="mesa" data-editando={!aberto}>
        <div className="mesa__mesa">
          <section className="cartao" aria-labelledby="t-material">
            <h2 className="cartao__titulo" id="t-material"><span className="num">01</span> Material</h2>
            {aberto ? (
              <>
                <Envio projeto={p.id} parteMB={parteMB} aberto={aberto} aoConcluir={recarregar} />
                <Importar aberto={aberto} aoImportar={(url) => postar('/importar', { url })} />
              </>
            ) : (
              <p className="material-fechado">Envio fechado: o editor está trabalhando com este material. Material novo entra numa nova versão.</p>
            )}
            {p.arquivos.length > 0 && (
              <ul className="arquivos" aria-label="Arquivos no projeto">
                {p.arquivos.map((a) => (
                  <li className="arquivo" key={a.id}>
                    <span>{a.nome}</span>
                    <span>{a.bytes > 1 ? `${bytesLegiveis(a.bytes)} · ` : ''}{a.estado === 'analisado' ? 'lido' : a.estado === 'ingerido' ? 'lendo falas' : 'na fila'}</span>
                  </li>
                ))}
              </ul>
            )}
            {aberto && <div className="linha-acoes">
              <button type="button" className="botao botao--fantasma" disabled={!p.arquivos.length || fechado || !aberto}
                onClick={() => postar('/fechar-envio')} data-teste="fechar-envio">
                {fechado ? 'Envio fechado, aguardando o pedido' : 'Terminei de enviar'}
              </button>
            </div>}
          </section>

          <section className="cartao" aria-labelledby="t-pedido">
            <h2 className="cartao__titulo" id="t-pedido"><span className="num">02</span> Pedido</h2>
            <Pedido atual={p.dados?.pedido?.texto ?? null} aberto={aberto} aoMandar={(c) => postar('/pedido', c)} />
          </section>
        </div>

        <div className="mesa__projecao">
          <section className="cartao relogio" aria-labelledby="t-relogio">
            <h2 className="cartao__titulo" id="t-relogio">
              <span className="num">03</span> Ilha ao vivo
              <span className="ao-vivo" data-conectado={conectado} style={{ marginLeft: 'auto' }}>{conectado ? 'ao vivo' : 'reconectando'}</span>
            </h2>
            <div className="relogio__linha">
              <p className="relogio__tc" data-correndo={correndo} aria-label={`Tempo de edição: ${tc(decorrido)}`}>{tc(decorrido)}</p>
              <p className="relogio__meta">
                {inicioRelogio === null ? <>começa quando<br />você fechar o envio</>
                  : fimRelogio !== null ? <>entregue<br />{decorrido <= TETO_MS ? `sobraram ${tc(TETO_MS - decorrido)}` : `passou ${tc(decorrido - TETO_MS)}`}</>
                  : <>de 30:00<br />{decorrido <= TETO_MS ? `faltam ${tc(TETO_MS - decorrido)}` : `passou ${tc(decorrido - TETO_MS)}`}</>}
              </p>
            </div>
            <div className="regua" aria-hidden="true">
              <div className="regua__trilho" />
              <div className="regua__feito" style={{ width: `${Math.min(100, (decorrido / TETO_MS) * 100)}%` }} />
              {inicioRelogio !== null && ESTADOS.slice(2).map((est) => marcas[est] ? (
                <span key={est} className={`regua__marca${est === 'entregue' ? ' regua__marca--entrega' : ''}`} title={ROTULO_ESTADO[est]}
                  style={{ left: `${Math.min(100, Math.max(0, ((marcas[est] - inicioRelogio) / TETO_MS) * 100))}%` }} />
              ) : null)}
              <div className="regua__escala"><span>0</span><span>10</span><span>20</span><span>30 min</span></div>
            </div>
            <ol className="trilha" style={{ marginTop: 20 }}>
              {ESTADOS.map((est, i) => {
                const situacao = p.estado === 'entregue' || i < indiceAtual ? 'feito' : i === indiceAtual ? 'agora' : 'falta';
                const ultimo = ultimaPorEstado[est];
                const progresso = situacao === 'agora' && ultimo?.tipo === 'etapa_progresso' ? ultimo.progresso ?? 0 : null;
                return (
                  <li className="passo" key={est} data-situacao={situacao} data-passo={est}>
                    <span className="passo__ponto">{situacao === 'feito' ? '✓' : i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <p className="passo__nome">{ROTULO_ESTADO[est]}</p>
                      <p className="passo__msg">{situacao !== 'falta' && ultimo?.mensagem ? ultimo.mensagem : EXPLICA_ESTADO[est]}</p>
                      {progresso !== null && <div className="barra"><i style={{ transform: `scaleX(${progresso})` }} /></div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="cartao" aria-labelledby="t-versoes">
            <h2 className="cartao__titulo" id="t-versoes"><span className="num">04</span> Versões</h2>
            {assistir ? (
              <video key={assistir.id} className="player" controls playsInline preload="metadata" data-teste="player" data-versao={assistir.id}
                src={`/api/motor/v1/arquivos/${assistir.video}#t=0.1`} aria-label={`Versão ${assistir.id}`} />
            ) : (
              <div className="player-vazio"><p>A primeira versão aparece aqui assim que passar no QA.</p></div>
            )}
            {versoes.length > 0 && (
              <ul className="versoes">
                {versoes.map((v) => <LinhaVersao key={v.id} v={v} aoReprovar={(motivo) => postar(`/versoes/${v.id}/reprovar`, { motivo })} />)}
              </ul>
            )}
          </section>

          {diario.length > 0 && (
            <details className="cartao">
              <summary className="cartao__titulo" style={{ margin: 0 }}>Diário da ilha ({eventos.length})</summary>
              <ol className="diario" style={{ marginTop: 8 }}>
                {diario.map((e) => <li key={e.id}><time dateTime={e.ts}>{hora(e.ts)}</time>{e.mensagem}</li>)}
              </ol>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}

function Importar({ aberto, aoImportar }: { aberto: boolean; aoImportar: (url: string) => Promise<unknown> }) {
  const [url, setUrl] = useState('');
  const [indo, setIndo] = useState(false);
  return (
    <form className="importar" onSubmit={async (e) => {
      e.preventDefault();
      if (!url.trim()) return;
      setIndo(true);
      if (await aoImportar(url.trim())) setUrl('');
      setIndo(false);
    }}>
      <label className="so-leitor" htmlFor="link-importar">Link compartilhado do Dropbox ou do Drive</label>
      <input id="link-importar" className="entrada" type="url" inputMode="url" placeholder="Ou cole um link do Dropbox / Drive"
        value={url} onChange={(e) => setUrl(e.target.value)} disabled={!aberto} />
      <button className="botao botao--fantasma" type="submit" disabled={!aberto || indo || !url.trim()}>{indo ? 'Indo…' : 'Importar'}</button>
    </form>
  );
}

function Pedido({ atual, aberto, aoMandar }: { atual: string | null; aberto: boolean; aoMandar: (c: object) => Promise<unknown> }) {
  const [indo, setIndo] = useState(false);
  if (atual && !aberto) {
    return <p style={{ whiteSpace: 'pre-wrap' }} data-teste="pedido-atual">“{atual}”</p>;
  }
  return (
    <form className="form" style={{ gap: 12, maxWidth: 'none' }} onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const texto = String(f.get('texto') ?? '').trim();
      if (!texto) return;
      const duracao = Number(f.get('duracao') ?? 0);
      setIndo(true);
      await aoMandar({ texto, ...(duracao ? { duracao_alvo: duracao } : {}) });
      setIndo(false);
    }}>
      {atual && <p className="aviso" data-teste="pedido-atual">Pedido atual: “{atual}”. Mande de novo para trocar.</p>}
      <label className="campo">
        <span className="campo__rotulo">O que você quer deste vídeo?</span>
        <textarea className="entrada" name="texto" maxLength={4000} required
          placeholder="Ex.: Reels de 45 s do bastidor, abre com a minha fala mais forte, fecha chamando para o @creat.mtt." />
      </label>
      <label className="campo">
        <span className="campo__rotulo">Duração</span>
        <select className="entrada" name="duracao" defaultValue="0">
          <option value="0">O editor decide</option>
          <option value="15">15 s</option>
          <option value="30">30 s</option>
          <option value="45">45 s</option>
          <option value="60">60 s</option>
          <option value="90">90 s</option>
        </select>
      </label>
      <button className="botao botao--principal" type="submit" disabled={indo} data-teste="mandar-pedido">{indo ? 'Mandando…' : 'Mandar pedido'}</button>
      <p className="aviso">A edição começa sozinha quando o envio estiver fechado e o material lido.</p>
    </form>
  );
}

function LinhaVersao({ v, aoReprovar }: { v: Versao; aoReprovar: (motivo: string) => Promise<unknown> }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const qa = lerQa(v.qa);
  const ok = qa?.checagens.filter((c) => c.ok).length ?? 0;
  const estado = v.estado === 'entregue' || v.estado === 'aprovada' ? 'chip chip--ok' : v.estado === 'reprovada' ? 'chip chip--erro' : 'chip chip--vivo';
  return (
    <li className="versao" data-versao={v.id}>
      <div className="versao__linha">
        <span className="versao__nome">{v.id.toUpperCase()}</span>
        <span className={estado}>{v.estado}</span>
      </div>
      {qa && (
        <>
          <p className="aviso">QA {ok}/{qa.checagens.length} {qa.aprovado ? 'aprovado' : 'com pendência'}</p>
          <ul className="qa">{qa.checagens.map((c) => <li key={c.id} data-ok={c.ok}>{c.ok ? '✓' : '✕'} {NOME_CHECAGEM[c.id] ?? c.id}</li>)}</ul>
        </>
      )}
      {v.reprovacao && <p className="aviso">Reprovada: “{v.reprovacao}”</p>}
      {v.video && v.estado !== 'reprovada' && (
        aberto ? (
          <form className="form" style={{ gap: 8, maxWidth: 'none' }} onSubmit={async (e) => {
            e.preventDefault();
            if (motivo.trim().length < 3) return;
            await aoReprovar(motivo.trim());
            setAberto(false); setMotivo('');
          }}>
            <label className="campo">
              <span className="campo__rotulo">O que ficou errado? Vira regra da casa.</span>
              <textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={3} maxLength={1000} required
                placeholder="Ex.: a logo do cliente ficou serrilhada na abertura" />
            </label>
            <div className="linha-acoes" style={{ marginTop: 0 }}>
              <button className="botao botao--perigo" type="submit">Reprovar {v.id}</button>
              <button className="botao botao--fantasma" type="button" onClick={() => setAberto(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="linha-acoes" style={{ marginTop: 0 }}>
            <a className="botao botao--fantasma botao--pequeno" href={`/api/motor/v1/arquivos/${v.video}`} download>Baixar</a>
            <button className="botao botao--perigo botao--pequeno" type="button" onClick={() => setAberto(true)}>Reprovar com motivo</button>
          </div>
        )
      )}
    </li>
  );
}
