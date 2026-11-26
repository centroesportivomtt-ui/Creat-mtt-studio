'use client';
// Mesa do projeto: material, pedido, status ao vivo (SSE do motor pelo proxy), relógio dos 30 minutos e versões.
// A tela segue o estado do projeto (aberto: material; pedido: o pedido; editando: o relógio; entregue: o filme) e a
// barra de comando, fixa no polegar, mostra sempre o próximo passo. Os data-teste do aceite ficam num elemento só cada.
import Cor from '@/componentes/Cor';
import LinkCliente from '@/componentes/LinkCliente';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ApagarProjeto from './ApagarProjeto';
import Envio from './Envio';
import Notas, { lerNotas } from './Notas';
import Segurada from './Segurada';
import { lerMarcas, type ListaMarcas } from './Marcas';
import BarraConversa from './conversa/Barra';
import Fio from './conversa/Fio';
import MesaAoVivo, { AgoraNaMesa } from './conversa/MesaAoVivo';
import { useConversa } from './conversa/useConversa';
import { useFioAoVivo } from '@/lib/fio';
import { irEntrar } from '@/lib/pendentes';
import * as Acoes from '@/lib/acoes';
import {
  bytesLegiveis, classeEstado, ESTADOS, ETAPA_DO_ESTADO, EXPLICA_ESTADO, ROTULO_ESTADO, rotuloTipo,
  type Evento, type Projeto as TProjeto, type Versao, MODOS, rotuloModo, perguntasDoModo,
  type ClientesEntregas, type Entregas, type ResumoNuvem, nomeCliente } from '@/lib/estados';

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
  // versão segurada pela conferência: qual está no lugar do player e se o dono abriu para assistir (onda 4, item 6)
  const [seguradaSel, setSeguradaSel] = useState<string | null>(null);
  const [seguradaAberta, setSeguradaAberta] = useState(false);
  // Página de entregas no Cloudflare: só aparece quando o motor diz que está ligada (sem as variáveis, nada muda na tela).
  const [clientesEnt, setClientesEnt] = useState<ClientesEntregas | null>(null);
  const [clienteEnt, setClienteEnt] = useState('');      // "Vai para as entregas de:" (escolhido ANTES de aprovar)
  const [mandarEnt, setMandarEnt] = useState(true);      // o dono pode aprovar SEM mandar (a página é pública para quem tem o link)
  const [entregas, setEntregas] = useState<Record<string, Entregas>>({});
  const entregasLigadas = useRef(false);
  const formPedido = useRef<HTMLFormElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  // trava síncrona: o toque duplo chega antes de o React redesenhar o botão apagado, então `disabled` sozinho não basta
  const trava = useRef(false);
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoEstado = useRef<{ estado: string; t: number } | null>(null);
  // onda 3: o que dá para refazer agora (R11). Lido com o projeto em erro, com a conferência segurando ou com vídeo de fora.
  const [refazerOps, setRefazerOps] = useState<Acoes.Opcoes | null>(null);
  const [refazendo, setRefazendo] = useState<string | null>(null);   // chave da opção tocada (trava visível)
  const leituraR11 = useRef(0);
  const [sinalR11, setSinalR11] = useState(0);                         // cada evento estado/etapa_erro relê a R11

  // O estado das entregas mora em GET /versoes (o mesmo contrato do motor); só é pedido com as entregas ligadas.
  const carregarEntregas = useCallback(async () => {
    if (!entregasLigadas.current) return;
    const r = await fetch(`/api/motor/v1/projetos/${inicial.id}/versoes`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;                       // rede caiu: fica o último estado conhecido, nada some da tela
    const c = await r.json().catch(() => null);
    const lista: Versao[] = Array.isArray(c) ? c : Array.isArray(c?.versoes) ? c.versoes : [];
    const m: Record<string, Entregas> = {};
    for (const v of lista) if (v?.entregas && typeof v.entregas.estado === 'string') m[v.id] = v.entregas;
    setEntregas(m);
  }, [inicial.id]);

  const recarregar = useCallback(() => {
    if (recarga.current) clearTimeout(recarga.current);
    recarga.current = setTimeout(async () => {
      void carregarEntregas();
      const pedidoEm = performance.now();
      const r = await fetch(`/api/motor/v1/projetos/${inicial.id}`, { cache: 'no-store' }).catch(() => null);
      if (r?.ok) {
        const novo = (await r.json()) as TProjeto;
        // Resposta atrasada não desfaz um estado que chegou depois pelo SSE.
        const u = ultimoEstado.current;
        if (u && u.t > pedidoEm) novo.estado = u.estado;
        setP(novo);
      } else if (r?.status === 401) irEntrar(inicial.id);
    }, 250);
  }, [inicial.id, carregarEntregas]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await fetch(`/api/motor/v1/entregas/clientes?projeto=${encodeURIComponent(inicial.id)}`, { cache: 'no-store' }).catch(() => null);
      const c = r?.ok ? ((await r.json().catch(() => null)) as ClientesEntregas | null) : null;
      if (!vivo || !c?.ligado || !Array.isArray(c.clientes) || !c.clientes.length) return;
      entregasLigadas.current = true;
      setClientesEnt(c);
      setClienteEnt((x) => x || c.sugerido || c.padrao || c.clientes[0].slug);
      void carregarEntregas();
    })();
    return () => { vivo = false; };
  }, [inicial.id, carregarEntregas]);
  // subindo ou retirando: confere de 4 em 4 s até terminar (o evento do motor também recarrega; isto é a rede de segurança).
  // Retirada que falhou por rede tem hora marcada (proxima): aí não fica batendo a cada 4 s, o evento do motor avisa.
  const entregaAndando = Object.values(entregas).some((e) => e.estado === 'enviando' || (e.estado === 'retirando' && !e.proxima));
  useEffect(() => {
    if (!entregaAndando) return;
    const t = setInterval(() => void carregarEntregas(), 4000);
    return () => clearInterval(t);
  }, [entregaAndando, carregarEntregas]);

  // R11: lido ao abrir, a cada mudança do projeto (estado, vídeo que ficou de fora, versão) e quando a tela volta.
  const temFora = p.arquivos.some((a) => a.estado === 'falhou');
  const precisaR11 = ['erro', 'reprovado_qa'].includes(p.estado) || temFora;
  const chaveR11 = `${p.estado}|${p.arquivos.map((a) => `${a.id}:${a.estado}`).join(',')}|${(p.versoes ?? []).map((v) => `${v.id}:${v.estado}`).join(',')}`;
  const lerRefazer = useCallback(async () => {
    const n = ++leituraR11.current;
    const r = await Acoes.refazerOpcoes(inicial.id);
    if (n !== leituraR11.current) return;               // resposta atrasada não desfaz uma leitura mais nova
    if (r.ok) setRefazerOps(r.dados);
    else if (r.status === 401) irEntrar(inicial.id);
  }, [inicial.id]);
  useEffect(() => {
    if (!precisaR11) { leituraR11.current++; setRefazerOps(null); return; }
    // a reconexão do SSE repassa a história: vários eventos juntos viram UMA leitura
    const t = window.setTimeout(() => void lerRefazer(), 250);
    return () => window.clearTimeout(t);
  }, [precisaR11, chaveR11, sinalR11, lerRefazer]);
  useEffect(() => {
    if (!precisaR11) return;
    const vis = () => { if (document.visibilityState === 'visible') void lerRefazer(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [precisaR11, lerRefazer]);

  // Status ao vivo e conversa: UM EventSource (SSE v2) leva a mesa e a conversa (lib/fio.ts). Os eventos que esta tela
  // já ouvia chegam aqui como antes (deduplicados por id); reconexão com Last-Event-ID, vigia de 40 s e volta da tela.
  const receber = useCallback((e: Evento) => {
    setEventos((l) => [...l, e].slice(-400));
    if (e.estado) {
      ultimoEstado.current = { estado: e.estado, t: performance.now() };
      setP((x) => ({ ...x, estado: e.estado! }));
    }
    if (['arquivo_recebido', 'etapa_fim', 'estado', 'versao_pronta', 'entregue', 'qa_reprovado', 'etapa_erro'].includes(e.tipo)) recarregar();
    if (e.tipo === 'estado' || e.tipo === 'etapa_erro' || e.tipo === 'aviso') setSinalR11((n) => n + 1);
  }, [recarregar]);
  const fio = useFioAoVivo(inicial.id, receber, useCallback(() => irEntrar(inicial.id), [inicial.id]));
  const conectado = fio.conectado && !fio.semSinal;      // 20 s sem sinal conta como desconectado (a tela avisa)
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
      if (r.status === 401) { irEntrar(p.id); return null; }
      setErro(typeof c?.detail === 'string' ? c.detail : r.status === 422 ? 'O pedido veio quebrado. Recarregue a página e tente de novo.' : `O editor não conseguiu agora (erro ${r.status}). Tente de novo.`);
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
      const c = await postar(`/versoes/${vid}/aprovar`, clientesEnt ? (mandarEnt ? (clienteEnt ? { cliente: clienteEnt } : {}) : { entregas: false }) : {});
      if (c) {
        if (c.entregas && typeof c.entregas.estado === 'string') setEntregas((m) => ({ ...m, [vid]: c.entregas as Entregas }));
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
  // "Tentar de novo", "Conferir de novo" e "Ler de novo": a mesma rota e a mesma guarda da conversa (R12). Trava síncrona.
  async function refazerEtapa(o: Acoes.Opcao) {
    if (trava.current) return;
    trava.current = true;
    const chave = `${o.de}:${o.versao ?? ''}:${o.arquivo_id ?? ''}`;
    setRefazendo(chave);
    setErro('');
    navigator.vibrate?.(8);
    try {
      const r = await Acoes.refazer(p.id, o);
      if (r.ok) {
        if (typeof r.dados.estado === 'string') {
          ultimoEstado.current = { estado: r.dados.estado, t: performance.now() };
          setP((x) => ({ ...x, estado: r.dados.estado }));
        }
        recarregar();
        return;
      }
      if (r.status === 401) { irEntrar(p.id); return; }
      setErro(r.erro);
      void lerRefazer();
    } finally { trava.current = false; setRefazendo(null); }
  }
  const chaveOpcao = (o: Acoes.Opcao) => `${o.de}:${o.versao ?? ''}:${o.arquivo_id ?? ''}`;
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

  const versoes = [...(p.versoes ?? [])].reverse().map((v) => (entregas[v.id] ? { ...v, entregas: entregas[v.id] } : v));
  // Regra do dono: nunca mostrar versão com erro conhecido. Só a versão ENTREGUE (QA aprovado) toca e baixa.
  const assistir = versoes.find((v) => v.estado === 'entregue' && v.video) ?? null;
  const emProducao = versoes.find((v) => v.estado !== 'entregue' && v.estado !== 'reprovada') ?? null;
  // A segurada pela conferência pode ser ASSISTIDA aqui (rota própria, marcada como não entregue); nunca baixa nem tem link.
  const seguradas = versoes.filter((v) => v.estado === 'reprovada_qa' && v.video);
  const seguradaPadrao = emProducao?.estado === 'reprovada_qa' && emProducao.video ? emProducao.id : null;
  const seguradaNaTela = seguradaSel && seguradas.some((v) => v.id === seguradaSel) ? seguradaSel : seguradaPadrao;
  const assistirSegurada = (vid: string) => {
    setSeguradaSel(vid);
    setSeguradaAberta(true);
    window.setTimeout(() => irPara('t-versoes'), 40);
  };
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
        <span>{clientesEnt && mandarEnt ? 'subindo para a página de entregas' : 'agora é mandar para o cliente'}</span>
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
        {clientesEnt && clienteEnt && mandarEnt && (
          // a página de entregas filtra por cliente: o dono vê para quem vai ANTES de aprovar, e o toque leva à escolha
          <a className="motivo" href={`#entregas-cliente-${assistir.id}`} data-teste="entregas-barra"
            onClick={(e) => { e.preventDefault(); irPara(`entregas-cliente-${assistir.id}`, `#entregas-cliente-${assistir.id}`); }}>
            Vai para as entregas de <b>{nomeCliente(clienteEnt, clientesEnt.clientes.find((x) => x.slug === clienteEnt)?.nome)}</b>
          </a>
        )}
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
    const reprovado = p.estado === 'reprovado_qa';
    const sugerida = refazerOps && refazerOps.sugerida !== null ? refazerOps.opcoes[refazerOps.sugerida] ?? null : null;
    const alvo = reprovado ? (refazerOps?.opcoes.find((o) => o.de === 'conferencia') ?? null) : sugerida;
    const verMotivo = temMesa && (
      <button type="button" className="botao botao--secundario barra-comando__secundario"
        onClick={() => irPara('mesa')} data-teste="ver-motivo">Ver motivo</button>
    );
    if (alvo) {
      const indo = refazendo === chaveOpcao(alvo);
      comando = (
        <>
          <div className="barra-comando__contexto" role="status" data-teste="refazer-contexto">
            <strong>{reprovado ? 'A conferência segurou a entrega' : 'A edição parou com erro'}</strong>
            <span className="barra-comando__faz">{reprovado ? 'As regras mudaram desde a última conferência.' : alvo.faz}</span>
            <span className="barra-comando__custo" data-teste="refazer-custo">{Acoes.custoTexto(alvo.custo_usd_est, alvo.custo_ate)} · {Acoes.minutosTexto(alvo.minutos_est)}</span>
          </div>
          <button type="button" className="botao botao--principal barra-comando__principal" disabled={Boolean(refazendo)}
            data-teste={reprovado ? 'conferir-de-novo' : 'tentar-de-novo'} data-de={alvo.de}
            onClick={() => void refazerEtapa(alvo)}>
            {indo ? 'Tentando…' : reprovado ? 'Conferir de novo' : 'Tentar de novo'}
          </button>
          {verMotivo}
        </>
      );
    } else {
      comando = (
        <>
          <p className="barra-comando__status" role="status">
            <strong>{reprovado ? 'A conferência segurou a entrega' : 'A edição parou com erro'}</strong>
            <span>{reprovado && seguradaPadrao ? (seguradaAberta && seguradaNaTela === seguradaPadrao ? 'os motivos estão embaixo do vídeo'
              : 'dá para assistir aqui, marcada como não entregue') : 'o motivo está na mesa ao vivo'}</span>
            {!reprovado && refazerOps && <span data-teste="refazer-nada">Não achei o que tentar de novo. Peça na conversa.</span>}
          </p>
          {reprovado && seguradaPadrao && !(seguradaAberta && seguradaNaTela === seguradaPadrao) ? (
            <button type="button" className="botao botao--secundario barra-comando__secundario" data-teste="assistir-segurada-barra"
              onClick={() => assistirSegurada(seguradaPadrao)}>Assistir a {seguradaPadrao.toUpperCase()}</button>
          ) : verMotivo}
        </>
      );
    }
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
      {p.nuvem && <ResumoNuvemLinha n={p.nuvem} />}
      {p.arquivos.length > 0 && (
        <ul className="arquivos" aria-label="Arquivos no projeto">
          {p.arquivos.map((a) => {
            const ler = refazerOps?.opcoes.find((o) => o.de === 'leitura' && o.arquivo_id === a.id) ?? null;
            return (
            <li className={`arquivo${ler ? ' arquivo--fora' : ''}`} key={a.id} data-nuvem={a.nuvem ?? undefined} data-estado-arquivo={a.estado}>
              <span>{a.nome}
                {/* selo só com a cópia CONFERIDA no Cloudflare (tamanho igual ao do editor); não é span: o aceite lê o último span */}
                {a.nuvem === 'guardado' && <b className="selo-nuvem" data-teste="selo-nuvem" title="Cópia conferida no Cloudflare">
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <i className="so-leitor">cópia guardada no </i>Cloudflare</b>}
              </span>
              <span>{a.bytes > 1 ? `${bytesLegiveis(a.bytes)} · ` : ''}{a.estado === 'analisado' ? 'lido' : a.estado === 'ingerido' ? 'lendo falas' : a.estado === 'falhou' ? 'ficou de fora' : 'na fila'}</span>
              {ler && (
                <div className="arquivo__ler" data-teste="ler-de-novo-bloco">
                  <button type="button" className="botao botao--secundario botao--pequeno" disabled={Boolean(refazendo)}
                    onClick={() => void refazerEtapa(ler)} data-teste="ler-de-novo" data-arquivo={a.id}>
                    {refazendo === chaveOpcao(ler) ? 'Lendo…' : 'Ler de novo'}
                  </button>
                  <p className="arquivo__custo">{Acoes.custoTexto(ler.custo_usd_est, ler.custo_ate)} · {Acoes.minutosTexto(ler.minutos_est)}</p>
                  {ler.atencao && <p className="arquivo__atencao">{ler.atencao}</p>}
                </div>
              )}
            </li>
            );
          })}
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
  const notas = lerNotas(p.dados?.notas);
  const blocoNotas = notas.length ? <Notas key="notas" notas={notas} /> : null;
  const blocoPedido = (
    <section key="pedido" className="cartao bloco-pedido" aria-labelledby="t-pedido">
      <h2 className="cartao__titulo" id="t-pedido">Pedido</h2>
      <Pedido pid={p.id} atual={p.dados?.pedido?.texto ?? null} aberto={aberto} formRef={formPedido}
        aoMudarTexto={setRascunho} aoMandar={enviarPedido} />
      {p.dados?.pedido?.texto && <p className="aviso" data-teste="modo-atual">Modo de edição: {rotuloModo(p.dados.pedido.modo)}
        {(p.dados.pedido as { cliente?: string | null }).cliente ? ` · para ${nomeCliente((p.dados.pedido as { cliente?: string }).cliente)}` : ''}</p>}
    </section>
  );
  const blocoRelogio = (
    <section key="relogio" className={`cartao relogio bloco-relogio${fase === 'entregue' ? ' relogio--recolhido' : ''}`} aria-labelledby="t-relogio">
      <h2 className="cartao__titulo" id="t-relogio">
        Ilha ao vivo
        {/* entregue: nada está acontecendo, então o ponto "gravando" sai */}
        {fase !== 'entregue' && <span className="ao-vivo" data-conectado={conectado} style={{ marginLeft: 'auto' }}>{conectado ? 'ao vivo' : fio.semSinal ? 'sem sinal · reconectando' : 'reconectando'}</span>}
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
      {/* A segurada aberta vem ANTES do filme entregue: no fluxo de ajuste (V1 entregue, V2 segurada) o dono pede para assistir a V2
          e ela tem de aparecer, sem tirar a V1 da tela. Sem versão entregue, o convite para assistir ocupa o lugar do player. */}
      {seguradaNaTela && (seguradaAberta || !assistir) && (
        <Segurada key={seguradaNaTela} pid={p.id} versao={seguradaNaTela} aberta={seguradaAberta} aoAbrir={setSeguradaAberta} />
      )}
      {assistir ? (
        <video key={assistir.id} className="player" controls playsInline preload="metadata" data-teste="player" data-versao={assistir.id}
          src={`/api/motor/v1/arquivos/${assistir.video}#t=0.1`} aria-label={`Versão ${assistir.id}`} />
      ) : seguradaNaTela ? null : (
        <div className="player-vazio"><p>{
          emProducao?.estado === 'reprovada_qa' ? `A conferência automática segurou a ${emProducao.id.toUpperCase()}: ela não foi entregue. O motivo está na mesa ao vivo.`
            : emProducao?.estado === 'erro' ? `A ${emProducao.id.toUpperCase()} parou com erro; o motivo está na mesa ao vivo.`
            : emProducao ? `A ${emProducao.id.toUpperCase()} está sendo feita. Ela aparece aqui quando passar na conferência.`
            : 'O filme aparece aqui quando passar na conferência.'}</p></div>
      )}
      {versoes.length > 0 && (
        <ul className="versoes">
          {versoes.map((v) => <LinhaVersao key={v.id} pid={p.id} v={v} aprovada={Boolean(p.dados?.aprovadas?.[v.id])}
            naBarra={v.id === assistir?.id} ajusteAberto={ajusteDe === v.id} aoAbrirAjuste={(sim) => setAjusteDe(sim ? v.id : null)}
            aoAprovar={() => aprovar(v.id)} batendo={batendo}
            seguradaNaTela={seguradaAberta && seguradaNaTela === v.id} aoAssistirSegurada={() => assistirSegurada(v.id)}
            aoReprovar={(motivo) => reprovar(v.id, motivo)}
            clientes={clientesEnt} cliente={clienteEnt} aoTrocarCliente={setClienteEnt} mandar={mandarEnt} aoMandar={setMandarEnt}
            aoMudarEntregas={(e) => { setEntregas((m) => ({ ...m, [v.id]: e })); recarregar(); }} />)}
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
    <div className="mesa__mesa" key="mesa">{fase === 'aberto' ? [blocoMaterial, blocoPedido, blocoNotas] : [blocoNotas, blocoPedido, blocoMaterial]}</div>
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

      {/* apagar: no fim da página, longe do Aprovar e da barra de comando; nunca pela conversa */}
      {!conversa.aberta && <ApagarProjeto key={p.id} pid={p.id} nome={p.nome} enviando={enviando} />}

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

// Pasta do Google Drive (o motor lista os vídeos de dentro): /drive/folders/<id>, /drive/u/0/folders, /drive/mobile/folders,
// folderview?id= e embeddedfolderview?id=. Serve só para o texto de espera ("Lendo a pasta…"); quem decide é o motor.
export function ehPastaDrive(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)drive\.google\.com$/i.test(u.hostname) && (/\/folders\//.test(u.pathname) || /^\/(embedded)?folderview\/?$/.test(u.pathname));
  } catch { return false; }
}

// nome curto do link para a mensagem: o arquivo do caminho (C0016.MP4) ou o site
function rotuloLink(url: string): string {
  if (ehPastaDrive(url)) return 'pasta do Drive';
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
  const [resultado, setResultado] = useState<{ ok: number; erros: string[]; avisos: string[]; pastas: string[] } | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const links = extrairLinks(texto);
  const temPasta = links.some(ehPastaDrive);
  // pendente = colado e nunca tentado. Se o Importar já foi tocado e o link foi recusado, o erro está na tela: não segura.
  const [tentado, setTentado] = useState('');
  const pendente = texto.trim().length > 0 && !indo && texto !== tentado;
  useEffect(() => { aoMudar?.({ indo, pendente }); }, [indo, pendente, aoMudar]);
  useEffect(() => () => aoMudar?.(SEM_IMPORTACAO), [aoMudar]);
  return (
    <form className="importar" noValidate data-teste="importar" onSubmit={async (e) => {
      e.preventDefault();
      if (!links.length) { setResultado({ ok: 0, erros: ['Não achei nenhum link https no que foi colado.'], avisos: [], pastas: [] }); return; }
      setIndo(true); setResultado(null); setTentado(texto);
      let ok = 0;
      // o motor confere cada link na hora; o mesmo motivo (ex.: link restrito da equipe) aparece UMA vez, com quantos links tem
      const porMotivo = new Map<string, string[]>();
      const falhados: string[] = [];   // ficam no campo para o dono corrigir e tocar Importar de novo
      const falhar = (url: string, motivo: string) => { falhados.push(url); porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), rotuloLink(url)]); };
      const avisos = new Set<string>();
      const pastas: string[] = [];   // o que o motor achou em cada pasta do Drive ("Pasta “X”: 4 vídeos na fila…")
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
          if (r.ok) {
            if (typeof c?.detalhe === 'string' && c.detalhe) pastas.push(c.detalhe);   // pasta: o resumo já diz quantos vídeos
            else ok += 1;
            if (typeof c?.aviso === 'string') avisos.add(c.aviso);
          }
          else falhar(url, typeof c?.detail === 'string' ? c.detail
            : r.status === 422 ? 'esse link está grande demais ou veio quebrado. Copie de novo e cole aqui.'
              : `o editor não conseguiu agora (erro ${r.status}). Toque em Importar de novo.`);
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
      if (saiu) { irEntrar(projeto); return; }
      setIndo(false);
      const erros = [...porMotivo].map(([m, quais]) => {
        const nomes = quais.slice(0, 3).join(', ') + (quais.length > 3 ? ` e mais ${quais.length - 3}` : '');
        return links.length > 1 ? `${quais.length} de ${links.length} links (${nomes}): ${m}` : `${nomes}: ${m}`;
      });
      setResultado({ ok, erros, avisos: [...avisos], pastas });
      if (ok || pastas.length) {
        const resto = links.filter((u) => falhados.includes(u)).join('\n');
        setTexto(resto); setTentado(resto); aoTerminar();
      }
      // o resultado aparece acima da barra fixa (o scroll-padding do html já desconta a barra)
      window.requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }}>
      <label className="so-leitor" htmlFor="link-importar">Links compartilhados do Dropbox ou do Drive, de arquivo ou de pasta</label>
      <textarea id="link-importar" className="entrada" rows={2} inputMode="url" placeholder="Ou cole links do Dropbox ou do Drive (pasta também vale)"
        value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!aberto} data-teste="importar-links" style={{ resize: 'vertical', minHeight: 48 }} />
      <button className="botao botao--fantasma" type="submit" disabled={!aberto || indo || !texto.trim()} data-teste="importar-enviar">
        {indo ? (temPasta ? 'Lendo a pasta…' : 'Conferindo o link…') : links.length > 1 ? `Importar ${links.length} links` : temPasta ? 'Importar a pasta' : 'Importar'}
      </button>
      {resultado && (
        <div style={{ flexBasis: '100%' }} role="status" data-teste="importar-resultado" ref={resultadoRef} className="importar__resultado">
          {resultado.pastas.map((d, i) => <p key={`p-${i}`} className="aprovada importar__pasta" style={{ margin: 0 }} data-teste="importar-pasta">{d}</p>)}
          {resultado.ok > 0 && <p className="aprovada importar__pasta" style={{ margin: 0 }}>{resultado.ok} link{resultado.ok > 1 ? 's' : ''} na fila: o editor baixa e já começa a ler.</p>}
          {resultado.avisos.map((av) => <p key={av} className="aviso" style={{ margin: '4px 0 0' }}>Aviso: {av}.</p>)}
          {resultado.erros.map((er) => <p key={er} className="erro" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{er}</p>)}
        </div>
      )}
      <details className="ajuda-link" data-teste="ajuda-link">
        <summary>Como compartilhar a pasta do Drive</summary>
        <p className="aviso">No Drive: 3 pontinhos da pasta &gt; Compartilhar &gt; Acesso geral: <b>Qualquer pessoa com o link</b> &gt; Copiar link, e cole aqui.
          Pode ser link de leitor ou de editor: os dois funcionam. Leitor é mais seguro (com editor, quem tiver o link pode apagar os vídeos).
          O editor pega os vídeos e áudios de dentro da pasta (e das subpastas).</p>
      </details>
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
  // Para qual cliente (onda 4, item 5): as marcas cadastradas + os clientes fixos, com a sugestão das entregas para o projeto.
  // Com a logo cadastrada, o fecho do filme assina com ela; "Nenhum" deixa só a creat.MTT.
  const [marcas, setMarcas] = useState<ListaMarcas | null>(null);
  const [clienteSel, setClienteSel] = useState('');
  const escolheu = useRef(false);
  useEffect(() => {
    if (!mostraForm) return;
    let vivo = true;
    (async () => {
      const [m, c] = await Promise.all([
        lerMarcas(),
        fetch(`/api/motor/v1/entregas/clientes?projeto=${encodeURIComponent(pid)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<ClientesEntregas | null>,
      ]);
      if (!vivo) return;
      setMarcas(m);
      const sug = c?.sugerido && c.sugerido !== c.padrao ? c.sugerido : '';
      if (!escolheu.current && sug) setClienteSel(sug);
    })();
    return () => { vivo = false; };
  }, [pid, mostraForm]);
  const opcoesCliente = [...new Set([...(marcas?.fixos ?? []), ...(marcas?.marcas ?? []).map((m) => m.slug), ...(clienteSel ? [clienteSel] : [])])]
    .filter((s) => s !== 'creat-mtt');
  const comLogo = (s: string) => Boolean(marcas?.marcas.find((m) => m.slug === s)?.logo);
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
      if (clienteSel) extra.cliente = clienteSel;
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
      <div className="campo" data-teste="pedido-cliente-campo">
        <label className="campo__rotulo" htmlFor={`pedido-cliente-${pid}`}>Para qual cliente?</label>
        <select className="entrada" id={`pedido-cliente-${pid}`} name="cliente" value={clienteSel} data-teste="pedido-cliente" aria-describedby={`pedido-cliente-aviso-${pid}`}
          onChange={(e) => { escolheu.current = true; setClienteSel(e.currentTarget.value); }}>
          <option value="">Nenhum: só a marca da creat.MTT</option>
          {opcoesCliente.map((s) => <option key={s} value={s}>{nomeCliente(s, marcas?.marcas.find((m) => m.slug === s)?.nome)}{comLogo(s) ? ' · com logo' : ''}</option>)}
        </select>
        <span className="aviso" id={`pedido-cliente-aviso-${pid}`} data-teste="pedido-cliente-aviso">{!clienteSel ? 'O fim do filme assina só com a creat.MTT.'
          : comLogo(clienteSel) ? `O fim do filme assina com a logo de ${nomeCliente(clienteSel)}.`
            : <>{nomeCliente(clienteSel)} ainda não tem logo cadastrada: o fim sai com a creat.MTT. <a className="ref-link" href="/caderno#marcas">Cadastrar no Caderno</a></>}</span>
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
function LinhaVersao({ pid, v, aprovada, naBarra, ajusteAberto, aoAbrirAjuste, batendo, aoAprovar, aoReprovar, clientes, cliente, aoTrocarCliente, aoMudarEntregas, mandar, aoMandar, seguradaNaTela, aoAssistirSegurada }: {
  pid: string; v: Versao; aprovada: boolean; naBarra: boolean; ajusteAberto: boolean; aoAbrirAjuste: (sim: boolean) => void;
  /** a segurada desta linha já está aberta no lugar do player; o toque abre a versão segurada lá em cima */
  seguradaNaTela: boolean; aoAssistirSegurada: () => void;
  batendo: boolean; aoAprovar: () => Promise<unknown>; aoReprovar: (motivo: string) => Promise<unknown>;
  clientes: ClientesEntregas | null; cliente: string; aoTrocarCliente: (c: string) => void; aoMudarEntregas: (e: Entregas) => void;
  mandar: boolean; aoMandar: (sim: boolean) => void;
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
      {entregue && v.video && !aprovada && clientes && (
        <div className="campo entregas-cliente">
          <label className="campo__rotulo" htmlFor={`entregas-cliente-${v.id}`}>Vai para as entregas de</label>
          <select className="entrada" id={`entregas-cliente-${v.id}`} value={cliente} data-teste="entregas-cliente" disabled={!mandar}
            onChange={(e) => aoTrocarCliente(e.currentTarget.value)}>
            {clientes.clientes.map((c) => <option key={c.slug} value={c.slug}>{nomeCliente(c.slug, c.nome)}</option>)}
          </select>
          <label className="entregas-opcao">
            <input type="checkbox" checked={mandar} onChange={(e) => aoMandar(e.currentTarget.checked)} data-teste="entregas-mandar" />
            Mandar para a página de entregas ao aprovar
          </label>
          <span className="aviso" data-teste="entregas-aviso">{mandar
            ? 'O filme sobe sozinho para a página de entregas desse cliente. A página é pública: quem tiver o link vê o filme, a legenda e as outras entregas da página.'
            : 'O filme fica só aqui no editor. Dá para mandar para a página depois, com um toque.'}</span>
        </div>
      )}
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
      {(v.entregas || (aprovada && entregue && clientes)) && (
        <NasEntregas pid={pid} v={v} cliente={cliente} aoMudar={aoMudarEntregas} />
      )}
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
            {v.estado === 'reprovada_qa' && v.video && !seguradaNaTela && (
              <button className="botao botao--secundario botao--pequeno" type="button" data-teste="assistir-segurada-linha" onClick={aoAssistirSegurada}>
                Assistir a {v.id.toUpperCase()} segurada
              </button>
            )}
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

// Cópia do material no Cloudflare (espelho). Só existe com o espelho ligado no motor; o original nunca sai do editor.
function ResumoNuvemLinha({ n }: { n: ResumoNuvem }) {
  if (!n.total) return null;
  const qtd = (k: number) => `${k} arquivo${k === 1 ? '' : 's'}`;
  const gb = bytesLegiveis(n.bytes);
  let texto: string, tipo: 'ok' | 'andando' | 'atencao';
  if ((n.fora_do_teto ?? 0) > 0) {
    texto = `O espaço grátis do Cloudflare (${String(n.teto_gb ?? 4).replace('.', ',')} GB) encheu. Os vídeos novos ficam só no editor até você liberar mais espaço.`;
    tipo = 'atencao';
  } else if (n.pendentes > 0) {
    texto = `Ainda não guardei ${qtd(n.pendentes)} no Cloudflare (sem conexão agora). Tento de novo sozinho; o original continua aqui no editor.`;
    tipo = 'atencao';
  } else if (n.guardados >= n.total) {
    texto = `Tudo guardado no Cloudflare (${gb}).`;
    tipo = 'ok';
  } else {
    texto = `Guardando no Cloudflare: ${n.guardados} de ${qtd(n.total)}${n.guardados ? ` (${gb})` : ''}. Você já pode editar.`;
    tipo = 'andando';
  }
  return <p className="nuvem-resumo" data-teste="nuvem-resumo" data-tipo={tipo} role="status">{texto}</p>;
}

const sem_ponto = (t: string) => t.trim().replace(/[.;:!\s]+$/, '');
async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* Safari sem permissão: cai para o jeito antigo */ }
  try {
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
}

// "Nas entregas": o filme aprovado na página de entregas do Cloudflare (a mesma página das outras entregas da creat).
// Falha de rede nunca some em silêncio: o estado diz o que houve e o botão tenta de novo.
function NasEntregas({ pid, v, cliente, aoMudar }: { pid: string; v: Versao; cliente: string; aoMudar: (e: Entregas) => void }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const e = v.entregas;
  const estado = e?.estado ?? 'fora';
  const nome = nomeCliente(e?.cliente ?? cliente, e?.nome_cliente);
  // o motor já manda frase em pt-BR; se algum dia vier nome de erro técnico, a tela não mostra o jargão
  const motivo = e?.motivo && !/(Error|Exception|Traceback|sha256|botocore|\bR2\b|\(\d{3}\))/.test(e.motivo) ? sem_ponto(e.motivo) : '';
  async function tentar() {
    if (indo) return;
    setIndo(true); setErro('');
    try {
      // sem estado ainda (aprovada antes de ligar as entregas): manda com o cliente escolhido; senão mantém o da 1ª vez
      const r = await fetch(`/api/motor/v1/projetos/${pid}/versoes/${v.id}/entregas`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(!e && cliente ? { cliente } : {}),
      });
      if (r.status === 401) { irEntrar(pid); return; }
      const c = await r.json().catch(() => null);
      if (!r.ok) {
        const d = typeof c?.detail === 'string' ? c.detail : 'O editor não conseguiu agora. Tente de novo em instantes.';
        setErro(d.charAt(0).toUpperCase() + d.slice(1));
        return;
      }
      if (c?.entregas && typeof c.entregas.estado === 'string') aoMudar(c.entregas as Entregas);
    } catch {
      setErro('Sem conexão com o editor agora. Confira a internet e toque de novo.');
    } finally { setIndo(false); }
  }
  let msg: React.ReactNode;
  let acoes: React.ReactNode = null;
  const botaoTentar = (rotulo: string) => (
    <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => void tentar()} disabled={indo} data-teste="entregas-tentar">
      {indo ? 'Mandando…' : rotulo}
    </button>
  );
  if (estado === 'enviando') {
    msg = <><span className="entregas__ponto" aria-hidden="true" />Subindo o filme para a sua página de entregas…</>;
  } else if (estado === 'no_ar' && e?.painel) {
    msg = <>No ar na página de entregas de <b>{nome}</b>.</>;
    acoes = (
      <>
        <a className="botao botao--secundario botao--pequeno entregas__abrir" href={e.painel} target="_blank" rel="noopener noreferrer" data-teste="entregas-abrir">Abrir nas entregas</a>
        {e.video_url && <a className="botao botao--fantasma botao--pequeno" href={e.video_url} download rel="noopener noreferrer" data-teste="entregas-baixar"
          aria-label="Baixar o filme da página de entregas">Baixar da página</a>}
        <button type="button" className="botao botao--fantasma botao--pequeno" data-teste="entregas-copiar"
          onClick={async () => { if (await copiar(e.painel!)) { setCopiado(true); window.setTimeout(() => setCopiado(false), 2000); } else setErro('Não consegui copiar. Toque em "Abrir nas entregas" e copie o endereço de lá.'); }}>
          {copiado ? 'Link copiado' : 'Copiar link'}
        </button>
      </>
    );
  } else if (estado === 'pendente') {
    msg = <>A página de entregas não respondeu agora. O filme está seguro aqui; tento de novo sozinho{e?.proxima ? <> às <b>{e.proxima}</b></> : ''}.</>;
    acoes = botaoTentar('Tentar agora');
  } else if (estado === 'falhou' || (estado === 'no_ar' && !e?.painel)) {
    msg = <>Não deu para mandar para as entregas{motivo ? `: ${motivo}` : '. O filme continua guardado aqui'}.</>;
    acoes = botaoTentar('Tentar de novo');
  } else if (estado === 'substituida') {
    msg = <>Trocada pela {(e?.substituida_por ?? 'versão nova').toUpperCase()} na página de entregas.</>;
  } else if (estado === 'retirando' && e?.proxima) {
    // a retirada caiu na rede: o filme reprovado AINDA está na página. Nunca dizer "Retirada" antes de sair de verdade.
    msg = <>Ainda não consegui tirar este filme da página de entregas{motivo ? ` (${motivo})` : ''}. Tento de novo sozinho às <b>{e.proxima}</b>.</>;
  } else if (estado === 'retirando') {
    msg = <><span className="entregas__ponto" aria-hidden="true" />Tirando o filme da página de entregas…</>;
  } else if (estado === 'retirada') {
    msg = <>Retirada da página de entregas.</>;
  } else if (estado === 'fora') {
    msg = <>Este filme ainda não está na página de entregas de <b>{nome}</b>.</>;
    acoes = botaoTentar('Mandar para as entregas');
  } else {
    msg = <>Página de entregas: {estado}.</>;
  }
  // pendente não é erro (ele tenta sozinho): borda neutra. Coral só quando precisa do dono (falhou).
  const tom = estado === 'no_ar' ? 'ok' : estado === 'falhou' || (estado === 'retirando' && e?.proxima) ? 'atencao'
    : estado === 'enviando' || estado === 'retirando' ? 'andando' : 'neutro';
  return (
    <div className="entregas" data-teste="entregas" data-estado={estado} data-tom={tom}>
      <p className="entregas__titulo">Nas entregas{nome ? <span className="entregas__cliente">{nome}</span> : null}</p>
      <p className="entregas__msg" role="status" data-teste="entregas-msg">{msg}</p>
      {acoes && <div className="linha-acoes entregas__acoes">{acoes}</div>}
      {erro && <p className="erro" role="alert" style={{ margin: 0, overflowWrap: 'anywhere' }}>{erro}</p>}
    </div>
  );
}
