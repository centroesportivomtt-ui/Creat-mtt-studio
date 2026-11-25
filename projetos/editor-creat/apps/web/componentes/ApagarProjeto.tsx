'use client';
// Apagar o projeto (onda 3, seção 10.5): só pela tela, nunca pela conversa. Fica no fim da página, discreto, longe do
// Aprovar e da barra de comando. Antes de qualquer coisa a tela pergunta ao motor o que vai e o que fica (R13), e o botão
// final só acende com o nome do projeto digitado (sem diferença de maiúscula e de espaços, como o motor confere).
// Filme na página de entregas: o motor recusa; aqui aparece "Tirar a V1 da página" (R15) e a prévia é lida de novo.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as A from '@/lib/acoes';
import { bytesLegiveis } from '@/lib/estados';
import { irEntrar } from '@/lib/pendentes';

type Fase = 'fechado' | 'abrindo' | 'aberto' | 'apagando';
const NOME_NAO_CONFERE = 'Digite o nome do projeto exatamente como aparece no topo.';

export default function ApagarProjeto({ pid, nome, enviando }: { pid: string; nome: string; enviando: number }) {
  const [fase, setFase] = useState<Fase>('fechado');
  const [previa, setPrevia] = useState<A.Previa | null>(null);
  const [digitado, setDigitado] = useState('');
  const [erro, setErro] = useState('');
  const [tirando, setTirando] = useState<string | null>(null);   // versão saindo da página de entregas
  const trava = useRef(false);
  const campo = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const ler = useCallback(async (): Promise<A.Previa | null> => {
    const r = await A.previaApagar(pid);
    if (r.ok) { setPrevia(r.dados); setErro(''); return r.dados; }
    if (r.status === 401) { irEntrar(pid); return null; }
    setErro(r.erro);
    return null;
  }, [pid]);

  async function abrir() {
    if (fase !== 'fechado') return;
    setFase('abrindo'); setErro(''); setDigitado('');
    const p = await ler();
    setFase(p ? 'aberto' : 'fechado');
    window.setTimeout(() => (p?.pode ? campo.current : titulo.current)?.focus({ preventScroll: true }), 40);
  }
  function fechar() {
    setFase('fechado'); setPrevia(null); setDigitado(''); setErro(''); setTirando(null);
  }

  // tirando da página: confere de 4 em 4 s até sair (pode = true) ou até a retirada ganhar hora marcada (falhou por rede)
  const retirando = previa?.na_pagina.find((x) => x.estado === 'retirando');
  useEffect(() => {
    if (fase !== 'aberto' || !tirando) return;
    if (previa?.pode || retirando?.proxima) { setTirando(null); return; }
    const t = window.setInterval(() => void ler(), 4000);
    return () => window.clearInterval(t);
  }, [fase, tirando, previa?.pode, retirando?.proxima, ler]);

  async function tirar(v: string) {
    if (trava.current) return;
    trava.current = true; setErro('');
    try {
      const r = await A.retirar(pid, v);
      if (r.ok) { setTirando(v); await ler(); return; }
      if (r.status === 401) { irEntrar(pid); return; }
      setErro(r.erro);
    } finally { trava.current = false; }
  }

  async function apagar() {
    if (trava.current || !previa?.pode) return;
    if (!A.mesmoNome(digitado, previa.nome)) { setErro(NOME_NAO_CONFERE); return; }
    trava.current = true;
    setFase('apagando'); setErro('');
    try {
      const r = await A.apagar(pid, digitado);
      if (r.ok) { window.location.assign('/projetos?apagado=1'); return; }
      if (r.status === 401) { irEntrar(pid); return; }
      setErro(r.erro);
      setFase('aberto');
      if (r.status === 409) void ler();     // o motivo mudou (job novo, conversa respondendo): a prévia mostra o de agora
    } finally { trava.current = false; }
  }

  const cabeca = (
    <h2 className="cartao__titulo" id="t-apagar" ref={titulo} tabIndex={-1}>Apagar projeto</h2>
  );
  if (fase === 'fechado' || fase === 'abrindo') {
    return (
      <section className="cartao apagar" aria-labelledby="t-apagar" data-teste="apagar" data-fase={fase} aria-busy={fase === 'abrindo'}>
        {cabeca}
        {enviando > 0 ? (
          <p className="aviso" data-teste="apagar-espere">Espere os envios terminarem para apagar.</p>
        ) : fase === 'abrindo' ? (
          <p className="aviso" role="status">Conferindo o que será apagado…</p>
        ) : (
          <>
            <p className="aviso">Apaga do editor, para sempre, o material, as versões, a conversa e as cópias de trabalho deste projeto. Antes, mostro o que vai e o que fica.</p>
            <button type="button" className="botao botao--perigo botao--pequeno apagar__abrir" onClick={() => void abrir()} data-teste="apagar-abrir">
              Apagar projeto…
            </button>
          </>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
      </section>
    );
  }

  const p = previa!;
  const confere = A.mesmoNome(digitado, p.nome);
  const naPagina = p.na_pagina.filter((x) => x.estado !== 'retirando');
  const n = p.vai_apagar;
  const resto = p.restos_previstos;
  return (
    <section className="cartao apagar apagar--aberto" aria-labelledby="t-apagar" data-teste="apagar" data-fase={fase} data-pode={p.pode}>
      {cabeca}
      {!p.pode ? (
        <>
          <p className="apagar__porque" role="status" data-teste="apagar-porque">{A.maiuscula(p.porque ?? 'não dá para apagar agora')}.</p>
          {tirando && !retirando?.proxima && (
            <p className="aviso" role="status" data-teste="apagar-tirando">Tirando a {tirando.toUpperCase()} da página de entregas… (leva até 1 minuto)</p>
          )}
          {retirando?.proxima && (
            <p className="aviso" role="status">Não consegui tirar agora; tento de novo sozinho às {retirando.proxima}.</p>
          )}
          <div className="linha-acoes apagar__botoes">
            {!tirando && naPagina.map((x) => (
              <button key={x.versao} type="button" className="botao botao--secundario botao--pequeno" onClick={() => void tirar(x.versao)} data-teste="apagar-tirar">
                Tirar a {x.versao.toUpperCase()} da página
              </button>
            ))}
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={fechar} data-teste="apagar-fechar">Fechar</button>
          </div>
        </>
      ) : (
        <form className="apagar__form" noValidate onSubmit={(e) => { e.preventDefault(); void apagar(); }}>
          <p className="apagar__vai" data-teste="apagar-vai">
            Vai apagar para sempre: {n.videos} vídeo{n.videos === 1 ? '' : 's'} enviado{n.videos === 1 ? '' : 's'}{n.bytes > 0 ? ` (${bytesLegiveis(n.bytes)})` : ''},
            {' '}{n.versoes} {n.versoes === 1 ? 'versão' : 'versões'}, a conversa e a mesa deste projeto.
          </p>
          {(n.respostas_cliente_sem_ver ?? 0) > 0 && (
            <p className="apagar__vai" data-teste="apagar-respostas">
              {n.respostas_cliente_sem_ver === 1 ? '1 resposta de cliente que você ainda não marcou como vista também sai.'
                : `${n.respostas_cliente_sem_ver} respostas de cliente que você ainda não marcou como vistas também saem.`}
            </p>
          )}
          {n.links_cliente_ativos > 0 && (
            <p className="apagar__vai">{n.links_cliente_ativos} link{n.links_cliente_ativos === 1 ? '' : 's'} de cliente {n.links_cliente_ativos === 1 ? 'para' : 'param'} de abrir.</p>
          )}
          <div data-teste="apagar-fica">
            <p className="apagar__rotulo">Fica:</p>
            <ul className="apagar__fica">{p.fica.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
          {resto?.pagina_desligada && resto.pagina_desligada.length > 0 && (
            <p className="apagar__resto" data-teste="apagar-resto">
              A página de entregas está desligada neste servidor: {resto.pagina_desligada.map((v) => v.toUpperCase()).join(', ')} pode{resto.pagina_desligada.length > 1 ? 'm' : ''} continuar lá até alguém tirar à mão.
            </p>
          )}
          {resto?.copia_material ? (
            <p className="apagar__resto" data-teste="apagar-resto">
              A cópia do material no Cloudflare está desligada aqui: {resto.copia_material} arquivo{resto.copia_material === 1 ? '' : 's'} fica{resto.copia_material === 1 ? '' : 'm'} lá até alguém apagar à mão.
            </p>
          ) : null}
          <label className="campo">
            <span className="campo__rotulo">Digite o nome do projeto para confirmar: <b className="apagar__nome">{p.nome}</b></span>
            <input ref={campo} className="entrada" value={digitado} onChange={(e) => { setDigitado(e.currentTarget.value); setErro(''); }}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" maxLength={200}
              /* com o botão apagado o navegador não envia o formulário no Enter (nem no "ok" do teclado do celular): aqui o
                 Enter com o nome incompleto diz o que falta, em vez de não fazer nada */
              onKeyDown={(e) => { if (e.key === 'Enter' && !A.mesmoNome(e.currentTarget.value, p.nome)) { e.preventDefault(); setErro(NOME_NAO_CONFERE); } }}
              disabled={fase === 'apagando'} data-teste="apagar-nome" aria-describedby={erro ? 'apagar-erro' : undefined} />
          </label>
          <div className="linha-acoes apagar__botoes">
            <button type="submit" className="botao botao--perigo-cheio" disabled={!confere || fase === 'apagando'} data-teste="apagar-confirmar">
              {fase === 'apagando' ? 'Apagando…' : 'Apagar para sempre'}
            </button>
            <button type="button" className="botao botao--fantasma" onClick={fechar} disabled={fase === 'apagando'} data-teste="apagar-cancelar">Cancelar</button>
          </div>
        </form>
      )}
      {erro && <p className="erro" role="alert" id="apagar-erro" data-teste="apagar-erro">{erro}</p>}
    </section>
  );
}
