# X · thread in English (5 posts)

**Horário sugerido:** terça ou quarta, 10h ET (11h ou 12h em Brasília, conforme o horário de verão dos EUA). Publique num dia diferente do fio em português.
**Onde publicar:** https://x.com > Post. Escreva o post 1 e use "+" para encadear os outros. Anexe ao post 1 um print da sede 3D ou o vídeo de 30 s.
**Contagem:** até 280 caracteres por post, contados abaixo. O X conta todo link como 23 caracteres; os marcadores [LINK_...] foram contados pelo tamanho literal.

---

**1/5** (239 characters)

I stopped asking one Claude Code session to do everything.

Now the work is split into subagents with fixed roles: one builds, one reviews the diff, one tests in a real browser.

The reviewer can't even edit files. It only points. (thread)

**2/5** (230 characters)

Why split: the session that wrote the code tends to agree with itself.

An agent with a clean context, reading only the git diff, catches more. Every finding comes with file, line and the scenario that breaks. No scenario, no bug.

**3/5** (243 characters)

QA has eyes: a Playwright script opens the page on phone and desktop, light and dark, saves screenshots and flags console errors, horizontal scroll and text under 11px.

If anything fails, it exits with code 1. The agent can't just say "done".

**4/5** (200 characters)

The cost: more tokens than a single chat. For small edits I call one agent. For a new page, all three.

None of this is official Anthropic stuff. It's plain .md files any Claude Code account can read.

**5/5** (252 characters)

I open-sourced the minimal version: 3 agents + the visual-check skill, MIT license. Agent files are in Portuguese; Claude handles them fine.

[LINK_LITE_REPO]

The 15-agent version with the wave workflow and a 3D HQ is paid, and lives here: [LINK_LOJA]
