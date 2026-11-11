#!/usr/bin/env node
/* Envia arquivos (vídeo, imagem, zip) para uma pasta do Dropbox do dono por uma "solicitação de arquivos".
   O conector do Dropbox só cria pasta e arquivo de texto; binário entra por aqui, com o navegador da casa.

   node scripts/dropbox-enviar.cjs --pedido https://www.dropbox.com/request/<id> arquivo1 [arquivo2 ...]

   O endereço da solicitação NÃO fica no repositório (ele aceita envio de qualquer pessoa): passe por argumento.
   Nome e e-mail de quem envia vêm de DROPBOX_REMETENTE_NOME (padrão "Creat Nuvem") e DROPBOX_REMETENTE_EMAIL
   (obrigatório). O Dropbox acrescenta o nome de quem envia ao fim do nome de cada arquivo.
   Sai com código 0 só quando a página confirma o envio. */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const args = process.argv.slice(2);
const iP = args.indexOf('--pedido');
const pedido = iP > -1 ? args[iP + 1] : '';
const arquivos = args.filter((a, i) => i !== iP && i !== iP + 1);
const NOME = process.env.DROPBOX_REMETENTE_NOME || 'Creat Nuvem';
const EMAIL = process.env.DROPBOX_REMETENTE_EMAIL || '';

function falha(msg) { console.error('erro   ' + msg); process.exit(1); }
if (!/^https:\/\/www\.dropbox\.com\/request\/[A-Za-z0-9]+$/.test(pedido)) falha('passe --pedido https://www.dropbox.com/request/<id>');
if (!EMAIL) falha('defina DROPBOX_REMETENTE_EMAIL');
if (!arquivos.length) falha('nenhum arquivo');
for (const a of arquivos) if (!fs.existsSync(a) || !fs.statSync(a).isFile()) falha('arquivo não existe: ' + a);
// Medido em 11/11/2026: a página diz "Envio concluído" e DESCARTA em silêncio arquivo com acento ou cedilha no nome.
// Envie com nome sem acento e renomeie depois pelo conector do Dropbox (move). Confira sempre a pasta depois do envio.
for (const a of arquivos) if (/[^\x20-\x7E]/.test(path.basename(a))) falha('nome com acento é descartado pelo Dropbox: ' + path.basename(a));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });
  const pg = await ctx.newPage();
  try {
    await pg.goto(pedido, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForSelector('text=Adicionar arquivos', { timeout: 45000 });
    await pg.waitForTimeout(2500);
    const recusar = pg.locator('button:has-text("Recusar")');
    if (await recusar.count()) await recusar.first().click().catch(() => {});
    await pg.waitForTimeout(800);
    await pg.locator('button:has-text("Adicionar arquivos")').first().click();
    await pg.waitForSelector('[role=menuitem]', { timeout: 15000 });
    const [seletor] = await Promise.all([
      pg.waitForEvent('filechooser', { timeout: 15000 }),
      pg.locator('[role=menuitem]').first().click()
    ]);
    await seletor.setFiles(arquivos);
    await pg.waitForSelector('input[name=name]', { timeout: 30000 });
    await pg.fill('input[name=name]', NOME);
    await pg.fill('input[name=email]', EMAIL);
    await pg.waitForTimeout(500);
    await pg.locator('button:has-text("Enviar")').last().click();
    // confirmação: a página troca o formulário por uma mensagem de envio concluído
    const total = arquivos.reduce((s, a) => s + fs.statSync(a).size, 0);
    const limite = Date.now() + Math.max(180000, total / 40000);   // ~40 KB/s de piso
    let ok = false, texto = '';
    while (Date.now() < limite) {
      texto = await pg.evaluate(() => document.body.innerText).catch(() => '');
      if (/enviado|enviados|conclu[ií]d|sucesso|recebemos|Obrigad/i.test(texto) && !/Seu endereço de e-mail/.test(texto)) { ok = true; break; }
      if (/n[aã]o foi poss[ií]vel|falha no envio|erro ao enviar|tente novamente/i.test(texto)) break;
      await pg.waitForTimeout(2000);
    }
    if (process.env.DROPBOX_PRINT) await pg.screenshot({ path: process.env.DROPBOX_PRINT });
    console.log((ok ? 'ok     ' : 'erro   ') + arquivos.length + ' arquivo(s) · ' + (total / 1048576).toFixed(1) + ' MB · ' + texto.replace(/\s+/g, ' ').slice(0, 220));
    await browser.close();
    process.exit(ok ? 0 : 1);
  } catch (e) {
    if (process.env.DROPBOX_PRINT) await pg.screenshot({ path: process.env.DROPBOX_PRINT }).catch(() => {});
    await browser.close();
    falha(String(e).slice(0, 300));
  }
})();
