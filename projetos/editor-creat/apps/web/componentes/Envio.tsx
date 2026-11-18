'use client';
// Envio retomável, em dois modos (o servidor diz qual em /api/envio-r2/config):
// - local (padrão, dev e esta máquina): tus. Partes de EDITOR_ENVIO_PARTE_MB; a impressão digital inclui o projeto.
// - r2 (produção, EDITOR_ARMAZENAMENTO=r2): direto do navegador ao R2 por multipart com URLs pré-assinadas, 3 partes
//   em paralelo, repetição com recuo por parte, retomada depois de recarregar (uploadId guardado no localStorage; o
//   servidor lista as partes que já chegaram e só as faltantes sobem), pausa sozinho sem rede e volta quando ela volta.
// Fechou a aba ou caiu a rede: escolha o mesmo arquivo e ele continua de onde parou.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { bytesLegiveis } from '@/lib/estados';

type EstadoEnvio = 'preparando' | 'enviando' | 'pausado' | 'concluido' | 'erro' | 'cancelado';
type Controle = { pausar: () => void; continuar: () => void; cancelar: () => void };
type Item = {
  chave: string; nome: string; tamanho: number; enviados: number; estado: EstadoEnvio;
  retomadoDe: number | null; velocidade: number; mensagem: string; controle?: Controle;
};
type Pendente = { nome: string; tamanho: number; fracao: number | null; storageKey: string; url: string; token?: string };
type Config = { modo: 'local' | 'r2'; parteMB: number; maxBytes: number; limite: string; simultaneas: number };

const impressao = (projeto: string, f: File) => ['ec', projeto, f.name, f.size, f.lastModified].join('|');

async function offsetRemoto(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' }, cache: 'no-store' });
    if (!r.ok) return null;
    return Number(r.headers.get('Upload-Offset') ?? NaN);
  } catch {
    return null;
  }
}

// ======================= modo R2: motor de envio =======================
type RegistroR2 = { token: string; chave: string; nome: string; tamanho: number; parteBytes: number; projeto: string; criado: number };
type ParteR2 = { parte: number; etag: string; bytes: number };
const PREFIXO_LS = 'ec-r2:';
const RECUOS_MS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 60000];

const lsLer = (k: string): RegistroR2 | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as RegistroR2) : null; } catch { return null; }
};
const lsGravar = (k: string, v: RegistroR2) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: só não retoma */ } };
const lsApagar = (k: string) => { try { localStorage.removeItem(k); } catch { /* idem */ } };
function lsPendentes(projeto: string): [string, RegistroR2][] {
  const lista: [string, RegistroR2][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO_LS)) continue;
      const v = lsLer(k);
      if (v?.projeto === projeto && v.token) lista.push([k, v]);
      else if (v && Date.now() - v.criado > 8 * 24 * 3600 * 1000) lsApagar(k); // o R2 já descartou
    }
  } catch { /* idem */ }
  return lista;
}

class ErroEnvio extends Error {
  constructor(msg: string, readonly status = 0, readonly corpo: Record<string, unknown> = {}) { super(msg); }
}

async function api<T>(acao: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/envio-r2/${acao}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), cache: 'no-store' });
  } catch {
    throw new ErroEnvio('sem conexão com o site', 0);
  }
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg = r.status === 401 ? 'Sua sessão expirou. Entre de novo e escolha o arquivo para continuar.'
      : typeof d.detail === 'string' ? d.detail : `o site respondeu ${r.status}`;
    throw new ErroEnvio(msg, r.status, d);
  }
  return d as T;
}

const dormir = (ms: number, sinal?: { cancelado: boolean }) => new Promise<void>((ok) => {
  const t0 = Date.now();
  const tique = () => { if (sinal?.cancelado || Date.now() - t0 >= ms) ok(); else setTimeout(tique, Math.min(250, ms)); };
  tique();
});

type Ouvintes = {
  progresso: (enviados: number, total: number, velocidade: number) => void;
  estado: (estado: EstadoEnvio, mensagem: string) => void;
  retomado: (bytes: number) => void;
  fim: () => void;
};

class EnvioR2 {
  private reg: RegistroR2 | null;
  private feitas = new Map<number, ParteR2>();
  private emCurso = new Map<number, { xhr: XMLHttpRequest; carregado: number }>();
  private fila: number[] = [];
  private urls = new Map<number, { url: string; em: number }>();
  private rodada = { cancelado: false };
  private pausadoPor: 'usuario' | 'rede' | null = null;
  private terminado = false;
  private ultimoAviso = 0;
  private amostra = { t: 0, b: 0, v: 0 };
  private soltar: () => void = () => {};

  constructor(private arquivo: File, private projeto: string, private lsChave: string, private simultaneas: number, private o: Ouvintes) {
    this.reg = lsLer(lsChave);
  }

  private get total() { return this.arquivo.size; }
  private get nPartes() { return this.reg ? Math.max(1, Math.ceil(this.reg.tamanho / this.reg.parteBytes)) : 0; }
  private bytesDe(n: number) { const r = this.reg!; return n < this.nPartes ? r.parteBytes : r.tamanho - (this.nPartes - 1) * r.parteBytes; }

  private enviados(): number {
    let s = 0;
    for (const p of this.feitas.values()) s += p.bytes;
    for (const c of this.emCurso.values()) s += c.carregado;
    return s;
  }

  private avisarProgresso(forcar = false) {
    const agora = performance.now();
    if (!forcar && agora - this.ultimoAviso < 200) return;
    this.ultimoAviso = agora;
    const b = this.enviados();
    if (!this.amostra.t) this.amostra = { t: agora, b, v: 0 };
    else if (agora - this.amostra.t > 700) {
      const inst = Math.max(0, ((b - this.amostra.b) / (agora - this.amostra.t)) * 1000);
      this.amostra = { t: agora, b, v: this.amostra.v ? this.amostra.v * 0.6 + inst * 0.4 : inst };
    }
    this.o.progresso(b, this.total, this.amostra.v);
  }

  /** Liga os ouvintes de rede e visibilidade (celular: tela bloqueada, troca de app, 4G que cai). */
  private ligarOuvintes() {
    const offline = () => { if (!this.terminado && !this.pausadoPor) this.pausar('rede'); };
    const online = () => { if (this.pausadoPor === 'rede') void this.continuar(); };
    const visivel = () => {
      if (document.visibilityState === 'visible' && this.pausadoPor === 'rede' && navigator.onLine) void this.continuar();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visivel);
    this.soltar = () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visivel);
    };
  }

  async comecar() {
    this.ligarOuvintes();
    this.o.estado('preparando', this.reg ? 'Conferindo o que já chegou…' : 'Preparando…');
    await this.continuar(true);
  }

  /** Pergunta ao servidor (ListParts) o que já está no R2; cria o envio se não houver um válido. */
  private async sincronizar(primeira: boolean): Promise<boolean> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      if (!this.reg) {
        const r = await api<{ token: string; chave: string; parteBytes: number }>('iniciar', {
          projeto: this.projeto, nome: this.arquivo.name, tamanho: this.arquivo.size, tipo: this.arquivo.type || 'application/octet-stream',
        });
        this.reg = { token: r.token, chave: r.chave, nome: this.arquivo.name, tamanho: this.arquivo.size, parteBytes: r.parteBytes, projeto: this.projeto, criado: Date.now() };
        lsGravar(this.lsChave, this.reg);
        this.feitas.clear();
        return true;
      }
      try {
        const r = await api<{ partes: ParteR2[]; enviados: number; concluido?: boolean }>('partes', { token: this.reg.token });
        this.feitas = new Map(r.partes.map((p) => [p.parte, p]));
        if (primeira && r.enviados > 0) this.o.retomado(r.enviados);
        if (r.concluido) for (let n = 1; n <= this.nPartes; n++) this.feitas.set(n, { parte: n, etag: '', bytes: this.bytesDe(n) });
        return true;
      } catch (e) {
        if (e instanceof ErroEnvio && (e.status === 404 || e.status === 400)) { // envio vencido: recomeça do zero
          lsApagar(this.lsChave);
          this.reg = null;
          continue;
        }
        throw e;
      }
    }
    return false;
  }

  async continuar(primeira = false) {
    if (this.terminado) return;
    this.pausadoPor = null;
    this.rodada.cancelado = true;
    for (const c of this.emCurso.values()) c.xhr.abort(); // sobra da rodada anterior: o ListParts diz o que ficou
    const rodada = (this.rodada = { cancelado: false });
    try {
      if (!navigator.onLine) { this.pausar('rede'); return; }
      await this.sincronizar(primeira);
      if (rodada.cancelado) return;
      this.fila = [];
      for (let n = 1; n <= this.nPartes; n++) if (!this.feitas.has(n)) this.fila.push(n);
      this.o.estado('enviando', '');
      this.avisarProgresso(true);
      const trabalhadores = Array.from({ length: Math.min(this.simultaneas, Math.max(1, this.fila.length)) }, () => this.trabalhar(rodada));
      await Promise.all(trabalhadores);
      if (rodada.cancelado || this.pausadoPor) return;
      if (this.feitas.size < this.nPartes) {
        this.o.estado('erro', 'O envio parou depois de várias tentativas. Toque em continuar (ou escolha o mesmo arquivo de novo).');
        return;
      }
      await this.concluir(rodada);
    } catch (e) {
      if (rodada.cancelado) return;
      if (e instanceof ErroEnvio && e.status === 0) { this.pausar('rede'); return; }
      this.o.estado('erro', e instanceof Error ? e.message : 'O envio parou. Escolha o mesmo arquivo para continuar de onde parou.');
    }
  }

  private async trabalhar(rodada: { cancelado: boolean }) {
    while (!rodada.cancelado && !this.pausadoPor) {
      const n = this.fila.shift();
      if (n === undefined) return;
      const ok = await this.enviarParte(n, rodada);
      if (!ok) {
        if (!rodada.cancelado && !this.pausadoPor) this.fila.length = 0; // falha definitiva: para os outros também
        else if (!this.feitas.has(n)) this.fila.unshift(n);
        return;
      }
    }
  }

  private async urlDa(n: number, nova = false): Promise<string> {
    const c = this.urls.get(n);
    if (c && !nova && Date.now() - c.em < 10 * 60 * 1000) return c.url;
    // assina esta e as próximas da fila numa chamada só (menos idas ao site)
    const pedir = [n, ...this.fila.filter((x) => !this.urls.has(x)).slice(0, 5)];
    const r = await api<{ urls: { parte: number; url: string }[] }>('assinar', { token: this.reg!.token, partes: pedir });
    for (const u of r.urls) this.urls.set(u.parte, { url: u.url, em: Date.now() });
    return this.urls.get(n)!.url;
  }

  private put(url: string, n: number): Promise<{ status: number; etag: string | null }> {
    const ini = (n - 1) * this.reg!.parteBytes;
    const corpo = this.arquivo.slice(ini, ini + this.bytesDe(n));
    return new Promise((ok) => {
      const xhr = new XMLHttpRequest();
      this.emCurso.set(n, { xhr, carregado: 0 });
      xhr.open('PUT', url);
      xhr.upload.onprogress = (ev) => { const c = this.emCurso.get(n); if (c) c.carregado = ev.loaded; this.avisarProgresso(); };
      const fim = (status: number) => { this.emCurso.delete(n); ok({ status, etag: status >= 200 && status < 300 ? xhr.getResponseHeader('ETag') : null }); };
      xhr.onload = () => fim(xhr.status);
      xhr.onerror = () => fim(0);
      xhr.onabort = () => fim(-1);
      xhr.ontimeout = () => fim(0);
      xhr.send(corpo);
    });
  }

  /** Uma parte, com repetição e recuo. Sem rede: espera a rede voltar sem gastar tentativa. */
  private async enviarParte(n: number, rodada: { cancelado: boolean }): Promise<boolean> {
    let novaUrl = false;
    for (let tentativa = 0; tentativa <= RECUOS_MS.length; tentativa++) {
      if (rodada.cancelado || this.pausadoPor) return false;
      let r: { status: number; etag: string | null };
      try {
        const url = await this.urlDa(n, novaUrl);
        r = await this.put(url, n);
      } catch (e) {
        if (e instanceof ErroEnvio && e.status !== 0 && e.status < 500) { this.o.estado('erro', e.message); return false; }
        r = { status: 0, etag: null };
      }
      if (r.status === -1 || rodada.cancelado || this.pausadoPor) return false;
      if (r.status >= 200 && r.status < 300) {
        if (!r.etag) {
          this.o.estado('erro', 'O armazenamento não mostrou o ETag da parte (CORS do bucket sem ExposeHeaders: ETag). Veja docs/R2-ENVIO.md.');
          return false;
        }
        this.feitas.set(n, { parte: n, etag: r.etag, bytes: this.bytesDe(n) });
        this.urls.delete(n);
        this.avisarProgresso(true);
        return true;
      }
      if (r.status === 404) { this.o.estado('erro', 'Este envio expirou no armazenamento. Escolha o arquivo de novo para começar.'); lsApagar(this.lsChave); return false; }
      novaUrl = r.status === 403 || r.status === 400; // URL vencida ou recusada: assina de novo
      this.avisarProgresso(true);
      if (!navigator.onLine) { this.pausar('rede'); return false; }
      await dormir(RECUOS_MS[Math.min(tentativa, RECUOS_MS.length - 1)] * (0.8 + Math.random() * 0.4), rodada);
    }
    return false;
  }

  private async concluir(rodada: { cancelado: boolean }) {
    this.o.estado('enviando', 'Juntando as partes no armazenamento…');
    for (let tentativa = 0; tentativa < 6 && !rodada.cancelado; tentativa++) {
      try {
        const partes = [...this.feitas.values()].filter((p) => p.etag).map(({ parte, etag }) => ({ parte, etag }));
        const r = await api<{ chave: string; registro: 'ok' | 'pendente' }>('concluir', { token: this.reg!.token, partes });
        if (r.registro === 'pendente' && tentativa < 5) { // arquivo salvo; o motor estava fora: avisa de novo (idempotente)
          this.o.estado('enviando', 'Arquivo salvo. Avisando o motor…');
          await dormir(3000 * (tentativa + 1), rodada);
          continue;
        }
        this.terminado = true;
        this.soltar();
        lsApagar(this.lsChave);
        this.o.progresso(this.total, this.total, 0);
        this.o.estado('concluido', r.registro === 'ok' ? 'No armazenamento. O motor já está lendo.' : 'No armazenamento. O motor registra quando você fechar o envio.');
        this.o.fim();
        return;
      } catch (e) {
        const faltam = e instanceof ErroEnvio && Array.isArray(e.corpo.faltam) ? (e.corpo.faltam as number[]) : [];
        if (faltam.length && tentativa < 3) { // alguma parte não está lá: manda só ela de novo
          for (const n of faltam) { this.feitas.delete(n); this.urls.delete(n); }
          this.fila = [...faltam];
          await Promise.all(Array.from({ length: Math.min(this.simultaneas, faltam.length) }, () => this.trabalhar(rodada)));
          continue;
        }
        if (e instanceof ErroEnvio && e.status !== 0 && e.status < 500) { this.o.estado('erro', e.message); return; }
        await dormir(2000 * (tentativa + 1), rodada);
      }
    }
    if (!rodada.cancelado) this.o.estado('erro', 'Não consegui fechar o envio agora. Toque em continuar.');
  }

  pausar(motivo: 'usuario' | 'rede') {
    if (this.terminado) return;
    this.pausadoPor = motivo;
    this.rodada.cancelado = true;
    for (const c of this.emCurso.values()) c.xhr.abort();
    this.avisarProgresso(true);
    this.o.estado('pausado', motivo === 'rede' ? 'Sem internet. O envio continua sozinho quando a rede voltar.' : 'Pausado. Toque em continuar quando quiser.');
  }

  async cancelar() {
    this.terminado = true;
    this.rodada.cancelado = true;
    this.soltar();
    for (const c of this.emCurso.values()) c.xhr.abort();
    const token = this.reg?.token;
    lsApagar(this.lsChave);
    this.o.estado('cancelado', 'Envio cancelado. As partes enviadas foram descartadas.');
    if (token) await api('abortar', { token }).catch(() => null);
  }
}

// ======================= componente =======================
export default function Envio({ projeto, parteMB, aberto, aoConcluir }: {
  projeto: string; parteMB: number; aberto: boolean; aoConcluir: () => void;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const medidas = useRef(new Map<string, { t: number; b: number }>());
  const config = useRef<Promise<Config> | null>(null);

  const lerConfig = useCallback((): Promise<Config> => {
    const padrao: Config = { modo: 'local', parteMB, maxBytes: 200 * 1024 ** 3, limite: '200 GB', simultaneas: 3 };
    const p: Promise<Config> = config.current ?? fetch('/api/envio-r2/config', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Config>) : padrao))
      .catch(() => { config.current = null; return padrao; });
    config.current = p;
    return p;
  }, [parteMB]);

  const atualizar = useCallback((chave: string, mudanca: Partial<Item>) => {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }, []);

  // Envios interrompidos deste projeto: tus (localStorage do tus-js-client) ou R2 (uploadId no localStorage).
  const carregarPendentes = useCallback(async () => {
    try {
      const cfg = await lerConfig();
      const lista: Pendente[] = [];
      if (cfg.modo === 'r2') {
        for (const [k, reg] of lsPendentes(projeto)) {
          try {
            const r = await api<{ enviados: number; tamanho: number; concluido?: boolean }>('partes', { token: reg.token });
            if (r.concluido) { lsApagar(k); continue; }
            lista.push({ nome: reg.nome, tamanho: reg.tamanho, fracao: r.tamanho ? r.enviados / r.tamanho : null, storageKey: k, url: '', token: reg.token });
          } catch (e) {
            if (e instanceof ErroEnvio && (e.status === 404 || e.status === 400)) lsApagar(k);
            else lista.push({ nome: reg.nome, tamanho: reg.tamanho, fracao: null, storageKey: k, url: '', token: reg.token });
          }
        }
      } else {
        const todos = await tus.defaultOptions.urlStorage.findAllUploads();
        for (const u of todos.filter((x) => x.metadata?.projeto === projeto && x.uploadUrl)) {
          const off = await offsetRemoto(u.uploadUrl!);
          if (off === null || Number.isNaN(off)) {
            if (u.urlStorageKey) await tus.defaultOptions.urlStorage.removeUpload(u.urlStorageKey);
            continue;
          }
          lista.push({ nome: u.metadata?.nome ?? 'arquivo', tamanho: Number(u.size ?? 0), fracao: u.size ? off / Number(u.size) : null, storageKey: u.urlStorageKey ?? '', url: u.uploadUrl! });
        }
      }
      setPendentes(lista);
    } catch {
      setPendentes([]);
    }
  }, [projeto, lerConfig]);

  useEffect(() => { void carregarPendentes(); }, [carregarPendentes]);

  // Avisa antes de fechar a aba com envio em andamento (o envio continua depois, mas o dono precisa saber).
  useEffect(() => {
    const ativo = itens.some((i) => i.estado === 'enviando' || i.estado === 'preparando');
    if (!ativo) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [itens]);

  const medirVelocidade = useCallback((chave: string, enviados: number): number => {
    const agora = performance.now();
    const m = medidas.current.get(chave);
    if (m && agora - m.t > 400) {
      medidas.current.set(chave, { t: agora, b: enviados });
      return ((enviados - m.b) / (agora - m.t)) * 1000;
    }
    if (!m) medidas.current.set(chave, { t: agora, b: enviados });
    return 0;
  }, []);

  const comecarR2 = useCallback((arquivo: File, chave: string, cfg: Config) => {
    if (cfg.maxBytes && arquivo.size > cfg.maxBytes) {
      atualizar(chave, { estado: 'erro', mensagem: `Arquivo grande demais: o limite é ${cfg.limite} por arquivo.` });
      return;
    }
    const lsChave = PREFIXO_LS + impressao(projeto, arquivo);
    const motor = new EnvioR2(arquivo, projeto, lsChave, cfg.simultaneas || 3, {
      progresso: (enviados, total, velocidade) => setItens((l) => l.map((i) => (i.chave === chave ? {
        ...i, enviados, tamanho: total, velocidade: velocidade || i.velocidade,
      } : i))),
      estado: (estado, mensagem) => atualizar(chave, { estado, mensagem }),
      retomado: (bytes) => atualizar(chave, { retomadoDe: bytes, enviados: bytes }),
      fim: () => { aoConcluir(); void carregarPendentes(); },
    });
    atualizar(chave, {
      controle: { pausar: () => motor.pausar('usuario'), continuar: () => void motor.continuar(), cancelar: () => void motor.cancelar() },
    });
    setPendentes((p) => p.filter((x) => x.storageKey !== lsChave));
    void motor.comecar();
  }, [projeto, atualizar, aoConcluir, carregarPendentes]);

  const comecarTus = useCallback(async (arquivo: File, chave: string) => {
    const upload = new tus.Upload(arquivo, {
      endpoint: '/api/envio',
      chunkSize: parteMB * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000],
      metadata: { projeto, nome: arquivo.name, filetype: arquivo.type || 'application/octet-stream' },
      fingerprint: async (f) => impressao(projeto, f as File),
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onProgress(enviados, total) {
        const velocidade = medirVelocidade(chave, enviados);
        setItens((l) => l.map((i) => (i.chave === chave ? {
          ...i, enviados, tamanho: total, estado: 'enviando',
          velocidade: velocidade || i.velocidade, mensagem: '',
        } : i)));
      },
      async onSuccess(payload) {
        const resp = payload?.lastResponse;
        const registro = resp?.getHeader('Editor-Registro');
        const chaveArm = resp?.getHeader('Editor-Chave');
        if (registro === 'pendente' && chaveArm) {
          // O motor estava fora no fim do envio: registra de novo pelo proxy.
          await fetch(`/api/motor/v1/projetos/${projeto}/arquivos`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chave: chaveArm, nome: arquivo.name, bytes: arquivo.size }),
          }).catch(() => null);
        }
        atualizar(chave, { estado: 'concluido', enviados: arquivo.size, mensagem: 'No armazenamento. O motor já está lendo.' });
        aoConcluir();
        void carregarPendentes();
      },
      onError(e) {
        const r = (e as tus.DetailedError).originalResponse;
        const corpo = r?.getBody?.();
        const status = r?.getStatus?.() ?? 0;
        const msg = status === 401 ? 'Sua sessão expirou. Entre de novo e escolha o arquivo para continuar.'
          : corpo && corpo.length < 300 ? corpo : 'O envio parou. Escolha o mesmo arquivo para continuar de onde parou.';
        atualizar(chave, { estado: 'erro', mensagem: msg });
      },
    });
    atualizar(chave, {
      controle: {
        pausar: () => { void upload.abort(); atualizar(chave, { estado: 'pausado', mensagem: 'Pausado. Toque em continuar quando quiser.' }); },
        continuar: () => { upload.start(); atualizar(chave, { estado: 'enviando', mensagem: '' }); },
        cancelar: () => { void upload.abort(true); atualizar(chave, { estado: 'cancelado', mensagem: 'Envio cancelado.' }); },
      },
    });
    try {
      const anteriores = await upload.findPreviousUploads();
      if (anteriores.length) {
        const ultimo = anteriores.sort((a, b) => String(b.creationTime).localeCompare(String(a.creationTime)))[0];
        const off = ultimo.uploadUrl ? await offsetRemoto(ultimo.uploadUrl) : null;
        if (off !== null && !Number.isNaN(off)) {
          upload.resumeFromPreviousUpload(ultimo);
          atualizar(chave, { retomadoDe: off, enviados: off, mensagem: `Retomando de ${Math.floor((off / arquivo.size) * 100)}%` });
        }
      }
    } catch { /* sem envio anterior: começa do zero */ }
    upload.start();
    setPendentes((p) => p.filter((x) => !(x.nome === arquivo.name && x.tamanho === arquivo.size)));
  }, [projeto, parteMB, atualizar, aoConcluir, carregarPendentes, medirVelocidade]);

  const comecar = useCallback(async (arquivo: File) => {
    const chave = `${impressao(projeto, arquivo)}|${Date.now()}`;
    setItens((l) => [{ chave, nome: arquivo.name, tamanho: arquivo.size, enviados: 0, estado: 'preparando', retomadoDe: null, velocidade: 0, mensagem: 'Preparando…' }, ...l]);
    const cfg = await lerConfig();
    if (cfg.modo === 'r2') comecarR2(arquivo, chave, cfg);
    else await comecarTus(arquivo, chave);
  }, [projeto, lerConfig, comecarR2, comecarTus]);

  const escolher = (lista: FileList | null) => {
    if (!lista) return;
    for (const f of Array.from(lista)) void comecar(f);
    if (entrada.current) entrada.current.value = '';
  };

  const descartar = async (p: Pendente) => {
    if (p.token) await api('abortar', { token: p.token }).catch(() => null);
    else if (p.storageKey) await tus.defaultOptions.urlStorage.removeUpload(p.storageKey).catch(() => null);
    lsApagar(p.storageKey);
    setPendentes((l) => l.filter((x) => x.storageKey !== p.storageKey));
  };

  return (
    <div>
      <div
        className="soltar"
        data-arrastando={arrastando}
        onDragOver={(e) => { e.preventDefault(); if (aberto) setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (aberto) escolher(e.dataTransfer.files); }}
      >
        <p className="soltar__grande">Solte o material aqui</p>
        <p className="aviso">Vídeos de vários GB, direto do celular ou do computador. Se a rede cair, continua de onde parou.</p>
        <label className="botao botao--principal" style={{ marginTop: 6 }} aria-disabled={!aberto}>
          Escolher arquivos
          <input ref={entrada} className="so-leitor" type="file" multiple disabled={!aberto}
            accept="video/*,audio/*,image/*,.mov,.mp4,.mts,.m4a,.wav,.zip,.pdf"
            onChange={(e) => escolher(e.currentTarget.files)} data-teste="entrada-arquivo" />
        </label>
        {!aberto && <p className="aviso">O envio foi fechado: este projeto já está sendo editado.</p>}
      </div>

      {pendentes.length > 0 && (
        <ul className="envios" aria-label="Envios interrompidos">
          {pendentes.map((p) => (
            <li className="envio" key={p.storageKey} data-estado="pausado" data-pendente={p.nome}>
              <div className="envio__linha">
                <span className="envio__nome">{p.nome}</span>
                <span className="envio__num">{p.fracao !== null ? `${Math.floor(p.fracao * 100)}%` : '…'}</span>
              </div>
              <div className="barra"><i style={{ transform: `scaleX(${p.fracao ?? 0})` }} /></div>
              <div className="envio__linha">
                <p className="envio__info">Interrompido. Escolha o mesmo arquivo de novo para continuar de onde parou.</p>
                <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => void descartar(p)}>Descartar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {itens.length > 0 && (
        <ul className="envios" aria-label="Envios" aria-live="polite">
          {itens.map((i) => {
            const fracao = i.tamanho ? Math.min(1, i.enviados / i.tamanho) : 0;
            const falta = i.velocidade > 0 ? Math.max(0, (i.tamanho - i.enviados) / i.velocidade) : null;
            const ativo = i.estado === 'enviando' || i.estado === 'preparando';
            return (
              <li className="envio" key={i.chave} data-envio={i.nome} data-estado={i.estado}
                data-progresso={fracao.toFixed(4)} data-retomado-de={i.retomadoDe !== null && i.tamanho ? (i.retomadoDe / i.tamanho).toFixed(4) : undefined}>
                <div className="envio__linha">
                  <span className="envio__nome">{i.nome}</span>
                  <span className="envio__num">{Math.floor(fracao * 100)}%</span>
                </div>
                <div className="barra" role="progressbar" aria-label={`Envio de ${i.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(fracao * 100)}>
                  <i style={{ transform: `scaleX(${fracao})` }} />
                </div>
                <div className="envio__linha">
                  <span className="envio__info">
                    {i.mensagem || `${bytesLegiveis(i.enviados)} de ${bytesLegiveis(i.tamanho)}${i.velocidade ? ` · ${bytesLegiveis(i.velocidade)}/s` : ''}${falta !== null && i.estado === 'enviando' ? ` · ~${falta < 60 ? `${Math.ceil(falta)} s` : `${Math.ceil(falta / 60)} min`}` : ''}`}
                    {i.retomadoDe !== null && i.estado === 'enviando' ? ` · retomado de ${Math.floor((i.retomadoDe / i.tamanho) * 100)}%` : ''}
                  </span>
                  {i.estado === 'enviando' && i.controle && <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => i.controle?.pausar()}>Pausar</button>}
                  {(i.estado === 'pausado' || i.estado === 'erro') && i.controle && <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => i.controle?.continuar()}>Continuar</button>}
                  {(ativo || i.estado === 'pausado' || i.estado === 'erro') && i.controle && (
                    <button type="button" className="botao botao--fantasma botao--pequeno" data-teste="cancelar-envio"
                      onClick={() => i.controle?.cancelar()} aria-label={`Cancelar o envio de ${i.nome}`}>Cancelar</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
