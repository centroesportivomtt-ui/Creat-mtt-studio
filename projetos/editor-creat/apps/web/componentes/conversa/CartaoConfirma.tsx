'use client';
// Antes de gastar ou refazer, o toque do dono. Tudo neste cartão é montado pelo código do motor (nunca pelo modelo): o
// texto EXATO que vai para a direção, entre aspas e como texto puro, o que roda de novo, quanto custa e demora, e o que
// fica guardado. O botão diz o verbo da ação; "Agora não" é só texto.
import type { DadosConfirmacao, DadosResposta } from '@/lib/conversa';
import { usd } from '@/lib/conversa';
import { IconeEstado } from './Pecas';

const ETAPA: Record<string, string> = { direcao: 'Direção', montagem: 'Montagem', qa: 'Conferência' };
const CAMPO: Record<string, string> = {
  texto: 'Pedido', formato: 'Formato', destino: 'Onde vai', duracao_alvo: 'Duração', obrigatorio: 'Tem que ter', proibido: 'Não pode ter',
  vozes: 'Quem fala', ambiente: 'Onde foi gravado',
};

export default function CartaoConfirma({ d, r, ocupado, erro, aoDecidir }: {
  d: DadosConfirmacao; r?: DadosResposta; ocupado: boolean; erro?: string; aoDecidir: (sim: boolean) => void;
}) {
  const titulo = `confirmacao-${d.tool_use_id}-t`;
  const verbo = d.acao === 'ajuste' ? 'Pedir o ajuste' : 'Trocar o pedido';
  if (r) {
    const tom = r.resultado === 'feito' ? 'ok' : r.resultado === 'nao_deu' ? 'alerta' : 'neutro';
    // o motor manda "Cancelado. Nada mudou." e "não deu: …": a primeira palavra já está no título da linha
    const extra = (r.detalhe ?? '').replace(/^(não deu|cancelado)\s*[:.]?\s*/i, '');
    const frase = r.resultado === 'feito' ? (d.acao === 'ajuste' ? 'Feito · a direção recomeçou' : 'Feito · pedido trocado')
      : r.resultado === 'nao_deu' ? 'Não deu' : 'Cancelado';
    return (
      <li className="cartao-fio cartao-fio--feito" data-teste="confirmacao" data-resultado={r.resultado ?? 'cancelado'} id={`confirmacao-${d.tool_use_id}`}>
        <p className="cartao-fio__pergunta-feita">{d.titulo}</p>
        <p className="cartao-fio__escolha" data-tom={tom}><strong>{frase}</strong>{extra && r.resultado !== 'feito' ? ` · ${extra}` : ''}</p>
        {r.resultado === 'feito' && r.detalhe && <p className="aviso">{r.detalhe}</p>}
      </li>
    );
  }
  const vira = d.vira_regra && !/regra/i.test(d.volta);
  return (
    <li className="cartao-fio cartao-fio--confirma" role="group" aria-labelledby={titulo} data-teste="confirmacao" data-resultado="pendente" id={`confirmacao-${d.tool_use_id}`}>
      <p className="cartao-fio__cabeca"><IconeEstado fase="esperando" /> Antes de seguir, preciso do seu toque</p>
      <p className="cartao-fio__titulo" id={titulo}>{d.titulo}</p>
      <blockquote className="cartao-fio__exato" data-teste="confirmacao-texto">“{d.texto_exato}”</blockquote>
      {d.mudancas && d.mudancas.length > 0 && (
        <ul className="cartao-fio__mudancas">
          {d.mudancas.map((m) => (
            <li key={m.campo}><span>{CAMPO[m.campo] ?? m.campo}</span> <s>{m.antes || '—'}</s> <span aria-hidden="true">→</span><span className="so-leitor"> passa a ser </span> <b>{m.depois || '—'}</b></li>
          ))}
        </ul>
      )}
      <dl className="cartao-fio__conta">
        {d.refaz.length > 0 && <><dt>roda de novo</dt><dd>{d.refaz.map((e) => ETAPA[e] ?? e).join(' → ')}</dd></>}
        <dt>custa</dt><dd>≈ {usd(d.custo_usd_est)}</dd>
        <dt>demora</dt><dd>≈ {Math.max(1, Math.round(d.minutos_est))} min</dd>
        {d.acao === 'pedido' && <><dt>quando</dt><dd>{d.comeca_agora ? 'Começa a edição agora' : 'Guarda o pedido. A edição começa quando você tocar em Começar a edição'}</dd></>}
        <dt>dá para voltar</dt><dd>{d.volta}</dd>
        {vira && <><dt>regra</dt><dd>Vira regra da casa, como no botão Pedir ajuste</dd></>}
      </dl>
      <div className="cartao-fio__botoes">
        <button type="button" className="botao botao--principal" disabled={ocupado} onClick={() => aoDecidir(true)} data-teste="confirmacao-sim">
          {ocupado ? 'Mandando…' : verbo}
        </button>
        <button type="button" className="botao botao--fantasma" disabled={ocupado} onClick={() => aoDecidir(false)} data-teste="confirmacao-nao">Agora não</button>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </li>
  );
}
