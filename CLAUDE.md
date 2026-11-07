# Creat Nuvem — agência de agentes

Este repositório é a sede da **Creat Nuvem**, uma equipe fixa de 12 agentes do Claude Code.
Os agentes ficam em `.claude/agents/` e o fluxo que coloca todos para trabalhar juntos fica em `.claude/workflows/agencia.js`.

## A equipe

| agente | apelido | cargo | quando chamar |
|---|---|---|---|
| `diretor` | Nimbus | Diretor de Operações | primeiro, em qualquer projeto com várias etapas |
| `arquiteto` | Cirro | Arquiteto de Software | stack, estrutura, contratos de API |
| `frontend` | Pixel | Engenheiro Frontend | páginas, componentes, responsivo |
| `backend` | Forja | Engenheira Backend | APIs, banco, integrações |
| `designer` | Paleta | Designer de Interface | identidade visual, tokens, layout |
| `motion-3d` | Órbita | Animação & 3D | Three.js, animações, microinterações |
| `copywriter` | Verbo | Redator & Conteúdo | textos, tom de voz, SEO |
| `pesquisador` | Radar | Pesquisador | concorrentes, referências, docs |
| `revisor` | Crivo | Revisor de Código | depois de toda implementação |
| `qa` | Lupa | Qualidade & Testes | testar no navegador, achar bugs |
| `seguranca` | Muralha | Segurança | auditoria antes de publicar |
| `devops` | Trilho | DevOps & Deploy | build, CI, deploy |

## Regras da casa

- Tarefa com mais de uma etapa começa pelo `diretor`, que devolve o plano em ondas.
- Todo código novo passa pelo `revisor` antes de ser dado como pronto.
- Nada é publicado sem `qa` e `seguranca`.
- Textos em português do Brasil, a não ser que o cliente peça outro idioma.
- Segredos nunca entram no repositório.
