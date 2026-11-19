'use client';
// Envio direto do navegador ao Cloudflare R2 (fase 2, site na Vercel). O arquivo não passa pelo site:
// o motor assina cada parte, o navegador faz PUT direto no R2 e guarda o ETag. Retomável: o envio fica
// salvo no localStorage pela impressão digital (projeto + nome + tamanho + data do arquivo) e, ao escolher
// o mesmo arquivo de novo, o motor diz quais partes já chegaram.
// Precisa do CORS do bucket liberando PUT da origem do site e expondo o cabeçalho ETag (ver apps/web/README.md).

export type Progresso = (enviados: number, total: number) => void;
type Salvo = { envio: string; chave: string; parte_bytes: number; nome: string; tamanho: number; projeto: string; criado: number; amostra?: string };
type Parte = { parte: number; etag: string };

const PREFIXO = 'ec-r2|';
const PARALELO = 3;
const TENTATIVAS = [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000];

export const impressaoR2 = (projeto: string, f: File) => PREFIXO + ['ec', projeto, f.name, f.size, f.lastModified].join('|');

function ler(k: string): Salvo | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as Salvo) : null;
  } catch {
    return null;
  }
}
function gravar(k: string, v: Salvo) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: envia sem retomada */ }
}
function apagar(k: string) {
  try { localStorage.removeItem(k); } catch { /* nada */ }
}

/** Envios interrompidos deste projeto que ainda podem continuar (o R2 guarda as partes por dias). */
export function pendentesR2(projeto: string): { chaveLocal: string; nome: string; tamanho: number }[] {
  const out: { chaveLocal: string; nome: string; tamanho: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      const s = ler(k);
      if (s?.projeto === projeto) out.push({ chaveLocal: k, nome: s.nome, tamanho: s.tamanho });
    }
  } catch { /* nada */ }
  return out;
}

export class ErroEnvio extends Error {
  constructor(msg: string, public status = 0) { super(msg); }
}

async function motor<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api/motor/v1/${caminho}`, {
    ...init, cache: 'no-store',
    headers: init.body ? { 'content-type': 'application/json', ...(init.headers ?? {}) } : init.headers,
  });
  const corpo = await r.json().catch(() => null) as { detail?: unknown } | null;
  if (!r.ok) {
    const d = corpo?.detail;
    throw new ErroEnvio(typeof d === 'string' ? d : `o motor respondeu ${r.status}`, r.status);
  }
  return corpo as T;
}

/** Resumo do começo e do fim do arquivo (1 MB de cada): diferencia dois vídeos com o mesmo nome e tamanho. */
async function amostra(f: File): Promise<string> {
  const MBy = 1024 * 1024;
  const partes = [f.slice(0, MBy), f.slice(Math.max(0, f.size - MBy))];
  const dados = new Uint8Array(await new Blob(partes).arrayBuffer());
  const h = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

const esperar = (ms: number, sinal: AbortSignal) => new Promise<void>((ok, nao) => {
  const t = setTimeout(ok, ms);
  sinal.addEventListener('abort', () => { clearTimeout(t); nao(new DOMException('pausado', 'AbortError')); }, { once: true });
});

/** Um envio. `iniciar()` começa ou continua; `pausar()` interrompe (as partes que chegaram ficam no R2). */
export class EnvioR2 {
  private controle: AbortController | null = null;
  private rodando = false;
  private feitos = new Map<number, Parte>();
  private emVoo = new Map<number, number>();
  readonly chaveLocal: string;
  retomadoDe: number | null = null;

  constructor(
    private arquivo: File, private projeto: string,
    private ao: { progresso: Progresso; sucesso: (r: { chave: string }) => void; erro: (e: ErroEnvio) => void },
  ) {
    this.chaveLocal = impressaoR2(projeto, arquivo);
  }

  pausar() { this.controle?.abort(); }

  private enviados(parte: number) {
    let n = 0;
    for (const p of this.feitos.keys()) n += Math.min(parte, this.arquivo.size - (p - 1) * parte);
    for (const v of this.emVoo.values()) n += v;
    return Math.min(n, this.arquivo.size);
  }

  /** Procura um envio anterior do mesmo arquivo; devolve os bytes já no R2 (ou null).
   *  Primeiro pela impressão exata; senão pelo mesmo nome e tamanho no mesmo projeto, porque o iPhone e alguns
   *  Androids entregam o vídeo da galeria com a data de modificação de agora a cada escolha. */
  async retomar(): Promise<Salvo | null> {
    let s = ler(this.chaveLocal);
    if (!s) {
      const parecido = pendentesR2(this.projeto).find((p) => p.nome === this.arquivo.name && p.tamanho === this.arquivo.size);
      const antigo = parecido ? ler(parecido.chaveLocal) : null;
      // só retoma se o começo e o fim do arquivo baterem: outro vídeo com o mesmo nome e tamanho começa do zero
      if (parecido && antigo && antigo.amostra && antigo.amostra === await amostra(this.arquivo).catch(() => '')) {
        apagar(parecido.chaveLocal);
        gravar(this.chaveLocal, antigo);
        s = antigo;
      }
    }
    if (!s) return null;
    try {
      const v = await motor<{ partes: { parte: number; etag: string; bytes: number }[] }>(
        `projetos/${this.projeto}/envios/${encodeURIComponent(s.envio)}?chave=${encodeURIComponent(s.chave)}`);
      this.feitos = new Map(v.partes.filter((p) => p.bytes === s.parte_bytes || p.parte * s.parte_bytes >= this.arquivo.size)
        .map((p) => [p.parte, { parte: p.parte, etag: p.etag }]));
      this.retomadoDe = this.enviados(s.parte_bytes);
      return s;
    } catch (e) {
      if (e instanceof ErroEnvio && e.status === 404) apagar(this.chaveLocal);   // expirou ou já concluiu
      return null;
    }
  }

  async iniciar() {
    if (this.rodando) return;                // "continuar" duas vezes não abre dois envios do mesmo arquivo
    this.rodando = true;
    this.controle = new AbortController();
    const controle = this.controle;
    const sinal = controle.signal;
    try {
      // continuar depois de pausar: as partes já estão em memória; senão pergunta ao motor o que chegou
      let s = this.feitos.size ? ler(this.chaveLocal) : await this.retomar();
      if (!s) {
        const n = await motor<{ envio: string; chave: string; parte_bytes: number }>(`projetos/${this.projeto}/envios`, {
          method: 'POST', body: JSON.stringify({ nome: this.arquivo.name, bytes: this.arquivo.size }), signal: sinal,
        });
        s = { ...n, nome: this.arquivo.name, tamanho: this.arquivo.size, projeto: this.projeto, criado: Date.now(),
          amostra: await amostra(this.arquivo).catch(() => undefined) };
        gravar(this.chaveLocal, s);
        this.feitos.clear();
      }
      const salvo = s;
      const total = Math.ceil(this.arquivo.size / salvo.parte_bytes);
      const fila = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !this.feitos.has(n));
      this.ao.progresso(this.enviados(salvo.parte_bytes), this.arquivo.size);

      const urls = new Map<number, string>();
      const assinar = async (lote: number[]) => {
        const r = await motor<{ urls: Record<string, string> }>(
          `projetos/${this.projeto}/envios/${encodeURIComponent(salvo.envio)}/partes`,
          { method: 'POST', body: JSON.stringify({ chave: salvo.chave, partes: lote }), signal: sinal });
        for (const [k, v] of Object.entries(r.urls)) urls.set(Number(k), v);
      };

      const mandar = async (n: number) => {
        const ini = (n - 1) * salvo.parte_bytes;
        const pedaco = this.arquivo.slice(ini, Math.min(ini + salvo.parte_bytes, this.arquivo.size));
        for (let t = 0; ; t++) {
          if (t) await esperar(TENTATIVAS[Math.min(t, TENTATIVAS.length - 1)], sinal);
          try {
            if (!urls.has(n)) {
              // assina esta parte e as próximas que faltam, em lote (menos idas ao motor); falha aqui também tenta de novo
              await assinar([n, ...fila.filter((x) => x !== n && !this.feitos.has(x) && !urls.has(x))].slice(0, 100));
            }
            const etag = await this.put(urls.get(n)!, pedaco, n, salvo.parte_bytes, sinal);
            this.feitos.set(n, { parte: n, etag });
            this.emVoo.delete(n);
            this.ao.progresso(this.enviados(salvo.parte_bytes), this.arquivo.size);
            return;
          } catch (e) {
            this.emVoo.delete(n);
            if (sinal.aborted) throw e;
            if (e instanceof ErroEnvio && e.status === 403) urls.delete(n);   // URL expirou: assina de novo
            if (e instanceof ErroEnvio && e.status === 401) throw e;           // sessão expirou: não adianta insistir
            if (t >= TENTATIVAS.length - 1) throw e;
          }
        }
      };

      let i = 0;
      const trabalhador = async () => { while (i < fila.length) await mandar(fila[i++]); };
      await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, trabalhador));

      const partes = [...this.feitos.values()].sort((a, b) => a.parte - b.parte);
      const r = await motor<{ chave: string }>(`projetos/${this.projeto}/envios/${encodeURIComponent(salvo.envio)}/concluir`, {
        method: 'POST', signal: sinal,
        body: JSON.stringify({ chave: salvo.chave, nome: this.arquivo.name, bytes: this.arquivo.size, partes }),
      });
      apagar(this.chaveLocal);
      this.ao.sucesso(r);
    } catch (e) {
      controle.abort();                       // para os outros trabalhadores: nada de PUT depois do erro
      if ((e as Error)?.name === 'AbortError' && !(e instanceof ErroEnvio)) return;
      this.ao.erro(e instanceof ErroEnvio ? e : new ErroEnvio('A rede caiu. Escolha o mesmo arquivo para continuar de onde parou.'));
    } finally {
      this.rodando = false;
    }
  }

  private put(url: string, corpo: Blob, n: number, parte: number, sinal: AbortSignal): Promise<string> {
    return new Promise((ok, nao) => {
      const x = new XMLHttpRequest();
      x.open('PUT', url);
      x.upload.onprogress = (ev) => {
        this.emVoo.set(n, ev.loaded);
        this.ao.progresso(this.enviados(parte), this.arquivo.size);
      };
      x.onload = () => {
        const etag = x.getResponseHeader('ETag');
        if (x.status >= 200 && x.status < 300 && etag) ok(etag);
        else if (x.status >= 200 && x.status < 300) nao(new ErroEnvio('O armazenamento não devolveu o ETag: falta liberar o CORS do bucket (ExposeHeaders ETag).', 0));
        else nao(new ErroEnvio(`o armazenamento respondeu ${x.status}`, x.status));
      };
      x.onerror = () => nao(new ErroEnvio('falha de rede no envio', 0));
      if (sinal.aborted) { nao(new DOMException('pausado', 'AbortError')); return; }
      sinal.addEventListener('abort', () => { x.abort(); nao(new DOMException('pausado', 'AbortError')); }, { once: true });
      x.send(corpo);
    });
  }
}
