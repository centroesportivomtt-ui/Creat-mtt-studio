# X · fio em português (5 posts)

**Horário sugerido:** terça, 12h15 (horário de Brasília). Publique o fio inteiro de uma vez e fixe o primeiro post no perfil por uma semana.
**Onde publicar:** https://x.com > Postar. Escreva o post 1, clique em "+" para adicionar os outros ao fio. Anexe ao post 1 um print da sede 3D ou o vídeo de 30 s (`roteiro-video-30s.md`).
**Contagem:** cada post tem até 280 caracteres, contados abaixo. O X conta todo link como 23 caracteres; os marcadores [LINK_...] foram contados pelo tamanho literal, então sobra espaço depois de trocar.

---

**1/5** (220 caracteres)

Parei de pedir tudo para uma conversa só do Claude Code.

Separei o trabalho em agentes com papel fixo: um constrói, outro revisa o diff, outro testa no navegador.

O revisor nem tem permissão de editar. Só aponta. (fio)

**2/5** (228 caracteres)

Por que separar: a sessão que escreveu o código tende a concordar com ela mesma.

Um agente com contexto limpo, lendo só o git diff, acha mais. E cada achado vem com arquivo, linha e o cenário que quebra. Sem cenário, não é bug.

**3/5** (251 caracteres)

O QA tem olhos: um script com Playwright abre a página no celular e no desktop, claro e escuro, salva prints e aponta erro de console, rolagem lateral e texto menor que 11 px.

Se achar problema, sai com código 1. O agente não consegue dizer "pronto".

**4/5** (203 caracteres)

O que custa: mais tokens que uma conversa só. Para ajuste pequeno, chamo um agente. Para página nova, os três.

E nada disso é oficial da Anthropic: são arquivos .md que qualquer conta do Claude Code lê.

**5/5** (179 caracteres)

Abri a versão mínima: 3 agentes + a skill de verificação visual, licença MIT.

[LINK_LITE_REPO]

A versão com 15 agentes, fluxo em ondas e sede 3D é paga, e está aqui: [LINK_LOJA]
