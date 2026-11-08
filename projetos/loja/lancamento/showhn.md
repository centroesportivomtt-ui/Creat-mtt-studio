# Show HN (EN)

**Horário sugerido:** terça a quinta, entre 8h e 10h ET (9h a 12h em Brasília, conforme o horário de verão dos EUA). Fique online nas 3 horas seguintes para responder.
**Onde publicar:** https://news.ycombinator.com/submit. Título no campo "title", [LINK_LITE_REPO] no campo "url", deixe "text" vazio. Logo depois de publicar, poste o primeiro comentário abaixo no próprio item.
**Regras do Show HN:** precisa ser algo que as pessoas possam testar agora (o repositório grátis cumpre isso). Nada de link de venda, nada de pedir votos.

---

## Título (77 caracteres)

Show HN: Claude Code subagents that build, review and test pages in a browser

## Primeiro comentário

Hi HN. I built this after noticing that when one Claude Code session writes a page and then "reviews" it, it mostly agrees with itself.

The repo is three subagent files and one skill, MIT licensed:

- frontend: builds mobile first and checks the console before handing off.
- reviewer: reads only the git diff, has no write tools, and must give file, line and a concrete failing scenario for each finding. It runs on Sonnet; reading and judging didn't need the bigger model in my tests.
- qa: runs the build and tests, opens the page at 390px and 1440px, and writes repro steps.

The skill is a ~120-line Node + Playwright script. It opens a page in four setups (phone/desktop, light/dark), saves screenshots, and reports console errors, failed requests, horizontal overflow and text under 11px. It exits 1 if anything is wrong, so the agent can't just declare victory. Software WebGL is enabled, so Three.js pages render in GPU-less cloud containers too.

Things I'm unsure about and would like opinions on:

1. Splitting roles costs more tokens than a single session. For small edits I still use one agent. Where do you draw that line?
2. The agent files are in Brazilian Portuguese (that's my working language). Claude follows them fine, but I'm curious if English prompts change the review quality in your experience.

It needs your own Claude Code account and Playwright. Not affiliated with Anthropic. I also sell a larger 15-agent version separately; it isn't linked here.
