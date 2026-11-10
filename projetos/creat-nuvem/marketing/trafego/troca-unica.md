# Troca única · roteiro dos dois atos de mídia

Trilho, 10/11/2026, pacote 2C da onda 2 do plano de qualidade. Roteiro para o coordenador executar. Os textos estão em `textos-troca-unica.md`; o plano de mídia, em `EXPANSAO.md` (seção Mídia); a régua de links, em `../utm.md`.

**Como isto ajuda a vender.** O desconhecido de outra cidade chega por um anúncio que diz o preço certo, em português, e cai na página certa do nicho dele, com a medição ligada. Cada troca de mídia vira uma edição só, conferida por máquina antes de ligar, para a leitura de 30/11 comparar coisas comparáveis.

**O que este arquivo não faz.** Não muda texto, arte, vídeo, preço, público, local nem verba. Não autoriza nada sozinho: cada ato precisa do "sim" do dono na pergunta P1 da rodada única.

---

## 0. Onde estamos (lido em 10/11/2026)

- Os 6 anúncios de texto corrigido estão **ativos** desde 15:02 (Bahia) de 10/11, lidos pelo MCP da Meta em 10/11 (só leitura, `ads_get_ad_entities`): A1 barbearia, A1 salão e B1 salão em Feira e em Salvador RMS (ids em `textos-troca-unica.md`, seção 6).
- Os 4 A1 antigos, com "você só paga se gostar", e os 2 B1 antigos estão **pausados**. A correção que o plano pedia até 13/11 (pausar os 4 A1) já está feita. Nenhum antigo volta a ser ativado: se algum aparecer ativo na leitura diária, pausar na hora (é correção, não edição).
- Validação tripla dos 6 textos ativos com `validar-anuncio.cjs` contra o site no ar (10/11): idioma verde nos 6, moeda verde nos 6, link verde nos 6 em tudo menos o contador próprio de visitas, que só sobe com a vitrine da onda 2. Depois dessa publicação, rodar de novo; só vale o verde inteiro.
- Avisos do link que não bloqueiam, mas pedem correção na home (onda 4 ou pacote 2A): o nicho marcado fica abaixo da primeira tela em 390x844 (y=940), e o exemplo do campo de nome diz "Barbearia do Zé" também para quem chega pelo anúncio de salão.

---

## 1. Regras que valem para os dois atos

1. **Janela.** A única edição significativa antes do congelamento é de **13 a 16/11**. Depois de 16/11 não se cria campanha nova; a leitura de 30/11 usa as campanhas de Tráfego como estão. **De 23 a 29/11 nada é editado** (orçamento, público, local, evento, criativo ou campanha). Nessa semana só existe pausa de emergência.
2. **Verba igual.** R$ 40 por dia por campanha, R$ 80 por dia no total. A campanha nova copia orçamento, público, local e posicionamento da campanha que substitui. Duas campanhas da mesma praça nunca ficam ligadas juntas além da sessão da troca (senão a verba dobra sem ordem do dono).
3. **Ids lidos na hora.** Nenhum id fixo deste repositório é usado para editar. Antes de cada passo, ler pelo MCP oficial da Meta (seção 4) e conferir o nome da campanha, do conjunto e do anúncio.
4. **Criar pausado.** Todo anúncio, conjunto e campanha nasce **PAUSADO**. Só liga com o "sim" da P1, a validação tripla verde e a conferência no ar verde.
5. **No máximo 4 anúncios por conjunto.**
6. **Critério de pausa do antigo.** O antigo só pausa depois que o novo está **aprovado e ativo** (estado efetivo ACTIVE, sem reprovação nem "em análise"). Em nenhum momento um conjunto fica sem anúncio. Antigo fica pausado, nunca apagado, para a leitura de antes e depois.
7. **Regra de parar.** Se `conferir-no-ar.cjs` ou `validar-anuncio.cjs` sair com 1, ou a Meta reprovar um anúncio: **pausar primeiro** os anúncios que levam à página com defeito, corrigir depois, publicar, conferir de novo e só então religar. Pausa nunca espera ordem; religar espera a conferência verde.
8. **Preço.** Se `dados/precos.json` passar a `ativa: false` ou `vagasRestantes: 0`, todo anúncio com R$ 297 pausa no mesmo ato da troca de preço da página (`textos-troca-unica.md`, seção 1). Ao chegar a 19 Pix pagos no painel do Mercado Pago, pausar o anúncio de oferta e avisar o dono (`EXPANSAO.md`).
9. **Registro.** Cada ato e cada publicação de funil ganham linha em `diario-campanha.csv` no mesmo dia, com a data e a hora (Bahia) na coluna `data_publicacao_funil`, sem número de gasto.

---

## 2. ATO 1 · 13/11 (limite 16/11)

**Pré-condições, todas juntas** (faltou uma, o ato desliza dia a dia até 16/11; passou de 16/11, não acontece):

- "Sim" da P1 (b) na rodada única.
- Ondas 1 e 2 publicadas, com `JORNADA_PUBLICADA = true` em `scripts/conferir-no-ar.cjs` e a conferência no ar verde.
- Pré-condições do `EXPANSAO.md` (seção Mídia, 13/11): Pixel conferido no Test Events com ViewContent e InitiateCheckout, sem `#` nem dado pessoal na URL; identidade da empresa publicada; links do Mercado Pago por praça em uso; T10 publicado e T12 aprovado.
- Portão do suporte (`docs/PEDIDO-API.md`, seção 10): a chave `ultimo_email_suporte` diz `enviado`, ou a tarefa executora com aviso ao dono está ligada.

**Passos.**

1. Ler a conta pelo MCP (seção 4): campanhas `PA | Site | Feira` e `PA | Site | Salvador RMS` ativas, seus conjuntos, os 3 anúncios ativos de cada conjunto e o orçamento de R$ 40 por dia de cada. Anotar os ids lidos.
2. Montar o JSON da validação no scratchpad (nunca no repositório), com o texto exatamente como vai para o Gerenciador: `node marketing/trafego/validar-anuncio.cjs --exemplo` mostra o formato. Os 6 anúncios do ato 1 são os da tabela da seção 2 de `textos-troca-unica.md`, com os links da seção 4 (com `utm_term={{placement}}`).
3. Rodar `node marketing/trafego/validar-anuncio.cjs <json>`. Só segue com saída 0.
4. Rodar `node scripts/conferir-no-ar.cjs`. Só segue com saída 0 e a última linha "ok". Colar a última linha no relatório.
5. Criar **pausadas** `PA | Feira | VC` e `PA | Salvador RMS | VC`, otimizadas para ViewContent (decisão do `EXPANSAO.md`, já prevista), cada uma com R$ 40 por dia, um conjunto, e o mesmo público, local e posicionamento das campanhas de Tráfego da mesma praça. As sugestões de público do `EXPANSAO.md` (13/11) entram aqui, nesta mesma edição, e em nenhuma outra.
6. Criar **pausados** os 3 anúncios de cada conjunto novo (A1 barbearia, A1 salão, B1 salão), com a mesma arte de hoje, o texto da seção 2 de `textos-troca-unica.md`, URL do site `https://creat-nuvem-404b1994.base44.app/` e, em "Parâmetros de URL", `nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=<feira|salvador-rms>&utm_content=<A1-barbearia-v1|A1-salao-v1|B1-salao-v1>&utm_term={{placement}}`. Aprimoramentos criativos da Meta desligados. Nome do anúncio: `<utm_content> · <praça> 2026-11-<dia>`. Máximo de 4 por conjunto; o vídeo não entra no ato 1.
7. Ler de novo pelo MCP o que foi criado (texto, título, botão e prévia do Reels, do Stories e do Feed em pt-BR com `ads_get_ad_preview`). Se algo divergir do JSON, corrigir ainda pausado e voltar ao passo 3.
8. Com o "sim" da P1: ligar as duas campanhas VC.
9. Esperar a aprovação. Quando os 6 anúncios novos estiverem ACTIVE e sem reprovação, pausar as campanhas de Tráfego `PA | Site | Feira` e `PA | Site | Salvador RMS` (critério da regra 6). Reprovado: não pausar o antigo daquele conjunto, seguir a regra de parar.
10. Ler pelo MCP o estado final: 2 campanhas VC ativas, R$ 40 cada, soma R$ 80; Tráfego pausadas; nenhum anúncio antigo ativo. Atualizar a tabela "Anúncios no ar" de `../utm.md` (pedido ao dono do arquivo) com a leitura nova.
11. Rodar `node scripts/conferir-no-ar.cjs` mais uma vez com os anúncios novos ativos e colar a última linha.
12. Registrar no `diario-campanha.csv`: uma linha `fase=publicacao` com a hora da troca em `data_publicacao_funil`, e atualizar a linha "ato 1 (planejado)" para o que de fato aconteceu.

**Se o "sim" não vier até 16/11:** as campanhas VC ficam pausadas (ou nem são criadas), as de Tráfego seguem como estão, com os textos corrigidos que já rodam desde 10/11.

---

## 3. ATO 2 · depois da leitura de 30/11

**Pré-condições:** leitura de 30/11 feita e registrada; "sim" da P1 (c); 7 dias desde a última edição significativa; fora de 23 a 29/11; vídeos prontos e revistos.

1. Ler pelo MCP as campanhas e os conjuntos ativos (as VC, se o ato 1 aconteceu; senão, as de Tráfego) e o custo por prévia gerada de cada anúncio desde 14/11.
2. Vídeo 9:16 de barbearia (`video/saida/R7-barbearia-v1.mp4`, renderizado de novo com a faixa de preço de `textos-troca-unica.md`, seção 3) e de salão (R7-salao, ainda por gravar). Sem fala, o portão de áudio não se aplica; com qualquer fala, a transcrição comparada palavra a palavra com o roteiro, com preço e moeda conferidos no áudio, e locução brasileira nativa.
3. `utm_content` dos vídeos: `video-barbearia-v1` e `video-salao-v1`, como manda `../utm.md` (os dois estão em `ANUNCIOS` de `schema/pedido-regras.mjs`). `textos-troca-unica.md`, seção 3, ainda diz `video`: alinhar antes do ato 2.
4. Estáticos novos, se houver, com o B1 mudando a primeira coisa que se vê (imagem ou preço na arte), conforme a hipótese CH-14 no diário.
5. Com até 4 anúncios por conjunto: entra cada vídeo no lugar do estático com o pior custo por prévia gerada daquele conjunto.
6. Repetir os passos 3, 4, 6, 7, 9, 11 e 12 do ato 1: validação tripla verde, conferência no ar verde, criar pausado, ler de novo, ligar com o "sim", pausar o substituído só depois do novo aprovado, conferir no ar de novo e registrar no diário. Verba, público, local e evento não mudam neste ato; mudança de verba segue os degraus do `EXPANSAO.md`, nunca junto com a troca de criativo.

---

## 4. Leitura de ids pelo MCP oficial da Meta (só leitura)

Conta de anúncios do Porta Aberta (a mesma do `EXPANSAO.md`; confirmar com `ads_get_ad_accounts`).

- Campanhas: `ads_get_ad_entities` com `level=campaign`, `fields=["id","name","effective_status"]` e filtro `name CONTAIN "PA |"`.
- Conjuntos de uma campanha: `level=adset`, filtro `campaign.id IN [<id lido>]`.
- Anúncios de um conjunto: `level=ad`, filtro `adset.id IN [<id lido>]`, `fields=["id","name","effective_status","creative_id"]`.
- Texto e botão do criativo: `ads_get_creatives` com o `creative_id`. Nos criativos de feed de recursos a API devolve texto e link vazios; nesse caso, ler pela prévia (`ads_get_ad_preview`, Reels, Stories e Feed, em pt-BR), onde o `href` mostra a URL final.

---

## 5. Validação tripla em uma linha

`node marketing/trafego/validar-anuncio.cjs <json>` confere por anúncio:

- **Idioma:** pt-BR em título, texto, descrição e botão; sem as palavras em inglês da lista do arquivo; acentos íntegros; sem travessão, sem emoji; sem "só paga se gostar", "em 1 minuto", vagas ou escassez; sem prazo em horas até o ensaio verde (`--prazo-liberado`); sem "inauguração" até a trava das 20 vagas provada (`--trava-provada`).
- **Moeda:** todo valor como "R$ 297", nunca US$ nem número solto; cada valor igual em `dados/precos.json` e `checkout.config.js`; Abertura e plano Aberto terminam até o caractere 125 do texto principal.
- **Link:** endereço do site, rota `/`, sem CDN nem encurtador; `nicho`, `utm_source=meta`, `utm_medium=pago`, `utm_campaign` da praça, `utm_content` do anúncio (dentro de `ANUNCIOS`) e `utm_term`; aberto num Android real: 200, título da home, nicho marcado, R$ 297 na tela, medição da Meta carregada com PageView saindo e visita do contador próprio saindo com nicho, praça e anúncio certos. Tudo com `X-Conferencia: 1`; envio à Meta e de pedido cancelados.

Saída 0: os três verdes em todos. Saída 1: nada sobe.
