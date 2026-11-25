'use client';
// O fio ao vivo do projeto: UM EventSource (SSE v2 do motor) leva a mesa (pipeline) e a conversa.
// - eventos com id: deduplicados por id ("vistos"); os da mesa que a tela do projeto já ouvia seguem para ela igual a antes;
// - efêmeros (rascunho, instantaneo, ping) têm handlers próprios e nunca entram no "vistos";
// - reconexão: o EventSource reconecta sozinho com Last-Event-ID; um vigia de 40 s e a volta da tela (visibilitychange)
//   reabrem com ?depois=<último id>, então nada se perde e nada repete;
// - etapa_progresso é fundido no lugar (não cria linha nova).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Evento } from './estados';
import type {
  DadosConfirmacao, DadosDecisao, DadosFalaDono, DadosFalaEditor, DadosFerramenta, DadosInstantaneo, DadosMostrar, DadosPasso, DadosPergunta,
  DadosRascunho, DadosResposta, DadosTurnoFim,
} from './conversa';
import { TIPOS_CONVERSA } from './conversa';

// os tipos que a tela do projeto ouvia antes (Projeto.tsx): continuam indo para ela, e só eles
const TIPOS_DO_PROJETO = ['projeto_criado', 'arquivo_recebido', 'etapa_inicio', 'etapa_progresso', 'etapa_fim', 'etapa_erro', 'estado', 'versao_pronta', 'qa_reprovado', 'entregue', 'cliente', 'message'];
const TIPOS_MESA = ['etapa_inicio', 'etapa_fim', 'etapa_erro', 'aviso', 'cliente'];
const TODOS = [...new Set([...TIPOS_DO_PROJETO, ...TIPOS_CONVERSA, ...TIPOS_MESA, 'passo', 'decisao'])];
const VIGIA_MS = 40_000;

export type Progresso = { progresso: number | null; mensagem: string | null };
export type FioAoVivo = {
  eventos: Evento[];                       // conversa e mesa, em ordem de id
  progresso: Record<string, Progresso>;    // último etapa_progresso por etapa|alvo
  rascunho: DadosRascunho | null;
  inst: DadosInstantaneo | null;
  conectado: boolean;
  carregado: boolean;                      // o histórico já chegou (primeiro instantâneo)
  vivoDesde: number;                       // eventos com id maior chegaram ao vivo, depois do histórico
};

export function useFioAoVivo(pid: string, aoProjeto: (e: Evento) => void, aoSessaoVencida: () => void): FioAoVivo {
  const [estado, setEstado] = useState<FioAoVivo>({ eventos: [], progresso: {}, rascunho: null, inst: null, conectado: false, carregado: false, vivoDesde: 0 });
  const vistos = useRef(new Set<number>());
  const ultimoId = useRef(0);
  const buffer = useRef<Evento[]>([]);
  const progressoBuf = useRef<Record<string, Progresso>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoSinal = useRef(Date.now());
  const fonte = useRef<EventSource | null>(null);
  const religar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const espera = useRef(2000);
  const carregou = useRef(false);
  const aoProjetoRef = useRef(aoProjeto);
  const aoSessaoRef = useRef(aoSessaoVencida);
  useEffect(() => { aoProjetoRef.current = aoProjeto; aoSessaoRef.current = aoSessaoVencida; });

  const descarregar = useCallback(() => {
    timer.current = null;
    const novos = buffer.current;
    const prog = progressoBuf.current;
    buffer.current = [];
    progressoBuf.current = {};
    if (!novos.length && !Object.keys(prog).length) return;
    setEstado((s) => {
      let rascunho = s.rascunho;
      for (const e of novos) {
        if (e.tipo === 'turno_fim' && rascunho && rascunho.turno === (e.dados as DadosTurnoFim | null)?.turno) rascunho = null;
      }
      return { ...s, rascunho, eventos: novos.length ? [...s.eventos, ...novos] : s.eventos, progresso: Object.keys(prog).length ? { ...s.progresso, ...prog } : s.progresso };
    });
  }, []);
  const agendar = useCallback(() => { if (!timer.current) timer.current = setTimeout(descarregar, 40); }, [descarregar]);

  const marcarCarregado = useCallback(() => {
    if (carregou.current) return;
    carregou.current = true;
    descarregar();
    setEstado((s) => ({ ...s, carregado: true, vivoDesde: ultimoId.current }));
  }, [descarregar]);

  const abrir = useCallback(() => {
    fonte.current?.close();
    if (religar.current) { clearTimeout(religar.current); religar.current = null; }
    const depois = ultimoId.current;
    const es = new EventSource(`/api/motor/v1/projetos/${pid}/eventos?v=2${depois ? `&depois=${depois}` : ''}`);
    fonte.current = es;
    ultimoSinal.current = Date.now();
    const comId = (m: MessageEvent) => {
      ultimoSinal.current = Date.now();
      let e: Evento;
      try { e = JSON.parse(m.data); } catch { return; }
      if (typeof e?.id !== 'number' || vistos.current.has(e.id)) return;
      vistos.current.add(e.id);
      if (e.id > ultimoId.current) ultimoId.current = e.id;
      if (TIPOS_DO_PROJETO.includes(e.tipo)) aoProjetoRef.current(e);
      if (e.tipo === 'etapa_progresso') {
        progressoBuf.current[`${e.etapa}|${e.alvo ?? ''}`] = { progresso: e.progresso, mensagem: e.mensagem };
        agendar();
        return;
      }
      if ((TIPOS_CONVERSA as readonly string[]).includes(e.tipo) || TIPOS_MESA.includes(e.tipo) || e.tipo === 'passo' || e.tipo === 'decisao') {
        buffer.current.push(e);
        agendar();
      }
    };
    for (const t of TODOS) es.addEventListener(t, comId as EventListener);
    es.addEventListener('rascunho', ((m: MessageEvent) => {
      ultimoSinal.current = Date.now();
      let r: { dados?: DadosRascunho } | null = null;
      try { r = JSON.parse(m.data); } catch { return; }
      const d = r?.dados;
      if (!d || typeof d.turno !== 'string') return;
      setEstado((s) => (s.rascunho && s.rascunho.turno === d.turno && s.rascunho.v >= d.v ? s : { ...s, rascunho: d }));
    }) as EventListener);
    es.addEventListener('instantaneo', ((m: MessageEvent) => {
      ultimoSinal.current = Date.now();
      let r: { dados?: DadosInstantaneo } | null = null;
      try { r = JSON.parse(m.data); } catch { return; }
      const d = r?.dados;
      if (!d || typeof d.ligada !== 'boolean') return;
      descarregar();
      setEstado((s) => ({ ...s, inst: d, rascunho: d.rascunho ?? (d.turno_rodando ? s.rascunho : null) }));
      marcarCarregado();
      espera.current = 2000;
    }) as EventListener);
    es.addEventListener('ping', () => { ultimoSinal.current = Date.now(); });
    es.onopen = () => {
      ultimoSinal.current = Date.now();
      setEstado((s) => (s.conectado ? s : { ...s, conectado: true }));
      // motor com o SSE novo desligado (EDITOR_SSE_NOVO=0) não manda instantâneo: o histórico vale como carregado
      setTimeout(() => { if (fonte.current === es) marcarCarregado(); }, 2500);
    };
    es.onerror = () => {
      setEstado((s) => (s.conectado ? { ...s, conectado: false } : s));
      if (es.readyState !== EventSource.CLOSED) return; // reconectando sozinho, com Last-Event-ID
      // fechou de vez (resposta que não é SSE): sessão vencida vai para a senha; o resto tenta de novo, cada vez mais devagar
      void fetch('/api/motor/v1/conversa', { cache: 'no-store' }).then((r) => {
        if (r.status === 401) aoSessaoRef.current();
      }).catch(() => {});
      if (fonte.current !== es) return;
      religar.current = setTimeout(abrir, espera.current);
      espera.current = Math.min(15000, espera.current * 2);
    };
  }, [pid, agendar, descarregar, marcarCarregado]);

  useEffect(() => {
    abrir();
    const vigia = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimoSinal.current > VIGIA_MS) abrir();
    }, 5000);
    // a tela voltou (celular destravado, aba trocada): o EventSource do iOS pode ter ficado zumbi; reabre na hora
    const visivel = () => { if (document.visibilityState === 'visible') abrir(); };
    const online = () => abrir();
    document.addEventListener('visibilitychange', visivel);
    window.addEventListener('online', online);
    return () => {
      clearInterval(vigia);
      document.removeEventListener('visibilitychange', visivel);
      window.removeEventListener('online', online);
      if (religar.current) clearTimeout(religar.current);
      if (timer.current) clearTimeout(timer.current);
      fonte.current?.close();
      fonte.current = null;
    };
  }, [abrir]);

  return estado;
}

// ---------------- do evento para o que a tela mostra ----------------
// Um passo da mesa (onda 2): o par de eventos `passo` vira uma linha só, atualizada no lugar.
export type PassoMesa = DadosPasso & { id: number; inicio: string; fimTs?: string };
export type LinhaMesa =
  | { k: 'etapa'; chave: string; id: number; etapa: string; alvo: string | null; fase: 'rodando' | 'feito' | 'erro' | 'interrompido'; inicio: string; fim?: string;
      mensagem?: string | null; progressoMsg?: string | null; detalhe?: string; raiz?: PassoMesa; passos: PassoMesa[] }
  | { k: 'nota'; id: number; tom: 'alerta' | 'info'; texto: string; ts: string; detalhe?: string }
  | { k: 'decisao'; id: number; versao: string | null; d: DadosDecisao };
export type Ferr = DadosFerramenta & { id: number; inicio: string; fimTs?: string };
export type Item =
  | { k: 'dono'; id: number; ts: string; d: DadosFalaDono }
  | { k: 'editor'; id: number; d: DadosFalaEditor }
  | { k: 'ferramenta'; id: number; f: Ferr }
  | { k: 'pergunta'; id: number; d: DadosPergunta; r?: DadosResposta }
  | { k: 'confirmacao'; id: number; d: DadosConfirmacao; r?: DadosResposta }
  | { k: 'fim'; id: number; d: DadosTurnoFim }
  | { k: 'mostrar'; id: number; d: DadosMostrar }
  | { k: 'retomar'; id: number; turno: string; ativo: boolean }
  | { k: 'mesa'; id: number; linhas: LinhaMesa[] };

export type Fio = {
  itens: Item[];
  rodando: string | null;                  // turno da conversa em andamento
  espera: { tipo: 'pergunta' | 'confirmacao'; tool_use_id: string; id: number } | null;
  ultimoFim: DadosTurnoFim | null;
  temConversa: boolean;
  mesaRodando: boolean;
  agora: PassoMesa[];                      // quem está trabalhando agora (passos abertos, do mais antigo ao mais novo)
  custoMesa: number;                       // soma dos passos pagos (o livro de gastos do projeto)
  custoConversa: number;                   // soma das respostas do Nimbus neste projeto
  porAgente: { chave: string; custo: number }[];  // placar do taxímetro (chave do passo; o site troca pelo agente)
  falas: number;                           // mensagens do dono e respostas do Nimbus (para o "abrir a conversa")
};

export function montarFio(eventos: Evento[], progresso: Record<string, Progresso>): Fio {
  const itens: Item[] = [];
  const porTool = new Map<string, Item & { k: 'ferramenta' | 'pergunta' | 'confirmacao' }>();
  const abertas = new Map<string, LinhaMesa & { k: 'etapa' }>();
  const ultimaLinha = new Map<string, LinhaMesa & { k: 'etapa' }>();   // a linha mais nova de cada etapa|alvo (eventos que chegam depois do fim)
  const porPasso = new Map<string, PassoMesa>();
  let custoConversa = 0;
  let falas = 0;
  const inicio: Record<string, number> = {};
  const fim: Record<string, number> = {};
  const turnoDaPergunta: Record<string, string> = {};
  let ultimoFim: DadosTurnoFim | null = null;
  let temConversa = false;
  const mesa = (l: LinhaMesa) => {
    const ult = itens[itens.length - 1];
    if (ult?.k === 'mesa') ult.linhas.push(l);
    else itens.push({ k: 'mesa', id: l.id, linhas: [l] });
  };
  for (const e of eventos) {
    const d = (e.dados ?? {}) as Record<string, unknown>;
    const turno = typeof d.turno === 'string' ? d.turno : null;
    switch (e.tipo) {
      case 'fala_dono': {
        temConversa = true;
        falas += 1;
        const f = d as DadosFalaDono;
        itens.push({ k: 'dono', id: e.id, ts: e.ts, d: f });
        if (turno && !f.na_fila) inicio[turno] = e.id;
        break;
      }
      case 'fala_editor':
        temConversa = true;
        falas += 1;
        itens.push({ k: 'editor', id: e.id, d: d as DadosFalaEditor });
        if (turno) inicio[turno] = e.id;
        break;
      case 'ferramenta': {
        const f = d as DadosFerramenta;
        if (typeof f.tool_use_id !== 'string') break;
        temConversa = true;
        const ja = porTool.get(f.tool_use_id);
        if (ja?.k === 'ferramenta') {
          ja.f = { ...ja.f, ...f, id: ja.f.id, inicio: ja.f.inicio, fimTs: f.fase === 'inicio' ? undefined : e.ts };
        } else {
          const it = { k: 'ferramenta' as const, id: e.id, f: { ...f, id: e.id, inicio: e.ts, fimTs: f.fase === 'inicio' ? undefined : e.ts } };
          itens.push(it);
          porTool.set(f.tool_use_id, it);
        }
        if (turno) inicio[turno] = e.id;
        break;
      }
      case 'pergunta': {
        temConversa = true;
        const p = d as DadosPergunta;
        const it = { k: 'pergunta' as const, id: e.id, d: p };
        itens.push(it);
        porTool.set(p.tool_use_id, it);
        if (turno) { inicio[turno] = e.id; turnoDaPergunta[p.tool_use_id] = turno; }
        break;
      }
      case 'confirmacao': {
        temConversa = true;
        const c = d as DadosConfirmacao;
        const it = { k: 'confirmacao' as const, id: e.id, d: c };
        itens.push(it);
        porTool.set(c.tool_use_id, it);
        if (turno) inicio[turno] = e.id;
        break;
      }
      case 'resposta': {
        const r = d as DadosResposta;
        const alvo = porTool.get(r.tool_use_id);
        if (alvo && (alvo.k === 'pergunta' || alvo.k === 'confirmacao')) alvo.r = r;
        const t = turnoDaPergunta[r.tool_use_id];
        if (t && r.tipo === 'pergunta' && r.por === 'dono') inicio[t] = e.id;
        break;
      }
      case 'turno_fim': {
        temConversa = true;
        const f = d as DadosTurnoFim;
        if (turno) fim[turno] = e.id;
        custoConversa += Number(f.custo_usd) || 0;
        // pausa sem texto e sem custo não ganha rodapé próprio: o cartão já está na tela
        itens.push({ k: 'fim', id: e.id, d: f });
        ultimoFim = f;
        break;
      }
      case 'mostrar':
        temConversa = true;
        itens.push({ k: 'mostrar', id: e.id, d: d as DadosMostrar });
        break;
      case 'aviso':
        if (d.acao === 'retomar' && turno) { temConversa = true; itens.push({ k: 'retomar', id: e.id, turno, ativo: true }); }
        else if (e.mensagem) mesa({ k: 'nota', id: e.id, tom: 'alerta', texto: e.mensagem, ts: e.ts, ...(typeof d.detalhe === 'string' ? { detalhe: d.detalhe } : {}) });
        break;
      case 'cliente':
        if (e.mensagem) mesa({ k: 'nota', id: e.id, tom: 'info', texto: e.mensagem, ts: e.ts });
        break;
      case 'etapa_inicio': {
        if (!e.etapa) break;
        const chave = `${e.etapa}|${e.alvo ?? ''}`;
        const l: LinhaMesa & { k: 'etapa' } = { k: 'etapa', chave, id: e.id, etapa: e.etapa, alvo: e.alvo, fase: 'rodando', inicio: e.ts, mensagem: e.mensagem, passos: [] };
        abertas.set(chave, l);
        ultimaLinha.set(chave, l);
        mesa(l);
        break;
      }
      case 'etapa_fim':
      case 'etapa_erro': {
        if (!e.etapa) break;
        const chave = `${e.etapa}|${e.alvo ?? ''}`;
        const fase = e.tipo === 'etapa_fim' ? 'feito' : 'erro';
        const det = typeof d.detalhe === 'string' ? d.detalhe : undefined;
        const l = abertas.get(chave);
        if (l) { l.fase = fase; l.fim = e.ts; l.mensagem = e.mensagem ?? l.mensagem; l.detalhe = det; abertas.delete(chave); }
        else {
          const nova: LinhaMesa & { k: 'etapa' } = { k: 'etapa', chave, id: e.id, etapa: e.etapa, alvo: e.alvo, fase, inicio: e.ts, fim: e.ts, mensagem: e.mensagem, detalhe: det, passos: [] };
          ultimaLinha.set(chave, nova);
          mesa(nova);
        }
        break;
      }
      case 'passo': {
        const ps = d as unknown as DadosPasso;
        if (typeof ps.passo !== 'string' || typeof ps.chave !== 'string') break;
        const ja = porPasso.get(ps.passo);
        if (ja) {
          Object.assign(ja, ps, { id: ja.id, inicio: ja.inicio, fimTs: ps.fase === 'inicio' ? undefined : e.ts });
          break;
        }
        const novo: PassoMesa = { ...ps, id: e.id, inicio: e.ts, fimTs: ps.fase === 'inicio' ? undefined : e.ts };
        porPasso.set(ps.passo, novo);
        const chave = `${e.etapa ?? ''}|${e.alvo ?? ''}`;
        let l = abertas.get(chave) ?? ultimaLinha.get(chave);
        if (!l && e.etapa) {   // passo sem etapa_inicio visível (histórico cortado): a linha nasce dele
          l = { k: 'etapa', chave, id: e.id, etapa: e.etapa, alvo: e.alvo, fase: 'rodando', inicio: e.ts, passos: [] };
          abertas.set(chave, l);
          ultimaLinha.set(chave, l);
          mesa(l);
        }
        if (!l) break;
        if (!ps.pai) l.raiz = novo;
        else l.passos.push(novo);
        break;
      }
      case 'decisao':
        mesa({ k: 'decisao', id: e.id, versao: e.alvo, d: d as unknown as DadosDecisao });
        break;
      default:
        break;
    }
  }
  // progresso fundido no lugar: só a mensagem mais nova da etapa aberta
  for (const [chave, l] of abertas) {
    const p = progresso[chave];
    if (p?.mensagem) l.progressoMsg = p.mensagem;
  }
  // a mesa interrompida (o editor reiniciou no meio) não fica pulsando: o passo raiz 'interrompido' fecha a linha
  for (const l of ultimaLinha.values()) {
    if (l.fase === 'rodando' && l.raiz && l.raiz.fase !== 'inicio') {
      l.fase = l.raiz.fase === 'fim' ? 'feito' : l.raiz.fase === 'erro' ? 'erro' : 'interrompido';
      l.fim = l.raiz.fimTs;
      abertas.delete(l.chave);
    }
    if (l.fase !== 'rodando') for (const x of l.passos) if (x.fase === 'inicio') { x.fase = 'interrompido'; x.fimTs = l.fim; }
  }
  const agoraMesa = [...porPasso.values()].filter((x) => x.fase === 'inicio' && x.pai).sort((a, b) => a.id - b.id);
  // etapa rodando sem filho aberto (catálogo, entrega, motor sem passos): o raiz conta como "trabalhando"
  for (const l of abertas.values()) if (!l.passos.some((x) => x.fase === 'inicio')) agoraMesa.push(l.raiz ?? { passo: `e${l.id}`, chave: l.etapa, fase: 'inicio', id: l.id, inicio: l.inicio, numeros: l.alvo && /^v\d+$/.test(l.alvo) ? { versao: l.alvo } : undefined });
  let custoMesa = 0;
  const placar = new Map<string, number>();
  for (const x of porPasso.values()) {
    const c = Number(x.custo_usd) || 0;
    if (c <= 0) continue;
    custoMesa += c;
    placar.set(x.chave, (placar.get(x.chave) ?? 0) + c);
  }
  // aviso "retomar" vale enquanto nada aconteceu na conversa depois dele
  for (const it of itens) {
    if (it.k !== 'retomar') continue;
    it.ativo = !itens.some((x) => x.id > it.id && (x.k === 'dono' || x.k === 'fim'));
  }
  const abertos = Object.entries(inicio).filter(([t, i]) => i > (fim[t] ?? 0)).sort((a, b) => a[1] - b[1]);
  const rodando = abertos.length ? abertos[abertos.length - 1][0] : null;
  let espera: Fio['espera'] = null;
  for (const it of itens) {
    if ((it.k === 'pergunta' || it.k === 'confirmacao') && !it.r) espera = { tipo: it.k, tool_use_id: it.d.tool_use_id, id: it.id };
  }
  return {
    itens, rodando, espera, ultimoFim, temConversa, mesaRodando: abertas.size > 0, agora: agoraMesa.sort((a, b) => a.id - b.id),
    custoMesa, custoConversa, porAgente: [...placar.entries()].map(([chave, custo]) => ({ chave, custo })), falas,
  };
}

export function progressoDe(progresso: Record<string, Progresso>, etapa: string, alvo: string | null): number | null {
  return progresso[`${etapa}|${alvo ?? ''}`]?.progresso ?? null;
}
