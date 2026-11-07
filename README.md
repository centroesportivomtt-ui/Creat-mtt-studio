# Creat Nuvem

Agência de agentes para o Claude Code: 12 especialistas fixos, um fluxo que coordena o trabalho entre eles e uma sede em 3D para ver a equipe em ação.

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

1. **Briefing**: Nimbus (diretor) lê o repositório e monta o plano em ondas.
2. **Construção**: os especialistas de cada onda trabalham em paralelo; Crivo (revisor) revisa cada entrega e pede ajustes.
3. **QA**: Lupa (qa), Muralha (seguranca) e Crivo procuram problemas; cada achado é conferido por outro agente antes de virar correção.
4. **Correções**: o responsável corrige o que foi confirmado.
5. **Entrega**: Nimbus confere os critérios de aceite e escreve o relatório.

## A equipe

| agente | apelido | cargo |
|---|---|---|
| `diretor` | Nimbus | Diretor de Operações |
| `arquiteto` | Cirro | Arquiteto de Software |
| `frontend` | Pixel | Engenheiro Frontend |
| `backend` | Forja | Engenheira Backend |
| `designer` | Paleta | Designer de Interface |
| `motion-3d` | Órbita | Animação & 3D |
| `copywriter` | Verbo | Redator & Conteúdo |
| `pesquisador` | Radar | Pesquisador |
| `revisor` | Crivo | Revisor de Código |
| `qa` | Lupa | Qualidade & Testes |
| `seguranca` | Muralha | Segurança |
| `devops` | Trilho | DevOps & Deploy |

Cada agente é um arquivo em `.claude/agents/`. Para mudar o jeito de um deles trabalhar, edite o arquivo; para contratar um novo, crie outro `.md` no mesmo formato.

## A sede em 3D

`sede/index.html` é uma página única (Three.js) com a ilha flutuante da agência: personagens em estilo desenho animado, cada um na sua mesa. Toque num agente para ver a ficha dele e o comando para chamá-lo, ou em **Rodar projeto** para ver uma demonstração do fluxo.

Para abrir localmente:

```
cd sede && python3 -m http.server 8000
# abra http://localhost:8000
```
