'use client';
// A linha da conversa na barra de comando, no polegar: [abrir a conversa] [Fale com a mesa…] [microfone · enviar · parar].
// Escrever ou gravar abre o fio. Gravando: ponto vermelho (o único status em vermelho Aba 71), tempo e uma onda simples.
// Depois, o texto cai no campo, editável: nada é enviado sem o toque. A linha de baixo da barra continua sendo o próximo
// passo do projeto, com os mesmos botões de sempre.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usd } from '@/lib/conversa';
import { irEntrar } from '@/lib/pendentes';
import { useGravador } from './Microfone';
import type { Conversa } from './useConversa';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Enviar vira Parar no mesmo lugar assim que a mensagem sai: o segundo toque (dedo que pesa, toque duplo) não pode parar
// a resposta nem abrir o microfone. Por 1,2 s depois de enviar, esse botão não aceita toque.
const SEGURA_MS = 1200;

export default function BarraConversa({ c }: { c: Conversa }) {
  const { pid, texto, setTexto, nota, setNota } = c;
  const aoTexto = useCallback((t: string, conf: number) => {
    const atual = c.campoRef.current?.value ?? '';
    const junto = atual.trim() ? `${atual.trim()} ${t}` : t;
    setTexto(junto, 'audio');
    setNota(conf > 0 && conf < 0.55 ? { tom: 'info', texto: 'Confira o texto: pode ter palavra trocada. Corrija e toque em enviar.' } : { tom: 'info', texto: 'Confira e toque em enviar. Nada sai sem o seu toque.' });
  }, [c.campoRef, setTexto, setNota]);
  const g = useGravador(pid, aoTexto, setNota, useCallback(() => irEntrar(pid), [pid]));

  // o campo cresce até 5 linhas e depois rola por dentro
  useLayoutEffect(() => {
    const el = c.campoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(132, Math.max(48, el.scrollHeight + 2))}px`;
  }, [texto, c.campoRef]);
  // a pergunta pendente abre a conversa no toque da pílula; responder do meu jeito leva o foco ao campo
  useEffect(() => { if (c.respondendo) c.abrir(); }, [c.respondendo, c.abrir]);

  const [segura, setSegura] = useState(false);
  const soltar = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (soltar.current) clearTimeout(soltar.current); }, []);
  const enviar = useCallback(() => {
    setSegura(true);
    if (soltar.current) clearTimeout(soltar.current);
    soltar.current = setTimeout(() => setSegura(false), SEGURA_MS);
    void c.enviar();
  }, [c]);

  const espera = c.montado.espera;
  const rodando = Boolean(c.montado.rodando);
  const gravando = g.estado === 'gravando' || g.estado === 'pedindo';
  const temTexto = texto.trim().length > 0;
  const passou = texto.length - c.limite;
  const perto = texto.length >= c.limite - 200;

  if (!c.chave && !c.fio.inst) {
    return <div className="conversa-barra" data-conversa data-teste="conversa-barra" data-estado="carregando"><p className="conversa-barra__faixa">Abrindo a conversa…</p></div>;
  }
  if (!c.ligada) {
    const peloDono = c.motivo === 'desligada_pelo_dono' || !c.motivo;
    return (
      <div className="conversa-barra" data-conversa data-teste="conversa-barra" data-estado="desligada">
        {peloDono ? (
          <button type="button" role="switch" aria-checked="false" className="conversa-barra__faixa conversa-barra__ligar" disabled={c.mudandoChave}
            onClick={() => void c.mudarChave(true)} data-teste="conversa-ligar">
            <span>Conversa desligada</span><b>{c.mudandoChave ? 'Ligando…' : 'Ligar'}</b>
          </button>
        ) : (
          <p className="conversa-barra__faixa" data-teste="conversa-servidor">A conversa está desligada no servidor.</p>
        )}
        {nota && <p className="conversa-barra__nota" data-tom={nota.tom} role="status">{nota.texto}</p>}
      </div>
    );
  }

  const placeholder = c.respondendo ? 'Respondendo ao Nimbus…' : 'Fale com a mesa…';
  const notaVisivel = nota ?? (c.noTeto ? { tom: 'alerta' as const, texto: `Chegou no teto de hoje (${usd(c.estadoChave?.teto ?? 3)}). A conversa volta à meia-noite. A mesa e os botões continuam funcionando.` } : null);
  return (
    <div className="conversa-barra" data-conversa data-teste="conversa-barra" data-estado={gravando ? 'gravando' : g.ouvindo ? 'transcrevendo' : rodando ? 'rodando' : 'pronta'}>
      {espera && !c.aberta && (
        <button type="button" className="conversa-barra__pilula" onClick={c.abrir} data-teste="conversa-pilula">
          <span className="ponto-espera" aria-hidden="true" />Nimbus espera sua resposta · ver
        </button>
      )}
      {c.respondendo && (
        <p className="conversa-barra__nota" data-tom="info">
          Respondendo à pergunta do Nimbus.
          <button type="button" className="conversa-barra__link" onClick={() => c.setRespondendo(null)}>Mandar como mensagem nova</button>
        </p>
      )}
      {g.ouvindo > 0 && <p className="conversa-barra__nota" data-tom="info" role="status" data-teste="conversa-transcrevendo"><span className="girando" aria-hidden="true" />Radar · Ouvindo seu áudio…</p>}
      {notaVisivel && (
        <p className="conversa-barra__nota" data-tom={notaVisivel.tom} role="status" data-teste="conversa-nota">
          {notaVisivel.texto}
          {nota && !nota.fixa && <button type="button" className="conversa-barra__link" onClick={() => setNota(null)} aria-label="Fechar o aviso">ok</button>}
        </p>
      )}
      {perto && (
        <p className="conversa-barra__nota" id="conversa-contador" data-tom={passou > 0 ? 'alerta' : 'info'} role="status" data-teste="conversa-contador">
          {passou > 0
            ? `Passou de ${c.limite.toLocaleString('pt-BR')} letras: corte ${passou.toLocaleString('pt-BR')} para enviar. Nada é cortado sem você ver.`
            : `${texto.length.toLocaleString('pt-BR')} de ${c.limite.toLocaleString('pt-BR')} letras.`}
        </p>
      )}
      <div className="conversa-barra__linha">
        {gravando ? (
          <button type="button" className="conversa-barra__icone" onClick={g.cancelar} aria-label="Apagar a gravação" data-teste="conversa-cancelar-gravacao">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : (
          <button type="button" className="conversa-barra__icone conversa-barra__abrir" aria-expanded={c.aberta} aria-controls="fio"
            aria-label={c.aberta ? 'Fechar a conversa e ver o projeto' : 'Abrir a conversa com a mesa'} data-teste="conversa-abrir"
            onClick={() => (c.aberta ? c.fechar() : c.abrir())}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>
            {(espera || c.saindo.some((m) => m.falhou)) && <span className="conversa-barra__selo" aria-hidden="true" />}
          </button>
        )}
        {gravando ? (
          <div className="conversa-barra__gravando" role="status" data-teste="conversa-gravando">
            <span className="ponto-gravando" aria-hidden="true" />
            <span className="conversa-barra__tempo">{g.estado === 'pedindo' ? 'Abrindo o microfone…' : `Gravando ${fmt(g.seg)}`}</span>
            {g.estado === 'gravando' && <span className="onda" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `scaleY(${0.2 + (g.niveis[g.niveis.length - 12 + i] ?? 0) * 0.8})` }} />)}</span>}
          </div>
        ) : (
          <>
            <label htmlFor="conversa-campo" className="so-leitor">Mensagem para a mesa</label>
            <textarea id="conversa-campo" ref={c.campoRef} className="conversa-barra__campo" rows={1} lang="pt-BR"
              aria-describedby={perto ? 'conversa-contador' : undefined} aria-invalid={passou > 0 || undefined}
              placeholder={placeholder} value={texto} data-teste="conversa-campo"
              disabled={c.noTeto && !c.respondendo}
              onFocus={() => { if (!c.aberta) c.abrir(); }}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                // no computador, Enter manda e Shift+Enter quebra a linha; no celular, Enter sempre quebra a linha
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); enviar(); }
              }} />
          </>
        )}
        {gravando ? (
          <button type="button" className="conversa-barra__icone conversa-barra__parar-gravacao" onClick={g.parar} aria-label="Parar de gravar" data-teste="conversa-parar-gravacao">
            <span className="quadrado" aria-hidden="true" />
          </button>
        ) : temTexto ? (
          <button type="button" className="conversa-barra__icone conversa-barra__enviar" onClick={enviar} aria-label="Enviar" data-teste="conversa-enviar"
            disabled={passou > 0}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11.5L12 5.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : rodando && c.aberta ? (
          <button type="button" className="conversa-barra__icone" onClick={() => { if (!segura) void c.pararTurno(); }} aria-label="Parar a resposta"
            disabled={c.parando || segura} data-teste="conversa-parar-barra">
            <span className="quadrado" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="conversa-barra__icone" aria-label="Gravar áudio" data-teste="conversa-microfone" disabled={(c.noTeto && !c.respondendo) || segura}
            onClick={() => { if (segura) return; c.abrir(); void g.iniciar(); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
