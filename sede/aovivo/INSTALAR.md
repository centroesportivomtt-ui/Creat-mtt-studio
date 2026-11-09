# Sede ao vivo: instalação

Os agentes avisam o que estão fazendo no momento em que fazem, e a tela recebe cada aviso em menos de 1 segundo, 24 horas por dia. Não há agente lendo em rodadas e não se gasta cota.

```
sessão do Claude Code ── gancho (hook.sh, em segundo plano) ──► Supabase (tabela eventos)
                                                                     │ tempo real
GitHub Pages: site/ao-vivo/ ◄────────────────────────────────────────┘ (login por e-mail)
```

## 1. Supabase (5 min, plano gratuito)

1. Crie uma conta em https://supabase.com e um projeto. A região São Paulo deixa a resposta mais rápida.
2. Em **SQL Editor**, rode o arquivo `sede/aovivo/schema.sql` inteiro. Depois rode a última linha com o seu e-mail:
   `insert into public.donos (email) values ('seu-email');`
3. Em **Authentication → URL Configuration**, coloque o endereço da tela em *Site URL* e em *Redirect URLs*:
   `https://centroesportivomtt-ui.github.io/Creat-mtt-studio/ao-vivo/`
4. Em **Project Settings → API Keys**, pegue três coisas:
   - a URL do projeto (`https://xxxx.supabase.co`);
   - a chave **publishable** (`sb_publishable_...`), que vai no `site/ao-vivo/config.js` e pode ficar pública;
   - a chave **secret** (`sb_secret_...`), que **nunca** entra no repositório.

## 2. Ligar a tela (GitHub Pages)

1. Preencha `site/ao-vivo/config.js` com a URL e a chave publishable.
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. A cada push na `main`, o fluxo `.github/workflows/sede-ao-vivo.yml` testa e publica a tela.
   Para ver a demonstração, que usa dados fictícios: `.../ao-vivo/?demo`.

## 3. Ligar os ganchos nas sessões

**No ambiente da nuvem** (vale para todas as sessões desse ambiente):
- variável de ambiente `CREAT_AOVIVO_URL=https://xxxx.supabase.co`;
- segredo de rede para o host `xxxx.supabase.co`, cabeçalho `apikey`, com o valor da chave secret. O proxy injeta a chave, e ela nunca fica em arquivo.

**Neste repositório:** junte o conteúdo de `sede/aovivo/hooks.json` ao `.claude/settings.json`.

**Em sessões de outros repositórios** (ex.: edição de vídeo): copie `sede/aovivo/hook.sh` e `evento.py` para `~/.claude/sede-aovivo/` pelo setup script do ambiente. Depois aponte os ganchos de `~/.claude/settings.json` para esse caminho.

Sem `CREAT_AOVIVO_URL`, o gancho sai na hora e não faz nada.

## O que sai da sessão (higiene)

`evento.py` envia só:
- o tipo do evento;
- o nome da ferramenta;
- o nome do arquivo, sem o caminho;
- um resumo de até 140 caracteres do comando, com tokens, chaves e senhas apagados.

O texto dos seus pedidos **nunca** é enviado; registra-se só "nova mensagem do dono". O banco guarda 7 dias, e só e-mails cadastrados em `donos` conseguem ler.
