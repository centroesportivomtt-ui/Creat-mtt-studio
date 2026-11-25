'use client';
import { useCallback, useEffect, useState } from 'react';

type Estado = {
  destino: string; estado: string; ultimo_ok?: string; ultima_tentativa?: string; bytes?: number; arquivos?: number; erro?: string | null;
  horas_desde_o_ultimo?: number; midia_fora?: { arquivos: number; bytes: number }; destino_fixo?: boolean;
  r2?: boolean; copias?: string[];
};
// Cloudflare no editor (GET /saude): entregas do filme aprovado e espelho do material. Campo ausente = desligado.
type Nuvem = { entregas?: { ligado?: boolean; ultimo_ok?: string }; espelho?: { ligado?: boolean; teto_gb?: number } };
const NOME_COPIA: Record<string, string> = { R2: 'Cloudflare', Dropbox: 'Dropbox' };

const ROTULO: Record<string, string> = {
  ok: 'em dia', falha: 'falhou', rodando: 'fazendo agora…', 'sem destino': 'falta o endereço do Dropbox', 'nunca rodou': 'ainda não rodou',
};
const mb = (n?: number) => (typeof n === 'number' ? `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1).replace('.', ',')} MB` : '');
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Backup diário: o que não se refaz (banco, memória da casa, direções e relatórios) vai para o Cloudflare (R2) e/ou o Dropbox
// do dono. Vídeo não entra.
export default function Backup() {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [nuvem, setNuvem] = useState<Nuvem | null>(null);
  useEffect(() => {
    fetch('/api/motor/v1/saude', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((c) => { if (c) setNuvem(c); }).catch(() => {});
  }, []);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/motor/v1/backup', { cache: 'no-store' });
      if (r.ok) setE(await r.json());
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 8000); return () => clearInterval(t); }, [carregar]);
  async function postar(caminho: string, corpo: unknown) {
    setIndo(true); setErro('');
    try {
      const r = await fetch(`/api/motor/v1/backup/${caminho}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
      const c = await r.json().catch(() => null);
      if (!r.ok) setErro(typeof c?.detail === 'string' ? c.detail : 'Não deu certo. Tente de novo.');
      else setE(c);
      return r.ok;
    } catch { setErro('Sem conexão. Tente de novo.'); return false; } finally { setIndo(false); }
  }
  const configurado = e?.destino === 'configurado';
  return (
    <div className="form" style={{ maxWidth: 'none', gap: 12 }} data-teste="backup">
      <p data-teste="backup-estado" style={{ overflowWrap: 'anywhere' }}>
        <strong>{e ? (ROTULO[e.estado] ?? e.estado) : 'carregando…'}</strong>
        {e?.ultimo_ok ? ` · último backup bom em ${quando(e.ultimo_ok)}` : ''}
        {e?.bytes ? ` · ${e.arquivos} arquivos, ${mb(e.bytes)}` : ''}
      </p>
      {(e?.r2 || (e?.copias?.length ?? 0) > 0) && (
        <p className="aviso" data-teste="backup-destinos">
          {e?.copias?.length ? <>Último backup guardado em <b>{e.copias.map((c) => NOME_COPIA[c] ?? c).join(' e ')}</b>.</> : <>Vai para o <b>Cloudflare</b>{e?.destino === 'configurado' ? ' e, se você salvar o link, para o Dropbox' : ''}.</>}
        </p>
      )}
      {nuvem && (nuvem.entregas?.ligado || nuvem.espelho?.ligado) && (
        <div className="nuvem-caderno" data-teste="caderno-cloudflare">
          <p className="campo__rotulo" style={{ margin: 0 }}>Cloudflare no editor</p>
          {nuvem.entregas?.ligado && (
            <p className="aviso" style={{ margin: 0 }}>Página de entregas: <b>ligada</b>. Filme aprovado sobe sozinho{nuvem.entregas.ultimo_ok ? ` · último envio bom em ${quando(nuvem.entregas.ultimo_ok)}` : ''}.</p>
          )}
          {nuvem.espelho?.ligado && (
            <p className="aviso" style={{ margin: 0 }}>Material enviado: guardado também no Cloudflare (até {String(nuvem.espelho.teto_gb ?? 4).replace('.', ',')} GB grátis).</p>
          )}
        </div>
      )}
      {erro && <p className="erro" role="alert" style={{ overflowWrap: 'anywhere' }}>{erro}</p>}
      {e?.erro && <p className="erro" style={{ overflowWrap: 'anywhere' }}>{e.erro}</p>}
      {e?.midia_fora && e.midia_fora.arquivos > 0 && (
        <p className="aviso">Vídeo e áudio não entram no backup ({e.midia_fora.arquivos} arquivos, {mb(e.midia_fora.bytes)}): continuam guardados no servidor.</p>
      )}
      <form className="form" style={{ maxWidth: 'none', gap: 8 }} onSubmit={async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const pedido = String(new FormData(form).get('pedido') ?? '').trim();
        if (!/^https:\/\/www\.dropbox\.com\/request\/[A-Za-z0-9]{8,40}$/.test(pedido)) {
          setErro('Esse não é o link de uma solicitação de arquivos do Dropbox. Ele começa com https://www.dropbox.com/request/');
          return;
        }
        if (await postar('config', { pedido })) form.reset();
      }}>
        <label className="campo">
          <span className="campo__rotulo">{configurado ? 'Trocar a pasta de destino (link da solicitação de arquivos do Dropbox)' : 'Link da solicitação de arquivos do Dropbox'}</span>
          <input className="entrada" name="pedido" type="url" required maxLength={200} placeholder="https://www.dropbox.com/request/..." autoComplete="off" data-teste="backup-pedido" />
        </label>
        <div className="linha-acoes" style={{ marginTop: 0 }}>
          <button className="botao botao--principal" type="submit" disabled={indo} data-teste="backup-salvar">{configurado ? 'Trocar destino' : 'Salvar destino'}</button>
          <button className="botao botao--fantasma" type="button" disabled={indo || !configurado} data-teste="backup-agora" onClick={() => postar('rodar', {})}>Fazer backup agora</button>
        </div>
      </form>
      {e?.destino_fixo && <p className="aviso">O destino está fixado nas variáveis da hospedagem; trocar por aqui não tem efeito.</p>}
      <p className="aviso">Depois de salvo, o editor manda o backup sozinho uma vez por dia. O link fica guardado só no servidor e não aparece mais na tela.</p>
    </div>
  );
}
