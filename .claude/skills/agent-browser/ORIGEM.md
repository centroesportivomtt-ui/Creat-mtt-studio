# Origem

- Skill original: `agent-browser` (guia `core`), da Vercel Labs.
- Fonte: https://github.com/vercel-labs/agent-browser, pasta `skill-data/core/` (SKILL.md e references `snapshot-refs.md`, `session-management.md`, `trust-boundaries.md`), commit `e751995`.
- Diretório público: https://skills.sh/vercel-labs/agent-browser/agent-browser
- Como chegou aqui: Reel "5 skills mais instaladas" (tiagolemosx, 02/11/2026), indicado pelo dono em 10/11/2026. 2º lugar, 1,38 mi de instalações em 10/11.
- Licença: Apache-2.0, Copyright 2025 Vercel Inc. Texto integral em `LICENCA-ORIGINAL.txt`, nesta pasta. O repositório não tem arquivo NOTICE.

## Como foi trazida
O programa `agent-browser` (binário em Rust, instalado por npm) **não foi instalado nem executado**. O sistema bloqueia código de fora sem autorização do dono. O guia foi lido como dado, e o método foi reescrito em código da casa, em `.claude/skills/navegador/navegar.cjs`, sem dependência além do Playwright que já existia. Nenhuma linha de código da Vercel foi copiada.

## O que foi incorporado
- Sessão própria por tarefa (`--sessao`, `NAVEGADOR_SESSAO`), com processo, soquete, página, números e prints separados; `sessoes` e `fechar --todas`.
- O laço abrir, ver, agir, esperar, ver de novo.
- `ver` no lugar do snapshot: elementos interativos numerados com papel, nome acessível e estado; iframes e molduras blob incluídos, com o número valendo em `clicar` e `digitar`; `--tudo`, `--dentro`, `--links`, `--max`.
- Espera por condição (`esperar-texto`, `esperar-seletor`, `esperar-url` com glob, `esperar-js`), padrão de 25 s e erro claro no estouro. Tempo fixo só para depurar.
- `ler` com `--dentro` e `--max`.
- Fronteiras de confiança: conteúdo da página, título e endereço marcados como dado não confiável; fora das marcas, o endereço sai codificado; lista de domínios permitidos (`--so-dominios`) para navegação, requisição, WebSocket e WebRTC; nunca imprimir cabeçalho de autorização nem corpo de requisição; valor de cookie e de campo de senha trocado por `***` em toda resposta (melhor esforço); `confirm` e `prompt` recusados por padrão.
- Clique e digitação que avisam quando o alvo está coberto e dizem por quem; forçar só com `--forcar`, e só no clique.

## O que a casa acrescentou
- Rede interna fechada por padrão (loopback, faixas privadas, 169.254.x, IPv6 local, com o IP resolvido conferido); `--rede-interna` libera por um `abrir`.
- `digitar` que confere o valor que ficou no campo; `ver` que respeita diálogo modal e área inerte; `clicar` que não força alvo desabilitado, inerte ou invisível (o clique cairia no elemento de baixo) e que marca caixa ou opção desenhada pelo rótulo, como a pessoa faz.
- `--celular` com agente de usuário e client hints de Android real (no lugar de "HeadlessChrome", que a Meta descarta), idioma pt-BR e fuso da Bahia.
- `--rede-lenta` (4G lento do Lighthouse: 1,6 Mbps, 750 kbps, 150 ms) e `--cpu-lenta <n>`, via CDP.
- WebRTC: com `--so-dominios`, a casa apaga `RTCPeerConnection` da página antes de qualquer script, e o Chromium sobe com a política de IP do WebRTC em `disable_non_proxied_udp` (como faz o original). Service workers ficam desligados com a lista ativa ou com a rede interna fechada. Para isolamento de verdade, vale também a regra de rede do próprio ambiente.
- `rede` (respostas >= 400 e falhas) e `eventos "<trecho>"` (`--regex` para regex), que mostra o nome do evento de medição (Meta `ev`, GA4 `en`) com e-mail, telefone, `fbp` e tokens trocados por `***`.

## O que ficou de fora e por quê
- Instalar ou rodar o binário, `npx agent-browser`, `skills get`, `doctor`, `upgrade`: código externo bloqueado.
- Cofre de login (`auth save/login`), importação de cookies e `--restore`: guardaria credencial e sessão em disco. A casa não testa com conta real de ninguém.
- `--cdp`, `--auto-connect`, perfis do Chrome do usuário: o agente não dirige o navegador pessoal do dono.
- WebMCP e fluxos gravados (`flow`): experimentais, não há caso de uso na casa.
- Gravação de vídeo, HAR, streaming, perfil de desempenho, mock de rede: fora do escopo de teste de fluxo. HAR grava cabeçalhos e tokens.
- Abas múltiplas (`tab`), `drag` e `upload`: o navegador avisa a aba nova e segue na original; os demais podem entrar quando houver caso real. O `select` virou parte do `digitar`: em lista de seleção, ele escolhe a opção pelo texto.

## Revisão de 10/11/2026
Revisão de segurança (Muralha) e de uso real (Lupa) no navegador da casa. Correções aplicadas pela Forja no mesmo dia: título e endereço dentro das marcas de dado, `%0A` sem virar quebra de linha, `ver --links` com endereço limpo, máscara de cookie e senha em toda resposta, rede interna fechada por padrão, `--cdn-local` sem travessia de caminho, `sessoes` sem apagar sessão ocupada, `--so-dominios` só ativo depois de um `abrir` que deu certo, soquete em pasta do usuário com nome em hash, alvo inexistente falhando em 6 s, `esperar-js` que espera o objeto nascer, `ver --dentro` em iframe, servidor local sem arquivos com ponto e com conferência de Host, `print` só na pasta da sessão, `eventos` com texto simples e regex com tempo limite, `confirm` e `prompt` recusados.

Segunda e terceira rodadas da Lupa, no mesmo dia, corrigidas pela Forja: `digitar` recusa campo coberto, invisível ou com o toque bloqueado, inclusive campo dentro de moldura coberto por aviso da página de fora (a conferência atravessa as molduras); motivo certo para `visibility: hidden` e para `pointer-events: none`, no `digitar` e no `clicar`; endereço codificado em toda linha fora das marcas, com `+` da consulta virando `%20`; rótulo de moldura nas esperas entre marcas; parâmetros de mensagem livre do endereço (`text`, `body`, `msg`, `mensagem`, `message`, `subject`, `assunto`) trocados por `***` (levam a mensagem que a pessoa escreveu, como no link do WhatsApp); `ler --dentro` num iframe lê a moldura, e trecho sem texto não vira "Nada casa"; campo só leitura recusado na hora, sem esperar 6 s.

Quarta rodada da Lupa, no mesmo dia, corrigida pela Forja: `clicar --forcar` recusa alvo invisível, sem tamanho ou fora da tela, em vez de clicar na coordenada e acertar o elemento de baixo; caixa de marcar e opção desenhada (campo escondido ou com `pointer-events: none` e rótulo visível, como o `btn-check` do Bootstrap) é clicada pelo rótulo; erro do Playwright no clique sai traduzido; número e palavra concordam em toda mensagem ("1 elemento interativo", "1 vista"); `digitar` em lista de seleção recusa na hora opção que não existe ou está desabilitada.

Conferência seguinte da Lupa, no mesmo dia, corrigida pela Forja: `clicar` só usa o rótulo quando ele está visível de fato, sem `opacity: 0` nele nem num ancestral (atravessando o shadow DOM). Antes, uma caixa com rótulo dentro de um menu fechado transparente era marcada na coordenada, e a resposta era "Clicado". Agora sai com código 1, "nem com --forcar". Caixa transparente com rótulo visível é clicada pelo rótulo.

Última conferência da Lupa, no mesmo dia, corrigida pela Forja: caixa de marcar ou opção escondida com o padrão `sr-only` (1 px, recortada, como o `sr-only` do Tailwind e o `visually-hidden` do Bootstrap) é clicada pelo rótulo. Antes, a recusa dizia que o alvo estava "coberto" pelo próprio rótulo ou pela página, e não havia nada por cima. Campo visualmente oculto sem rótulo visível sai com "está escondido". Rótulo flutuante por cima de campo de texto continua valendo no `digitar`.
