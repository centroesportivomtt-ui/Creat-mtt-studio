# Publicar o Editor creat.MTT

Tudo roda num servidor só, com HTTPS automático. O seu computador não processa nada.

## O que o dono precisa ter (uma vez)
1. **Um servidor na nuvem** com Docker: recomendado 8 núcleos e 16 GB de memória, 200 GB de disco (o render do motion e o 4K pedem CPU).
2. **Um domínio** (ex.: `editor.creatmtt.com.br`) apontando para o IP do servidor (registro A).
3. **Chave da API da Anthropic** só para o editor, com teto mensal em console.anthropic.com → Limits.
4. Opcional: **Cloudflare R2** para guardar os vídeos fora do disco do servidor.

## Subir (quem tiver acesso ao servidor)
```bash
git clone https://github.com/centroesportivomtt-ui/creat-mtt-studio && cd creat-mtt-studio/projetos/editor-creat/deploy
cp .env.example .env    # preencher domínio, senha, tokens e chave
docker compose up -d --build
```
O Caddy pede o certificado HTTPS sozinho. Depois é só abrir o domínio no celular e entrar com a senha da casa.

## O que fica guardado
- Volume `dados`: projetos, vídeos e banco do motor.
- Volume `memoria`: regras, casos e modos (o caderno da casa). Na primeira subida ele nasce com o que está no repositório.
