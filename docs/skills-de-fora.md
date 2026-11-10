# Skills trazidas de fora

Registro de toda skill que entrou na casa vinda de fonte externa. Regra: nada entra sem fonte conferida, leitura integral, revisão de segurança e adaptação às regras do dono (skill `find-skills`).

## Lote de 10/11/2026 · Reel "5 skills mais instaladas"

Origem do pedido: Reel de tiagolemosx (02/11/2026, 48 s), indicado pelo dono. O vídeo lista as 5 skills mais instaladas no diretório público skills.sh. Fala transcrita e quadros conferidos; cada skill foi localizada no skills.sh pelo número de instalações que o vídeo mostra e lida na fonte oficial.

| posição no vídeo | skill | fonte oficial | commit lido | licença | instalações em 10/11 | como ficou na casa |
|---|---|---|---|---|---|---|
| 1º | find-skills | vercel-labs/skills | 26dc8e4 | MIT | 4,28 mi | `.claude/skills/find-skills/` adaptada: busca por script nosso, leitura em quarentena e revisão antes de trazer. Instalação cega foi removida. |
| 2º | agent-browser | vercel-labs/agent-browser | e751995 | Apache-2.0 | 1,38 mi | Método incorporado ao `navegador` da casa (sessão própria por tarefa, espera por condição, leitura por árvore de elementos). O programa externo não foi instalado: o sistema bloqueia execução de código de fora sem autorização do dono. Skill `agent-browser` aponta para o navegador da casa. |
| 3º | handoff | mattpocock/skills | 4ae2317 | MIT | 1,12 mi | `.claude/skills/handoff/` adaptada: passagem em página privada, nunca no repositório público. |
| 4º | grilling | mattpocock/skills | 4ae2317 | MIT | 1,08 mi | `.claude/skills/grilling/` adaptada: modo dono (rodadas com resposta recomendada) e modo interno (a agência interroga o próprio plano). |
| 5º | design-taste-frontend | leonxlnx/taste-skill | plugin da sessão | conferir no plugin | 755 mil | Já estava na casa como plugin `taste-skill`, ligado nos agentes `designer` e `frontend` e na skill `direcao-de-arte`. |

Revisão: ver o relatório da rodada de 10/11 (segurança, código e uso real de cada skill).
