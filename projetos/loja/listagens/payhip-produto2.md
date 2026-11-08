# Payhip · Produto 2 · Kit Toon 3D para Three.js

**Onde colar cada campo** (Payhip > Products > Add product > Digital product):

| campo deste arquivo | onde fica no Payhip |
|---|---|
| Título | Product name |
| Preço | Price (moeda da loja em BRL) |
| Arquivo | Upload file: `projetos/loja/dist/kit-toon-3d-threejs.zip` |
| Descrição | Description |
| Tags | Product tags, se o seu painel mostrar o campo; senão, use as palavras na descrição |
| E-mail de entrega | mensagem ao comprador que vai junto com o link de download (procure "message to buyers" ou "custom email" em Advanced options) |

---

## Título (49 caracteres)

Kit Toon 3D para Three.js: 3D com cara de desenho

## Preço

R$ 39,00

## Descrição

Deixe uma cena Three.js com cara de desenho animado: sombra em 3 tons chapados, contorno de nanquim e pulo com comprimir e esticar. O kit é um arquivo JavaScript pequeno, sem dependências além do próprio Three.js.

**O que vem no zip**

- `toon-kit.js`: uma função, `createToonKit(THREE)`, que devolve as peças do visual: material toon de 3 tons, contorno por casca invertida com cor única para a cena toda (troca no tema escuro com uma linha), atalhos para malha com contorno e esfera, versão facetada, a pose de pulo com volume constante e o tempo "em dois" (12 poses por segundo, como animação tradicional).
- Uma demo pronta: um mascote nuvem montado só com o kit, girando, que pula ao ser tocado, com tema claro e escuro e respeito ao movimento reduzido.
- `README.md` em português e inglês, com instalação em 3 passos, a API de cada função com exemplo e dicas de desempenho para celular.

**Para quem é**

Para quem já escreve Three.js e quer um visual de desenho sem montar shader, gradiente e contorno do zero. É o mesmo kit usado na sede 3D da Creat Nuvem.

**Antes de comprar**

- Requer conhecimento básico de JavaScript e Three.js (r160 ou mais novo).
- A demo já traz o Three.js r160 na pasta `vendor/` e funciona sem internet. Ela precisa de um servidor local (`npx serve .` ou `python3 -m http.server`), porque o navegador bloqueia módulos abertos por `file://`. O README mostra os dois comandos.
- O kit não depende do Claude Code. Funciona em qualquer projeto Three.js.

**Licença**

Uso pessoal e comercial permitido, inclusive em projetos de clientes. Não é permitido revender ou redistribuir o kit como produto.

Dúvidas antes de comprar: [EMAIL_SUPORTE]

## Tags

three.js, webgl, 3d, toon shading, cel shading, javascript, animação, mascote, desenho animado, creative coding

## E-mail de entrega

Assunto: Seu Kit Toon 3D chegou

Olá!

Obrigado pela compra. O link acima baixa o arquivo `kit-toon-3d-threejs.zip`.

Para começar:

1. Descompacte o zip e abra a demo (`demo/index.html`) seguindo o `README.md`. Você deve ver o mascote nuvem girando; toque nele para ele pular.
2. Copie `toon-kit.js` para o seu projeto e importe: `import { createToonKit } from './toon-kit.js'`.
3. O README traz a receita do mascote e a API de cada função.

Se algo não funcionar, escreva para [EMAIL_SUPORTE] com o navegador que você usou e a mensagem do console (F12).

Bom trabalho!
Creat Nuvem
