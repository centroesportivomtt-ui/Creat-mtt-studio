# Origem

- Skill original: `founder-consumer` (com `panel.py`), do pacote founder-skill de Jake Schincariol.
- Fonte: https://github.com/Jakeschincariol/founder-skill, pasta `skills/founder-consumer/`, commit `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d` (06/10/2026, commit único "v1.0").
- Licença: MIT, Copyright (c) 2026 Jake Schincariol. Texto integral abaixo e em `LICENSE` nesta pasta.
- Como chegou aqui: Reel do perfil @erickcastilio.ia sobre o pacote founder-skill, mandado pelo dono em 12/11/2026. Estudo integral pelo Radar no mesmo dia (30 arquivos lidos, 29 testes do original rodados em cópia temporária com `python3 -I`).
- Reputação: estrelas, forks e issues **não verificados** (API do GitHub negada na sessão). Repositório de 5 semanas com um commit só: por isso entrou copiado e revisado, nunca instalado.
- Nada do pacote foi instalado nem executado na casa. A instalação do README ("cole o link e diga install skill", `/plugin marketplace add`) não foi usada.

## O que mudou e por quê

| mudança | por quê |
|---|---|
| Nome `painel-de-objecoes` e saída sem taxa de compra (nem global nem por grupo em porcentagem; só contagem com o rótulo "não é taxa de compra") | O valor real é achar objeção, segmento, palavra e gancho. Taxa simulada parece dado e um agente cansado repete só o número (risco de falsa precisão do estudo). |
| Padrão de 20 compradores, teto de 100 | Poupa cota; 100 só sob pedido. |
| Comprador responde só com o JSON, sem ferramenta; o script arquiva com `salvar` e valida antes de gravar | O original manda subagente `general-purpose` gravar arquivo e sugere ligar "aceitar edições" para 100 aprovações. Aqui ninguém grava fora da pasta e não há aprovação em massa. |
| `--dir` obrigatório, sem padrão, e recusado (saída 2) se estiver dentro do repositório da casa, também por atalho (`os.path.realpath`, mesma checagem do `ingerir.py`); `contar` só grava dentro da pasta (saiu o `--out` livre) | Perfil de cliente não cai no repositório público por esquecimento; nenhuma escrita em caminho arbitrário. Até a revisão da Muralha de 12/11 o texto prometia isso sem o código checar; a checagem e o teste entraram na mesma rodada. |
| `iniciar` recusa pasta com resposta arquivada e apaga briefing antigo; resposta guardada e contada só com as chaves do briefing | Achados do Crivo de 12/11: resposta da oferta antiga era contada como da nova, e chave a mais do comprador (`segmento`, `renda_mensal`) corrompia o agrupamento e quebrava a faixa de renda. |
| Briefing em português do Brasil, com "você chegou por um anúncio há 30 segundos" e a oferta e os ganchos marcados como dado, não instrução | Direção de escala da casa (desconhecido de outra cidade) e defesa contra texto de página copiado para a oferta. |
| Ganchos: 2 a 4 aberturas candidatas, cada comprador escolhe uma ou "nenhum", contagem por segmento; campo "frase que me pararia" | Para testar a abertura de um anúncio ou vídeo antes de editar (pedido do dono). Não existia no original. |
| Saíram as 4 respostas de preço (Van Westendorp) | Preço com resposta simulada só repete o que o modelo acha normal; o método fica guardado para pesquisa real (ver `docs/skills-de-fora.md`, lote de 12/11). |
| Renda mensal em reais, com `frase_renda` (faturamento do negócio para dono), nomes brasileiros, motivos em português | Público da casa. |
| Validação mais dura: renda só em número, texto até 600 caracteres, motivo e objeção não vazios, gancho só entre as letras dadas | Resposta quebrada não entra na contagem. |
| Exemplo fictício de salão no lugar do café de Toronto | Repositório público: só caso fictício marcado. |

## Revisão de 12/11/2026 (Forja)

- `panel.py` lido linha a linha antes de adaptar: só biblioteca padrão (argparse, json, os, random, sys); sem rede, sem subprocess, eval, exec, pickle; o único `os.remove` apagava o arquivo que o próprio `save` acabara de gravar e reprovar. Na versão da casa, `salvar` valida **antes** de gravar, e o `os.remove` saiu.
- O briefing é montado com `str.format` recebendo os dados como argumentos (texto da oferta com chaves não vira modelo); `frase_renda` usa troca simples de `{valor}`.
- 13 testes próprios (`testes/test_painel.py`, adaptados dos originais), rodados com `python3 -I` a partir da pasta da casa: todos passam.
- Pendente antes do primeiro uso real: revisão da Muralha (segurança) e do Crivo (código), como manda a `find-skills`, e a primeira rodada de verdade com a Lupa conferindo.

## Licença do original (MIT), texto integral

MIT License

Copyright (c) 2026 Jake Schincariol

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
