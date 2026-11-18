'use client';
// Envio retomável (tus). Partes de EDITOR_ENVIO_PARTE_MB; a impressão digital inclui o projeto, então o mesmo
// arquivo em outro projeto não se mistura. Fechou a aba ou caiu a rede: escolha o mesmo arquivo e ele continua.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { bytesLegiveis } from '@/lib/estados';

type EstadoEnvio = 'preparando' | 'enviando' | 'pausado' | 'concluido' | 'erro';
type Item = {
  chave: string; nome: string; tamanho: number; enviados: number; estado: EstadoEnvio;
  retomadoDe: number | null; velocidade: number; mensagem: string; upload?: tus.Upload;
};
type Pendente = { nome: string; tamanho: number; fracao: number | null; storageKey: string; url: string };

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

export default function Envio({ projeto, parteMB, aberto, aoConcluir }: {
  projeto: string; parteMB: number; aberto: boolean; aoConcluir: () => void;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const medidas = useRef(new Map<string, { t: number; b: number }>());

  const atualizar = useCallback((chave: string, mudanca: Partial<Item>) => {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }, []);

  // Envios interrompidos deste projeto (ficam no localStorage do navegador pelo tus).
  const carregarPendentes = useCallback(async () => {
    try {
      const todos = await tus.defaultOptions.urlStorage.findAllUploads();
      const meus = todos.filter((u) => u.metadata?.projeto === projeto && u.uploadUrl);
      const lista: Pendente[] = [];
      for (const u of meus) {
        const off = await offsetRemoto(u.uploadUrl!);
        if (off === null || Number.isNaN(off)) {
          if (u.urlStorageKey) await tus.defaultOptions.urlStorage.removeUpload(u.urlStorageKey);
          continue;
        }
        lista.push({ nome: u.metadata?.nome ?? 'arquivo', tamanho: Number(u.size ?? 0), fracao: u.size ? off / Number(u.size) : null, storageKey: u.urlStorageKey ?? '', url: u.uploadUrl! });
      }
      setPendentes(lista);
    } catch {
      setPendentes([]);
    }
  }, [projeto]);

  useEffect(() => { void carregarPendentes(); }, [carregarPendentes]);

  // Avisa antes de fechar a aba com envio em andamento (o envio continua depois, mas o dono precisa saber).
  useEffect(() => {
    const ativo = itens.some((i) => i.estado === 'enviando' || i.estado === 'preparando');
    if (!ativo) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [itens]);

  const comecar = useCallback(async (arquivo: File) => {
    const chave = `${impressao(projeto, arquivo)}|${Date.now()}`;
    setItens((l) => [{ chave, nome: arquivo.name, tamanho: arquivo.size, enviados: 0, estado: 'preparando', retomadoDe: null, velocidade: 0, mensagem: 'Preparando…' }, ...l]);
    const upload = new tus.Upload(arquivo, {
      endpoint: '/api/envio',
      chunkSize: parteMB * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000],
      metadata: { projeto, nome: arquivo.name, filetype: arquivo.type || 'application/octet-stream' },
      fingerprint: async (f) => impressao(projeto, f as File),
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onProgress(enviados, total) {
        const agora = performance.now();
        const m = medidas.current.get(chave);
        let velocidade = 0;
        if (m && agora - m.t > 400) {
          velocidade = ((enviados - m.b) / (agora - m.t)) * 1000;
          medidas.current.set(chave, { t: agora, b: enviados });
        } else if (!m) medidas.current.set(chave, { t: agora, b: enviados });
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
    atualizar(chave, { upload });
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
  }, [projeto, parteMB, atualizar, aoConcluir, carregarPendentes]);

  const escolher = (lista: FileList | null) => {
    if (!lista) return;
    for (const f of Array.from(lista)) void comecar(f);
    if (entrada.current) entrada.current.value = '';
  };

  const pausar = (i: Item) => { void i.upload?.abort(); atualizar(i.chave, { estado: 'pausado', mensagem: 'Pausado. Toque em continuar quando quiser.' }); };
  const continuar = (i: Item) => { i.upload?.start(); atualizar(i.chave, { estado: 'enviando', mensagem: '' }); };

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
              <p className="envio__info">Interrompido. Escolha o mesmo arquivo de novo para continuar de onde parou.</p>
            </li>
          ))}
        </ul>
      )}

      {itens.length > 0 && (
        <ul className="envios" aria-label="Envios" aria-live="polite">
          {itens.map((i) => {
            const fracao = i.tamanho ? i.enviados / i.tamanho : 0;
            const falta = i.velocidade > 0 ? Math.max(0, (i.tamanho - i.enviados) / i.velocidade) : null;
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
                  {i.estado === 'enviando' && <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => pausar(i)}>Pausar</button>}
                  {(i.estado === 'pausado' || i.estado === 'erro') && i.upload && <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => continuar(i)}>Continuar</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
