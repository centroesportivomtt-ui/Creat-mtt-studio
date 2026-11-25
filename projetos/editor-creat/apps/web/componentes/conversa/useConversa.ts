'use client';
// O controle da conversa dentro do projeto: o que o fio mostra (montado dos eventos), o campo, as mensagens que ainda
// estão saindo, as respostas aos cartões e a chave. Quem chama é o Projeto.tsx, que entrega o mesmo controle ao <Fio>
// (no corpo da página) e à <BarraConversa> (na barra de comando, no polegar).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/lib/conversa';
import type { Contexto, DadosConfirmacao, DadosMostrar, EstadoChave, MotivoDesligada } from '@/lib/conversa';
import { montarFio, type FioAoVivo } from '@/lib/fio';
import { gravarFila, guardarCampo, irEntrar, lerCampo, lerFila, type Saindo } from '@/lib/pendentes';

export type Nota = { tom: 'info' | 'alerta'; texto: string; fixa?: boolean };
export const LIMITE = 4000;          // letras por mensagem (o motor recusa acima disso)
type Chave = { ligada: boolean; motivo?: MotivoDesligada; gasto: number; teto: number };

export function useConversa(pid: string, fio: FioAoVivo, opcoes: { contexto: () => Contexto; aoMudouProjeto: () => void }) {
  const montado = useMemo(() => montarFio(fio.eventos, fio.progresso), [fio.eventos, fio.progresso]);
  const [aberta, setAberta] = useState(false);
  const [texto, setTextoBruto] = useState('');
  const [via, setVia] = useState<'texto' | 'audio'>('texto');
  const [saindo, setSaindo] = useState<(Saindo & { turno?: string; ok?: number; indo?: boolean })[]>([]);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);           // tool_use_id do cartão com toque em andamento
  const [erroCartao, setErroCartao] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Nota | null>(null);
  const [chave, setChave] = useState<Chave | null>(null);
  const [mudandoChave, setMudandoChave] = useState(false);
  const opcoesRef = useRef(opcoes);
  useEffect(() => { opcoesRef.current = opcoes; });
  const travaEnvio = useRef(false);
  const travaCartao = useRef(false);
  // cartões e perguntas que este aparelho já decidiu: os botões ficam travados até a resposta chegar pelo fio (o segundo
  // toque não manda um segundo pedido, que o motor recusaria com 409)
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  const marcarFeito = useCallback((id: string) => setFeitos((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);

  // ---------- estado guardado da aba: campo, fila, conversa aberta ----------
  useEffect(() => {
    const c = lerCampo(pid);
    if (c) { setTextoBruto(c.texto); setVia(c.via); }
    setSaindo(lerFila(pid));
    try { if (sessionStorage.getItem(`ec-conversa-aberta-${pid}`) === '1') setAberta(true); } catch { /* sem armazenamento */ }
  }, [pid]);
  const viaRef = useRef<'texto' | 'audio'>('texto');
  useEffect(() => { viaRef.current = via; }, [via]);
  /** Campo da conversa: guarda na sessão da aba a cada mudança (sessão vencida, aba descarregada: o texto volta). */
  const setTexto = useCallback((t: string, v?: 'texto' | 'audio') => {
    const nv = v ?? (t.trim() ? viaRef.current : 'texto');
    viaRef.current = nv;
    setTextoBruto(t);
    setVia(nv);
    guardarCampo(pid, { texto: t, via: nv });
  }, [pid]);
  useEffect(() => { gravarFila(pid, saindo.map(({ cmid, texto: t, via: v, contexto, criado, falhou }) => ({ cmid, texto: t, via: v, contexto, criado, falhou }))); }, [pid, saindo]);

  // O fio aberto tem entrada própria no histórico (#conversa): o Voltar do celular fecha o fio e fica no projeto.
  const fecharLocal = useCallback(() => {
    setAberta(false);
    try { sessionStorage.removeItem(`ec-conversa-aberta-${pid}`); } catch { /* sem armazenamento */ }
  }, [pid]);
  const abrir = useCallback(() => {
    setAberta(true);
    try { sessionStorage.setItem(`ec-conversa-aberta-${pid}`, '1'); } catch { /* sem armazenamento */ }
  }, [pid]);
  const empurrou = useRef(false);            // a entrada #conversa do histórico foi posta por esta tela
  const semHash = () => window.location.pathname + window.location.search;
  const fechar = useCallback(() => {
    if (window.location.hash === '#conversa') {
      if (empurrou.current) { empurrou.current = false; window.history.back(); return; }   // o popstate fecha
      window.history.replaceState(window.history.state, '', semHash());
    }
    fecharLocal();
  }, [fecharLocal]);
  useEffect(() => {
    if (aberta && window.location.hash !== '#conversa') {
      window.history.pushState(window.history.state, '', '#conversa');
      empurrou.current = true;
    }
  }, [aberta]);
  useEffect(() => {
    const aoVoltar = () => {
      if (window.location.hash !== '#conversa') { empurrou.current = false; fecharLocal(); }
      else { empurrou.current = true; setAberta(true); }        // Avançar reabre o fio
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [fecharLocal]);

  // ---------- chave e gasto do dia ----------
  const lerChave = useCallback(async () => {
    const r = await api.chave();
    if (r.ok) setChave({ ligada: r.dados.ligada, motivo: r.dados.motivo, gasto: r.dados.gasto_hoje_usd, teto: r.dados.teto_usd_dia });
    else if (r.status === 401) irEntrar(pid);
  }, [pid]);
  useEffect(() => { void lerChave(); }, [lerChave]);
  useEffect(() => {
    const i = fio.inst;
    if (i) setChave({ ligada: i.ligada, motivo: i.motivo, gasto: i.gasto_hoje_usd, teto: i.teto_usd_dia });
  }, [fio.inst]);
  // o gasto do dia anda a cada resposta que chega ao vivo (as do histórico podem ser de ontem)
  const ultimoFimVivo = useMemo(() => {
    for (let i = montado.itens.length - 1; i >= 0; i--) {
      const it = montado.itens[i];
      if (it.k === 'fim' && it.id > fio.vivoDesde && fio.carregado) return it;
    }
    return null;
  }, [montado.itens, fio.vivoDesde, fio.carregado]);
  useEffect(() => {
    if (ultimoFimVivo) setChave((c) => (c ? { ...c, gasto: Math.max(c.gasto, ultimoFimVivo.d.gasto_hoje_usd ?? 0) } : c));
  }, [ultimoFimVivo]);

  const mudarChave = useCallback(async (ligada: boolean) => {
    if (mudandoChave) return;
    setMudandoChave(true);
    const r = await api.mudarChave(ligada);
    setMudandoChave(false);
    if (r.ok) {
      setChave({ ligada: r.dados.ligada, motivo: r.dados.motivo, gasto: r.dados.gasto_hoje_usd, teto: r.dados.teto_usd_dia });
      setNota(null);
      api.avisarMudanca();
    } else if (r.status === 401) irEntrar(pid);
    else setNota({ tom: 'alerta', texto: r.erro });
  }, [mudandoChave, pid]);

  // ---------- mensagens saindo ----------
  // A bolha local some quando a fala chega pelo fio (mesmo turno e mesmo texto); assim não pisca nem aparece duas vezes.
  useEffect(() => {
    setSaindo((l) => {
      const fora = l.filter((m) => m.turno && montado.itens.some((it) => it.k === 'dono' && it.d.turno === m.turno && it.d.texto === m.texto));
      return fora.length ? l.filter((m) => !fora.includes(m)) : l;
    });
  }, [montado.itens]);
  useEffect(() => {
    if (!saindo.some((m) => m.ok)) return;
    const t = setTimeout(() => setSaindo((l) => l.filter((m) => !m.ok || Date.now() - m.ok < 15000)), 15500);
    return () => clearTimeout(t);
  }, [saindo]);

  const mandar = useCallback(async (m: Saindo) => {
    setSaindo((l) => l.map((x) => (x.cmid === m.cmid ? { ...x, indo: true, falhou: undefined } : x)));
    const r = await api.enviar(pid, { texto: m.texto, via: m.via, cliente_msg_id: m.cmid, ...(m.contexto ? { contexto: m.contexto } : {}) });
    if (r.ok) {
      setSaindo((l) => l.map((x) => (x.cmid === m.cmid ? { ...x, indo: false, turno: r.dados.turno, ok: Date.now() } : x)));
      setNota(null);
      return true;
    }
    if (r.status === 401) { irEntrar(pid); return false; }
    setSaindo((l) => l.map((x) => (x.cmid === m.cmid ? { ...x, indo: false, falhou: r.erro } : x)));
    if (r.status === 429 || r.status === 503) void lerChave();
    return false;
  }, [pid, lerChave]);

  // ao abrir a página (depois de entrar de novo, por exemplo) e quando a rede volta, o que ficou sem sair vai de novo:
  // o mesmo cliente_msg_id devolve o mesmo turno, então reenviar nunca duplica
  const saindoRef = useRef(saindo);
  useEffect(() => { saindoRef.current = saindo; }, [saindo]);
  const reenviarPendentes = useCallback(() => {
    for (const m of saindoRef.current) if (!m.ok && !m.indo) void mandar(m);
  }, [mandar]);
  useEffect(() => {
    if (!fio.carregado) return;
    reenviarPendentes();
    window.addEventListener('online', reenviarPendentes);
    return () => window.removeEventListener('online', reenviarPendentes);
  }, [fio.carregado, reenviarPendentes]);

  const responderTexto = useCallback(async (tool_use_id: string, t: string) => {
    if (travaCartao.current) return false;
    travaCartao.current = true;
    setOcupado(tool_use_id);
    try {
      const r = await api.responder(pid, { tool_use_id, texto: t });
      if (r.ok) { marcarFeito(tool_use_id); setRespondendo(null); return true; }
      if (r.status === 401) { irEntrar(pid); return false; }
      setErroCartao((e) => ({ ...e, [tool_use_id]: r.erro }));
      if (r.status === 409 || r.status === 404) setRespondendo(null);
      return false;
    } finally { travaCartao.current = false; setOcupado(null); }
  }, [pid, marcarFeito]);

  const enviar = useCallback(async () => {
    const t = texto.trim();
    if (!t || travaEnvio.current) return;
    if (t.length > LIMITE) {
      setNota({ tom: 'alerta', texto: `A mensagem passou de ${LIMITE.toLocaleString('pt-BR')} letras. Corte ${(t.length - LIMITE).toLocaleString('pt-BR')} para enviar: nada é cortado sem você ver.` });
      return;
    }
    travaEnvio.current = true;
    try {
      if (respondendo) {
        if (await responderTexto(respondendo, t)) setTexto('', 'texto');
        return;
      }
      let contexto: Contexto | undefined;
      try { contexto = opcoesRef.current.contexto(); } catch { contexto = undefined; }
      const m: Saindo = { cmid: api.novoCmid(), texto: t, via, contexto, criado: Date.now() };
      setSaindo((l) => [...l, m]);
      setTexto('', 'texto');
      abrir();
      await mandar(m);
    } finally { travaEnvio.current = false; }
  }, [texto, via, respondendo, responderTexto, setTexto, abrir, mandar]);

  const tentarSaindo = useCallback((cmid: string) => {
    const m = saindo.find((x) => x.cmid === cmid);
    if (m && !m.indo) void mandar(m);
  }, [saindo, mandar]);
  const descartarSaindo = useCallback((cmid: string) => setSaindo((l) => l.filter((x) => x.cmid !== cmid)), []);

  // ---------- cartões ----------
  const escolher = useCallback(async (tool_use_id: string, escolha_id: string) => {
    if (travaCartao.current || feitos.has(tool_use_id)) return;
    travaCartao.current = true;
    setOcupado(tool_use_id);
    setErroCartao((e) => { const n = { ...e }; delete n[tool_use_id]; return n; });
    try {
      const r = await api.responder(pid, { tool_use_id, escolha_id });
      if (r.ok) { marcarFeito(tool_use_id); if (respondendo === tool_use_id) setRespondendo(null); return; }
      if (r.status === 401) { irEntrar(pid); return; }
      setErroCartao((e) => ({ ...e, [tool_use_id]: r.status === 409 ? `${r.erro}. Talvez no outro aparelho.` : r.erro }));
    } finally { travaCartao.current = false; setOcupado(null); }
  }, [pid, respondendo, feitos, marcarFeito]);

  const decidir = useCallback(async (c: DadosConfirmacao, sim: boolean, soNesteProjeto?: boolean) => {
    if (travaCartao.current || feitos.has(c.tool_use_id)) return;
    travaCartao.current = true;
    setOcupado(c.tool_use_id);
    setErroCartao((e) => { const n = { ...e }; delete n[c.tool_use_id]; return n; });
    try {
      const r = await api.confirmar(pid, { tool_use_id: c.tool_use_id, sim, entrada_hash: c.entrada_hash, ...(soNesteProjeto ? { so_neste_projeto: true } : {}) });
      if (r.ok) { marcarFeito(c.tool_use_id); if (r.dados.feito) opcoesRef.current.aoMudouProjeto(); return; }
      if (r.status === 401) { irEntrar(pid); return; }
      if (r.status === 409) marcarFeito(c.tool_use_id);          // já decidido (aqui ou no outro aparelho): a resposta vem pelo fio
      setErroCartao((e) => ({ ...e, [c.tool_use_id]: r.erro }));
    } finally { travaCartao.current = false; setOcupado(null); }
  }, [pid, feitos, marcarFeito]);

  const responderDoMeuJeito = useCallback((tool_use_id: string) => {
    setRespondendo(tool_use_id);
    setTimeout(() => campoRef.current?.focus(), 30);
  }, []);

  // ---------- parar, retomar, tentar de novo ----------
  const [parando, setParando] = useState(false);
  const pararTurno = useCallback(async () => {
    if (parando) return;
    setParando(true);
    const r = await api.parar(pid);
    setParando(false);
    if (!r.ok) { if (r.status === 401) irEntrar(pid); else setNota({ tom: 'alerta', texto: r.erro }); }
  }, [pid, parando]);
  const [retomando, setRetomando] = useState(false);
  const retomarTurno = useCallback(async () => {
    if (retomando) return;
    setRetomando(true);
    const r = await api.retomar(pid);
    setRetomando(false);
    if (!r.ok) { if (r.status === 401) irEntrar(pid); else setNota({ tom: 'alerta', texto: r.erro }); }
  }, [pid, retomando]);
  /** A resposta parou com erro: manda de novo o que o dono tinha dito naquele turno (uma mensagem nova). */
  const tentarTurno = useCallback((turno: string) => {
    const falas = montado.itens.filter((it) => it.k === 'dono' && it.d.turno === turno);
    const ult = falas[falas.length - 1];
    if (!ult || ult.k !== 'dono') return;
    const m: Saindo = { cmid: api.novoCmid(), texto: ult.d.texto, via: ult.d.via, criado: Date.now() };
    setSaindo((l) => [...l, m]);
    void mandar(m);
  }, [montado.itens, mandar]);
  /** Mensagem pronta de um toque (ex.: "Pode seguir." depois do limite de passos). */
  const mandarTexto = useCallback((t: string) => {
    const m: Saindo = { cmid: api.novoCmid(), texto: t, via: 'texto', criado: Date.now() };
    setSaindo((l) => [...l, m]);
    void mandar(m);
  }, [mandar]);

  // ---------- mostrar no player ----------
  const mostrar = useCallback((d: DadosMostrar) => {
    fechar();
    setTimeout(() => {
      const v = document.querySelector<HTMLVideoElement>('[data-teste=player]');
      if (!v || (d.versao && v.dataset.versao !== d.versao)) {
        setNota({ tom: 'info', texto: d.versao ? `A ${d.versao.toUpperCase()} ainda não está no player.` : 'O player ainda não tem filme.' });
        return;
      }
      if (typeof d.tempo_s === 'number') { try { v.currentTime = d.tempo_s; } catch { /* ainda carregando */ } }
      v.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      v.focus({ preventScroll: true });
    }, 60);
  }, [fechar]);

  // quem espera o dono mudou: o Topo relê (selo, número em Projetos, título da aba)
  const esperaId = montado.espera?.tool_use_id ?? null;
  useEffect(() => { if (fio.carregado) api.avisarMudanca(); }, [esperaId, fio.carregado]);

  const ligada = chave?.ligada ?? fio.inst?.ligada ?? false;
  const noTeto = Boolean(chave && chave.gasto >= chave.teto - 1e-9);
  return {
    pid, fio, montado, aberta, abrir, fechar, texto, setTexto, via, enviar, saindo, tentarSaindo, descartarSaindo,
    respondendo, setRespondendo, responderDoMeuJeito, escolher, decidir, ocupado, feitos, erroCartao, nota, setNota, limite: LIMITE,
    chave, ligada, motivo: chave?.motivo ?? fio.inst?.motivo, noTeto, mudarChave, mudandoChave, lerChave,
    pararTurno, parando, retomarTurno, retomando, tentarTurno, mandarTexto, mostrar, campoRef, estadoChave: chave as EstadoChaveTela | null,
  };
}
type EstadoChaveTela = Chave;
export type Conversa = ReturnType<typeof useConversa>;
export type { EstadoChave };
