"""Conversa com o editor (onda 1 do plano "Fio Único", docs/plano-conversa-25-11.md).

O dono fala (texto ou áudio) dentro do projeto; o Nimbus responde escrevendo ao vivo, usa ferramentas de leitura,
pergunta de volta com botões e propõe duas ações que só rodam com o toque do dono (ajuste da versão pronta e troca
do pedido antes de a edição começar). Tudo passa pelo mesmo SSE do projeto.

- laco.py: o laço do agente (Messages API com streaming), o rascunho em memória, Parar, reconciliação no boot.
- repo.py: as tabelas conversa_capitulos, conversa_msgs e conversa_espera; monta o histórico para a API.
- ferramentas.py: as 7 ferramentas do capítulo 1 (esquemas com limites; a API recebe a versão sem limites).
- acoes.py: guarda de estado e execução das duas ações com toque (chamam as mesmas funções das rotas antigas).
- teto.py: gasto do dia (só linhas 'conversa', dia da Bahia) e pré-voo no pior caso, teto travado em US$ 3.
- preferencia.py: a chave liga/desliga da tela, gravada em <dados>/conversa.json.
- ouvir.py: transcrição local do áudio do dono num subprocesso (fora do processo da API).
- falso.py: cérebro roteirizado (transporte HTTP falso no SDK), para testes e aceite sem rede.
"""
