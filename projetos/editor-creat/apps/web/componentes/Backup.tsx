'use client';
import { useCallback, useEffect, useState } from 'react';

type Estado = {
  destino: string; estado: string; ultimo_ok?: string; ultima_tentativa?: string; bytes?: number; arquivos?: number; erro?: string | null;
  horas_desde_o_ultimo?: number; midia_fora?: { arquivos: number; bytes: number }; destino_fixo?: boolean;
};

const ROTULO: Record<string, string> = {
  ok: 'em dia', falha: 'falhou', rodando: 'fazendo agora…', 'sem destino': 'falta o endereço do Dropbox', 'nunca rodou': 'ainda não rodou',
};
const mb = (n?: number) => (typeof n === 'number' ? `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1).replace('.', ',')} MB` : '');
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Backup diário: o que não se refaz (banco, memória da casa, direções e relatórios) vai para o Dropbox do dono. Vídeo não entra.
export default function Backup() {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
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
