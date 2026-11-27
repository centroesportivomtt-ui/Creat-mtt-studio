// Aceite da mesa ao vivo no site (onda 2; docs/plano-conversa-25-11.md, 13.9: A2.4, A2.5, A2.6 e A2.7 do lado do site).
// Roda contra o motor falso (scripts/motor-falso.mjs), que emite os mesmos eventos `passo` e `decisao` do motor real.
// Sem rede e sem chave. Chamado pelo aceite.mjs depois do aceite da conversa; também roda sozinho:
//   ACEITE_BASE=… ACEITE_MOTOR=… MOTOR_TOKEN=… ACEITE_SENHA=… EDITOR_DADOS=… node scripts/aceite-mesa.mjs
// Prints de celular claro e escuro (e desktop) em apps/web/.verificacao/mesa/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function aceiteMesa({ BASE, MOTOR, TOKEN, SENHA, DADOS, ok }) {
  const PRINTS = path.join(WEB, '.verificacao', 'mesa');
  fs.rmSync(PRINTS, { recursive: true, force: true });
  fs.mkdirSync(PRINTS, { recursive: true });
  const problemas = [];
  const prints = [];
  const motor = (rota, corpo) => fetch(`${MOTOR}/v1/${rota}`, { method: corpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then((r) => r.json().catch(() => null));
  const chrome = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find((f) => fs.existsSync(f));
  const navegador = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}) });
  const celular = (colorScheme) => navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', colorScheme });
  const erros = [];
  const vigiar = (pg, nome) => {
    pg.on('console', (m) => { if (m.type() === 'error') erros.push(`${nome}: ${m.text()}`); });
    pg.on('pageerror', (e) => erros.push(`${nome}: ${String(e)}`));
  };
  const api = (pg, rota, corpo) => pg.evaluate(async ([rota, corpo]) => {
    const r = await fetch(`/api/motor/v1/${rota}`, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  }, [rota, corpo]);
  const medir = (pg) => pg.evaluate(() => {
    const larg = document.documentElement.clientWidth;
    const pequenos = [];
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const t = parseFloat(getComputedStyle(el).fontSize);
      if (t < 11) pequenos.push(`${el.tagName.toLowerCase()} ${t}px "${el.textContent.trim().slice(0, 20)}"`);
    }
    const alvos = [...document.querySelectorAll('a, button, input:not(.so-leitor), select, textarea, label.botao, summary')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 44 || r.width < 44) && !el.closest('.opcao'); })
      .map((el) => `${el.tagName.toLowerCase()}${el.dataset.teste ? `[${el.dataset.teste}]` : ''}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    return { rolagem: document.documentElement.scrollWidth > larg + 1, pequenos, alvos };
  });
  // print do cartão da mesa (rolado até ele) e da página inteira
  async function print(pg, nome, tema, { inteira = false, alvo = '[data-teste=mesa-ao-vivo]' } = {}) {
    const m = await medir(pg);
    const arq = `${nome}-celular-${tema}.png`;
    if (!inteira) await pg.locator(alvo).first().scrollIntoViewIfNeeded().catch(() => {});
    await pg.screenshot({ path: path.join(PRINTS, arq), fullPage: inteira });
    prints.push(arq);
    if (m.rolagem) problemas.push(`${arq}: rolagem horizontal`);
    if (m.pequenos.length) problemas.push(`${arq}: texto < 11px (${m.pequenos.slice(0, 2).join('; ')})`);
    if (m.alvos.length) problemas.push(`${arq}: alvo < 44px (${m.alvos.slice(0, 4).join(', ')})`);
  }
  async function entrar(ctx) {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/entrar`);
    await pg.fill('input[name=senha]', SENHA);
    await pg.click('main button[type=submit]');
    await pg.waitForURL(`${BASE}/projetos`, { timeout: 20000 });
    return pg;
  }
  async function projetoComMaterial(pg, nome) {
    const r = await api(pg, 'projetos', { nome, tipo_video: 'evento' });
    const pid = r.corpo.id;
    const chave = `entrada/${pid}/aceite-mesa.mp4`;
    fs.mkdirSync(path.join(DADOS, 'armazenamento', 'entrada', pid), { recursive: true });
    fs.writeFileSync(path.join(DADOS, 'armazenamento', chave), randomBytes(4096));
    await api(pg, `projetos/${pid}/arquivos`, { chave, nome: 'C0021.MP4', bytes: 4096 });
    return pid;
  }
  const passosDoMotor = async (pid) => {
    const r = await fetch(`${MOTOR}/v1/projetos/${pid}/eventos?v=2&seguir=false`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((x) => x.text());
    const ids = new Set();
    for (const bloco of r.split('\n\n')) {
      const m = /^event: passo\n?.*?data: (.*)$/ms.exec(bloco.replace(/^id: \d+\n/, ''));
      if (!m) continue;
      try { const e = JSON.parse(m[1]); if (e.dados?.pai) ids.add(e.dados.passo); } catch { /* */ }
    }
    return ids.size;
  };
  const semAnelNaMesa = (pg) => pg.evaluate(() => document.querySelectorAll('[data-teste=mesa-ao-vivo] .avatar[data-trabalhando=true]').length);

  try {
    const escuro = await celular('dark');
    const claro = await celular('light');
    const A = await entrar(escuro);
    vigiar(A, 'escuro');
    await claro.addCookies(await escuro.cookies());
    const pid = await projetoComMaterial(A, 'Aceite mesa · Super Kal');
    await A.goto(`${BASE}/projetos/${pid}`);
    const B = await claro.newPage();
    vigiar(B, 'claro');
    await B.goto(`${BASE}/projetos/${pid}`);

    // ---------- 1. o material chega: Trilho recebe, Radar ouve e olha (o Diário virou a mesa ao vivo) ----------
    await A.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo][data-chave="analise.visao"][data-fase=fim]', { state: 'attached', timeout: 20000 });
    await B.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo][data-chave="analise.visao"][data-fase=fim]', { state: 'attached', timeout: 10000 });
    const achadoVisao = await A.textContent('[data-teste=mesa-passo][data-chave="analise.visao"] [data-teste=mesa-achado]');
    const textoTranscr = await A.textContent('[data-teste=mesa-passo][data-chave="analise.transcricao"] [data-teste=mesa-passo-texto]');
    const diarioVelho = await A.locator('#diario, .bloco-diario').count();
    await print(A, '01-material-lido', 'escuro');
    await print(B, '01-material-lido', 'claro');
    ok('mesa: o Diário de 12 linhas escondidas virou a mesa ao vivo, com quem fez e o que achou em números ("Ouviu 14 falas", "6 momentos fortes")',
      diarioVelho === 0 && /Ouviu 14 falas/.test(textoTranscr ?? '') && /6 momentos fortes/.test(achadoVisao ?? ''), `${textoTranscr} | ${achadoVisao}`);

    // ---------- 2. o pedido: a direção trabalha ao vivo (trabalhando agora, avatares com anel, o mesmo fio) ----------
    await api(A, `projetos/${pid}/fechar-envio`, {});
    await api(A, `projetos/${pid}/pedido`, { texto: 'Reel do evento com a melhor fala no gancho' });
    await A.waitForSelector('[data-teste=agora-linha]', { timeout: 15000 });
    await A.waitForFunction(() => /Faísca|Cirro|Crivo/.test(document.querySelector('[data-teste=agora]')?.textContent ?? ''), null, { timeout: 15000 });
    const agoraTxt = await A.textContent('[data-teste=agora]');
    const anel = await A.locator('[data-teste=agora] .avatar[data-trabalhando=true]').count();
    const compacto = await A.locator('[data-teste=agora-compacto]').count();
    await print(A, '02-trabalhando-agora', 'escuro');
    await print(B, '02-trabalhando-agora', 'claro');
    ok('mesa: "Trabalhando agora" diz quem, fazendo o quê e há quanto tempo, com o avatar pulsando (no cartão e no palco)',
      /Trabalhando agora/.test(agoraTxt ?? '') && /\d:\d\d/.test(agoraTxt ?? '') && anel >= 1 && compacto === 1, agoraTxt?.slice(0, 120));
    // a mesma linha do tempo dentro do fio da conversa (aparelho claro): os passos e quem trabalha na faixa do topo
    await B.click('[data-teste=conversa-abrir]').catch(() => {});
    await B.waitForSelector('[data-teste=fio] [data-teste=mesa-passo]', { state: 'attached', timeout: 8000 });
    const faixa = await B.locator('[data-teste=fio-mesa-agora]').count();
    const cartaoNoFio = await B.locator('[data-teste=mesa-ao-vivo]').count();
    await print(B, '03-fio-com-a-mesa', 'claro', { alvo: '[data-teste=fio] [data-teste=mesa-grupo]' });
    ok('mesa: no fio da conversa, a mesma linha do tempo com os passos, quem trabalha na faixa do topo e sem o cartão duplicado escondido',
      faixa === 1 && cartaoNoFio === 0, `faixa ${faixa} · cartão ${cartaoNoFio}`);
    await B.click('[data-teste=fio-fechar]');

    // ---------- 3. o que a direção decidiu: conceito, gancho, blocos; riscos fechados; modelo e custo nos bastidores ----------
    await A.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=decisao]', { state: 'attached', timeout: 20000 });
    await B.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=decisao]', { state: 'attached', timeout: 10000 });
    const conceito = await A.textContent('[data-teste=decisao-conceito]');
    const blocos = await A.locator('[data-teste=decisao-blocos] li').count();
    const riscosAbertos = await A.evaluate(() => document.querySelector('.decisao__riscos')?.hasAttribute('open'));
    const custoDiretor = await A.textContent('[data-teste=mesa-passo][data-chave="direcao.diretor"] [data-teste=mesa-passo-custo]').catch(() => '');
    const achadoResolv = await A.textContent('[data-teste=mesa-passo][data-chave="direcao.resolvedor"] [data-teste=mesa-achado]').catch(() => '');
    await print(A, '04-decisao', 'escuro', { alvo: '[data-teste=decisao]' });
    await print(B, '04-decisao', 'claro', { alvo: '[data-teste=decisao]' });
    ok('mesa (A2.2): o cartão "O que a direção decidiu" mostra conceito e os 5 blocos, riscos fechados; o diretor mostra o custo e o resolvedor onde a música explode',
      /salão vira palco/.test(conceito ?? '') && blocos === 5 && riscosAbertos === false && /US\$ 0,07/.test(custoDiretor ?? '') && /a música explode aos 0:14/.test(achadoResolv ?? ''),
      JSON.stringify({ conceito, blocos, riscosAbertos, custoDiretor, achadoResolv }));

    // ---------- 4. montagem: Verbo confere o número, Eco, Paleta, Órbita, Trilho; cair a rede não duplica (A2.4) ----------
    await A.waitForSelector('[data-teste=mesa-passo][data-chave="montagem.fatos"][data-fase=fim]', { state: 'attached', timeout: 20000 });
    const fatos = await A.textContent('[data-teste=mesa-passo][data-chave="montagem.fatos"] [data-teste=mesa-achado]');
    await print(A, '05-montagem', 'escuro');
    await B.waitForSelector('[data-teste=mesa-passo][data-chave="montagem.fatos"]', { state: 'attached', timeout: 10000 });
    await print(B, '05-montagem', 'claro');
    await escuro.setOffline(true);
    await dormir(2500);
    await escuro.setOffline(false);
    for (let i = erros.length - 1; i >= 0; i--) if (/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(erros[i])) erros.splice(i, 1);
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.getAttribute('data-estado') === 'entregue', null, { timeout: 60000 });
    await B.waitForFunction(() => document.querySelector('[data-teste=estado]')?.getAttribute('data-estado') === 'entregue', null, { timeout: 30000 });
    await dormir(800);
    const idsTela = await A.evaluate(() => [...document.querySelectorAll('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo]')].map((el) => el.dataset.id));
    const noMotor = await passosDoMotor(pid);
    const linhasMontagem = await A.locator('[data-teste=mesa-ao-vivo] [data-teste=mesa-linha][data-etapa=montagem]').count();
    ok('mesa (A2.4, A2.7): modo avião no meio da montagem não duplica nem perde passo; o progresso não cria linha nova',
      idsTela.length === noMotor && new Set(idsTela).size === idsTela.length && linhasMontagem === 1 && /275 ml confere/.test(fatos ?? ''),
      `tela ${idsTela.length} · motor ${noMotor} · montagem ${linhasMontagem} · ${fatos}`);

    // ---------- 5. entregue: nada pulsando, grupos recolhidos com custo, taxímetro e placar por agente ----------
    const abertos = await A.locator('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo][data-fase=inicio]').count();
    const aneis = await semAnelNaMesa(A);
    const recolhidos = await A.locator('[data-teste=mesa-ao-vivo] [data-teste=mesa-grupo][data-aberto=false]').count();
    const custoGrupo = await A.locator('[data-teste=mesa-grupo-custo]').allTextContents();
    await A.click('[data-teste=taximetro-botao]');
    const placar = await A.textContent('[data-teste=taximetro-placar]');
    const total = await A.textContent('[data-teste=taximetro-total]');
    await print(A, '06-entregue-taximetro', 'escuro', { alvo: '[data-teste=taximetro]' });
    await B.click('[data-teste=taximetro-botao]');
    await print(B, '06-entregue-taximetro', 'claro', { alvo: '[data-teste=taximetro]' });
    ok('mesa: entregue, ninguém fica pulsando; cada grupo recolhe numa linha com o custo e o taxímetro abre o placar por agente',
      abertos === 0 && aneis === 0 && recolhidos >= 2 && custoGrupo.some((t) => /US\$/.test(t)) && /Faísca/.test(placar ?? '') && /Crivo/.test(placar ?? '') && /Lupa/.test(placar ?? '') && /US\$ 0,09/.test(total ?? ''),
      JSON.stringify({ abertos, aneis, recolhidos, custoGrupo, total, placar: placar?.slice(0, 120) }));

    // ---------- 6. bastidores: ferramenta técnica, modelo, esforço, tokens e a conta escrita ----------
    await A.click('[data-teste=bastidores]');
    await A.waitForSelector('[data-teste=mesa-passo][data-chave="direcao.diretor"] [data-teste=mesa-bastidores]', { state: 'visible', timeout: 5000 });
    const bast = await A.textContent('[data-teste=mesa-passo][data-chave="direcao.diretor"] [data-teste=mesa-bastidores]');
    const visiveis = await A.evaluate(() => [...document.querySelectorAll('[data-teste=mesa-ao-vivo] [data-teste=mesa-bastidores]')].filter((el) => el.getBoundingClientRect().height > 0).length);
    await print(A, '07-bastidores', 'escuro', { alvo: '[data-teste=mesa-passo][data-chave="direcao.diretor"]' });
    await B.click('[data-teste=bastidores]');
    await B.waitForSelector('[data-teste=mesa-passo][data-chave="direcao.diretor"] [data-teste=mesa-bastidores]', { state: 'visible', timeout: 5000 });
    await print(B, '07-bastidores', 'claro', { alvo: '[data-teste=mesa-passo][data-chave="direcao.diretor"]' });
    await B.click('[data-teste=bastidores]');
    await A.reload();
    await A.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo]', { state: 'attached', timeout: 15000 });
    const lembrou = await A.getAttribute('[data-teste=bastidores]', 'aria-pressed');
    await A.click('[data-teste=bastidores]');
    ok('mesa: o modo Bastidores abre todas as gavetas (Claude, claude-opus-5-5 · esforço alto, tokens e a conta) e o aparelho lembra',
      /claude-opus-5-5 · esforço alto/.test(bast ?? '') && /a conta/.test(bast ?? '') && /15\.000 do cache/.test(bast ?? '') && visiveis >= 10 && lembrou === 'true',
      `${bast?.slice(0, 160)} · ${visiveis} abertas · lembrou ${lembrou}`);
    // uma gaveta só, pelo toque (sem o modo)
    await A.locator('[data-teste=mesa-passo][data-chave="qa.olho_ia"] summary').first().scrollIntoViewIfNeeded();
    await A.locator('[data-teste=mesa-grupo][data-aberto=false] summary').filter({ hasText: 'Lupa' }).first().click().catch(() => {});
    await A.locator('[data-teste=mesa-passo][data-chave="qa.olho_ia"] summary').first().click();
    const gaveta = await A.textContent('[data-teste=mesa-passo][data-chave="qa.olho_ia"] [data-teste=mesa-bastidores]');
    await print(A, '08-gaveta-do-passo', 'escuro', { alvo: '[data-teste=mesa-passo][data-chave="qa.olho_ia"]' });
    ok('mesa: tocar num passo abre os bastidores dele (ferramenta técnica e custo da chamada paga)', /motor\.etapas\.qa\.olho_ia/.test(gaveta ?? '') && /US\$/.test(gaveta ?? ''), gaveta?.slice(0, 140));

    // ---------- 7. erro e aviso (A2.5): frase em pt-BR, técnico recolhido, tudo como texto puro ----------
    await motor(`_teste/mesa-erro/${pid}`, {});
    await A.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-nota][data-tom=alerta]', { timeout: 10000 });
    await B.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-nota][data-tom=alerta]', { timeout: 10000 });
    const nota = await A.locator('[data-teste=mesa-nota][data-tom=alerta]').last();
    const notaTxt = await nota.textContent();
    const tagDentro = await nota.locator('b').count();
    const erroTxt = await A.locator('[data-teste=mesa-erro]').last().textContent();
    await A.locator('[data-teste=mesa-linha][data-fase=erro] .mesa-linha__detalhe summary').last().click();
    const detalhe = await A.locator('[data-teste=mesa-linha][data-fase=erro] .mesa-linha__detalhe').last().textContent();
    const scripts = await A.evaluate(() => document.querySelectorAll('[data-teste=mesa-ao-vivo] script').length);
    await print(A, '09-erro-e-aviso', 'escuro', { alvo: '[data-teste=mesa-nota][data-tom=alerta]' });
    await print(B, '09-erro-e-aviso', 'claro', { alvo: '[data-teste=mesa-nota][data-tom=alerta]' });
    ok('mesa (A2.5): arquivo recusado vira aviso visível em texto puro; o erro é uma frase em pt-BR e o técnico fica na gaveta',
      /<b>quebrado<\/b>\.mov/.test(notaTxt ?? '') && tagDentro === 0 && /^A leitura do vídeo \d parou\.$/.test(erroTxt ?? '') && /moov atom not found/.test(detalhe ?? '') && scripts === 0,
      JSON.stringify({ notaTxt: notaTxt?.slice(0, 90), tagDentro, erroTxt, detalhe: detalhe?.slice(0, 80), scripts }));

    // ---------- 8. o editor reiniciou no meio (A2.6): a linha fecha como interrompida, nenhum avatar pulsando ----------
    await motor(`_teste/mesa-interrompida/${pid}`, {});
    await A.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-linha][data-fase=interrompido]', { timeout: 10000 });
    await B.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-linha][data-fase=interrompido]', { timeout: 10000 });
    const inter = await A.locator('[data-teste=mesa-linha][data-fase=interrompido]').textContent();
    const aneis2 = await semAnelNaMesa(A);
    const agora2 = await A.locator('[data-teste=agora-linha]').count();
    await print(A, '10-interrompida', 'escuro', { alvo: '[data-teste=mesa-linha][data-fase=interrompido]' });
    await print(B, '10-interrompida', 'claro', { alvo: '[data-teste=mesa-linha][data-fase=interrompido]' });
    ok('mesa (A2.6): o passo interrompido pelo reinício fecha a linha ("interrompido") e nenhum avatar fica pulsando',
      /interrompido/.test(inter ?? '') && /reiniciou/.test(inter ?? '') && aneis2 === 0 && agora2 === 0, `${inter?.slice(0, 120)} · anéis ${aneis2} · agora ${agora2}`);

    // ---------- 9. a página inteira e o desktop ----------
    await print(A, '11-projeto-inteiro', 'escuro', { inteira: true });
    await print(B, '11-projeto-inteiro', 'claro', { inteira: true });
    for (const tema of ['dark', 'light']) {
      const d = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', colorScheme: tema });
      await d.addCookies(await escuro.cookies());
      const D = await d.newPage();
      vigiar(D, `desktop-${tema}`);
      await D.goto(`${BASE}/projetos/${pid}`);
      await D.waitForSelector('[data-teste=mesa-ao-vivo] [data-teste=mesa-passo]', { state: 'attached', timeout: 15000 });
      const m = await medir(D);
      const arq = `12-desktop-${tema === 'dark' ? 'escuro' : 'claro'}.png`;
      await D.locator('[data-teste=mesa-ao-vivo]').scrollIntoViewIfNeeded();
      await D.screenshot({ path: path.join(PRINTS, arq) });
      prints.push(arq);
      if (m.rolagem) problemas.push(`${arq}: rolagem horizontal`);
      if (m.pequenos.length) problemas.push(`${arq}: texto < 11px`);
      await d.close();
    }
    ok('mesa: nenhum erro de console nos aparelhos', erros.length === 0, erros.slice(0, 3).join(' | '));
    ok(`mesa: prints de celular claro e escuro e desktop (${prints.length}) sem rolagem, texto pequeno ou alvo < 44 px`, problemas.length === 0 && prints.length >= 20,
      problemas.length ? problemas.slice(0, 5).join(' || ') : `em ${path.relative(WEB, PRINTS)}`);
  } catch (e) {
    ok('mesa: aceite da mesa ao vivo rodou até o fim', false, String(e?.stack || e).slice(0, 700));
  } finally {
    await navegador.close().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = [];
  await aceiteMesa({
    BASE: process.env.ACEITE_BASE, MOTOR: process.env.ACEITE_MOTOR, TOKEN: process.env.MOTOR_TOKEN, SENHA: process.env.ACEITE_SENHA, DADOS: process.env.EDITOR_DADOS,
    ok: (nome, passou, detalhe = '') => { res.push(passou); console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`); },
  });
  console.log(`\nMESA: ${res.filter(Boolean).length}/${res.length} ok`);
  process.exit(res.every(Boolean) ? 0 : 1);
}
