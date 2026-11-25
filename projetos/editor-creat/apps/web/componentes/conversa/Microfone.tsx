'use client';
// Gravar áudio e virar texto no campo (nada é enviado sem o toque do dono).
// - Formato: o primeiro que o aparelho grava (Android/Chrome: webm/opus; iPhone: mp4/AAC), sem biblioteca nova.
// - Pedaços: fecha o pedaço com 700 KB ou 60 s, o que vier primeiro (o motor aceita até 950 KB); cada pedaço é um arquivo
//   inteiro (para e reinicia o MediaRecorder no mesmo microfone). Total de até 5 min. Os textos se juntam no campo.
// - Guardado: cada pedaço fica no IndexedDB até a transcrição voltar 200 (sem rede ou sessão vencida, vai de novo depois).
// - Tela apagou no meio: fecha o pedaço, manda o que tem e avisa ao voltar.
// - Sem microfone ou sem permissão: mensagem clara, e o microfone do teclado continua valendo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcrever } from '@/lib/conversa';
import { apagarAudio, audiosGuardados, guardarAudio } from '@/lib/pendentes';
import type { Nota } from './useConversa';

const TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const LIMITE_BYTES = 700_000;
const LIMITE_PEDACO_MS = 60_000;
const LIMITE_TOTAL_S = 300;
export const SEM_MIC = 'O microfone do app não abriu. Toque no microfone do teclado para ditar.';

function escolherTipo(): string {
  try {
    for (const t of TIPOS) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
  } catch { /* navegador antigo */ }
  return '';
}

export type Gravador = ReturnType<typeof useGravador>;
export function useGravador(pid: string, aoTexto: (texto: string, conf: number) => void, aoNota: (n: Nota | null) => void, aoSessao: () => void) {
  const [estado, setEstado] = useState<'parado' | 'pedindo' | 'gravando'>('parado');
  const [ouvindo, setOuvindo] = useState(0);
  const [seg, setSeg] = useState(0);
  const [niveis, setNiveis] = useState<number[]>([]);
  const r = useRef<{
    stream?: MediaStream; rec?: MediaRecorder; partes: Blob[]; bytes: number; iniPedaco: number; iniTotal: number; n: number;
    fechando: boolean; continuar: boolean; timer?: ReturnType<typeof setInterval>; ctx?: AudioContext; medidor?: ReturnType<typeof setInterval>;
    fila: Promise<void>; emAndamento: Set<string>; telaApagou: boolean; cancelado: boolean; tipo: string;
  }>({ partes: [], bytes: 0, iniPedaco: 0, iniTotal: 0, n: 0, fechando: false, continuar: false, fila: Promise.resolve(), emAndamento: new Set(), telaApagou: false, cancelado: false, tipo: '' });
  const cb = useRef({ aoTexto, aoNota, aoSessao });
  useEffect(() => { cb.current = { aoTexto, aoNota, aoSessao }; });

  const transcreverUm = useCallback(async (chave: string, blob: Blob) => {
    const g = r.current;
    if (g.emAndamento.has(chave)) return;
    g.emAndamento.add(chave);
    setOuvindo((x) => x + 1);
    let contou = true;
    try {
      const res = await transcrever(pid, blob);
      if (res.ok) {
        await apagarAudio(chave);
        contou = false;
        setOuvindo((x) => Math.max(0, x - 1));     // o texto chega já sem a linha "Ouvindo seu áudio"
        if (res.dados.texto) cb.current.aoTexto(res.dados.texto, res.dados.conf);
        return;
      }
      if (res.status === 401) { cb.current.aoSessao(); return; }
      if (res.status === 0 || res.status === 502) {
        cb.current.aoNota({ tom: 'alerta', texto: 'Sem conexão: o áudio ficou guardado e vai de novo quando a rede voltar.' });
        return;
      }
      if (res.status === 429) {                    // já tem áudio sendo ouvido: este espera a vez, guardado
        cb.current.aoNota({ tom: 'info', texto: 'Ainda estou ouvindo o áudio anterior. Este ficou guardado e vai em seguida.' });
        setTimeout(() => { void transcreverUm(chave, blob); }, 4000);
        return;
      }
      if (res.status >= 500 && res.status !== 503 && res.status !== 504) {
        cb.current.aoNota({ tom: 'alerta', texto: 'O serviço de voz falhou agora. O áudio ficou guardado e vai de novo quando você abrir o projeto.' });
        return;
      }
      await apagarAudio(chave);   // 413, 415, 422, 503, 504: não adianta mandar o mesmo pedaço de novo
      cb.current.aoNota({ tom: 'alerta', texto: `${res.erro}.`.replace(/\.\.$/, '.'), fixa: res.status === 503 });
    } finally {
      g.emAndamento.delete(chave);
      if (contou) setOuvindo((x) => Math.max(0, x - 1));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const entregar = useCallback(async (blob: Blob) => {
    const g = r.current;
    g.n += 1;
    const chave = await guardarAudio(pid, g.n, blob);
    g.fila = g.fila.then(() => transcreverUm(chave, blob)).catch(() => {});
  }, [pid, transcreverUm]);

  const pararMedidor = () => {
    const g = r.current;
    if (g.medidor) clearInterval(g.medidor);
    g.medidor = undefined;
    void g.ctx?.close().catch(() => {});
    g.ctx = undefined;
    setNiveis([]);
  };
  const soltarMicrofone = () => {
    const g = r.current;
    g.stream?.getTracks().forEach((t) => t.stop());
    g.stream = undefined;
    pararMedidor();
  };

  const novoPedaco = useCallback(() => {
    const g = r.current;
    if (!g.stream) return;
    const rec = g.tipo ? new MediaRecorder(g.stream, { mimeType: g.tipo }) : new MediaRecorder(g.stream);
    g.rec = rec;
    g.partes = [];
    g.bytes = 0;
    g.iniPedaco = Date.now();
    const partes = g.partes;
    rec.ondataavailable = (ev) => {
      if (!ev.data || !ev.data.size) return;
      partes.push(ev.data);
      if (g.rec === rec) g.bytes += ev.data.size;
      if (g.rec === rec && g.bytes >= LIMITE_BYTES && !g.fechando) fecharPedaco(true);
    };
    rec.onstop = () => {
      g.fechando = false;
      const blob = new Blob(partes, { type: rec.mimeType || g.tipo || 'audio/mp4' });
      if (!g.cancelado && blob.size > 0) void entregar(blob);
      if (g.continuar && g.stream && !g.cancelado) novoPedaco();
      else soltarMicrofone();
    };
    rec.onerror = () => { g.continuar = false; try { rec.stop(); } catch { soltarMicrofone(); } };
    rec.start(1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregar]);

  const fecharPedaco = (continuar: boolean) => {
    const g = r.current;
    const rec = g.rec;
    g.continuar = continuar;
    if (!rec || rec.state === 'inactive') { if (!continuar) soltarMicrofone(); return; }
    g.fechando = true;
    try { rec.stop(); } catch { g.fechando = false; soltarMicrofone(); }
  };

  const parar = useCallback(() => {
    const g = r.current;
    if (g.timer) clearInterval(g.timer);
    g.timer = undefined;
    fecharPedaco(false);
    setEstado('parado');
  }, []);

  const cancelar = useCallback(() => {
    const g = r.current;
    g.cancelado = true;
    if (g.timer) clearInterval(g.timer);
    g.timer = undefined;
    fecharPedaco(false);
    setEstado('parado');
  }, []);

  const iniciar = useCallback(async () => {
    const g = r.current;
    if (estado !== 'parado') return;
    cb.current.aoNota(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      cb.current.aoNota({ tom: 'alerta', texto: SEM_MIC, fixa: true });
      return;
    }
    setEstado('pedindo');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setEstado('parado');
      const nome = (e as { name?: string })?.name ?? '';
      cb.current.aoNota({ tom: 'alerta', fixa: true, texto: nome === 'NotAllowedError' || nome === 'SecurityError'
        ? 'Sem permissão para o microfone. Toque no microfone do teclado para ditar, ou libere o microfone nos ajustes do navegador.'
        : SEM_MIC });
      return;
    }
    g.stream = stream;
    g.tipo = escolherTipo();
    g.cancelado = false;
    g.telaApagou = false;
    g.iniTotal = Date.now();
    stream.getAudioTracks().forEach((t) => { t.onended = () => { if (r.current.stream === stream) parar(); }; });
    try { novoPedaco(); } catch {
      soltarMicrofone();
      setEstado('parado');
      cb.current.aoNota({ tom: 'alerta', texto: SEM_MIC, fixa: true });
      return;
    }
    setSeg(0);
    setEstado('gravando');
    g.timer = setInterval(() => {
      const s = (Date.now() - g.iniTotal) / 1000;
      setSeg(s);
      if (s >= LIMITE_TOTAL_S) { parar(); cb.current.aoNota({ tom: 'info', texto: 'Gravei até 5 minutos. O texto vai aparecer no campo.' }); return; }
      if (Date.now() - g.iniPedaco >= LIMITE_PEDACO_MS && !g.fechando) fecharPedaco(true);
    }, 250);
    // nível do microfone (a "onda" simples); com movimento reduzido fica parado
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          void ctx.resume?.().catch(() => {});
          const an = ctx.createAnalyser();
          an.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(an);
          const buf = new Uint8Array(an.fftSize);
          g.ctx = ctx;
          g.medidor = setInterval(() => {
            an.getByteTimeDomainData(buf);
            let soma = 0;
            for (const v of buf) soma += ((v - 128) / 128) ** 2;
            const nivel = Math.min(1, Math.sqrt(soma / buf.length) * 4);
            setNiveis((l) => [...l.slice(-15), nivel]);
          }, 120);
        }
      }
    } catch { /* sem medidor: a gravação segue */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, novoPedaco, parar]);

  // tela apagou ou aba trocou: fecha o pedaço e manda o que tem; ao voltar, avisa
  useEffect(() => {
    const vis = () => {
      const g = r.current;
      if (document.visibilityState === 'hidden' && g.stream) { g.telaApagou = true; parar(); }
      else if (document.visibilityState === 'visible' && g.telaApagou) {
        g.telaApagou = false;
        cb.current.aoNota({ tom: 'info', texto: 'A gravação parou quando a tela apagou. O que você falou até ali vai para o campo.' });
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [parar]);

  // áudio que ficou guardado (sem rede, sessão vencida, aba fechada) vai de novo ao abrir e quando a rede volta
  const retomarGuardados = useCallback(async () => {
    const lista = await audiosGuardados(pid);
    for (const p of lista) {
      const g = r.current;
      g.fila = g.fila.then(() => transcreverUm(p.chave, p.blob)).catch(() => {});
    }
  }, [pid, transcreverUm]);
  useEffect(() => {
    void retomarGuardados();
    const on = () => void retomarGuardados();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [retomarGuardados]);

  useEffect(() => () => {
    const g = r.current;
    if (g.timer) clearInterval(g.timer);
    g.cancelado = false;
    g.continuar = false;
    try { g.rec?.state !== 'inactive' && g.rec?.stop(); } catch { /* já parado */ }
    g.stream?.getTracks().forEach((t) => t.stop());
    if (g.medidor) clearInterval(g.medidor);
    void g.ctx?.close().catch(() => {});
  }, []);

  return { estado, ouvindo, seg, niveis, iniciar, parar, cancelar };
}
