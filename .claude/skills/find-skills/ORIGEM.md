# Origem

- Skill original: `find-skills`, da Vercel Labs.
- Fonte: https://github.com/vercel-labs/skills, pasta `skills/find-skills/`, commit `26dc8e4` (10/11/2026).
- Diretório público: https://skills.sh/vercel-labs/skills/find-skills
- Como chegou aqui: Reel "5 skills mais instaladas" (tiagolemosx, 02/11/2026), indicado pelo dono em 10/11/2026.
- O que mudou: tradução para português do Brasil; a busca usa o endereço público de pesquisa do skills.sh por um script nosso, sem instalar o programa `skills`; instalação direta foi trocada por leitura em quarentena, revisão de segurança, adaptação e registro.

## Revisão de 10/11/2026
Revisão de segurança (Muralha) e de uso real (Lupa). Correções aplicadas pela Forja no mesmo dia:
- Quarentena: clone sem checkout e leitura por `git show`, para que `CLAUDE.md`, `AGENTS.md` e `.claude/` do repositório de fora nunca entrem como instrução; dono e repositório validados antes de qualquer comando.
- `buscar.cjs`: saída entre marcas de dado não confiável e sem caractere de controle; fonte e link só com formato válido (nada de `..`); erro da API sai com código 1; ordem de relevância do skills.sh por padrão e `--por-instalacoes` (pede 50, ordena, corta); `--limite=N` aceito e valor ruim recusado com código 2; filtro de dado pessoal pega telefone com máscara, CPF com pontos e domínio.
- `SKILL.md`: busca em inglês com 2 ou 3 variações; critério de estrelas e atividade do original de volta; licença lida antes do clone pelo endereço bruto do GitHub.

## Licença do original (MIT), texto integral

MIT License

Copyright (c) 2026 Vercel, Inc.

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
