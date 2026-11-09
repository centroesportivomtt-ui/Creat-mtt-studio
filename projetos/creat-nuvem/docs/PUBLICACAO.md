# Publicação no app Base44 "Creat Nuvem"

App `6aefffe66b684db9404b1994`, no ar em https://creat-nuvem-404b1994.base44.app. Os arquivos estáticos ficam em `public/` do app:

| o quê | onde, no app | endereço |
|---|---|---|
| vitrine Porta Aberta (`dist/publico/`, montada por `scripts/montar-publico.cjs`) | `public/<caminhos da vitrine>` | `https://creat-nuvem-404b1994.base44.app/` |
| site de cliente ou demo (`dist/<slug>/`, gerado por `produzir.mjs` / `build-site.cjs`) | `public/sites/<slug>/` | `https://creat-nuvem-404b1994.base44.app/sites/<slug>/` |

**Regra de ouro: a publicação da vitrine nunca apaga `public/sites/`.** A pasta tem os sites dos clientes, e eles não existem em `dist/publico/`. Por isso não rode `rm -rf public/*`, `rm -rf public/` nem nenhum `rsync --delete` em `public/`. Apague só os caminhos da lista abaixo, um por um.

Quem executa: o chat principal, pelos MCPs do Google Drive e do Base44. Os agentes só preparam o zip e o passo a passo. Deploy em produção só acontece com o ok do Marcos.

## 1. Site de cliente ou demo

A partir de `projetos/creat-nuvem/`:

```bash
npm run produzir -- --pedido <pedido.txt|.json>      # gera sites/<slug>/ e dist/<slug>/
npm run publicar-site -- --slug <slug>               # confere, testa, zipa e imprime o passo a passo
npm run publicar-site -- --slug <slug> --demo        # demo: exige a faixa "demonstração · nome fictício" e o WhatsApp 5575981151202
```

`publicar-site.cjs` faz o seguinte:
1. Confere `dist/<slug>/`: é um build (`tenant.json`, `index.html`, `tenant.js`, `motor/v1/`), o slug bate com o pedido, não há link simbólico e só há arquivos da lista branca (index, tenant, robots, sitemap, motor). Se houver `custo.json`, RELATORIO ou qualquer outro arquivo interno, o script recusa.
2. Roda `testar-site.cjs`: Chromium a 390 px, console limpo, sem rolagem lateral, texto de pelo menos 11 px e todos os wa.me com o número do tenant.
3. Grava `site-<slug>.zip` com `sites/<slug>/...` dentro. O mtime é fixo, então o mesmo build dá o mesmo sha256. O script relê o zip para conferir. Destino: `--destino`, ou `CREAT_PUBLICAR_DESTINO`, ou o scratchpad da sessão.
4. Imprime o sha256 e os passos abaixo já preenchidos (com `--json`, imprime em formato de máquina).

Códigos de saída: 0 ok · 1 entrada ou dist inválido · 2 ambiente · 3 teste do site falhou.

Passos do chat principal (o script imprime cada um com o hash e o caminho certos):

1. **Drive `create_file`**: title `site-<slug>-<sha8>.zip`, `contentMimeType` `application/zip`, `disableConversionToGoogleType` true, `parentId` `1C5Msox1Q-zVEDMfneH2yU9GUrNbPW1zN` (pasta "Creat Nuvem") e `base64Content` `sha256:<hash>:<caminho absoluto do zip>`. Guarde o id.
2. **Drive `share_file`**: `fileId` = o id, `permissionId` `anyoneWithLink`, `role` `reader`.
3. **Base44 `run_command`** (na raiz do app):
   ```bash
   rm -rf /tmp/s /tmp/s.zip && curl -sSL -o /tmp/s.zip "https://drive.google.com/uc?export=download&id=<id>" \
   && echo "<hash>  /tmp/s.zip" | sha256sum -c - && python3 -m zipfile -e /tmp/s.zip /tmp/s \
   && test -f /tmp/s/sites/<slug>/index.html && mkdir -p public/sites && rm -rf public/sites/<slug> \
   && cp -r /tmp/s/sites/<slug> public/sites/ && ls public/sites/<slug>
   ```
   Se o `sha256sum -c` falhar, o Drive devolveu outra coisa (link ainda privado ou página de aviso). Pare e refaça o passo 2. O `rm -rf` só atinge `public/sites/<slug>`, nunca `public/sites`.
4. **Base44 `run_command`**: `git log --oneline -1`. Ele precisa mostrar o auto-commit com `public/sites/<slug>`. Se não mostrar, não siga.
5. **Base44 `create_checkpoint`** com o nome `site <slug> <sha8>`.
6. **Deploy** do app, com o ok do Marcos. Depois confira: `curl -sI https://creat-nuvem-404b1994.base44.app/sites/<slug>/` precisa voltar 200 e a página precisa ter pelo menos um `wa.me`. Abra também sem a barra final (`/sites/<slug>`). Os caminhos do site são relativos (`motor/...`, `tenant.js`), então sem a barra eles só funcionam se o host redirecionar.
7. **Drive `trash_file`** no zip temporário.

Para tirar um site do ar: `rm -rf public/sites/<slug>`, depois os passos 4 a 6.

Endereço padrão: `build-site.cjs` e `produzir.mjs` gravam canonical, sitemap e JSON-LD com `https://creat-nuvem-404b1994.base44.app/sites/<slug>/` e o rodapé com a home `https://creat-nuvem-404b1994.base44.app/`. As variáveis `CREAT_URL_SITES` (com `{slug}`) e `CREAT_HOME` mudam esses endereços, e `0` desliga cada um. O pacote SAIR nunca herda esses endereços.

## 2. Vitrine

A partir de `projetos/creat-nuvem/`:

```bash
node scripts/checar-placeholders.cjs     # avisa dos links que faltam
node scripts/montar-publico.cjs          # monta dist/publico/ e imprime "vitrine (topo de public/): ..."
CREAT_TESTE_TMP=/tmp npm test
```

Leve `dist/publico/` ao app pelo mesmo caminho dos sites: zip, Drive, `share_file`, `curl` e `sha256sum -c`. Depois, no Base44, **apague só os caminhos de topo da vitrine** e copie por cima.

Lista atual dos caminhos de topo da vitrine (09/11/2026; é a lista `ENTRA` de `montar-publico.cjs` mais `sede`):

```
404.html _headers abrir assets bastidores checkout.config.js conteudo dados index.html motor obrigado previa privacidade ritual sede termos
```

```bash
# no Base44, raiz do app, com a vitrine descompactada de modo que exista <origem>/dist/publico/
cd public && rm -rf 404.html _headers abrir assets bastidores checkout.config.js conteudo dados \
  index.html motor obrigado previa privacidade ritual sede termos && cd .. \
&& cp -r <origem>/dist/publico/. public/ && ls public public/sites 2>/dev/null
```

- Antes de rodar, compare a lista com a linha `vitrine (topo de public/)` que `montar-publico.cjs` imprimiu. Se for diferente, atualize este documento primeiro. Item novo entra na lista. Item que saiu continua na lista por uma publicação, para ser apagado, e depois sai.
- `montar-publico.cjs` falha se a vitrine tiver `sites/` na raiz, porque esse caminho apagaria os sites dos clientes.
- Nada fora da lista é tocado: `public/sites/` e os arquivos do template do Base44 continuam onde estão.
- Depois do cp: `git log --oneline -1` (auto-commit), `create_checkpoint` ("vitrine <data>") e deploy, com o ok do Marcos. Confira se `/`, `/abrir/` e `/sites/<um slug publicado>/` respondem 200.

## O que o Base44 não aplica

O `_headers` (CSP e cache) é formato da Cloudflare, e o Base44 não o lê. No Base44 a vitrine e os sites ficam sem esses cabeçalhos. Se a CSP precisar valer, o caminho é o deploy da Cloudflare (`wrangler.toml`) ou a configuração de cabeçalhos do Base44, se existir. `robots.txt` e `sitemap.xml` de cada site ficam em `/sites/<slug>/`. O Google só lê o `robots.txt` da raiz, então para indexar os sites é preciso um `sitemap.xml` na raiz da vitrine que liste cada `/sites/<slug>/` (pendência registrada no RELATORIO).
