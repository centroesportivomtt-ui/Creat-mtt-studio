# Origem

- Skill original: `grilling` (e o atalho `grill-me`), de Matt Pocock.
- Fonte: https://github.com/mattpocock/skills, pasta `skills/productivity/grilling/`, commit `4ae2317` (31/10/2026).
- Diretório público: https://skills.sh/mattpocock/skills/grilling
- Como chegou aqui: Reel "5 skills mais instaladas" (tiagolemosx, 02/11/2026), indicado pelo dono em 10/11/2026.
- O que mudou: tradução para português do Brasil, formato sem emoji, limite de 5 perguntas por rodada, modo interno (a agência interroga o próprio plano) e a lista de decisões que só o dono toma.

## Revisão de 10/11/2026
Revisão de segurança (Muralha) e de uso real (Lupa). Correções aplicadas pela Forja no mesmo dia:
- Volta a trava do original ("não aja até o usuário confirmar o entendimento"): no modo dono, nada é executado sem o "confirmo"; se ele parar de responder, nada anda.
- Caixa "só do dono" ampliada: permissões e configuração, instalar ou rodar código de fora, publicar ou ligar tráfego pago, enviar algo a terceiros, git push.
- Volta o subagente de contexto limpo para buscar fato.
- Modo interno com regras para agente único, formato F/D no `RELATORIO.md`, documentos em conflito, decisão mista e fato sem fonte.
- Quarta rodada: no modo dono, fronteira com mais de 5 perguntas manda as 5 que mais destravam o plano, e as outras vão na rodada seguinte; a rodada das decisões só do dono continua inteira.

## Licença do original (MIT), texto integral

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
