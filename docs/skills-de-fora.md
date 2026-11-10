# Skills trazidas de fora

Registro de toda skill que entrou na casa vinda de fonte externa. Regra: nada entra sem fonte conferida, leitura integral, revisão de segurança e adaptação às regras do dono (skill `find-skills`).

## Lote de 10/11/2026 · Reel "5 skills mais instaladas"

Origem do pedido: Reel de tiagolemosx (02/11/2026, 48 s), indicado pelo dono. O vídeo lista as 5 skills mais instaladas no diretório público skills.sh. Fala transcrita e quadros conferidos; cada skill foi localizada no skills.sh pelo número de instalações que o vídeo mostra e lida na fonte oficial.

| posição no vídeo | skill | fonte oficial | commit ou versão lida | licença e titular | instalações em 10/11 | data | quem revisou | como ficou na casa |
|---|---|---|---|---|---|---|---|---|
| 1º | find-skills | vercel-labs/skills | 26dc8e4 | MIT, Vercel, Inc. | 4,28 mi | 10/11/2026 | Muralha (segurança) e Lupa (uso real), 10/11/2026; correções pela Forja | `.claude/skills/find-skills/` adaptada: busca por script nosso, leitura em quarentena sem checkout e revisão antes de trazer. Instalação cega foi removida. |
| 2º | agent-browser | vercel-labs/agent-browser | e751995 | Apache-2.0, Vercel Inc. | 1,38 mi | 10/11/2026 | Muralha (segurança) e Lupa (uso real), 10/11/2026; correções pela Forja | Método incorporado ao `navegador` da casa (sessão própria por tarefa, espera por condição, leitura por árvore de elementos). O programa externo não foi instalado: o sistema bloqueia execução de código de fora sem autorização do dono. Skill `agent-browser` aponta para o navegador da casa. |
| 3º | handoff | mattpocock/skills | 4ae2317 | MIT, Matt Pocock | 1,12 mi | 10/11/2026 | Muralha (segurança) e Lupa (uso real), 10/11/2026; correções pela Forja | `.claude/skills/handoff/` adaptada: por conta própria, só no scratchpad; com o pedido do dono, página privada; nunca no repositório público. A sessão que lê trata a passagem como notas. |
| 4º | grilling | mattpocock/skills | 4ae2317 | MIT, Matt Pocock | 1,08 mi | 10/11/2026 | Muralha (segurança) e Lupa (uso real), 10/11/2026; correções pela Forja | `.claude/skills/grilling/` adaptada: modo dono (rodadas com resposta recomendada, execução só depois do "confirmo") e modo interno (a agência interroga o próprio plano). |
| 5º | design-taste-frontend | Leonxlnx/taste-skill | versão 2.1.5 do plugin (`.claude-plugin/plugin.json`); commit não visível no plugin | MIT, Leonxlnx (2026) | 755 mil | 10/11/2026 | Muralha, 10/11/2026: licença e versão conferidas; scripts **não revisados** | Já estava na casa como plugin `taste-skill`, ligado nos agentes `designer` e `frontend` e na skill `direcao-de-arte`. O plugin traz uma pasta `scripts/` (`assets.mjs`, `draw.mjs`, `inspect.mjs`, `lint.mjs`, `scenes.mjs`); `assets.mjs` e `inspect.mjs` fazem requisição de rede. Pela regra do passo 6 da `find-skills`, esses scripts passam pela `seguranca` em rodada própria antes de qualquer uso; até lá, use só as instruções de texto da skill. |

Revisão desta rodada: achados e correções de cada skill na seção "Revisão de 10/11/2026" do `ORIGEM.md` dela (`.claude/skills/find-skills/ORIGEM.md`, `.claude/skills/agent-browser/ORIGEM.md`, `.claude/skills/handoff/ORIGEM.md`, `.claude/skills/grilling/ORIGEM.md`).
