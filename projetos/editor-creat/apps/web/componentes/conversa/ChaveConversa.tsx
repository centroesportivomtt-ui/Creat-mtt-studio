'use client';
// A chave da conversa (decisão do dono, 25/11): ligada por padrão; ele liga e desliga aqui e o servidor guarda a escolha.
// O teto de US$ 3 por dia é travado no código do motor: passou, a conversa para e volta à meia-noite. A mesa e os botões
// de sempre não dependem da conversa. Desligada no servidor (sem a chave do cérebro), a tela não promete religar.
import { useCallback, useEffect, useState } from 'react';
import * as api from '@/lib/conversa';
import { EVENTO_CONVERSA, usd, type EstadoChave } from '@/lib/conversa';

export default function ChaveConversa({ variante }: { variante: 'menu' | 'cartao' }) {
  const [e, setE] = useState<EstadoChave | null>(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const ler = useCallback(async () => {
    const r = await api.chave();
    if (r.ok) { setE(r.dados); setErro(''); } else if (r.status !== 401) setErro(r.erro);
  }, []);
  useEffect(() => {
    void ler();
    const f = () => void ler();
    window.addEventListener(EVENTO_CONVERSA, f);
    return () => window.removeEventListener(EVENTO_CONVERSA, f);
  }, [ler]);

  async function mudar() {
    if (!e || indo) return;
    setIndo(true);
    const r = await api.mudarChave(!e.ligada);
    setIndo(false);
    if (r.ok) { setE(r.dados); setErro(''); api.avisarMudanca(); } else if (r.status === 401) window.location.assign('/entrar'); else setErro(r.erro);
  }

  const noServidor = Boolean(e && !e.ligada && e.motivo && e.motivo !== 'desligada_pelo_dono');
  const estado = !e ? 'Conferindo…' : e.ligada ? 'Ligada' : noServidor ? 'Desligada no servidor' : 'Desligada';
  const gasto = e ? `Hoje: ${usd(e.gasto_hoje_usd)} de ${usd(e.teto_usd_dia)}` : '';
  const botao = (
    <button type="button" role="switch" aria-checked={Boolean(e?.ligada)} className={`chave chave--${variante}`} disabled={!e || indo || noServidor}
      onClick={() => void mudar()} data-teste={`chave-conversa-${variante}`}>
      <span className="chave__texto">
        <span className="chave__nome">{variante === 'menu' ? 'Conversa com o editor' : 'Chave da conversa'}</span>
        <span className="chave__estado">{indo ? (e?.ligada ? 'Desligando…' : 'Ligando…') : `${estado}${gasto ? ` · ${gasto}` : ''}`}</span>
      </span>
      <span className="chave__trilho" aria-hidden="true"><span className="chave__bola" /></span>
    </button>
  );
  if (variante === 'menu') {
    return <div className="nav__menu-chave">{botao}{erro && <p className="erro" role="alert">{erro}</p>}</div>;
  }
  return (
    <section className="cartao" aria-labelledby="c-conversa" id="conversa" data-teste="caderno-conversa">
      <h2 className="cartao__titulo" id="c-conversa">Conversa com o editor</h2>
      {botao}
      <p className="aviso" style={{ marginTop: 12, maxWidth: '62ch' }}>
        Dentro de cada projeto você fala com a mesa por texto ou áudio, vê as ferramentas trabalhando e responde às perguntas com um toque.
        Nada que gasta ou refaz o filme roda sem o seu toque.
      </p>
      <p className="aviso" style={{ marginTop: 8, maxWidth: '62ch' }}>
        Teto de {usd(e?.teto_usd_dia ?? 3)} por dia, travado no editor. Chegou no teto, a conversa para, avisa e volta à meia-noite
        (horário da Bahia). A mesa e os botões de sempre continuam funcionando. Cada resposta mostra quanto custou.
      </p>
      {e && typeof e.retencao_dias === 'number' && (
        // onda 3 (R20): por quanto tempo a conversa fica guardada, numa linha
        <p className="aviso caderno__retencao" data-teste="caderno-retencao">
          {e.retencao_dias > 0
            ? `As mensagens da conversa ficam guardadas ${e.retencao_dias} dias depois de encerradas (ao aprovar um vídeo ou quando a conversa fica longa); a conversa em andamento nunca é apagada. As cópias de segurança (backup) levam o banco inteiro e podem guardar por mais tempo: no Cloudflare até 30 dias, no Dropbox até alguém apagar.`
            : 'As mensagens da conversa ficam guardadas sem prazo.'}
        </p>
      )}
      {noServidor && <p className="aviso" style={{ marginTop: 8 }}>A conversa está desligada no servidor. Aqui não dá para religar: avise o suporte.</p>}
      {erro && <p className="erro" role="alert" style={{ marginTop: 8 }}>{erro}</p>}
    </section>
  );
}
