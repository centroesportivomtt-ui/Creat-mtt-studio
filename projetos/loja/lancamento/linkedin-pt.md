# LinkedIn · post em português (PT)

**Horário sugerido:** semana 2, sexta, 8h15 (horário de Brasília). Publique um dia depois do Show HN, nunca no mesmo dia de outro post.
**Onde publicar:** https://www.linkedin.com/feed > Começar uma publicação. Cole o corpo abaixo. Anexe o vídeo de 30 s (`roteiro-video-30s.md`) ou um print da sede 3D. Não use "Artigo": o post curto alcança mais gente.
**Link:** o LinkedIn mostra menos os posts com link no corpo. Por isso o corpo não tem link. Logo depois de publicar, faça o primeiro comentário com o texto de "Primeiro comentário" abaixo.
**Público:** freelancers, agências e times de produto que entregam sites para clientes. É o único canal da lista em que o link de venda pode aparecer no primeiro comentário, porque o post é seu e no seu perfil.
**Regras:** não prometa renda, lucro nem resultado financeiro. Não diga que é produto da Anthropic. Não marque pessoas que não pediram. Responda aos comentários nas primeiras 2 horas.
**Contagem:** o corpo tem cerca de 1.300 caracteres (limite do LinkedIn: 3.000). As 3 primeiras linhas aparecem antes do "...ver mais"; elas carregam a ideia.

---

## Corpo

Quem revisa o código que a IA escreveu?

No Claude Code, eu pedia tudo para uma conversa só: fazer a página, revisar, testar. A mesma sessão que escrevia era a que dizia "pronto". O erro aparecia depois, no celular do cliente.

Separei o trabalho em agentes com papel fixo, como numa agência pequena:

→ quem constrói não aprova o próprio trabalho;
→ o revisor lê o diff sem poder editar;
→ o QA abre a página num navegador de verdade, em celular e desktop, claro e escuro, e só passa sem erro no console;
→ cada um deixa uma seção num relatório do projeto, então dá para retomar de onde parou.

Hoje são 15 agentes, um fluxo que divide o projeto em ondas e uma sede 3D onde dá para ver quem está trabalhando.

Para quem entrega site para cliente, o que mais mudou foi a revisão: menos idas e voltas, porque o QA pega a rolagem lateral e o texto minúsculo antes de mim.

Abri uma versão mínima e grátis, com frontend, revisor, QA e a verificação visual. A versão completa e dois kits prontos (3D em estilo desenho e um site de barbearia com agendamento pelo WhatsApp) estão à venda. Links no primeiro comentário.

Não é um projeto da Anthropic, só é compatível com o Claude Code.

Como você organiza revisão e teste quando o código vem de IA?

#ClaudeCode #DesenvolvimentoWeb #Frontend #Freelancer

---

## Primeiro comentário

Versão grátis (MIT), com 3 agentes e a verificação visual: [LINK_LITE_REPO]

Loja, com a agência de 15 agentes (R$ 47), o Kit Toon 3D para Three.js (R$ 39) e o site de barbearia com agendamento pelo WhatsApp (R$ 67): [LINK_LOJA]

Os arquivos estão em português. Precisa de uma conta do Claude Code e do Playwright.

---

## Respostas prontas

- **"Funciona com outro modelo/ferramenta?"** Os agentes são arquivos Markdown do Claude Code. A ideia (papéis separados, revisor sem edição, QA no navegador) serve em qualquer ferramenta, mas os arquivos foram feitos para o Claude Code.
- **"Quanto gasta de token?"** Mais que uma conversa só, porque cada agente começa com contexto próprio. Uso um agente para ajuste pequeno e o fluxo completo só para projeto inteiro.
- **"Posso usar em projeto de cliente?"** Sim, a licença dos pacotes pagos permite uso comercial e em projetos de clientes. Só não permite revender o pacote.
