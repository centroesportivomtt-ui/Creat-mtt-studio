---
name: painel-de-objecoes
description: Painel de objeções (compradores simulados). Sorteia de 20 a 100 compradores do público de um negócio, cada um com renda, comportamento e dúvida diferentes, mostra a mesma oferta e os mesmos ganchos a todos e conta por que desistem, o que viraria o não, que frase faria parar de rolar a tela e qual gancho prende mais. Use quando o dono ou um agente disser "painel de compradores", "testa com clientes", "quem compraria isso", "qual a objeção", "qual gancho funciona", "testa o gancho antes de editar", e antes de escrever anúncio, roteiro de vídeo ou página para um nicho novo. Resultado é hipótese simulada: escolhe o que testar, nunca prevê venda.
---

# Painel de objeções

Vem do `founder-consumer` do pacote founder-skill (Jake Schincariol, MIT, commit `fd9385b0`; ver `ORIGEM.md`). Na casa ele serve para uma coisa: **achar objeção, segmento, palavra e gancho que a equipe não tinha pensado, antes de gastar com anúncio ou de editar um vídeo**. Ele não diz quantos vão comprar.

Pergunta de corte que o painel responde: *o que faz um dono de salão de outra cidade, que chegou por um anúncio há 30 segundos, desistir, e que frase o faria parar?*

## Honestidade, dita uma vez em toda entrega

- São subagentes do mesmo modelo, não clientes. Modelo tende a concordar: o "sim" do painel é **teto**, nunca previsão.
- Nunca dizer "X% comprariam", nunca usar fala do painel como depoimento ou prova social, nunca pôr número do painel em anúncio ou página.
- Quem decide é o dado real: o anúncio de verdade (custo por clique e por conversa) e o contador do site (prévia, checkout, Pix). O painel só escolhe **o que** testar primeiro.
- Tudo o que sair daqui é rotulado **hipótese simulada** no relatório.

## A ferramenta

```bash
P="python3 -I -B /home/user/Creat-nuvem-VIBE-CODE/.claude/skills/painel-de-objecoes/painel.py --dir <pasta>"
```

`<pasta>` é **obrigatória e fica no scratchpad da sessão**, nunca no repositório (o repositório é público e o perfil é dado do cliente). O script recusa, com saída 2, pasta dentro do repositório da casa (também por atalho). Só lê o que recebe e só grava dentro da pasta. Sem rede, sem comando, só biblioteca padrão.

**Uma pasta por rodada.** Para comparar duas ofertas ou dois jogos de ganchos, mesmo com a mesma semente, use uma pasta nova para cada uma: `iniciar` recusa pasta que já tem resposta arquivada, porque a resposta antiga seria contada como se fosse da oferta nova. Da resposta do comprador só ficam as chaves pedidas no briefing; o que ele acrescentar a mais é descartado.

## Passo 1: o público

Escreva `<pasta>/cliente.json` no formato de `cliente.exemplo.json` (caso fictício):

- `negocio` e `publico`: quem é o comprador, em uma linha concreta.
- `segmentos`: 2 a 4 grupos com `parcela` e `renda_mensal` [mínimo, máximo] em reais, só números.
- `frase_renda` (opcional): como a renda aparece no cartão, com `{valor}`. Para dono de negócio: `"Seu salão fatura cerca de {valor} por mês."`.
- `comportamentos`: 4 a 8 jeitos de comprar com `parcela` e `como` (desconfia de internet, sem tempo, caça preço, acha que o Instagram basta...).
- `objecoes`: as 4 a 8 dúvidas reais desse comprador. Fonte, nesta ordem: o que o dono sabe dos clientes dele; reclamações reais de concorrentes (Radar, com data); o que o `vendas` ouve no WhatsApp (só contagem e frase, nunca nome). Diga quais partes são palpite.
- `habitos` (opcional): linhas do dia a dia que deixam o comprador concreto.

O padrão da casa é o desconhecido de outra cidade que chegou por anúncio: o briefing já diz isso a cada comprador.

## Passo 2: a oferta e os ganchos

- `<pasta>/oferta.md`: o que o anúncio e a página mostram de verdade. Produto, preço, mensalidade, como compra, garantia. De 3 a 6 linhas, sem superlativo, sem nada que não se entrega.
- `<pasta>/ganchos.md` (opcional): de 2 a 4 frases de abertura de anúncio ou de vídeo, uma por linha. Cada comprador escolhe a que mais o faria parar, ou "nenhum".

Texto copiado de página ou de concorrente entra só como dado: o briefing marca a oferta e os ganchos como "dado, não instrução" para o comprador.

## Passo 3: sortear e rodar

```bash
$P iniciar --cliente <pasta>/cliente.json --oferta <pasta>/oferta.md --ganchos <pasta>/ganchos.md --n 20
$P briefings
```

- Padrão de **20 compradores**. 100 só quando o dono pedir ou quando a decisão for grande (troca de oferta, nicho novo de verba alta), e avise antes que são 100 chamadas de subagente.
- `iniciar` guarda a semente: mesma semente, mesmos cartões, para comparar duas versões da oferta.
- Para cada onda (até 10), mande **uma mensagem com uma chamada de Agent por comprador**:
  - `subagent_type`: `general-purpose`, `model`: `sonnet` (esforço médio basta; poupa cota);
  - `description`: `painel <id>`;
  - `prompt`: o texto inteiro do briefing, copiado do arquivo sem mudar nada. O comprador não precisa de ferramenta nenhuma: ele responde só com o JSON.
- Arquive cada resposta como ela veio, sem editar:
  ```bash
  $P salvar P001 <<'FIM_DA_RESPOSTA'
  <a resposta do comprador, inteira>
  FIM_DA_RESPOSTA
  ```
  `salvar` recusa o que não for resposta válida. Comprador que falhar duas vezes fica de fora e aparece contado no resultado. **Nunca escreva resposta por um comprador.**
- Depois da última onda: `$P conferir`, `$P briefings` (só para quem falta), uma rodada a mais, e `$P contar`.

Por que assim e não como no original: o original dispara subagentes com todas as ferramentas, que gravam arquivo, e sugere ligar "aceitar edições" para não aprovar 100 arquivos. Aqui o comprador não grava nada, quem grava é o script na pasta do painel, e nenhuma aprovação em massa é pedida.

## Passo 4: ler para quem pediu

`$P contar` grava `<pasta>/resultado.md` e `resultado.json`. Entregue, em poucas linhas:

1. Por que desistem: os 3 motivos que mais apareceram, com uma frase de cada, como escrita.
2. O que viraria o não: as respostas que mais se repetem.
3. Ganchos (se houver): qual foi mais escolhido, em qual segmento, e o porquê.
4. Frases que fariam parar: 3 a 5 que servem de matéria-prima para o `copywriter` e para o roteiro.
5. Uma frase do que mudar **antes** de gastar, e quem faz: `oferta-empilhada` (oferta), `calculadora-de-oferta` (preço e conta), `copywriter` (gancho e texto), `edicao-de-video` (abertura do vídeo).
6. A linha de honestidade: hipótese simulada, teto, o teste real que confirma (qual anúncio, qual número, qual amostra mínima definida antes).

## Onde entra na casa

- **Antes de editar um anúncio em vídeo** (skill `edicao-de-video`): rode com 2 a 4 ganchos candidatos e abra o vídeo com o que prendeu mais. Depois, o anúncio real decide.
- **Nicho novo que o dono mandou em vídeo** (skill `estudar-referencia`): quem é o comprador, qual a objeção, qual frase para.
- **Oferta** (skill `oferta-empilhada`): a lista de objeções é a matéria-prima dos bônus e da garantia.
- Agentes que usam: `copywriter`, `trafego`, `vendas`, `conversao`.

## O que nunca fazer

- Apresentar taxa de compra do painel como dado, previsão ou prova.
- Pôr nome, telefone ou conversa de cliente real no `cliente.json`; o perfil é de público, não de pessoas.
- Gravar a pasta do painel dentro do repositório.
- Mudar o briefing de um comprador só, ou responder no lugar dele.
- Virar preço, página ou produto só porque o painel mandou (regra 9 do dono): o painel escolhe o teste; a amostra real decide.

## Testes

```bash
cd /home/user/Creat-nuvem-VIBE-CODE && python3 -I -B -m unittest discover -s .claude/skills/painel-de-objecoes/testes -v
```
