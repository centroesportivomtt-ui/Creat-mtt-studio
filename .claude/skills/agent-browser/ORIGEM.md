# Origem

- Skill original: `agent-browser` (guia `core`), da Vercel Labs.
- Fonte: https://github.com/vercel-labs/agent-browser, pasta `skill-data/core/` (SKILL.md e references `snapshot-refs.md`, `session-management.md`, `trust-boundaries.md`), commit `e751995`.
- Diretório público: https://skills.sh/vercel-labs/agent-browser/agent-browser
- Como chegou aqui: Reel "5 skills mais instaladas" (tiagolemosx, 02/11/2026), indicado pelo dono em 10/11/2026. 2º lugar, 1,38 mi de instalações em 10/11.
- Licença: Apache-2.0. Texto integral em `LICENCA-ORIGINAL.txt`, nesta pasta. O repositório não tem arquivo NOTICE.

## Como foi trazida
O programa `agent-browser` (binário em Rust, instalado por npm) **não foi instalado nem executado**. O sistema bloqueia código de fora sem autorização do dono. O guia foi lido como dado, e o método foi reescrito em código da casa, em `.claude/skills/navegador/navegar.cjs`, sem dependência além do Playwright que já existia. Nenhuma linha de código da Vercel foi copiada.

## O que foi incorporado
- Sessão própria por tarefa (`--sessao`, `NAVEGADOR_SESSAO`), com processo, soquete, página, números e prints separados; `sessoes` e `fechar --todas`.
- O laço abrir, ver, agir, esperar, ver de novo.
- `ver` no lugar do snapshot: elementos interativos numerados com papel, nome acessível e estado; iframes e molduras blob incluídos, com o número valendo em `clicar` e `digitar`; `--tudo`, `--dentro`, `--links`, `--max`.
- Espera por condição (`esperar-texto`, `esperar-seletor`, `esperar-url` com glob, `esperar-js`), padrão de 25 s e erro claro no estouro. Tempo fixo só para depurar.
- `ler` com `--dentro` e `--max`.
- Fronteiras de confiança: conteúdo da página marcado como dado não confiável; lista de domínios permitidos (`--so-dominios`) para navegação, requisição e WebSocket; nunca imprimir cookie, cabeçalho de autorização nem corpo de requisição.
- Clique que avisa quando o alvo está coberto e diz por quem; forçar só com `--forcar`.

## O que a casa acrescentou
- `--celular` com agente de usuário e client hints de Android real (no lugar de "HeadlessChrome", que a Meta descarta), idioma pt-BR e fuso da Bahia.
- `--rede-lenta` (4G lento do Lighthouse: 1,6 Mbps, 750 kbps, 150 ms) e `--cpu-lenta <n>`, via CDP.
- `rede` (respostas >= 400 e falhas) e `eventos "<regex>"`, que mostra o nome do evento de medição (Meta `ev`, GA4 `en`) com e-mail, telefone, `fbp` e tokens trocados por `***`.

## O que ficou de fora e por quê
- Instalar ou rodar o binário, `npx agent-browser`, `skills get`, `doctor`, `upgrade`: código externo bloqueado.
- Cofre de login (`auth save/login`), importação de cookies e `--restore`: guardaria credencial e sessão em disco. A casa não testa com conta real de ninguém.
- `--cdp`, `--auto-connect`, perfis do Chrome do usuário: o agente não dirige o navegador pessoal do dono.
- WebMCP e fluxos gravados (`flow`): experimentais, não há caso de uso na casa.
- Gravação de vídeo, HAR, streaming, perfil de desempenho, mock de rede: fora do escopo de teste de fluxo. HAR grava cabeçalhos e tokens.
- Abas múltiplas (`tab`), `drag` e `upload`: o navegador avisa a aba nova e segue na original; os demais podem entrar quando houver caso real. O `select` virou parte do `digitar`: em lista de seleção, ele escolhe a opção pelo texto.
- Bloqueio de WebRTC dentro de `--so-dominios`: o Playwright não oferece. Service workers ficam desligados quando a lista está ativa. Para isolamento de verdade, vale a regra de rede do próprio ambiente.
