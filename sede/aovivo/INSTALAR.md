# Sede ao vivo: instalação

Os agentes avisam o que estão fazendo no momento em que fazem, e a tela recebe cada aviso em menos de 1 segundo, 24 horas por dia. Não há agente lendo em rodadas e não se gasta cota.

```
sessão do Claude Code ── gancho (hook.sh, em segundo plano) ──► Supabase (tabela eventos)
                                                                     │ tempo real
GitHub Pages: site/ao-vivo/ ◄────────────────────────────────────────┘ (login por e-mail)
```

## 1. Supabase (5 min, plano gratuito)

1. Crie uma conta em https://supabase.com e um projeto. A região São Paulo deixa a resposta mais rápida.
2. Em **SQL Editor**, rode o arquivo `sede/aovivo/schema.sql` inteiro. O resultado mostra o **token dos ganchos**: guarde.
3. Ainda no SQL Editor, rode a linha com o seu e-mail, em minúsculas:
   `insert into public.donos (email) values ('seu-email');`
4. **Authentication → Users → Add user → Send invitation** com o mesmo e-mail.
5. **Authentication → Sign In / Providers → Email**: desligue *Allow new users to sign up*. Assim ninguém mais cria conta.
6. **Authentication → URL Configuration**: em *Site URL* e *Redirect URLs*, coloque o endereço exato, sem curinga:
   `https://centroesportivomtt-ui.github.io/Creat-mtt-studio/ao-vivo/`
7. **Project Settings → API Keys**: pegue a URL do projeto e a chave **publishable** (`sb_publishable_...`). As duas podem ficar públicas.

A chave **secret** não é usada em lugar nenhum. Os ganchos só têm o token, que serve apenas para inserir eventos: não lê, não apaga e não mexe em quem tem acesso.

## 2. Tela (GitHub Pages)

1. Preencha `site/ao-vivo/config.js` com a URL e a chave publishable.
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. A cada push na `main`, o fluxo `.github/workflows/sede-ao-vivo.yml` testa (lógica, higiene dos ganchos e tela) e publica.
   - Demonstração com dados fictícios: `.../ao-vivo/?demo`.

## 3. Ganchos nas sessões

**No ambiente da nuvem** (vale para todas as sessões desse ambiente):
- variáveis `CREAT_AOVIVO_URL=https://xxxx.supabase.co` e `CREAT_AOVIVO_PUB=sb_publishable_...`;
- segredo de rede para o host `xxxx.supabase.co`, cabeçalho `x-sede-token`, com o valor do token. O proxy injeta o token, e ele nunca fica em arquivo.

**Neste repositório:** junte `sede/aovivo/hooks.json` ao `.claude/settings.json`.

**Em sessões de outros repositórios** (ex.: edição de vídeo): copie `hook.sh` e `evento.py` para `~/.claude/sede-aovivo/` pelo setup script do ambiente. Depois aponte os ganchos de `~/.claude/settings.json` para esse caminho.

**Fora da nuvem:** exporte também `CREAT_AOVIVO_TOKEN`. Ele vai para o curl pela entrada padrão, nunca pela linha de comando.

Sem `CREAT_AOVIVO_URL` e `CREAT_AOVIVO_PUB`, o gancho sai na hora e não faz nada.

## Sessões antigas (abertas antes dos ganchos)

Uma sessão que começou antes de os ganchos existirem não envia nada. Para ela aparecer sem recomeçar, rode a ponte dentro dela:

```
mkdir -p /tmp/sede-ponte && cd /tmp/sede-ponte
B=https://raw.githubusercontent.com/centroesportivomtt-ui/Creat-mtt-studio/main/sede/aovivo
curl -fsSLO $B/ponte.py && curl -fsSLO $B/evento.py
(setsid nohup python3 -I ponte.py --titulo "Nome da sessão" >/dev/null 2>&1 &)
```

`ponte.py` lê o registro local da sessão conforme ele cresce e envia os mesmos eventos dos ganchos. Não usa IA nem gasta cota. Para sozinha em 12 horas e se recusa a rodar onde os ganchos já estão instalados, para não duplicar.

## O que sai de cada sessão (LGPD)

`evento.py` funciona por lista branca e envia só isto:

| campo | conteúdo |
|---|---|
| sessão | id da sessão, o título dela e o nome da pasta do projeto |
| agente | id e tipo do subagente (ex.: `frontend`) |
| evento | início e fim de sessão, pedido recebido, ferramenta usada, início e fim de subagente, fim da vez |
| ferramenta | nome (ex.: `Edit`, `Bash`) |
| resumo | Bash: a descrição que o agente deu, ou só o programa e o subcomando (ex.: `git commit`), nunca o comando inteiro. Arquivos: só o nome. Busca: o termo. |

Regras de proteção:
- Todo texto passa por máscara de segredos: tokens, chaves, senhas e URLs com credencial.
- Também passa por máscara de dados pessoais: e-mail, CPF, CNPJ e telefone.
- O texto dos seus pedidos **nunca** sai da sessão. O título da sessão sai, porque é o que identifica o trabalho na tela. Nomes de cliente podem aparecer nele.

O Supabase é o operador dos dados e pode guardá-los fora do Brasil, conforme a região do projeto. O banco guarda 7 dias, e só os e-mails cadastrados em `donos` leem. Em lugar público, use o Modo TV sabendo que os títulos das sessões ficam visíveis.
