'use client';
// Antes de gastar ou refazer, o toque do dono. Tudo neste cartão é montado pelo código do motor (nunca pelo modelo): o
// texto EXATO que vai para a direção, entre aspas e como texto puro, o que roda de novo, quanto custa e demora, e o que
// fica guardado. O botão diz o verbo da ação; "Agora não" é só texto.
// Onda 3: refazer uma etapa e trocar a música mostram a frase do código SEM aspas (não é fala de ninguém); a nota mostra o
// texto dele entre aspas, como o ajuste. "Só neste projeto" só existe no ajuste.
import type { DadosConfirmacao, DadosResposta } from '@/lib/conversa';
import { usd } from '@/lib/conversa';
import { IconeEstado } from './Pecas';

const ETAPA: Record<string, string> = {
  direcao: 'Direção', montagem: 'Montagem', qa: 'Conferência', encaixe: 'Encaixe na batida', entrega: 'Entrega', leitura: 'Leitura do vídeo',
};
const CAMPO: Record<string, string> = {
  texto: 'Pedido', formato: 'Formato', destino: 'Onde vai', duracao_alvo: 'Duração', obrigatorio: 'Tem que ter', proibido: 'Não pode ter',
  vozes: 'Quem fala', ambiente: 'Onde foi gravado',
};
const VERBO: Record<DadosConfirmacao['acao'], string> = {
  ajuste: 'Pedir o ajuste', pedido: 'Trocar o pedido', refazer: 'Refazer', trilha: 'Trocar a música', nota: 'Guardar a nota',
};
const FEITO: Record<DadosConfirmacao['acao'], string> = {
  ajuste: 'Feito · a direção recomeçou', pedido: 'Feito · pedido trocado', refazer: 'Feito · recomeçou',
  trilha: 'Feito · trocando a música', nota: 'Feito · nota guardada',
};

export default function CartaoConfirma({ d, r, ocupado, feito, erro, aoDecidir }: {
  d: DadosConfirmacao; r?: DadosResposta; ocupado: boolean; feito?: boolean; erro?: string; aoDecidir: (sim: boolean, soNesteProjeto?: boolean) => void;
}) {
  const titulo = `confirmacao-${d.tool_use_id}-t`;
  const verbo = d.botao || VERBO[d.acao] || 'Confirmar';
  if (r) {
    const tom = r.resultado === 'feito' ? 'ok' : r.resultado === 'nao_deu' ? 'alerta' : 'neutro';
    // o motor manda "Cancelado. Nada mudou." e "não deu: …": a primeira palavra já está no título da linha
    const extra = (r.detalhe ?? '').replace(/^(não deu|cancelado)\s*[:.]?\s*/i, '');
    const frase = r.resultado === 'feito' ? (FEITO[d.acao] ?? 'Feito') : r.resultado === 'nao_deu' ? 'Não deu' : 'Cancelado';
    return (
      <li className="cartao-fio cartao-fio--feito" data-teste="confirmacao" data-acao={d.acao} data-resultado={r.resultado ?? 'cancelado'} id={`confirmacao-${d.tool_use_id}`}>
        <p className="cartao-fio__pergunta-feita">{d.titulo}</p>
        <p className="cartao-fio__escolha" data-tom={tom}><strong>{frase}</strong>{extra && r.resultado !== 'feito' ? ` · ${extra}` : ''}</p>
        {r.resultado === 'feito' && r.detalhe && <p className="aviso">{r.detalhe}</p>}
      </li>
    );
  }
  const vira = d.vira_regra && !/regra/i.test(d.volta);
  const travado = ocupado || Boolean(feito);
  const doCodigo = d.acao === 'refazer' || d.acao === 'trilha';   // frase montada pelo motor: sem aspas
  const nota = d.acao === 'nota';
  // custo zero (a conferência já está guardada, por exemplo): "nada", nunca "≈ US$ 0,00"
  const custo = d.custo_usd_est > 0 || d.acao === 'ajuste' || d.acao === 'pedido' ? `${d.custo_ate ? 'até' : '≈'} ${usd(d.custo_usd_est)}` : 'nada';
  return (
    <li className="cartao-fio cartao-fio--confirma" role="group" aria-labelledby={titulo} data-teste="confirmacao" data-acao={d.acao} data-resultado="pendente" id={`confirmacao-${d.tool_use_id}`}>
      <p className="cartao-fio__cabeca"><IconeEstado fase="esperando" /> Antes de seguir, preciso do seu toque</p>
      <p className="cartao-fio__titulo" id={titulo}>{d.titulo}</p>
      {doCodigo
        ? <p className="cartao-fio__faz" data-teste="confirmacao-texto">{d.faz || d.texto_exato}</p>
        : <blockquote className="cartao-fio__exato" data-teste="confirmacao-texto">“{d.texto_exato}”</blockquote>}
      {nota && d.faz && <p className="cartao-fio__faz cartao-fio__faz--apoio" data-teste="confirmacao-faz">{d.faz}</p>}
      {d.nao_muda && <p className="cartao-fio__nao-muda" data-teste="confirmacao-nao-muda"><b>Não muda:</b> {d.nao_muda}</p>}
      {d.atencao && <p className="cartao-fio__atencao" role="note" data-teste="confirmacao-atencao">{d.atencao}</p>}
      {d.mudancas && d.mudancas.length > 0 && (
        <ul className="cartao-fio__mudancas" data-teste="confirmacao-mudancas">
          {d.mudancas.map((m) => (
            <li key={m.campo}><span>{CAMPO[m.campo] ?? m.campo}</span> <s>{m.antes || '—'}</s> <span aria-hidden="true">→</span><span className="so-leitor"> passa a ser </span> <b>{m.depois || '—'}</b></li>
          ))}
        </ul>
      )}
      <dl className="cartao-fio__conta">
        {nota ? (
          <><dt>custa</dt><dd>nada · não refaz nada</dd>{d.volta && <><dt>fica</dt><dd>{d.volta}</dd></>}</>
        ) : (
          <>
            {d.refaz.length > 0 && <><dt>roda de novo</dt><dd>{d.refaz.map((e) => ETAPA[e] ?? e).join(' → ')}</dd></>}
            <dt>custa</dt>
            <dd>
              {custo}
              {d.partes && d.partes.length > 0 && (
                <ul className="cartao-fio__partes" data-teste="confirmacao-partes">
                  {d.partes.map((p) => <li key={p.rotulo}>{p.rotulo}: {usd(p.usd)}</li>)}
                </ul>
              )}
            </dd>
            <dt>demora</dt><dd>≈ {Math.max(1, Math.round(d.minutos_est))} min</dd>
            {d.acao === 'pedido' && <><dt>quando</dt><dd>{d.comeca_agora ? 'Começa a edição agora' : 'Guarda o pedido. A edição começa quando você tocar em Começar a edição'}</dd></>}
            <dt>dá para voltar</dt><dd>{d.volta}</dd>
            {vira && <><dt>regra</dt><dd>Vira regra da casa e vale para TODOS os projetos, como no botão Pedir ajuste</dd></>}
          </>
        )}
      </dl>
      <div className="cartao-fio__botoes">
        <button type="button" className="botao botao--principal" disabled={travado} onClick={() => aoDecidir(true)} data-teste="confirmacao-sim">
          {travado ? 'Mandando…' : verbo}
        </button>
        {d.acao === 'ajuste' && d.vira_regra && (
          <button type="button" className="botao botao--secundario" disabled={travado} onClick={() => aoDecidir(true, true)} data-teste="confirmacao-so-aqui">
            Só neste projeto
          </button>
        )}
        <button type="button" className="botao botao--fantasma" disabled={travado} onClick={() => aoDecidir(false)} data-teste="confirmacao-nao">Agora não</button>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </li>
  );
}
