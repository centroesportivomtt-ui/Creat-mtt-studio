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
| `navegador` | Chromium que fica aberto entre comandos: `abrir`, `ver`, `clicar`, `digitar`, `ler`, `print`, `console` |
| `padrao-de-entrega` | definição de pronto e relatório final |

```
node .claude/skills/verificacao-visual/olhar.cjs sede/index.html --hash frontend
```

### Skills dos plugins da sua conta
Os agentes já sabem quando usar cada uma (seção **Arsenal** de cada arquivo em `.claude/agents/`):
`impeccable`, `taste-skill`, `frontend-design`, as de animação do Emil Kowalski (`animate`, `choreograph`, `apple-design`, `break-ui`, `animation-performance`), as de design (`design-system`, `design-critique`, `accessibility-review`, `ux-copy`), as de marketing (`content-creation`, `seo-audit`, `brand-review`, `competitive-brief`), `algorithmic-art`, `deep-research`, `code-review`, `simplify`, `security-review` e `claude-api`.

### Conexões (MCP)
Os agentes que constroem e criam herdam todas as ferramentas da sessão, então usam os conectores da sua conta quando estão ligados: **Figma** (ler designs, gerar imagens e shaders), **Adobe** (fontes, Firefly), **Canva**, **TinyFish** (pesquisa e extração na web), **Base44** (apps com banco pronto), **Google Drive** e **GitHub**. Revisor, segurança e diretor ficam só com leitura, de propósito.

O QA e o frontend têm dois pares de olhos: a skill da casa `navegador` (funciona em qualquer sessão, sem configurar nada) e o MCP do Playwright, já declarado em `.mcp.json`, que o Claude Code oferece para aprovar na primeira sessão que abrir este repositório.

### Inteligência
Quem cria e constrói (criativo, designer, frontend, backend, motion-3d, shader, som, copywriter, arquiteto, devops) roda em **Opus**; quem lê e julga (diretor, revisor, segurança, pesquisador) roda em **Sonnet**, que custa uma fração e perde pouco nessas tarefas. O fluxo `agencia` aceita `max_tarefas` (padrão 10) e cada agente escreve um `RELATORIO.md` parcial na pasta do projeto, para nada se perder se a cota acabar no meio.

## A sede em 3D

`sede/index.html` é uma página única (Three.js) com a ilha flutuante da agência: personagens em estilo desenho animado, cada um na sua mesa. Toque num agente para ver a ficha dele, o arsenal (skills e conexões) e o comando para chamá-lo, ou em **Rodar projeto** para ver uma demonstração do fluxo.

**Painel ao vivo** (`sede/ao-vivo.html`): placar de operações publicado como artefato no claude.ai. Lê as suas sessões do Claude Code pelo conector *Claude Code Remote* a cada 2,5 s (só os eventos novos) e mostra quem está trabalhando no palco "Agora", um registro de eventos em tempo real, modo TV e som opcional, além de os 15 agentes (quem está trabalhando, em quê, há quanto tempo), as fases do fluxo, as entregas recentes, as sessões que precisam de você e a cota de uso.

Para abrir localmente:

```
cd sede && python3 -m http.server 8000
# abra http://localhost:8000
```
