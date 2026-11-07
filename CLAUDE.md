# Creat Nuvem — agência de agentes

Este repositório é a sede da **Creat Nuvem**, uma equipe fixa de 15 agentes do Claude Code.
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

- `ideacao`: método para sair da primeira ideia (metáfora, inversão, ritual) e escolher com critério.
- `direcao-de-arte`: ficha de direção, regras de identidade e clichês proibidos.
- `toon-3d`: 3D com cara de desenho; kit pronto em `toon-3d/toon-kit.js`.
- `verificacao-visual`: prints em celular/desktop, claro/escuro, com erros de console, rolagem e texto pequeno (`node .claude/skills/verificacao-visual/olhar.cjs <página>`).
- `padrao-de-entrega`: definição de pronto e formato do relatório.

## Regras da casa

- Tarefa com mais de uma etapa começa pelo `diretor`, que devolve o plano em ondas.
- Projeto que precisa ser memorável passa pelo `criativo` antes do design.
- Nenhuma interface é dada como pronta sem rodar `verificacao-visual` e olhar os prints.
- Todo código novo passa pelo `revisor`; nada é publicado sem `qa` e `seguranca`.
- Textos em português do Brasil, a não ser que o cliente peça outro idioma.
- Segredos nunca entram no repositório.
