
## T3 · QA do agendamento, correções e README (Lupa)

**O que foi feito**
- Fluxo completo testado no `navegador` em 390px e 1280px (claro e escuro): dia, horário, serviço, profissional, nome, WhatsApp, confirmar (botão "Confirmar sem arrastar" e Enter na tira) e link `wa.me` com a mensagem certa. Casos de borda: campos vazios (erros e foco no nome), clique duplo no confirmar (grava 1 reserva), horário perto do fechamento (só o serviço de 15 min cabe), nome longo, "Marcar outro horário".
- `verificacao-visual` nas 4 configurações: limpo (sem erro de console, sem request quebrada, sem rolagem horizontal, sem texto pequeno). Alvos de toque ≥ 44px, contraste AA nos dois temas (checagem automática), foco visível, `prefers-reduced-motion` respeitado (navalha já afiada, nenhuma animação ativa).
- Falhas encontradas e corrigidas:
  1. (devops) WhatsApp com número de aparência real `5511987654321` no `config.js` e no HTML: trocado pelo marcador `5500000000000` / `(00) 00000-0000`; `<noscript>` não traz mais número fixo.
  2. (devops/copy) `config.js` não era o único lugar: `<title>`, `description`, `theme-color`, manifesto, nota de privacidade, botão "Esquecer meus dados", rótulos da tela de conferência e avisos da agenda estavam fixos no HTML/JS. Novos campos `pagina.titulo`, `pagina.descricao`, `textos.manifesto`, `textos.agenda.*` e `textos.espelho.*`; `agendamento.js` ganhou `aplicarPagina()` e `renderManifesto()`. Teste com config trocado: nada da Fio & Couro sobra na página.
  3. (designer) Depois de confirmar, a tela de conferência rolava para o centro e o cabeçalho fixo cortava o título "Marque sua cadeira" pela metade; agora rola para o início do espelho, respeitando o `scroll-padding`.
  4. (devops) README reescrito: parte 1 personalização campo a campo do `config.js`; parte 2 publicação grátis em GitHub Pages, Cloudflare Pages e Netlify Drop.

**Arquivos tocados:** `config.js`, `agendamento.js`, `index.html`, `README.md`, `RELATORIO.md` (todos em `projetos/barbearia/`).

**Como verificar**
```sh
cd projetos/barbearia && python3 -m http.server 8000   # outra aba:
node .claude/skills/verificacao-visual/olhar.cjs http://localhost:8000
```
Ou abra `index.html`, marque um horário e confira o link "Enviar no WhatsApp". Prints finais em `.verificacao/` (não versionado).

**Pendente**
- `projetos/loja/empacotar.cjs` empacota a pasta inteira: este `RELATORIO.md` iria para o zip do comprador. Sugestão: excluir `RELATORIO.md` no pacote `barbearia`.
- Avaliações e equipe são fictícias (avisado no README); o comprador precisa trocar.
- Revisão do `revisor` e auditoria da `seguranca` não feitas nesta tarefa.

## T4 · Correções do QA: Enter no formulário e links de WhatsApp sem JS (Pixel)

**O que foi feito**
1. **Enter não confirmava a reserva.** O form não tinha botão submit e tinha dois campos de texto, então o navegador não fazia o envio implícito. `#confirmar-sem-arrastar` virou `type="submit"` e o listener de clique duplicado saiu do `agendamento.js`: clique, Enter em qualquer campo e a tecla "Ir" do celular caem no mesmo `submit` → `confirmar('botao')`. Os outros botões do form já eram `type="button"`, então nenhum deles vira o padrão por engano.
2. **Links de WhatsApp com número-marcador sem JS.** `#whats-flutuante` e o trecho ` · WhatsApp (…)` do rodapé (agora dentro de `#rodape-contato`) nascem com `hidden`; o `renderContato()` preenche o `href` com o número do `config.js` e só então os exibe. Sem JS, o rodapé mostra só o horário e nenhum `wa.me/5500000000000` fica clicável. O `#espelho-whats` já ficava dentro do `#espelho` escondido. O README ganhou uma nota sobre isso.

**Arquivos tocados:** `index.html`, `agendamento.js`, `README.md`, `RELATORIO.md` (em `projetos/barbearia/`).

**Como verificar**
- `navegador --celular`: quarta, 10h, Corte + barba, Seu Dirceu, nome "João", WhatsApp "(21) 98765-4321" e **Enter** no campo WhatsApp → abre `wa.me` com a mensagem certa (1 chamada); recarregar → quarta 10h aparece "ocupado". Feito e ok.
- Desktop: clique em "Confirmar sem arrastar" abre `wa.me` uma vez só (sem disparo duplo); Enter no campo nome também confirma; Enter com nada escolhido mostra "Falta escolher dia, horário, serviço e profissional" e não abre nada. Console limpo.
- Sem JS (Playwright com `javaScriptEnabled: false`): nenhum link `wa.me` visível; rodapé mostra só "Terça a Sábado, 9h às 20h".
- `node .claude/skills/verificacao-visual/olhar.cjs projetos/barbearia/index.html` → "Tudo limpo" nas 4 configurações.

**Pendente**
- Sem JS a página não oferece nenhum contato direto (decisão consciente: o número só existe no `config.js`). O dono pode escrever o número à mão no `<noscript>`, como explica o README.
- Revisão do `revisor` e auditoria da `seguranca` continuam pendentes.
