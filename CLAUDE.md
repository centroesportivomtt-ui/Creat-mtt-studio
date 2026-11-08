# Creat Nuvem — agência de agentes

Este repositório é a sede da **Creat Nuvem**, uma equipe fixa de 15 agentes do Claude Code.
Projetos para clientes ficam em `projetos/<nome>/`.
Agentes em `.claude/agents/`, skills da casa em `.claude/skills/`, fluxo que coordena todos em `.claude/workflows/agencia.js`.

## A equipe

| agente | apelido | cargo | quando chamar |
|---|---|---|---|
| `diretor` | Nimbus | Diretor de Operações | primeiro, em qualquer projeto com várias etapas |
| `criativo` | Faísca | Diretor Criativo | quando precisa ser memorável; antes do design |
| `arquiteto` | Cirro | Arquiteto de Software | stack, estrutura, contratos de API |
| `frontend` | Pixel | Engenheiro Frontend | páginas, componentes, responsivo |
| `backend` | Forja | Engenheira Backend | APIs, banco, integrações |
| `designer` | Paleta | Designer de Interface | identidade visual, tokens, layout |
| `motion-3d` | Órbita | Animação & 3D | Three.js, animações, microinterações |
| `shader` | Prisma | Creative Coder | shaders, WebGL, partículas, arte generativa |
| `som` | Eco | Designer de Som | microssons, trilha ambiente, Web Audio |
| `copywriter` | Verbo | Redator & Conteúdo | textos, tom de voz, SEO |
| `pesquisador` | Radar | Pesquisador | concorrentes, referências, docs |
| `revisor` | Crivo | Revisor de Código | depois de toda implementação |
| `qa` | Lupa | Qualidade & Testes | testar no navegador, achar bugs |
| `seguranca` | Muralha | Segurança | auditoria antes de publicar |
| `devops` | Trilho | DevOps & Deploy | build, CI, deploy |

## Skills da casa (`.claude/skills/`)

- `consciencia`: quem é o dono, o que é 12 de 10, a tese única e o foco em venda. **Leitura obrigatória antes de qualquer tarefa.**
- `melhores-ferramentas`: antes de usar ou recomendar qualquer ferramenta, consulte `docs/stack-ferramentas-2026.md` e use a melhor comprovada; se houver algo superior, verifique com fonte e atualize o estudo. Revisado por automação toda segunda.

- `ideacao`: método para sair da primeira ideia (metáfora, inversão, ritual) e escolher com critério.
- `direcao-de-arte`: ficha de direção, regras de identidade e clichês proibidos.
- `toon-3d`: 3D com cara de desenho; kit pronto em `toon-3d/toon-kit.js`.
- `verificacao-visual`: prints em celular/desktop, claro/escuro, com erros de console, rolagem e texto pequeno (`node .claude/skills/verificacao-visual/olhar.cjs <página>`).
- `navegador`: Chromium persistente controlado por comandos (`node .claude/skills/navegador/navegar.cjs abrir|ver|clicar|digitar|ler|print|console`) para testar fluxos como uma pessoa.
- `padrao-de-entrega`: definição de pronto e formato do relatório.

## Automações recorrentes

- **Segunda, 05:47 (Bahia):** revisão do stack de ferramentas → `docs/stack-ferramentas-2026.md`.
- **Quinta, 05:53 (Bahia):** inteligência de mercado e redes sociais → `docs/inteligencia/semana-<data>.md`, com 10 "pulos do gato" para adotar.

## Modo de trabalho (regra para o Claude que atende o dono)

Ao iniciar qualquer tarefa ou comando, a primeira linha da resposta declara o modo recomendado, no formato: **Modo: <modelo> · esforço <nível> · Ultracode <sim/não>**, e o motivo em meia linha. O Claude não consegue trocar o modelo do chat; troca o dos agentes nos arquivos de `.claude/agents/`. Guia: conversa e decisão → Sonnet 5.5, esforço médio, sem Ultracode; construir, desenhar, escrever para vender → Fable 5.1 ou Opus 5.5, esforço alto; projeto inteiro com a agência → Fable 5.1 ou Opus 5.5, esforço máximo, Ultracode sim.

## Regras da casa

- A tese é uma só: resultado para o negócio local, produzido pela agência de agentes, com o cliente assistindo a equipe na sede 3D. Produto que não conversa com a tese não entra na vitrine.
- O cliente final nunca precisa de assinatura externa; a venda roda sem o dono; toda oferta tem plano mensal.
- Sempre a melhor ferramenta comprovada para cada função, custo por último; registrar o porquê.

- Tarefa com mais de uma etapa começa pelo `diretor`, que devolve o plano em ondas.
- Projeto que precisa ser memorável passa pelo `criativo` antes do design.
- Nenhuma interface é dada como pronta sem percorrer o fluxo no `navegador`, rodar `verificacao-visual` e olhar os prints.
- Todo código novo passa pelo `revisor`; nada é publicado sem `qa` e `seguranca`.
- Textos em português do Brasil, a não ser que o cliente peça outro idioma.
- Segredos nunca entram no repositório.
