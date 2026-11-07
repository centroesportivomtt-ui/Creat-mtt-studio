# Creat Nuvem

Agência de agentes para o Claude Code: 15 especialistas fixos, skills próprias, um fluxo que coordena o trabalho entre eles e uma sede em 3D para ver a equipe em ação.

## Como usar

**Um agente só.** Em qualquer sessão do Claude Code neste repositório, peça pelo nome:

```
Use o agente frontend para construir a página de preços responsiva
Use o agente revisor para revisar o diff desta branch
```

**A agência inteira.** Peça para rodar o fluxo com o seu briefing:

```
rode o workflow agencia com o briefing: landing page para uma barbearia com agendamento online
```

O fluxo faz assim:

1. **Conceito**: três Faíscas (criativo) criam conceitos por ângulos diferentes (metáfora, inversão, ritual) e um júri escolhe o melhor, enxertando a melhor ideia dos outros. Pule com `{ briefing, conceito: false }`.
2. **Briefing**: Nimbus (diretor) lê o repositório e monta o plano em ondas a serviço do conceito.
3. **Construção**: os especialistas de cada onda trabalham em paralelo; Crivo (revisor) revisa cada entrega e pede ajustes.
4. **QA**: Lupa (qa), Muralha (seguranca) e Crivo procuram problemas; cada achado é conferido por outro agente antes de virar correção.
5. **Correções**: o responsável corrige o que foi confirmado.
6. **Entrega**: Nimbus confere os critérios de aceite e escreve o relatório.

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

Cada agente é um arquivo em `.claude/agents/`. Para mudar o jeito de um deles trabalhar, edite o arquivo; para contratar um novo, crie outro `.md` no mesmo formato.

## Arsenal

### Skills da casa (`.claude/skills/`, vão junto com o repositório)
| skill | para quê |
|---|---|
| `ideacao` | sair da primeira ideia: metáfora, inversão, ritual, pontuação e enxerto |
| `direcao-de-arte` | ficha de direção, regras de identidade, clichês proibidos |
| `toon-3d` | 3D com cara de desenho; kit pronto em `toon-3d/toon-kit.js` |
| `verificacao-visual` | prints em celular/desktop, claro/escuro + erros de console, rolagem lateral, texto pequeno |
| `padrao-de-entrega` | definição de pronto e relatório final |

```
node .claude/skills/verificacao-visual/olhar.cjs sede/index.html --hash frontend
```

### Skills dos plugins da sua conta
Os agentes já sabem quando usar cada uma (seção **Arsenal** de cada arquivo em `.claude/agents/`):
`impeccable`, `taste-skill`, `frontend-design`, as de animação do Emil Kowalski (`animate`, `choreograph`, `apple-design`, `break-ui`, `animation-performance`), as de design (`design-system`, `design-critique`, `accessibility-review`, `ux-copy`), as de marketing (`content-creation`, `seo-audit`, `brand-review`, `competitive-brief`), `algorithmic-art`, `deep-research`, `code-review`, `simplify`, `security-review` e `claude-api`.

### Conexões (MCP)
Os agentes que constroem e criam herdam todas as ferramentas da sessão, então usam os conectores da sua conta quando estão ligados: **Figma** (ler designs, gerar imagens e shaders), **Adobe** (fontes, Firefly), **Canva**, **TinyFish** (pesquisa e extração na web), **Base44** (apps com banco pronto), **Google Drive** e **GitHub**. Revisor, segurança e diretor ficam só com leitura, de propósito.

Para dar ao QA e ao frontend um navegador que eles controlam clicando e digitando, adicione o MCP do Playwright ao projeto (cria o `.mcp.json`):

```
claude mcp add --scope project playwright -- npx -y @playwright/mcp@0.0.83 --headless --isolated
```

### Inteligência
Todos os agentes rodam no modelo **Opus** (`model: opus`), o mais capaz disponível. Para economizar em tarefas simples, troque para `sonnet` no arquivo do agente.

## A sede em 3D

`sede/index.html` é uma página única (Three.js) com a ilha flutuante da agência: personagens em estilo desenho animado, cada um na sua mesa. Toque num agente para ver a ficha dele, o arsenal (skills e conexões) e o comando para chamá-lo, ou em **Rodar projeto** para ver uma demonstração do fluxo.

Para abrir localmente:

```
cd sede && python3 -m http.server 8000
# abra http://localhost:8000
```
