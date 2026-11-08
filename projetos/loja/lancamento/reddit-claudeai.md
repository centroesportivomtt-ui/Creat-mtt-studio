# Reddit · r/ClaudeAI (EN)

**Horário sugerido:** terça ou quarta, 9h ET (10h ou 11h em Brasília, conforme o horário de verão dos EUA).
**Onde publicar:** https://www.reddit.com/r/ClaudeAI > Create post > Text. Escolha a flair que as regras pedirem para projetos ou ferramentas.
**Antes de publicar:** leia as regras atuais do subreddit (barra lateral e post fixado). Siga a regra de autopromoção:
- diga que você é o autor (já está no texto);
- nada de link de venda direto: só o repositório grátis [LINK_LITE_REPO];
- responda aos comentários durante as primeiras horas;
- não publique o mesmo texto em vários subreddits no mesmo dia.

---

## Title

I split Claude Code into three subagents (build, review, browser QA) and open-sourced them

## Body

Disclosure: I made this. The repo is free and MIT licensed.

I used to ask a single Claude Code session to build a page, then review it, then test it. The problem: the same context that wrote the code was the one deciding it was fine. So I split the work into subagents with fixed roles.

**The three agents**

- **frontend**: builds mobile first, with visible focus, AA contrast and `prefers-reduced-motion`. Opens the page and checks the console before handing off.
- **reviewer**: reads the `git diff` only. Every finding has file, line and a concrete failing scenario. It has no Edit or Write tools on purpose, so it can't "fix" things it misread. Runs on Sonnet, since reading and judging doesn't need the bigger model.
- **qa**: runs build and tests, opens the page at 390px and 1440px, writes bug reports with repro steps.

**The skill that gives them eyes**

`verificacao-visual` is a small Node + Playwright script:

```
node .claude/skills/verificacao-visual/olhar.cjs index.html
```

It opens the page in four setups (phone/desktop × light/dark), saves screenshots and a JSON report with console errors, failed requests, horizontal scroll and text under 11px, and exits with code 1 if anything is wrong. Software WebGL is on, so even Three.js scenes render in a GPU-less container. The agent then reads the screenshots as images.

**What changed for me**

- A reviewer with a clean context catches things the author agent keeps rationalizing.
- "Opens with no console errors at 390px" works as acceptance criteria. "Looks good" doesn't.
- It costs more tokens than one chat. For small changes I call one agent, not three.

**Caveats**

- The agent files and the skill are written in Brazilian Portuguese. Claude follows them fine; replies come in Portuguese unless you tell it otherwise in your `CLAUDE.md`.
- Needs Claude Code (your own subscription) and Playwright. Not affiliated with Anthropic.

Repo: [LINK_LITE_REPO]

How do you handle review and testing for code that comes from Claude? Do you keep it in one session or split it up?
