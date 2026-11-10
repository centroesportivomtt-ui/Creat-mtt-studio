---
name: handoff
description: Passagem de bastão (handoff). Resume a conversa atual em um documento curto para outra conversa ou outro agente continuar sem perder nada. Use quando o dono disser "handoff", "passa o bastão", "resume tudo", "vou continuar em outra conversa", "a conversa ficou longa", e por conta própria quando uma frente de trabalho vai passar para outra sessão, para uma tarefa agendada ou para o dia seguinte.
---

# Handoff: a próxima conversa começa sabendo tudo

Vem da skill `handoff` de Matt Pocock (mattpocock/skills, licença MIT, ver `ORIGEM.md`), adaptada à casa.

## Onde o documento fica

- **Nunca no repositório.** Ele é público, e a passagem costuma ter gasto, cliente e ponto fraco.
- Grave o arquivo no scratchpad da sessão e publique como **página privada** (Artifact). O link é o que atravessa de uma conversa para a outra: a sessão nova lê a página pelo link.
- Sem a ferramenta de página: salve no Dropbox do dono, em `/Pasta da equipe Mttcreatt/passagens/AAAA-MM-DD-<assunto>.md`.
- Entregue ao dono em uma linha: o link e a frase pronta para colar na conversa nova, "Leia esta passagem e continue daqui: <link>".

## O que entra (uma a duas páginas, nada além)

1. **Para que serve a próxima sessão.** Uma frase. Se o dono disse o foco, é o foco dele.
2. **Estado agora.** O que está no ar, o que está pausado, o que está rodando. Para cada item: verificado (como, quando) ou não verificado.
3. **Decisões tomadas e o porquê.** Só as que mudam o que o próximo faz. Inclua as ordens permanentes do dono que nasceram nesta conversa.
4. **Pendências.** Cada uma com dono (agência ou Marcos), o próximo passo exato e o que a destrava.
5. **Armadilhas já pisadas.** Erros desta conversa e a trava que ficou (comando, script, regra).
6. **Onde está cada coisa.** Caminho de arquivo, commit, link, identificador de campanha. **Aponte, não copie:** plano, relatório, ADR, commit e diff já existem; a passagem só diz onde estão.
7. **Skills sugeridas.** Quais skills a próxima sessão deve carregar antes de agir (sempre `consciencia`; mais as do assunto).
8. **Primeira ação.** O primeiro comando ou a primeira leitura da sessão nova.

## O que nunca entra

- Chave, token, senha, link com credencial. Escreva "existe um segredo em <lugar>", nunca o valor.
- Telefone, e-mail ou nome de terceiros. Use contagem.
- Valor de saldo da conta de anúncios (regra do dono).
- Opinião sem evidência e histórico que não muda nenhuma decisão.

## Antes de entregar

- Releia como se você fosse a sessão nova, sem memória: dá para continuar só com isto e os lugares apontados? Se algum passo depende de "lembrar", escreva.
- Confira cada link e cada caminho citado. Passagem com link quebrado é pior que nenhuma.
- Diga ao dono o que a passagem **não** cobre.

## Modelo

```
# Passagem · <assunto> · <data e hora, Bahia>

Para que serve a próxima sessão: ...

## Estado agora
- <item> · verificado em <quando> por <como> | não verificado

## Decisões e porquê
- ...

## Pendências
- [agência] ... próximo passo: ...
- [Marcos] ... o que ele clica: ...

## Armadilhas e travas
- ...

## Onde está
- ...

## Skills sugeridas
- consciencia, ...

## Primeira ação
...
```
