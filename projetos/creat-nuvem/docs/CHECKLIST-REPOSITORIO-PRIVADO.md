# Checklist · repositório privado numa organização da Creat

Trilho (T10), 08/11/2026. Quem faz: **Marcos** (exige ser dono da conta). Tempo: cerca de 30 min.
Por que antes da Fase 2: o executor (ADR-004) vai guardar a chave da API e o token da Cloudflare neste repositório. Repositório público ou pessoal com segredo de produção não passa.

Marque cada item. Caminhos do painel do GitHub em inglês, como aparecem lá.

## 1. Antes de mexer
- [ ] Rodar a varredura de segredos (seção "Varredura" do `RELATORIO.md`) e confirmar que está limpa.
- [ ] Anotar quem tem acesso hoje: repositório > **Settings > Collaborators and teams**.
- [ ] Anotar integrações ligadas: **Settings > Webhooks**, **Settings > GitHub Apps** (ex.: Claude), **Settings > Deploy keys**.

## 2. Criar a organização
- [ ] github.com > avatar > **Your organizations > New organization** > plano **Free**. Nome sugerido: `creat-mtt-studio` (confirmar com o Marcos).
- [ ] **Settings > Authentication security**: exigir 2FA de todos os membros.
- [ ] **Settings > Member privileges**: permissão base **No permission** (ou Read); desligar criação de repositório público por membros.

## 3. Transferir o repositório
- [ ] Repositório > **Settings > General > Danger Zone > Transfer ownership** > escolher a organização.
- [ ] Conferir que o GitHub redireciona o endereço antigo; atualizar o remoto local: `git remote set-url origin git@github.com:<org>/<repo>.git`.
- [ ] Reinstalar na organização os GitHub Apps que eram da conta pessoal (Claude, Cloudflare): **Org Settings > GitHub Apps**.
- [ ] Atualizar o repositório nas sessões na nuvem do Claude Code (o caminho `owner/repo` muda).

## 4. Tornar privado
- [ ] **Settings > General > Danger Zone > Change repository visibility > Make private**.
- [ ] Atenção: estrelas e forks públicos se perdem; forks públicos existentes **continuam públicos**. Se houve fork, tratar todo segredo que já esteve no histórico como vazado (seção 5).
- [ ] Abrir o endereço numa janela anônima: deve dar 404.

## 5. Rotação de chaves (fazer mesmo que a varredura esteja limpa, se o repositório já foi público)
- [ ] **Anthropic (Console)**: console.anthropic.com > **Settings > API Keys** > criar chave nova com nome `porta-aberta-producao`, apagar a antiga. Definir limite de gasto mensal em **Settings > Limits**.
- [ ] **Cloudflare**: dash.cloudflare.com > **My Profile > API Tokens** > criar token com o modelo **Edit Cloudflare Workers**, só a conta da Creat, com validade; revogar o antigo.
- [ ] **Asaas** (Fase 2, webhook): painel > **Integrações > Webhooks** > gerar token de autenticação novo.
- [ ] **PostHog, Pixel e Clarity**: são IDs públicos por desenho (vão ao navegador); não precisam rotação.
- [ ] Colocar os segredos novos só em: GitHub > **Settings > Environments > New environment `producao`** > *Environment secrets*; ou no `.env` local (ignorado pelo git). Nunca em arquivo versionado.

## 6. Proteção do branch principal
- [ ] **Settings > Rules > Rulesets > New branch ruleset**, alvo `main` (ou o branch padrão):
  - [ ] Restrict deletions; Block force pushes.
  - [ ] Require a pull request before merging (1 aprovação; para a agência, o Marcos aprova).
  - [ ] Require status checks to pass: o job de CI que roda `checar.cjs`, `npm test` e `checar-placeholders.cjs` (este só no job de deploy, porque falha de propósito enquanto faltar link).
  - [ ] Require linear history (opcional).
- [ ] **Settings > Actions > General**: *Allow select actions* (só GitHub e verificadas) e *Workflow permissions: Read repository contents*.
- [ ] **Settings > Code security**: ligar **Secret scanning** e **Push protection** (disponível em repositório privado conforme o plano; confirmar no painel) e **Dependabot alerts**.

## 7. Depois
- [ ] Rodar de novo a varredura de segredos e o CI local (`node scripts/checar.cjs && npm test`).
- [ ] Registrar no `RELATORIO.md` a data da transferência e da rotação.
