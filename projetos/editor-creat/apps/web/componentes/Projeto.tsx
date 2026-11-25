'use client';
// Mesa do projeto: material, pedido, status ao vivo (SSE do motor pelo proxy), relógio dos 30 minutos e versões.
// A tela segue o estado do projeto (aberto: material; pedido: o pedido; editando: o relógio; entregue: o filme) e a
// barra de comando, fixa no polegar, mostra sempre o próximo passo. Os data-teste do aceite ficam num elemento só cada.
import Cor from '@/componentes/Cor';
import LinkCliente from '@/componentes/LinkCliente';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Envio from './Envio';
import BarraConversa from './conversa/Barra';
import Fio from './conversa/Fio';
import MesaAoVivo, { AgoraNaMesa } from './conversa/MesaAoVivo';
import { useConversa } from './conversa/useConversa';
import { useFioAoVivo } from '@/lib/fio';
import { irEntrar } from '@/lib/pendentes';
import {
  bytesLegiveis, classeEstado, ESTADOS, ETAPA_DO_ESTADO, EXPLICA_ESTADO, ROTULO_ESTADO, rotuloTipo,
  type Evento, type Projeto as TProjeto, type Versao, MODOS, rotuloModo, perguntasDoModo } from '@/lib/estados';

type EstadoImportar = { indo: boolean; pendente: boolean };
const SEM_IMPORTACAO: EstadoImportar = { indo: false, pendente: false };
const TETO_MS = 30 * 60 * 1000;
const ESTADOS_ABERTOS = ['recebendo', 'lendo'];

function tc(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dois(m)}:${dois(ss)}` : `${dois(m)}:${dois(ss)}`;
}

type Checagem = { id: string; ok: boolean; bloqueia?: boolean; detalhe?: string };
// O motor grava em versoes.qa um JSON curto (aprovado + checagens); aceita string ou objeto.
function lerQa(qa: unknown): { aprovado?: boolean; checagens: Checagem[] } | null {
  let v = qa;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || !Array.isArray((v as { checagens?: unknown }).checagens)) return null;
  return v as { aprovado?: boolean; checagens: Checagem[] };
}
// Estados da VERSÃO (diferentes dos do projeto).
const ROTULO_VERSAO: Record<string, string> = {
  montando: 'montando', montada: 'conferindo', aprovada_qa: 'aprovada no QA', reprovada_qa: 'reprovada no QA',
  entregue: 'entregue', reprovada: 'reprovada por você', erro: 'erro',
};
function classeVersao(estado: string): string {
  if (estado === 'entregue' || estado === 'aprovada_qa') return 'chip chip--ok';
  if (estado === 'reprovada' || estado === 'reprovada_qa' || estado === 'erro') return 'chip chip--erro';
  return 'chip chip--vivo';
}
const NOME_CHECAGEM: Record<string, string> = {
  frase_repetida: 'frase repetida', tom_sala_sem_voz: 'tom de sala', logo_100: 'logo a 100%', lufs: 'LUFS', true_peak: 'pico',
  quadros_pretos: 'quadro preto', legenda_x_fala: 'legenda x fala', zona_segura: 'zona segura', legenda_sobre_rosto: 'legenda x rosto',
  formato: 'formato', duracao: 'duração', sincronia: 'sincronia', telas_desfocadas: 'telas', regra_memoria: 'regras da casa', cor_medida: 'cor', fala_cortada: 'fim das falas', voz_externa: 'voz de fora', cobertura_sintonia: 'cobertura em sintonia', fatos: 'fatos conferidos', olho_ia: 'olho de IA',
};

export default function Projeto({ inicial, parteMB }: { inicial: TProjeto; parteMB: number }) {
  const [p, setP] = useState(inicial);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [agora, setAgora] = useState<number | null>(null); // só no navegador: evita diferença servidor x cliente
  const [erro, setErro] = useState('');
  const [rascunho, setRascunho] = useState(false);       // o campo do pedido tem texto
  const [comecando, setComecando] = useState(false);     // fechando o envio e/ou mandando o pedido
  const [enviando, setEnviando] = useState(0);           // envios ainda subindo
  const [interrompidos, setInterrompidos] = useState(0); // envios parados (rede caiu, aba recarregada, pausa)
  const [importacao, setImportacao] = useState<EstadoImportar>(SEM_IMPORTACAO); // link colado ainda não importado
  const [batendo, setBatendo] = useState(false);         // claquete do Aprovar
  const [corta, setCorta] = useState(false);             // "Corta! Aprovada" na barra logo depois do Aprovar
  const [ajusteDe, setAjusteDe] = useState<string | null>(null); // versão com o formulário de ajuste aberto
  const formPedido = useRef<HTMLFormElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  // trava síncrona: o toque duplo chega antes de o React redesenhar o botão apagado, então `disabled` sozinho não basta
  const trava = useRef(false);
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

  // Status ao vivo e conversa: UM EventSource (SSE v2) leva a mesa e a conversa (lib/fio.ts). Os eventos que esta tela
  // já ouvia chegam aqui como antes (deduplicados por id); reconexão com Last-Event-ID, vigia de 40 s e volta da tela.
  const receber = useCallback((e: Evento) => {
    setEventos((l) => [...l, e].slice(-400));
    if (e.estado) {
      ultimoEstado.current = { estado: e.estado, t: performance.now() };
      setP((x) => ({ ...x, estado: e.estado! }));
    }
    if (['arquivo_recebido', 'etapa_fim', 'estado', 'versao_pronta', 'entregue', 'qa_reprovado', 'etapa_erro'].includes(e.tipo)) recarregar();
  }, [recarregar]);
  const fio = useFioAoVivo(inicial.id, receber, useCallback(() => irEntrar(inicial.id), [inicial.id]));
  const conectado = fio.conectado;
  // contexto da mensagem: a versão no player e o ponto em que ele está (o Nimbus responde "Entendi: 0:12, …")
  const conversa = useConversa(inicial.id, fio, {
    aoMudouProjeto: recarregar,
    contexto: () => {
      const v = document.querySelector<HTMLVideoElement>('[data-teste=player]');
      const versao = v?.dataset.versao;
      // só manda o ponto do player se ele assistiu (o #t=0.1 da capa não conta como "aqui")
      const t = v && v.played.length > 0 && Number.isFinite(v.currentTime) && v.currentTime > 0.2 ? Math.round(v.currentTime * 10) / 10 : undefined;
      return { tela: 'fio' as const, ...(versao && /^v[0-9]{1,3}$/.test(versao) ? { versao } : {}), ...(t !== undefined ? { t_player: t } : {}) };
    },
  });

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
  const temMaterial = p.arquivos.length > 0;
  const temPedido = Boolean(p.dados?.pedido?.texto);

  // O que ainda segura o fim do envio: nada some em silêncio quando o envio fecha (o Envio e o Importar desmontam).
  const bloqueio: { texto: string; alvo: 'envios' | 'importar' } | null = !aberto || fechado ? null
    : enviando > 0 ? { texto: `terminar de enviar ${enviando} vídeo${enviando > 1 ? 's' : ''}`, alvo: 'envios' }
    : interrompidos > 0 ? { texto: `retomar ${interrompidos} vídeo${interrompidos > 1 ? 's' : ''} interrompido${interrompidos > 1 ? 's' : ''}`, alvo: 'envios' }
    : importacao.indo ? { texto: 'esperar a conferência do link', alvo: 'importar' }
    : importacao.pendente ? { texto: 'importar (ou apagar) o link colado', alvo: 'importar' }
    : null;

  // "Começar a edição" num toque: grava o pedido e SÓ depois fecha o envio. Fechar primeiro dispararia a direção com o
  // pedido antigo (quando já havia um); e se o fechar falhar, fica "pedido gravado, envio aberto", que a barra já trata.
  async function enviarPedido(corpo: object): Promise<boolean> {
    if (trava.current || bloqueio) return false;
    trava.current = true;
    setComecando(true);
    try {
      if (!(await postar('/pedido', corpo))) return false;
      setRascunho(false);
      if (!fechado && temMaterial && !(await postar('/fechar-envio'))) return true; // pedido gravado; o erro fica na barra
      navigator.vibrate?.(8);
      return true;
    } finally {
      trava.current = false;
      setComecando(false);
    }
  }
  async function soFechar() {
    if (trava.current || bloqueio) return;
    trava.current = true;
    setComecando(true);
    try { await postar('/fechar-envio'); } finally { trava.current = false; setComecando(false); }
  }
  async function aprovar(vid: string) {
    if (trava.current) return;
    trava.current = true;
    setBatendo(true);
    navigator.vibrate?.(8);
    try {
      if (await postar(`/versoes/${vid}/aprovar`, {})) {
        setCorta(true);
        window.setTimeout(() => setCorta(false), 1800);
      }
    } finally { trava.current = false; setBatendo(false); }
  }
  async function reprovar(vid: string, motivo: string) {
    if (trava.current) return null;
    trava.current = true;
    try { return await postar(`/versoes/${vid}/reprovar`, { motivo }); } finally { trava.current = false; }
  }
  // requestSubmit não existe no Safari < 16: cai para reportValidity + evento de submit
  const submeterPedido = () => {
    const f = formPedido.current;
    if (!f) return;
    if (typeof f.requestSubmit === 'function') f.requestSubmit();
    else if (f.reportValidity()) f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };
  // A barra é fixa e cresce (linha de motivo, erro de 3 linhas): a altura real vira --altura-comando, que dá o fim da página
  // e a altura do player. Assim nada fica escondido atrás dela.
  useLayoutEffect(() => {
    const el = barraRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const raiz = document.documentElement;
    const medir = () => raiz.style.setProperty('--altura-comando', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => { ro.disconnect(); raiz.style.removeProperty('--altura-comando'); };
  }, []);
  const irPara = (id: string, foco?: string) => {
    const ir = () => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      if (foco) (document.querySelector(foco) as HTMLElement | null)?.focus({ preventScroll: true });
    };
    // com a conversa aberta, o material e o pedido estão escondidos: fecha a conversa e vai depois do redesenho
    if (conversa.aberta) { conversa.fechar(); window.setTimeout(ir, 60); return; }
    ir();
  };

  const versoes = [...(p.versoes ?? [])].reverse();
  // Regra do dono: nunca mostrar versão com erro conhecido. Só a versão ENTREGUE (QA aprovado) toca e baixa.
  const assistir = versoes.find((v) => v.estado === 'entregue' && v.video) ?? null;
  const emProducao = versoes.find((v) => v.estado !== 'entregue' && v.estado !== 'reprovada') ?? null;
  // a mesa ao vivo (onda 2) substitui o diário de 12 linhas: tudo o que a mesa fez, com quem, tempo, custo e achado
  const temMesa = conversa.montado.itens.some((it) => it.k === 'mesa');
  const trilha = (
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
  );
  const aprovadaAssistir = assistir ? Boolean(p.dados?.aprovadas?.[assistir.id]) : false;
  // fase da tela: decide a ordem dos cartões (CSS) e o que a barra de comando oferece
  const fase = p.estado === 'entregue' && assistir ? 'entregue' : aberto ? (fechado ? 'pedido' : 'aberto') : 'editando';
  const faltaMin = Math.max(0, TETO_MS - decorrido);

  // ---------- barra de comando: o próximo passo ----------
  const irAoBloqueio = (b: { alvo: 'envios' | 'importar' }) => {
    if (b.alvo === 'importar') irPara('t-material', '#link-importar');
    else irPara('t-material', '.envios button, #entrada-arquivo');
  };
  let comando: React.ReactNode;
  if (fase === 'aberto' && !temMaterial && !bloqueio) {
    comando = (
      <>
        <label className="botao botao--principal barra-comando__principal" htmlFor="entrada-arquivo">Escolher vídeos</label>
        <label className="botao botao--secundario barra-comando__secundario" htmlFor="link-importar">Colar link</label>
      </>
    );
  } else if (aberto && (!temPedido || rascunho || !fechado)) {
    // pronto para começar = material (ou envio já fechado) + pedido escrito + nada subindo, parado ou colado sem importar
    const faltaPedido = !rascunho && !temPedido;
    if (!bloqueio && faltaPedido) {
      // só falta o pedido: o botão principal leva até ele (âmbar = toque aqui agora; nunca âmbar apagado)
      comando = (
        <>
          <button type="button" className="botao botao--principal barra-comando__principal" data-teste="mandar-pedido"
            onClick={() => irPara('t-pedido', '#pedido-texto')}>
            Escrever o pedido
          </button>
          <span className="motivo" data-tipo="status">
            {fechado ? 'O envio já está fechado. Falta só o pedido.' : 'O material chegou. Falta só o pedido.'}
          </span>
        </>
      );
    } else {
      const falta = bloqueio ?? (faltaPedido ? { texto: 'escrever o pedido', alvo: 'pedido' as const } : null);
      const rotulo = comecando ? 'Começando…' : temPedido && fechado ? 'Mandar o pedido novo' : 'Começar a edição';
      comando = (
        <>
          <button type="button" className="botao botao--principal barra-comando__principal" data-teste="mandar-pedido"
            disabled={Boolean(falta) || comecando} aria-describedby={falta ? 'motivo-comando' : undefined}
            onClick={() => {
              if (trava.current) return;
              if (rascunho) submeterPedido();
              else if (temPedido && !fechado) void soFechar();
            }}>
            {rotulo}
          </button>
          {falta ? (
            <a className="motivo" id="motivo-comando" href={`#${falta.alvo === 'pedido' ? 'pedido-texto' : falta.alvo === 'importar' ? 'link-importar' : 't-material'}`}
              onClick={(e) => { e.preventDefault(); if (falta.alvo === 'pedido') irPara('t-pedido', '#pedido-texto'); else irAoBloqueio(falta); }}>
              Falta: <b>{falta.texto}</b>
            </a>
          ) : (
            <span className="motivo" data-tipo="status">
              {!fechado && !temPedido ? 'Fecha o envio e manda o pedido num toque.'
                : !fechado && !rascunho ? 'O pedido já chegou: este toque fecha o envio.'
                : !fechado ? 'Troca o pedido e fecha o envio.'
                : temPedido ? 'Troca o pedido atual.' : 'Manda o pedido e a edição começa.'}
            </span>
          )}
        </>
      );
    }
  } else if (aberto) {
    comando = (
      <>
        <p className="barra-comando__status" role="status"><strong>Tudo certo por aqui</strong><span>lendo o material · a edição começa sozinha</span></p>
        <button type="button" className="botao botao--secundario barra-comando__secundario" onClick={() => irPara('t-relogio')}>Ver ao vivo</button>
      </>
    );
  } else if (fase === 'entregue' && assistir && corta) {
    // a confirmação do Aprovar aparece onde o polegar está (o selo "Corta!" da versão fica fora da tela, abaixo do filme)
    comando = (
      <p className="barra-comando__status barra-comando__corta" role="status" data-teste="corta-barra">
        <strong><span className="claquete claquete--bateu" aria-hidden="true" />Corta! {assistir.id.toUpperCase()} aprovada</strong>
        <span>agora é mandar para o cliente</span>
      </p>
    );
  } else if (fase === 'entregue' && assistir && !aprovadaAssistir) {
    comando = (
      <>
        <button className="botao botao--ok barra-comando__principal" type="button" data-teste="aprovar" disabled={batendo}
          onClick={() => void aprovar(assistir.id)}>
          <span className={`claquete${batendo ? ' claquete--bateu' : ''}`} aria-hidden="true" />{batendo ? 'Batendo…' : `Aprovar a ${assistir.id.toUpperCase()}`}
        </button>
        <button className="botao botao--secundario barra-comando__secundario" type="button"
          onClick={() => { setAjusteDe(assistir.id); setTimeout(() => irPara(`ajuste-${assistir.id}`, `#ajuste-${assistir.id} textarea`), 30); }}>
          Pedir ajuste
        </button>
      </>
    );
  } else if (fase === 'entregue' && assistir) {
    comando = (
      <>
        <button className="botao botao--principal barra-comando__principal" type="button"
          onClick={() => irPara(`cliente-${assistir.id}`, `#cliente-${assistir.id} [data-teste=link-cliente-gerar]`)}>
          Mandar para o cliente
        </button>
        <a className="botao botao--secundario barra-comando__secundario" href={`/api/motor/v1/arquivos/${assistir.video}`} download>Baixar</a>
      </>
    );
  } else if (['erro', 'reprovado_qa'].includes(p.estado)) {
    comando = (
      <>
        <p className="barra-comando__status" role="status">
          <strong>{p.estado === 'erro' ? 'A edição parou com erro' : 'A conferência segurou a entrega'}</strong>
          <span>o motivo está na mesa ao vivo</span>
        </p>
        {temMesa && (
          <button type="button" className="botao botao--secundario barra-comando__secundario"
            onClick={() => irPara('mesa')} data-teste="ver-motivo">Ver motivo</button>
        )}
      </>
    );
  } else {
    // editando: o relógio já é o primeiro cartão da tela, então a barra só informa (sem "Ver ao vivo" repetido)
    comando = (
      <p className="barra-comando__status" role="status">
        <strong>{ROTULO_ESTADO[p.estado] ?? p.estado}</strong>
        <span>{inicioRelogio === null ? 'o relógio começa já' : decorrido <= TETO_MS ? `faltam ${tc(faltaMin)} dos 30:00` : `passou ${tc(decorrido - TETO_MS)} dos 30:00`}</span>
      </p>
    );
  }

  // ---------- blocos, já na ordem da fase ----------
  // A ordem do DOM é a ordem que o olho vê (Tab e VoiceOver seguem a tela). Os blocos têm chave: mudar de fase move o
  // cartão sem remontar (um envio em andamento não se perde).
  const blocoMaterial = (
    <section key="material" className="cartao bloco-material" aria-labelledby="t-material">
      <h2 className="cartao__titulo" id="t-material">Material</h2>
      {aberto && !fechado ? (
        <>
          <Envio projeto={p.id} parteMB={parteMB} aberto={aberto} aoConcluir={recarregar} aoMudarAtivos={setEnviando} aoMudarInterrompidos={setInterrompidos} />
          <Importar aberto={aberto} projeto={p.id} aoTerminar={recarregar} aoMudar={setImportacao} />
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
      {aberto && !fechado && (
        <div className="acao-cartao">
          <button type="button" className="botao botao--fantasma" disabled={!temMaterial || Boolean(bloqueio) || comecando}
            aria-describedby="motivo-fechar"
            onClick={() => void soFechar()} data-teste="fechar-envio">
            Terminei de enviar
          </button>
          <span className="motivo" data-tipo="status" id="motivo-fechar">
            {!temMaterial && !bloqueio ? <>Falta: <b>mandar 1 vídeo</b></> : bloqueio ? <>Falta: <b>{bloqueio.texto}</b></> : 'Só fecha o envio; a edição começa quando o pedido chegar.'}
          </span>
        </div>
      )}
    </section>
  );
  const blocoPedido = (
    <section key="pedido" className="cartao bloco-pedido" aria-labelledby="t-pedido">
      <h2 className="cartao__titulo" id="t-pedido">Pedido</h2>
      <Pedido pid={p.id} atual={p.dados?.pedido?.texto ?? null} aberto={aberto} formRef={formPedido}
        aoMudarTexto={setRascunho} aoMandar={enviarPedido} />
      {p.dados?.pedido?.texto && <p className="aviso" data-teste="modo-atual">Modo de edição: {rotuloModo(p.dados.pedido.modo)}</p>}
    </section>
  );
  const blocoRelogio = (
    <section key="relogio" className={`cartao relogio bloco-relogio${fase === 'entregue' ? ' relogio--recolhido' : ''}`} aria-labelledby="t-relogio">
      <h2 className="cartao__titulo" id="t-relogio">
        Ilha ao vivo
        {/* entregue: nada está acontecendo, então o ponto "gravando" sai */}
        {fase !== 'entregue' && <span className="ao-vivo" data-conectado={conectado} style={{ marginLeft: 'auto' }}>{conectado ? 'ao vivo' : 'reconectando'}</span>}
      </h2>
      <div className="relogio__linha">
        <p className="relogio__tc" data-correndo={correndo} aria-label={`Tempo de edição: ${tc(decorrido)}`}>{tc(decorrido)}</p>
        <p className="relogio__meta">
          {inicioRelogio === null ? <>começa quando<br />você fechar o envio</>
            : fimRelogio !== null ? <>entregue<br />{decorrido <= TETO_MS ? `sobraram ${tc(TETO_MS - decorrido)}` : `passou ${tc(decorrido - TETO_MS)}`}</>
            : <>de 30:00<br />{decorrido <= TETO_MS ? `faltam ${tc(TETO_MS - decorrido)}` : `passou ${tc(decorrido - TETO_MS)}`}</>}
        </p>
      </div>
      {fase !== 'entregue' && <AgoraNaMesa agora={conversa.montado.agora} compacto />}
      <div className="regua" aria-hidden="true">
        <div className="regua__trilho" />
        <div className="regua__feito" style={{ width: `${Math.min(100, (decorrido / TETO_MS) * 100)}%` }} />
        {inicioRelogio !== null && ESTADOS.slice(2).map((est) => marcas[est] ? (
          <span key={est} className={`regua__marca${est === 'entregue' ? ' regua__marca--entrega' : ''}`} title={ROTULO_ESTADO[est]}
            style={{ left: `${Math.min(100, Math.max(0, ((marcas[est] - inicioRelogio) / TETO_MS) * 100))}%` }} />
        ) : null)}
        <div className="regua__escala"><span>0</span><span>10</span><span>20</span><span>30 min</span></div>
      </div>
      {fase === 'entregue' ? (
        <details className="relogio__etapas">
          <summary>Ver as {ESTADOS.length} etapas</summary>
          {trilha}
        </details>
      ) : trilha}
    </section>
  );
  const blocoVersoes = (versoes.length > 0 || !aberto) ? (
    <section key="versoes" className={`cartao bloco-versoes${assistir ? ' palco' : ''}`} aria-labelledby="t-versoes">
      <h2 className={assistir ? 'so-leitor' : 'cartao__titulo'} id="t-versoes">{assistir ? 'Filme pronto e versões' : 'Versões'}</h2>
      {assistir ? (
        <video key={assistir.id} className="player" controls playsInline preload="metadata" data-teste="player" data-versao={assistir.id}
          src={`/api/motor/v1/arquivos/${assistir.video}#t=0.1`} aria-label={`Versão ${assistir.id}`} />
      ) : (
        <div className="player-vazio"><p>{
          emProducao?.estado === 'reprovada_qa' ? `A conferência automática segurou a ${emProducao.id.toUpperCase()}: ela não vai para o player.`
            : emProducao?.estado === 'erro' ? `A ${emProducao.id.toUpperCase()} parou com erro; o motivo está na mesa ao vivo.`
            : emProducao ? `A ${emProducao.id.toUpperCase()} está sendo feita. Ela aparece aqui quando passar na conferência.`
            : 'O filme aparece aqui quando passar na conferência.'}</p></div>
      )}
      {versoes.length > 0 && (
        <ul className="versoes">
          {versoes.map((v) => <LinhaVersao key={v.id} pid={p.id} v={v} aprovada={Boolean(p.dados?.aprovadas?.[v.id])}
            naBarra={v.id === assistir?.id} ajusteAberto={ajusteDe === v.id} aoAbrirAjuste={(sim) => setAjusteDe(sim ? v.id : null)}
            aoAprovar={() => aprovar(v.id)} batendo={batendo}
            aoReprovar={(motivo) => reprovar(v.id, motivo)} />)}
        </ul>
      )}
    </section>
  ) : null;
  // com a conversa aberta, o fio já mostra a mesa (a mesma linha do tempo): o cartão não fica escondido duplicando as linhas
  const blocoDiario = conversa.aberta ? null : (
    <MesaAoVivo key="mesa-ao-vivo" montado={conversa.montado} progresso={fio.progresso} arquivos={p.arquivos.map((a) => a.id)} conectado={conectado}
      aoAbrirConversa={conversa.abrir} />
  );
  // aberto: material, pedido | pedido: pedido, material | editando: relógio, versões, diário, pedido, material
  // entregue: filme, relógio, diário, pedido, material. No desktop a mesa fica à esquerda e a projeção à direita (CSS).
  const mesa = (
    <div className="mesa__mesa" key="mesa">{fase === 'aberto' ? [blocoMaterial, blocoPedido] : [blocoPedido, blocoMaterial]}</div>
  );
  const projecao = (
    <div className="mesa__projecao" key="projecao">
      {fase === 'entregue' ? [blocoVersoes, blocoRelogio, blocoDiario] : [blocoRelogio, blocoVersoes, blocoDiario]}
    </div>
  );

  return (
    <main className="pagina pagina--comando" data-conversa={conversa.aberta ? 'aberta' : 'fechada'} data-espera={conversa.montado.espera ? 'sim' : undefined}>
      <div className="cabeca-projeto">
        <div className="cabeca-projeto__linha">
          <p className="sobretitulo">{rotuloTipo(p.tipo_video)} · {p.arquivos.length} arquivo{p.arquivos.length === 1 ? '' : 's'}</p>
          <span className={classeEstado(p.estado)} data-teste="estado" data-estado={p.estado}>{ROTULO_ESTADO[p.estado] ?? p.estado}</span>
        </div>
        <h1 className="titulo titulo--projeto">{p.nome}</h1>
      </div>

      <div className="mesa" data-fase={fase}>
        {fase === 'editando' || fase === 'entregue' ? [projecao, mesa] : [mesa, projecao]}
      </div>

      {conversa.aberta && (
        <Fio c={conversa} arquivos={p.arquivos.map((a) => a.id)} palco={{ nome: p.nome, estado: p.estado, rotuloEstado: ROTULO_ESTADO[p.estado] ?? p.estado,
          classeEstado: classeEstado(p.estado), tc: tc(decorrido), correndo }} />
      )}

      {/* Tocar num botão da barra com um campo de texto em foco: o botão NÃO pode roubar o foco no toque, senão a navegação
          reaparece, a barra sobe debaixo do dedo e o primeiro toque se perde (achado da conferência final, 25/11). O foco só
          sai do campo no clique, quando o alvo já está decidido. */}
      <div className="barra-comando" role="region" aria-label="Próximo passo" ref={barraRef}
        onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}
        onClickCapture={(e) => {
          const alvo = e.target as HTMLElement;
          // a linha da conversa cuida do próprio foco (o teclado fica aberto entre uma mensagem e outra)
          if (alvo.closest('.conversa-barra')) return;
          if (conversa.aberta && alvo.closest('.barra-comando__dentro')) conversa.fechar();
          const foco = document.activeElement as HTMLElement | null;
          if (alvo.closest('button') && foco && /^(TEXTAREA|INPUT|SELECT)$/.test(foco.tagName)) foco.blur();
        }}>
        <BarraConversa c={conversa} />
        <div className="barra-comando__dentro" key={`${fase}-${temMaterial}-${temPedido}-${aprovadaAssistir}-${corta}`}>
          {comando}
          {erro && <p className="erro" role="alert">{erro}</p>}
        </div>
      </div>
    </main>
  );
}

// Links do Dropbox ou do Drive: um ou VÁRIOS de uma vez (o dono compartilha 4 vídeos e cola os 4 links juntos). Cada link entra
// na fila do motor; o resultado aparece aqui mesmo, embaixo do botão (no celular o topo da página fica fora da vista).
export function extrairLinks(texto: string): string[] {
  const achados = texto.match(/https:\/\/[^\s<>"'”“]+/g) ?? [];
  return [...new Set(achados.map((u) => u.replace(/[),.;!?]+$/, '')))].slice(0, 30);
}

// nome curto do link para a mensagem: o arquivo do caminho (C0016.MP4) ou o site
function rotuloLink(url: string): string {
  try {
    const u = new URL(url);
    const ultimo = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    return /\.[a-z0-9]{2,4}$/i.test(ultimo) ? ultimo.slice(0, 40) : `${u.hostname}${u.pathname}`.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

function Importar({ aberto, projeto, aoTerminar, aoMudar }: {
  aberto: boolean; projeto: string; aoTerminar: () => void;
  /** link colado e ainda não importado (ou conferindo): a barra não deixa fechar o envio e perder o link em silêncio */
  aoMudar?: (s: EstadoImportar) => void;
}) {
  const [texto, setTexto] = useState('');
  const [indo, setIndo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; erros: string[]; avisos: string[] } | null>(null);
  const links = extrairLinks(texto);
  // pendente = colado e nunca tentado. Se o Importar já foi tocado e o link foi recusado, o erro está na tela: não segura.
  const [tentado, setTentado] = useState('');
  const pendente = texto.trim().length > 0 && !indo && texto !== tentado;
  useEffect(() => { aoMudar?.({ indo, pendente }); }, [indo, pendente, aoMudar]);
  useEffect(() => () => aoMudar?.(SEM_IMPORTACAO), [aoMudar]);
  return (
    <form className="importar" noValidate data-teste="importar" onSubmit={async (e) => {
      e.preventDefault();
      if (!links.length) { setResultado({ ok: 0, erros: ['Não achei nenhum link https no que foi colado.'], avisos: [] }); return; }
      setIndo(true); setResultado(null); setTentado(texto);
      let ok = 0;
      // o motor confere cada link na hora; o mesmo motivo (ex.: link restrito da equipe) aparece UMA vez, com quantos links tem
      const porMotivo = new Map<string, string[]>();
      const falhar = (url: string, motivo: string) => porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), rotuloLink(url)]);
      const avisos = new Set<string>();
      const um = async (url: string) => {
        let host = '';
        try { host = new URL(url).hostname.toLowerCase(); } catch { /* inválido */ }
        if (!/(^|\.)(dropbox\.com|dropboxusercontent\.com|drive\.google\.com|docs\.google\.com)$/.test(host)) {
          falhar(url, 'não é link do Dropbox nem do Google Drive.');
          return;
        }
        try {
          const r = await fetch(`/api/motor/v1/projetos/${projeto}/importar`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
          });
          if (r.status === 401) { saiu = true; return; }
          const c = await r.json().catch(() => null);
          if (r.ok) { ok += 1; if (typeof c?.aviso === 'string') avisos.add(c.aviso); }
          else falhar(url, typeof c?.detail === 'string' ? c.detail : `O motor recusou (erro ${r.status}).`);
        } catch {
          falhar(url, 'sem conexão com o editor agora. Confira a internet e toque em Importar de novo.');
        }
      };
      // o motor confere cada link na hora (até ~15 s cada): 4 de cada vez, para 30 links não virarem minutos de espera
      let saiu = false;
      const fila = [...links];
      await Promise.all(Array.from({ length: Math.min(4, fila.length) }, async () => {
        for (let u = fila.shift(); u !== undefined && !saiu; u = fila.shift()) await um(u);
      }));
      if (saiu) { window.location.assign('/entrar'); return; }
      setIndo(false);
      const erros = [...porMotivo].map(([m, quais]) => {
        const nomes = quais.slice(0, 3).join(', ') + (quais.length > 3 ? ` e mais ${quais.length - 3}` : '');
        return links.length > 1 ? `${quais.length} de ${links.length} links (${nomes}): ${m}` : `${nomes}: ${m}`;
      });
      setResultado({ ok, erros, avisos: [...avisos] });
      if (ok) { setTexto(''); aoTerminar(); }
    }}>
      <label className="so-leitor" htmlFor="link-importar">Links compartilhados do Dropbox ou do Drive</label>
      <textarea id="link-importar" className="entrada" rows={2} inputMode="url" placeholder="Ou cole links do Dropbox ou Drive"
        value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!aberto} data-teste="importar-links" style={{ resize: 'vertical', minHeight: 48 }} />
      <button className="botao botao--fantasma" type="submit" disabled={!aberto || indo || !texto.trim()} data-teste="importar-enviar">
        {indo ? 'Conferindo o link…' : links.length > 1 ? `Importar ${links.length} links` : 'Importar'}
      </button>
      {resultado && (
        <div style={{ flexBasis: '100%' }} role="status" data-teste="importar-resultado">
          {resultado.ok > 0 && <p className="aprovada" style={{ margin: 0 }}>{resultado.ok} link{resultado.ok > 1 ? 's' : ''} na fila: o motor baixa e já começa a ler.</p>}
          {resultado.avisos.map((av) => <p key={av} className="aviso" style={{ margin: '4px 0 0' }}>Aviso: {av}.</p>)}
          {resultado.erros.map((er) => <p key={er} className="erro" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{er}</p>)}
        </div>
      )}
    </form>
  );
}

// O formulário do pedido não tem botão próprio: quem manda é a barra de comando ("Começar a edição"), que chama
// requestSubmit() neste form. Assim o pedido vai e o envio fecha no mesmo toque. Sem botão de enviar, o Enter no único
// campo de uma linha mandaria o form sozinho (envio implícito do HTML), pulando as travas da barra: ele é bloqueado.
// O rascunho (texto, modo, duração) fica na sessão da aba: recarregar ou o iPhone descarregar a aba não apaga o pedido.
type Rascunho = { texto?: string; modo?: string; duracao?: string; precisa?: string };
function Pedido({ pid, atual, aberto, aoMandar, formRef, aoMudarTexto }: {
  pid: string; atual: string | null; aberto: boolean; aoMandar: (c: object) => Promise<boolean>;
  formRef: React.RefObject<HTMLFormElement | null>; aoMudarTexto: (temTexto: boolean) => void;
}) {
  const [modoSel, setModoSel] = useState('auto');
  const chave = `ec-pedido-${pid}`;
  const mostraForm = !(atual && !aberto);
  useEffect(() => {
    const f = formRef.current;
    if (!mostraForm || !f) return;
    let r: Rascunho | null = null;
    try { r = JSON.parse(sessionStorage.getItem(chave) ?? 'null') as Rascunho | null; } catch { r = null; }
    if (!r) return;
    const campo = (n: string) => f.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    const texto = campo('texto');
    if (r.texto && texto && !texto.value) { texto.value = r.texto; aoMudarTexto(r.texto.trim().length > 0); }
    if (r.modo && r.modo !== 'auto') {
      const radio = f.querySelector<HTMLInputElement>(`input[name=modo][value="${CSS.escape(r.modo)}"]`);
      if (radio) { radio.checked = true; setModoSel(r.modo); }
    }
    const dur = campo('duracao');
    if (r.duracao && dur) dur.value = r.duracao;
    const precisa = campo('precisa');
    if (r.precisa && precisa && !precisa.value) precisa.value = r.precisa;
  }, [chave, mostraForm, formRef, aoMudarTexto]);
  const guardar = (f: HTMLFormElement) => {
    try {
      const d = new FormData(f);
      const r: Rascunho = { texto: String(d.get('texto') ?? ''), modo: String(d.get('modo') ?? 'auto'), duracao: String(d.get('duracao') ?? '0'), precisa: String(d.get('precisa') ?? '') };
      if (r.texto || r.precisa || r.modo !== 'auto' || r.duracao !== '0') sessionStorage.setItem(chave, JSON.stringify(r));
      else sessionStorage.removeItem(chave);
    } catch { /* aba privada ou armazenamento bloqueado: segue sem rascunho */ }
  };
  if (!mostraForm) {
    return <p style={{ whiteSpace: 'pre-wrap' }} data-teste="pedido-atual">“{atual}”</p>;
  }
  return (
    <form className="form" ref={formRef} id="form-pedido" style={{ gap: 12, maxWidth: 'none' }}
      onChange={(e) => guardar(e.currentTarget)} onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const texto = String(f.get('texto') ?? '').trim();
      if (!texto) return;
      const duracao = Number(f.get('duracao') ?? 0);
      const modo = String(f.get('modo') ?? 'auto');
      const extra: Record<string, unknown> = { obrigatorio: [] as string[], proibido: [] as string[] };
      for (const q of perguntasDoModo(modo)) {
        const marcados = f.getAll(`q_${q.id}`).map(String).filter(Boolean);
        if (!marcados.length) continue;
        if (q.campo === 'formato') extra.formato = marcados[0];
        else if (q.campo === 'destino') extra.destino = marcados;
        else if (q.campo === 'ambiente') extra.ambiente = marcados[0];
        else if (q.campo === 'vozes') extra.vozes = marcados[0];
        else (extra[q.campo] as string[]).push(...marcados);
      }
      const livre = String(f.get('precisa') ?? '').trim();
      if (livre) (extra.obrigatorio as string[]).push(livre.slice(0, 200));
      if (await aoMandar({ texto, modo, ...extra, ...(duracao ? { duracao_alvo: duracao } : {}) })) {
        form.reset();
        setModoSel('auto');
        aoMudarTexto(false);
        try { sessionStorage.removeItem(chave); } catch { /* sem armazenamento */ }
      }
    }}>
      {atual && <p className="aviso" data-teste="pedido-atual">Pedido atual: “{atual}”. Mande de novo para trocar.</p>}
      <label className="campo">
        <span className="campo__rotulo">O que você quer deste vídeo?</span>
        <textarea className="entrada" id="pedido-texto" name="texto" maxLength={4000} required
          onChange={(e) => aoMudarTexto(e.currentTarget.value.trim().length > 0)}
          placeholder="Ex.: Reels de 45 s do bastidor, abre com a minha fala mais forte, fecha chamando para o @creat.mtt." />
      </label>
      <fieldset className="campo" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="campo__rotulo" style={{ marginBottom: 8 }}>Modo de edição</legend>
        <div className="opcoes" data-teste="modos">
          {MODOS.map((m, i) => (
            <label className="opcao" key={m.valor} title={m.dica}>
              <input type="radio" name="modo" value={m.valor} defaultChecked={i === 0} onChange={() => setModoSel(m.valor)} />
              <span>{m.rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="perguntas" data-teste="perguntas">
        <p className="aviso" style={{ margin: 0 }}>O editor pergunta o que falta. Toque nas respostas; o que ficar sem resposta ele decide.</p>
        {perguntasDoModo(modoSel).map((q) => (
          <fieldset className="campo" key={`${modoSel}-${q.id}`} style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="campo__rotulo" style={{ marginBottom: 6 }}>{q.texto}</legend>
            <div className="opcoes">
              {q.opcoes.map((o, i) => (
                <label className="opcao" key={o.rotulo}>
                  <input type={q.tipo === 'um' ? 'radio' : 'checkbox'} name={`q_${q.id}`} value={o.valor} defaultChecked={q.tipo === 'um' && i === 0 && q.campo !== 'formato' ? true : q.id === 'formato' && i === 0} />
                  <span>{o.rotulo}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="campo">
          <span className="campo__rotulo">Algo que precisa aparecer? (opcional)</span>
          <input className="entrada" name="precisa" maxLength={200} placeholder="Ex.: a frase da Lavínia sobre calorias" autoComplete="off"
            enterKeyHint="done" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
        </label>
      </div>
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
      <p className="aviso">Quando estiver pronto, toque em <strong>Começar a edição</strong>, aqui embaixo.</p>
    </form>
  );
}

// naBarra: é a versão no player; o Aprovar e o "Pedir ajuste" dela moram na barra de comando (data-teste num lugar só).
function LinhaVersao({ pid, v, aprovada, naBarra, ajusteAberto, aoAbrirAjuste, batendo, aoAprovar, aoReprovar }: {
  pid: string; v: Versao; aprovada: boolean; naBarra: boolean; ajusteAberto: boolean; aoAbrirAjuste: (sim: boolean) => void;
  batendo: boolean; aoAprovar: () => Promise<unknown>; aoReprovar: (motivo: string) => Promise<unknown>;
}) {
  const aberto = ajusteAberto;
  const setAberto = aoAbrirAjuste;
  const [motivo, setMotivo] = useState('');
  const qa = lerQa(v.qa);
  const ok = qa?.checagens.filter((c) => c.ok).length ?? 0;
  const estado = classeVersao(v.estado);
  const entregue = v.estado === 'entregue';
  const podeReprovar = ['entregue', 'reprovada_qa', 'erro'].includes(v.estado);
  return (
    <li className="versao" data-versao={v.id}>
      <div className="versao__linha">
        <span className="versao__nome">{v.id.toUpperCase()}</span>
        <span className={estado} data-estado-versao={v.estado}>{ROTULO_VERSAO[v.estado] ?? v.estado}</span>
      </div>
      {qa && (
        <>
          <p className="aviso">QA {ok}/{qa.checagens.length} {qa.aprovado ? 'aprovado' : 'com pendência'}</p>
          <ul className="qa">{qa.checagens.map((c) => <li key={c.id} data-ok={c.ok} title={c.detalhe || undefined}>{c.ok ? '✓' : '✕'} {NOME_CHECAGEM[c.id] ?? c.id}</li>)}</ul>
          {qa.checagens.filter((c) => !c.ok && c.bloqueia !== false && c.detalhe).slice(0, 3).map((c) => (
            <p className="aviso" key={`d-${c.id}`} style={{ overflowWrap: 'anywhere' }}>{NOME_CHECAGEM[c.id] ?? c.id}: {c.detalhe}</p>
          ))}
          {qa.checagens.filter((c) => !c.ok && c.bloqueia === false && c.detalhe).slice(0, 4).map((c) => (
            <p className="aviso" key={`a-${c.id}`} data-teste="qa-aviso" style={{ overflowWrap: 'anywhere' }}>Aviso · {NOME_CHECAGEM[c.id] ?? c.id}: {c.detalhe}</p>
          ))}
          {qa.checagens.filter((c) => c.ok && c.id === 'olho_ia' && c.detalhe && /custo US\$/.test(c.detalhe)).map((c) => (
            <p className="aviso" key="olho" data-teste="qa-olho" style={{ overflowWrap: 'anywhere' }}>Olho de IA: {c.detalhe}</p>
          ))}
        </>
      )}
      {entregue && v.video && <Cor base={v.video.replace(/\/final\.mp4$/, '')} />}
      {entregue && v.video && <div id={`cliente-${v.id}`}><LinkCliente pid={pid} versao={v.id} /></div>}
      {v.reprovacao && <p className="aviso">Reprovada: “{v.reprovacao}”</p>}
      {aprovada && <p className="aprovada" data-teste="aprovada"><span className="claquete claquete--bateu" aria-hidden="true" />Corta! Aprovada por você. Bora postar.</p>}
      {podeReprovar && (
        aberto ? (
          <form className="form" id={`ajuste-${v.id}`} style={{ gap: 8, maxWidth: 'none' }} onSubmit={async (e) => {
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
              <button className="botao botao--perigo" type="submit">Pedir ajuste da {v.id.toUpperCase()}</button>
              <button className="botao botao--fantasma" type="button" onClick={() => setAberto(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="linha-acoes" style={{ marginTop: 0 }}>
            {entregue && v.video && <a className="botao botao--fantasma botao--pequeno" href={`/api/motor/v1/arquivos/${v.video}`} download data-teste="baixar">Baixar</a>}
            {entregue && !aprovada && !naBarra && (
              <button className="botao botao--ok botao--pequeno" type="button" disabled={batendo} onClick={() => void aoAprovar()}>
                <span className={`claquete${batendo ? ' claquete--bateu' : ''}`} aria-hidden="true" />{batendo ? 'Batendo…' : 'Aprovar'}
              </button>
            )}
            {!aprovada && !naBarra && <button className="botao botao--perigo botao--pequeno" type="button" onClick={() => setAberto(true)}>Reprovar com motivo</button>}
          </div>
        )
      )}
    </li>
  );
}
