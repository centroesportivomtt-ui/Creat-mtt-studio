# Textos da troca única · os 6 anúncios no ar e os vídeos do segundo ato

Verbo, 10/11/2026, pacote 1E da onda 1 do plano de qualidade. Corrige os achados AN-02, AN-03, AN-04 e AN-07 da auditoria dos anúncios.

**Como isto ajuda a vender.** Quem chega de outra cidade lê o preço antes de tocar no anúncio. Ele toca já sabendo o que vai pagar, e a página confirma o mesmo número. Sem surpresa no site, sem sensação de truque, sem risco de reprovação por assinatura escondida.

**O que muda em uma linha.** Sai a promessa de pagar só depois de gostar, que era falsa: a Abertura é paga antes da produção. Entram a Abertura de R$ 297 e o plano a partir de R$ 147 por mês antes do corte do "ver mais", e um título que diz "site".

**O que este arquivo não faz.** Não mexe na conta de anúncios. Não muda preço, produto, público, verba, arte nem vídeo. A publicação é do coordenador, com a validação tripla da seção 4 verde.

---

## 1. Regras que os textos daqui cumprem

- Abertura e plano mensal declarados no texto principal e na descrição. **Nunca no título.** A razão está em `../anuncios.md`, "Regra de preço no anúncio".
- Nos 4 A1, "R$ 297" e "R$ 147" terminam antes do caractere 125 do texto principal (contagem na seção 5).
- Primeira frase com até 40 caracteres, que fecha a ideia sozinha e cita o WhatsApp. É o que o Reels mostra antes de cortar (AN-04).
- Título com até 40 caracteres, dizendo "site" (AN-03).
- Sem prazo em parte nenhuma do anúncio. O prazo de 72 h só volta ao texto depois do ensaio verde da onda 1.
- Sem "domínio": a cláusula 9 dos termos está sendo reescrita, e só se promete o que já existe (AN-07).
- Sem posts no B1 até o primeiro ciclo do plano Vitrine rodar de verdade (`docs/EXECUTOR.md` marca o ciclo como NÃO PROVADO).
- Sem promessa de ganho, sem pergunta a quem vê, sem nome de pessoa, sem emoji, sem travessão.

### A palavra "inauguração" (e "vagas")

**Hoje fica fora.** Ela só entra quando a trava das 20 vagas estiver provada de ponta a ponta:

1. a função `portaAbertaFecharPrefs` publicada e testada (pacote 1B);
2. o passo (m) de `docs/EXECUTOR.md` ensaiado (pacote 1D);
3. o ensaio da onda 1 verde (conferência da onda, Lupa).

Até lá o texto diz "Abertura R$ 297", que é o preço cobrado hoje (`dados/precos.json`, `abertura.inauguracao.preco`). Nenhum texto cita vagas, contador ou escassez.

Com as três provas verdes, a troca é de uma palavra só, no texto e na descrição:

| hoje | depois da trava provada |
|---|---|
| Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. | Abertura R$ 297 na inauguração, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. (no A1 de barbearia, R$ 147 passa a terminar no caractere 110) |
| Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Abertura R$ 297 na inauguração + plano a partir de R$ 147 por mês, só com o site no ar. |

### Quando a inauguração acabar

R$ 297 no anúncio deixa de ser verdade no minuto em que `precos.json` passa a `ativa: false` ou `vagasRestantes: 0`. A oferta anunciada vincula (CDC, art. 30). No mesmo ato da troca de preço da página:

1. pausar os anúncios com R$ 297 (os 6 desta tabela e os 4 vídeos);
2. subir a mesma versão com o valor de `abertura.padrao` (hoje R$ 497) no lugar de R$ 297, com o `v` do `utm_content` subindo para `v2`;
3. refazer a validação tripla (seção 4) antes de ativar.

---

## 2. Os 6 anúncios no ar

Campanhas: "PA | Site | Feira" (120254150908340237) e "PA | Site | Salvador RMS" (120254151674300237). Ids lidos na conta em 10/11/2026 (`ads_get_ad_entities`, só leitura).

A **legenda de abertura** é a primeira frase do texto principal: é o que aparece no Reels antes do "mais".

| nº | anúncio no ar (id) · criativo atual (id) | praça | título (caracteres) | texto principal | descrição | botão | legenda de abertura (caracteres) | `utm_content` |
|---|---|---|---|---|---|---|---|---|
| 1 | A1 barbearia · 120254151686550237 · 1801544234466330 | Feira | Veja o site da sua barbearia pronto (35) | Barbearia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Barbearia: site com pedido no WhatsApp. (39) | `A1-barbearia-v1` |
| 2 | A1 salão · 120254151686810237 · 1484300866968837 | Feira | Veja o site do seu salão pronto (31) | Salão: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Salão: site com pedido no WhatsApp. (35) | `A1-salao-v1` |
| 3 | B1 salão · 120254151686970237 · 2234756560727787 | Feira | Seu site pronto. Sem amarra. (28) | Sem fidelidade e sem multa. Site pronto. Abertura R$ 297, paga uma vez; plano mensal a partir de R$ 147, só com o site no ar. O site do salão tem pedido de horário no WhatsApp. Se sair, você leva o site e os arquivos. Ver é grátis e sem cadastro. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Sem fidelidade e sem multa. Site pronto. (40) | `B1-salao-v1` |
| 4 | A1 barbearia · 120254151687230237 · 1481962513995987 | Salvador RMS | Veja o site da sua barbearia pronto (35) | Barbearia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Barbearia: site com pedido no WhatsApp. (39) | `A1-barbearia-v1` |
| 5 | A1 salão · 120254151687430237 · 1510153400992556 | Salvador RMS | Veja o site do seu salão pronto (31) | Salão: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Salão: site com pedido no WhatsApp. (35) | `A1-salao-v1` |
| 6 | B1 salão · 120254151687710237 · 2151571608773090 | Salvador RMS | Seu site pronto. Sem amarra. (28) | Sem fidelidade e sem multa. Site pronto. Abertura R$ 297, paga uma vez; plano mensal a partir de R$ 147, só com o site no ar. O site do salão tem pedido de horário no WhatsApp. Se sair, você leva o site e os arquivos. Ver é grátis e sem cadastro. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Sem fidelidade e sem multa. Site pronto. (40) | `B1-salao-v1` |

**Arte:** a mesma de hoje em cada anúncio (A1 barbearia com as imagens 0d38b464… e 0d75f360…; A1 salão e B1 com 009fe008… e 6e435f56…). A arte igual entre A1 salão e B1 é o que isola o texto no teste (AN-03).

**Por que "paga uma vez".** "Abertura" sozinha não diz a um desconhecido se é taxa única ou mensal. "Paga uma vez" separa os dois valores na mesma frase e repete a página no ar ("Hoje você paga só a Abertura: R$ 297 uma vez", lida em 10/11/2026).

**Por que a descrição passa de 30 caracteres.** A descrição não aparece no Instagram e é cortada no Feed do Facebook. Ela leva o preço inteiro mesmo assim, para que nenhum posicionamento mostre o anúncio sem o valor no lugar onde ele aparece. Quem garante o preço na tela é o texto principal.

**Como publicar.** Anúncio novo em cada conjunto, com o mesmo criativo de imagem. O antigo pausa assim que o novo for aprovado: é correção de erro, não virada de plano (regra 9 do dono). Título, texto e legenda mudam juntos, para o aprendizado reiniciar uma vez só. Decidir entre A1 e B1 pelo custo por prévia gerada, não só pelo CTR (`criativos-atras-da-placa.md`, "Medição e ritmo").

**Nome do anúncio.** O nome segue o `utm_content` com a praça e a data, como hoje (`A1-barbearia-v1 · feira 2026-11-<dia>`). A data no nome separa o texto novo do antigo na leitura, porque o `utm_content` continua `v1` por ordem do plano.

---

## 3. Vídeos do segundo ato (`utm_content=video`)

Entram nas mesmas duas campanhas, ao lado dos estáticos, quando os vídeos estiverem prontos e revistos. No Reels a descrição não aparece e o texto corta em cerca de 40 caracteres. Por isso o preço vai **queimado no vídeo**.

| nº | vídeo | nicho | título (caracteres) | texto principal | descrição | botão | legenda queimada de preço | `utm_content` |
|---|---|---|---|---|---|---|---|---|
| 7 | `video/saida/R7-barbearia-v1.mp4` (já renderizado, ainda sem a faixa de preço) | barbearia | Veja o site da sua barbearia pronto (35) | Barbearia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Abertura R$ 297 + plano a partir de R$ 147/mês, só com o site no ar | `video` |
| 8 | [PREENCHER: arquivo do vídeo de salão; o sistema "Atrás da placa" pede R7-salao-v1, ainda não gravado] | salão | Veja o site do seu salão pronto (31) | Salão: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir. | Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. | Saiba mais | Abertura R$ 297 + plano a partir de R$ 147/mês, só com o site no ar | `video` |

**A faixa de preço no vídeo** (pedido ao designer e ao motion, arte não é deste pacote):

- texto exato: "Abertura R$ 297 + plano a partir de R$ 147/mês, só com o site no ar" (67 caracteres);
- em duas linhas: "Abertura R$ 297 + plano a partir de" / "R$ 147/mês, só com o site no ar";
- é faixa informativa, como o chip "Grátis para ver · Sem cadastro". Por isso não segue o limite de 2 linhas de 18 caracteres da legenda de cena;
- Figtree 800, no mínimo 36 px em 1080x1920, tinta sobre `--papel`, dentro da área segura (y 269 a 1248);
- visível do começo ao fim do cartão final (no mínimo 3 s) e, no corte de 8 s para Stories, também no cartão final;
- quando a trava estiver provada, a faixa ganha "na inauguração" depois de "R$ 297" (render novo, `v2`).

O nicho do vídeo vai no `?nicho=` do link. O `utm_content=video` é o mesmo nos dois vídeos, por ordem do plano; a leitura separa barbearia e salão pelo nome do anúncio (`video-barbearia · feira`, `video-salao · salvador-rms`).

---

## 4. Tabela de validação tripla (regra 5 do dono)

Nenhum anúncio desta troca sobe sem as três colunas verdes. O pacote 2C automatiza esta conferência; até lá, quem publica confere à mão na prévia do Gerenciador (`ads_get_ad_preview`, Feed, Stories e Reels, em pt-BR) e cola o resultado em `diario-campanha.csv`.

**Endereço do site** em todos: `https://creat-nuvem-404b1994.base44.app/`. Os parâmetros vão no campo "Parâmetros de URL" do Gerenciador. `{{placement}}` é o parâmetro dinâmico da Meta, que ela troca pelo posicionamento na hora do clique.

| nº | anúncio | idioma | moeda e valores | link final esperado |
|---|---|---|---|---|
| 1 | A1 barbearia · Feira | pt-BR em título, texto, descrição e botão ("Saiba mais") | R$ 297 e R$ 147, nada mais em R$ | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-barbearia-v1&utm_term={{placement}}` |
| 2 | A1 salão · Feira | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-salao-v1&utm_term={{placement}}` |
| 3 | B1 salão · Feira | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=B1-salao-v1&utm_term={{placement}}` |
| 4 | A1 barbearia · Salvador RMS | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=A1-barbearia-v1&utm_term={{placement}}` |
| 5 | A1 salão · Salvador RMS | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=A1-salao-v1&utm_term={{placement}}` |
| 6 | B1 salão · Salvador RMS | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=B1-salao-v1&utm_term={{placement}}` |
| 7a | vídeo barbearia · Feira | pt-BR no texto e na faixa queimada | R$ 297 e R$ 147 no texto, na descrição e na faixa | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=video&utm_term={{placement}}` |
| 7b | vídeo barbearia · Salvador RMS | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=video&utm_term={{placement}}` |
| 8a | vídeo salão · Feira | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=video&utm_term={{placement}}` |
| 8b | vídeo salão · Salvador RMS | pt-BR | R$ 297 e R$ 147 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=video&utm_term={{placement}}` |

**Como conferir cada coluna.**

- **Idioma:** a prévia do Gerenciador em pt-BR mostra os textos desta tabela sem tradução automática e o botão "Saiba mais". Aprimoramentos criativos da Meta desligados (não reescrevem o texto).
- **Moeda e valores:** todo "R$" do anúncio é R$ 297 ou R$ 147. R$ 297 tem de bater com `dados/precos.json` (`abertura.inauguracao.preco`, com `ativa: true`) e com `checkout.config.js` (`VALOR_DOS_LINKS.aberturaInauguracao`); R$ 147 com `planos.aberto` e com `precosPadrao.planos.aberto`. Se a inauguração tiver acabado, nenhum destes anúncios sobe (seção 1).
- **Link:** abre a home do Porta Aberta (título "Site pronto com pedido de horário no WhatsApp | Creat") com o nicho do anúncio já marcado; `utm_medium=pago`; `utm_campaign` é a praça do conjunto (`feira` ou `salvador-rms`); o botão de pagar escolhe o link do Mercado Pago dessa praça. Nunca link de CDN, nunca encurtador (regra 7 do dono).

---

## 5. Contagem (python, 10/11/2026)

O script lê as tabelas das seções 2 e 3 deste arquivo, conta cada título e cada primeira frase, acha a posição de "R$ 297" e "R$ 147" no texto principal e confere todo valor em R$ contra `dados/precos.json` e `checkout.config.js`. Ele sai com erro se algum limite falhar. Fica fora do repositório, com o relatório do pacote 1E; a saída é esta:

```
 1 A1 barbearia · Feira         titulo 35 · frase1 39 · R$ 297 termina em 55 · R$ 147 termina em 95 · texto 197 · descricao 72
 2 A1 salão · Feira             titulo 31 · frase1 35 · R$ 297 termina em 51 · R$ 147 termina em 91 · texto 193 · descricao 72
 3 B1 salão · Feira             titulo 28 · frase1 40 · R$ 297 termina em 56 · R$ 147 termina em 103 · texto 246 · descricao 72
 4 A1 barbearia · Salvador RMS  titulo 35 · frase1 39 · R$ 297 termina em 55 · R$ 147 termina em 95 · texto 197 · descricao 72
 5 A1 salão · Salvador RMS      titulo 31 · frase1 35 · R$ 297 termina em 51 · R$ 147 termina em 91 · texto 193 · descricao 72
 6 B1 salão · Salvador RMS      titulo 28 · frase1 40 · R$ 297 termina em 56 · R$ 147 termina em 103 · texto 246 · descricao 72
 7 vídeo barbearia              titulo 35 · frase1 39 · R$ 297 termina em 55 · R$ 147 termina em 95
 8 vídeo salão                  titulo 31 · frase1 35 · R$ 297 termina em 51 · R$ 147 termina em 91

precos.json: inauguracao 297 ativa=True · padrao 497 · aberto 147 · vitrine 297
checkout.config.js: VALOR_DOS_LINKS.aberturaInauguracao 297 · aberturaPadrao 497 · precosPadrao.planos 147/297
textos-troca-unica.md: só aparecem R$ 147, R$ 297 e R$ 497 (este último na regra do fim da inauguração)

FALHAS: nenhuma
```

Os quatro A1 e os dois vídeos trazem os dois valores antes do caractere 125. O B1 também, embora o plano só exija isso dos A1. Nenhum título tem número ou "R$".
