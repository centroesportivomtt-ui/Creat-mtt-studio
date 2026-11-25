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

// No celular a parte é menor (16 MB): se o iPhone corta a conexão (tela bloqueada, troca de app, 4G oscilando),
// perde no máximo 16 MB em vez de 64 e retoma logo. Computador segue com EDITOR_ENVIO_PARTE_MB.
function tamanhoParte(parteMB: number): number {
  const celular = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return celular ? Math.min(parteMB, 16) : parteMB;
}

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

export default function Envio({ projeto, parteMB, aberto, aoConcluir, aoMudarAtivos, aoMudarInterrompidos }: {
  projeto: string; parteMB: number; aberto: boolean; aoConcluir: () => void;
  /** quantos envios ainda estão subindo: a barra de comando não deixa começar a edição no meio de um envio */
  aoMudarAtivos?: (n: number) => void;
  /** quantos envios pararam (interrompidos ao recarregar, pausados, com erro): fechar o envio perderia esses vídeos */
  aoMudarInterrompidos?: (n: number) => void;
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

  const ativos = itens.filter((i) => i.estado === 'enviando' || i.estado === 'preparando').length;
  useEffect(() => { aoMudarAtivos?.(ativos); }, [ativos, aoMudarAtivos]);
  useEffect(() => () => aoMudarAtivos?.(0), [aoMudarAtivos]);
  // um pendente do armazenamento que já está na lista desta aba (subindo, pausado ou com erro) aparece só uma vez
  const interrompidosVisiveis = pendentes.filter((x) => !itens.some((i) => i.nome === x.nome && i.tamanho === x.tamanho));
  const parados = interrompidosVisiveis.length + itens.filter((i) => i.estado === 'pausado' || i.estado === 'erro').length;
  useEffect(() => { aoMudarInterrompidos?.(parados); }, [parados, aoMudarInterrompidos]);
  useEffect(() => () => aoMudarInterrompidos?.(0), [aoMudarInterrompidos]);

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
      chunkSize: tamanhoParte(parteMB) * 1024 * 1024,
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

  const [aviso, setAviso] = useState('');
  // Entre tocar em "Escolher" e o seletor devolver os vídeos, o iPhone prepara/baixa cada um (do app Dropbox ou da
  // galeria) e a página fica parada: sem este aviso parece que "o botão não vai para lugar nenhum".
  const [esperandoSeletor, setEsperandoSeletor] = useState(false);
  useEffect(() => {
    const el = entrada.current;
    if (!el) return;
    const cancelou = () => setEsperandoSeletor(false);
    el.addEventListener('cancel', cancelou);
    return () => el.removeEventListener('cancel', cancelou);
  }, []);
  // Safari antigo não avisa quando a pessoa cancela: o aviso some sozinho em 3 min
  useEffect(() => {
    if (!esperandoSeletor) return;
    const t = window.setTimeout(() => setEsperandoSeletor(false), 180_000);
    return () => window.clearTimeout(t);
  }, [esperandoSeletor]);
  const escolher = (lista: FileList | null) => {
    setEsperandoSeletor(false);
    const arquivos = lista ? Array.from(lista) : [];
    // o seletor do iPhone com arquivos do app Dropbox pode voltar VAZIO (ele precisa baixar os vídeos antes e às vezes desiste)
    setAviso(arquivos.length ? '' : 'Nenhum arquivo chegou do seletor. Vídeos do app Dropbox: o celular baixa tudo antes de entregar, '
      + 'e com vídeo grande isso pode falhar. Mais rápido: cole aqui embaixo o link do Dropbox (da pasta ou dos vídeos).');
    for (const f of arquivos) void comecar(f);
    if (entrada.current) entrada.current.value = '';
  };

  const pausar = (i: Item) => { void i.upload?.abort(); atualizar(i.chave, { estado: 'pausado', mensagem: 'Pausado. Toque em continuar quando quiser.' }); };
  const continuar = (i: Item) => { i.upload?.start(); atualizar(i.chave, { estado: 'enviando', mensagem: '' }); };
  // Seguir sem um vídeo é escolha explícita do dono: ele tira da lista e só então o envio pode fechar.
  const tirar = (i: Item) => {
    void i.upload?.abort(true).catch(() => null);
    setItens((l) => l.filter((x) => x.chave !== i.chave));
  };
  const esquecer = async (x: Pendente) => {
    try { if (x.storageKey) await tus.defaultOptions.urlStorage.removeUpload(x.storageKey); } catch { /* já saiu */ }
    setPendentes((l) => l.filter((y) => y.storageKey !== x.storageKey));
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
        {/* No celular não existe arrastar: lá o gesto é escolher os vídeos da galeria (o título some e o botão vem primeiro). */}
        <p className="soltar__grande so-mouse">Solte o material aqui</p>
        <label className="botao botao--secundario" aria-disabled={!aberto}>
          <span className="so-mouse">Escolher arquivos</span><span className="so-toque">Escolher vídeos</span>
          <input ref={entrada} id="entrada-arquivo" className="so-leitor" type="file" multiple disabled={!aberto}
            accept="video/*,audio/*,image/*,.mov,.mp4,.mts,.m4a,.wav,.zip,.pdf"
            onClick={() => setEsperandoSeletor(true)}
            onChange={(e) => escolher(e.currentTarget.files)} data-teste="entrada-arquivo" />
        </label>
        <p className="aviso">Vídeos de vários GB. Se a rede cair, continua de onde parou.</p>
        {esperandoSeletor && (
          <p className="aviso" role="status" data-teste="envio-esperando">
            Escolheu? Se o celular mostrar &quot;Preparando&quot; ou &quot;Baixando&quot;, espere nesta tela: ele está pegando os vídeos
            (do app Dropbox pode levar alguns minutos). O envio começa sozinho.
          </p>
        )}
        {!aberto && <p className="aviso">O envio foi fechado: este projeto já está sendo editado.</p>}
        {aviso && <p className="erro" role="alert" data-teste="envio-aviso">{aviso}</p>}
        <p className="aviso">No Dropbox? Cole o link logo abaixo (pasta também vale): o servidor baixa direto.</p>
      </div>

      {interrompidosVisiveis.length > 0 && (
        <ul className="envios" aria-label="Envios interrompidos">
          {interrompidosVisiveis.map((p) => (
            <li className="envio" key={p.storageKey} data-estado="pausado" data-pendente={p.nome}>
              <div className="envio__linha">
                <span className="envio__nome">{p.nome}</span>
                <span className="envio__num">{p.fracao !== null ? `${Math.floor(p.fracao * 100)}%` : '…'}</span>
              </div>
              <div className="barra"><i style={{ transform: `scaleX(${p.fracao ?? 0})` }} /></div>
              <div className="envio__linha">
                <p className="envio__info">Interrompido. Escolha o mesmo arquivo de novo para continuar de onde parou.</p>
                <button type="button" className="botao botao--fantasma botao--pequeno" data-teste="envio-esquecer" onClick={() => void esquecer(p)}>Seguir sem ele</button>
              </div>
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
                  {(i.estado === 'pausado' || i.estado === 'erro') && <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => tirar(i)}>Seguir sem ele</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
