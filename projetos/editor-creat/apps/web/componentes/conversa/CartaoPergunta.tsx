'use client';
// A mesa pergunta de volta: o texto, até 4 botões grandes (52 px) com o efeito de cada um, a etiqueta "sugestão" (nunca
// o âmbar: o dono escolhe, não só confirma) e "Responder do meu jeito". Respondida, recolhe numa linha.
import type { DadosPergunta, DadosResposta } from '@/lib/conversa';
import { IconeEstado } from './Pecas';

export default function CartaoPergunta({ d, r, ocupado, feito, erro, respondendo, aoEscolher, aoMeuJeito }: {
  d: DadosPergunta; r?: DadosResposta; ocupado: boolean; feito?: boolean; erro?: string; respondendo: boolean;
  aoEscolher: (id: string) => void; aoMeuJeito: () => void;
}) {
  const titulo = `pergunta-${d.tool_use_id}`;
  if (r) {
    const escolhida = d.opcoes.find((o) => o.id === r.escolha_id);
    return (
      <li className="cartao-fio cartao-fio--feito" data-teste="pergunta" data-respondida="true" id={`pergunta-${d.tool_use_id}`}>
        <p className="cartao-fio__pergunta-feita">{d.texto}</p>
        <p className="cartao-fio__escolha" data-teste="pergunta-escolha">
          {escolhida ? <>Você escolheu: <strong>{escolhida.rotulo}</strong></>
            : r.por === 'mensagem' ? 'Respondida pela sua mensagem'
            : <>Você respondeu: <strong>“{r.texto}”</strong></>}
        </p>
      </li>
    );
  }
  return (
    <li className="cartao-fio cartao-fio--pergunta" role="group" aria-labelledby={titulo} data-teste="pergunta" data-respondida="false" id={`pergunta-${d.tool_use_id}`}>
      <p className="cartao-fio__cabeca"><IconeEstado fase="esperando" /> Nimbus pergunta</p>
      <p className="cartao-fio__texto" id={titulo}>{d.texto}</p>
      <p className="cartao-fio__so-responde" data-teste="pergunta-so-responde">Isto só responde ao Nimbus: nada é enviado nem refeito.</p>
      {d.opcoes.length > 0 && (
        <div className="cartao-fio__opcoes">
          {d.opcoes.map((o) => (
            <button key={o.id} type="button" className="opcao-fio" disabled={ocupado || feito} data-teste="pergunta-opcao" data-opcao={o.id}
              onClick={() => aoEscolher(o.id)}>
              <span className="opcao-fio__rotulo">{o.rotulo}{d.sugestao === o.id && <span className="opcao-fio__sugestao">sugestão</span>}</span>
              {o.efeito && <span className="opcao-fio__efeito">{o.efeito}</span>}
            </button>
          ))}
        </div>
      )}
      {d.aceita_texto && (
        <button type="button" className="botao botao--fantasma cartao-fio__livre" aria-pressed={respondendo} onClick={aoMeuJeito} disabled={ocupado || feito} data-teste="pergunta-livre">
          {respondendo ? 'Escreva ou grave a resposta aqui embaixo' : 'Responder do meu jeito'}
        </button>
      )}
      {(ocupado || feito) && <p className="aviso" role="status">Mandando a resposta…</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
    </li>
  );
}
