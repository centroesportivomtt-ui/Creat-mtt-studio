# itch.io · Produto 1 · 15-agent studio for Claude Code (EN)

**Onde colar cada campo** (itch.io > Dashboard > Create new project; textos em inglês):

| campo deste arquivo | onde fica no itch.io |
|---|---|
| Title | Title |
| Short description | Short description or tagline |
| Classification | Classification: Tools · Kind of project: Downloadable |
| Pricing | Pricing: Paid · Price USD 12.00 (marque "Allow people to pay more" se quiser) |
| Uploads | Upload `projetos/loja/dist/creat-nuvem-agencia-15-agentes.zip` |
| Long description | Details > Description |
| Tags | Tags (até 10) |
| Delivery text | Não há e-mail de entrega editável: cole o texto no fim da descrição, sob "After you download", e use-o também como README de boas-vindas se publicar um devlog |

---

## Title

Creat Nuvem: 15-Agent Studio for Claude Code

## Short description

Fifteen specialist subagents, house skills and a wave-based workflow for Claude Code.

## Classification

Tools · Downloadable

## Pricing

USD 12.00

## Long description

Creat Nuvem turns Claude Code into a small studio with fixed roles. Instead of asking one conversation to do everything, you ask the right specialist by name: the director plans, the designer writes tokens, the frontend engineer builds, the reviewer reads the diff, QA tests in a real browser.

**What's in the zip**

- 15 subagents in `.claude/agents/`: director, creative, architect, frontend, backend, designer, motion-3d, shader, sound, copywriter, researcher, reviewer, qa, security and devops. Each has a role, quality rules and the tools it should use.
- 6 house skills: concept ideation, art direction, toon-style 3D (a Three.js kit is included), visual checks with screenshots on phone and desktop, a persistent browser driven by commands, and a definition of done.
- The `agencia.js` workflow, which hands work from agent to agent in waves: concept, plan, build, review, QA, fixes, delivery. Each agent appends to a partial `RELATORIO.md`, so nothing is lost if your quota runs out halfway.
- A 3D headquarters page: a cartoon island with the 15 characters. In live mode it shows which agents are working on your machine and how many tokens each one used.
- A PDF guide with two prompt examples per agent, the wave workflow, token costs, good practices and common mistakes.

**Language note:** the agents, skills and guide are written in Brazilian Portuguese, and the agents answer in Portuguese by default. Claude reads them fine in any language; change the language rule in `CLAUDE.md` to get answers in English.

**Before you buy**

- Works with Claude Code. This is not an official Anthropic product and is not affiliated with Anthropic.
- You need an active Claude Code subscription or account. Access to Claude is not included.
- Every agent uses tokens from your account. A full workflow runs many agents and costs more than a regular chat. The guide explains how to measure it.
- The browser and visual-check skills need Playwright (`npm install -D playwright`), which is free.

**License**

Personal and commercial use allowed, including client work. Reselling or redistributing the pack is not allowed.

Questions: mttcreatt@gmail.com

## Tags

claude-code, ai-agents, subagents, developer-tools, workflow, frontend, threejs, automation, web-development, productivity

## Delivery text (after you download)

Thanks for buying Creat Nuvem.

1. Unzip `creat-nuvem-agencia-15-agentes.zip` and open `README.md`. Setup takes about 2 minutes: copy `.claude/` and `CLAUDE.md` to the root of your repository, then run `npm install -D playwright` and `npx playwright install chromium`.
2. Open Claude Code in that repository and ask: "List the available agents". You should see all 15 names.
3. Read the token cost section of `GUIA.pdf` before your first full workflow run.

Reminder: the pack runs on your own Claude Code subscription, and agents use tokens from your account.

Something not working? Email mttcreatt@gmail.com with what you asked, what you saw and your Claude Code version.
