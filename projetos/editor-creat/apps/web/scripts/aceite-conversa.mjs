// Aceite da conversa com o editor no site (onda 1; docs/plano-conversa-25-11.md, 13.9: A1.1 a A1.4, A1.13, A1.22 a A1.24,
// A2.4, A2.7 do lado do site). Roda contra o motor falso (scripts/motor-falso.mjs), sem rede e sem chave real.
// Chamado pelo aceite.mjs depois dos passos de sempre (que continuam iguais); também roda sozinho:
//   ACEITE_BASE=http://127.0.0.1:3100 ACEITE_MOTOR=http://127.0.0.1:8798 MOTOR_TOKEN=… ACEITE_SENHA=… EDITOR_DADOS=… node scripts/aceite-conversa.mjs
// Prints de celular, claro e escuro, de cada estado em apps/web/.verificacao/conversa/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function aceiteConversa({ BASE, MOTOR, TOKEN, SENHA, DADOS, ok }) {
  const PRINTS = path.join(WEB, '.verificacao', 'conversa');
  fs.rmSync(PRINTS, { recursive: true, force: true });
  fs.mkdirSync(PRINTS, { recursive: true });
  const problemas = [];
  const motor = (rota, corpo) => fetch(`${MOTOR}/v1/${rota}`, { method: corpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then((r) => r.json().catch(() => null));

  // 0. contrato: a cópia do equipe.json do site é igual à do pacote de schemas (o Dockerfile.web só copia apps/web)
  {
    const a = JSON.parse(fs.readFileSync(path.join(WEB, 'lib', 'equipe.json'), 'utf8'));
    const b = JSON.parse(fs.readFileSync(path.resolve(WEB, '..', '..', 'packages', 'schemas', 'equipe.json'), 'utf8'));
    ok('conversa: lib/equipe.json igual a packages/schemas/equipe.json', JSON.stringify(a) === JSON.stringify(b));
  }

  const chrome = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find((f) => fs.existsSync(f));
  const navegador = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const celular = (colorScheme, extra = {}) => navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', colorScheme, permissions: ['microphone'], ...extra });
  const erros = new Map();
  const vigiar = (pg, nome) => {
    const l = [];
    erros.set(nome, l);
    pg.on('console', (m) => { if (m.type() === 'error') l.push(m.text()); });
    pg.on('pageerror', (e) => l.push(String(e)));
    return l;
  };
  // erro de console que o próprio teste provocou (rede cortada, 429 e 503 pedidos de propósito): sai da conta, só ele
  const tirar = (nome, re, max = Infinity) => {
    const l = erros.get(nome) ?? [];
    let n = 0;
    for (let i = l.length - 1; i >= 0 && n < max; i--) if (re.test(l[i])) { l.splice(i, 1); n++; }
  };
  const api = (pg, rota, corpo) => pg.evaluate(async ([rota, corpo]) => {
    const r = await fetch(`/api/motor/v1/${rota}`, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  }, [rota, corpo]);
  // medida da tela no estado atual: rolagem horizontal, alvos de toque < 44 px e texto < 11 px (as mesmas regras do aceite)
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
  const prints = [];
  async function print(pg, nome, tema) {
    const m = await medir(pg);
    const arq = `${nome}-celular-${tema}.png`;
    await pg.screenshot({ path: path.join(PRINTS, arq) });
    prints.push(arq);
    if (m.rolagem) problemas.push(`${arq}: rolagem horizontal`);
    if (m.pequenos.length) problemas.push(`${arq}: texto < 11px (${m.pequenos.slice(0, 2).join('; ')})`);
    if (m.alvos.length) problemas.push(`${arq}: alvo < 44px (${m.alvos.slice(0, 4).join(', ')})`);
  }
  const contar = (pg, sel) => pg.locator(sel).count();
  const idsUnicos = (pg) => pg.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-teste=fio-lista] [data-id]')].map((el) => `${el.dataset.teste}:${el.dataset.id}`);
    return { total: ids.length, unicos: new Set(ids).size };
  });
  async function entrar(ctx) {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/entrar`);
    await pg.fill('input[name=senha]', SENHA);
    await pg.click('main button[type=submit]');
    await pg.waitForURL(`${BASE}/projetos`, { timeout: 20000 });
    return pg;
  }
  // projeto com 1 vídeo lido e envio fechado (o arquivo vai direto ao armazenamento, como o tus faria)
  async function projetoComMaterial(pg, nome) {
    const r = await api(pg, 'projetos', { nome, tipo_video: 'bastidor' });
    const pid = r.corpo.id;
    const chave = `entrada/${pid}/aceite-conversa.mp4`;
    fs.mkdirSync(path.join(DADOS, 'armazenamento', 'entrada', pid), { recursive: true });
    fs.writeFileSync(path.join(DADOS, 'armazenamento', chave), randomBytes(4096));
    await api(pg, `projetos/${pid}/arquivos`, { chave, nome: 'C0016.MP4', bytes: 4096 });
    for (let i = 0; i < 40; i++) {
      const p = await api(pg, `projetos/${pid}`);
      if (p.corpo?.arquivos?.every((a) => a.estado === 'analisado')) break;
      await dormir(250);
    }
    await api(pg, `projetos/${pid}/fechar-envio`, {});
    return pid;
  }
  const abrirConversa = async (pg) => {
    await pg.waitForSelector('[data-teste=conversa-barra]:not([data-estado=carregando])', { timeout: 15000 });
    if (!(await pg.locator('[data-teste=fio]').count())) await pg.click('[data-teste=conversa-abrir]');
    await pg.waitForSelector('[data-teste=fio]', { timeout: 8000 });
  };
  async function mandar(pg, texto) {
    await pg.fill('[data-teste=conversa-campo]', texto);
    await pg.click('[data-teste=conversa-enviar]');
  }
  const esperarFim = (pg, n, timeout = 20000) => pg.waitForFunction((n) => document.querySelectorAll('[data-teste=turno-fim]').length >= n, n, { timeout });

  try {
    // ---------- sem sessão: a rota da conversa fica fechada ----------
    {
      const r = await fetch(`${BASE}/api/motor/v1/conversa`);
      const r2 = await fetch(`${BASE}/api/motor/v1/conversa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ligada":false}' });
      ok('conversa: sem sessão, a chave e a conversa ficam fechadas (401)', r.status === 401 && r2.status === 401, `GET ${r.status} · POST ${r2.status}`);
    }

    const escuro = await celular('dark');
    const claro = await celular('light');
    const A = await entrar(escuro);
    const errA = vigiar(A, 'escuro');
    const chaveR1 = await api(A, 'conversa');
    ok('conversa: o proxy deixa passar a chave (R1) com sessão e ela vem ligada por padrão', chaveR1.status === 200 && chaveR1.corpo?.ligada === true && chaveR1.corpo?.teto_usd_dia === 3, JSON.stringify(chaveR1.corpo).slice(0, 160));

    const pid = await projetoComMaterial(A, 'Aceite conversa · Super Kal');
    await A.goto(`${BASE}/projetos/${pid}`);
    const B = await claro.newPage();
    const errB = vigiar(B, 'claro');
    await claro.addCookies(await escuro.cookies());
    await B.goto(`${BASE}/projetos/${pid}`);

    // ---------- 1. abrir pela barra, estado vazio ----------
    await abrirConversa(A);
    await abrirConversa(B);
    const vazio = await contar(A, '[data-teste=fio-vazio]');
    const estadoAntes = await A.getAttribute('[data-teste=estado]', 'data-estado').catch(() => null);
    await print(A, '01-vazio', 'escuro');
    await print(B, '01-vazio', 'claro');
    ok('conversa: abre pela barra do projeto, com o fio vazio explicando o que dá para fazer', vazio === 1 && (await contar(A, '[data-teste=conversa-campo]')) === 1);

    // ---------- 2. texto: resposta chegando aos poucos, ferramentas, custo (A1.1, A1.4) ----------
    const medidas = await (async () => {
      const t0 = Date.now();
      await mandar(A, 'Me diz o que tem no material');
      const primeiro = await A.waitForFunction(() => (document.querySelector('[data-teste=fio-rascunho]')?.textContent ?? '').length > 0, null, { timeout: 8000 }).then(() => Date.now() - t0, () => -1);
      const tam1 = await A.evaluate(() => document.querySelector('[data-teste=fio-rascunho]')?.textContent?.length ?? 0);
      await dormir(700);
      const tam2 = await A.evaluate(() => document.querySelector('[data-teste=fio-rascunho]')?.textContent?.length ?? 0);
      await print(A, '02-escrevendo', 'escuro');
      await B.waitForSelector('[data-teste=fio-rascunho], [data-teste=fio-pensando], [data-teste=ferramenta]', { timeout: 5000 }).catch(() => {});
      await print(B, '02-escrevendo', 'claro');
      await A.waitForSelector('[data-teste=ferramenta][data-nome=ver_projeto][data-fase=inicio]', { timeout: 8000 }).catch(() => {});
      await print(A, '03-ferramenta-rodando', 'escuro');
      await B.waitForSelector('[data-teste=ferramenta][data-fase=inicio]', { timeout: 3000 }).catch(() => {});
      await print(B, '03-ferramenta-rodando', 'claro');
      await esperarFim(A, 1);
      await esperarFim(B, 1);
      return { primeiro, tam1, tam2 };
    })();
    const rotulos = await A.locator('[data-teste=ferramenta] .ferr__texto').allTextContents();
    const custo = await A.textContent('[data-teste=turno-custo]');
    const donoA = await contar(A, '[data-teste=fala-dono]');
    const donoB = await contar(B, '[data-teste=fala-dono]');
    ok('conversa (A1.1): a resposta aparece crescendo em até 1 s depois de mandar e continua crescendo', medidas.primeiro > 0 && medidas.primeiro < 1500 && medidas.tam2 > medidas.tam1, JSON.stringify(medidas));
    ok('conversa (A1.4): cada ferramenta vira linha na língua do dono, com quem fez e o detalhe técnico recolhido',
      rotulos.some((t) => /Nimbus.*Olhou o projeto/.test(t)) && rotulos.some((t) => /Radar.*Leu \d+ trechos/.test(t)) && (await contar(A, '[data-teste=ferramenta] details')) >= 2, rotulos.join(' | ').slice(0, 200));
    ok('conversa: o custo de cada resposta fica à vista ("US$ … · … s") e o dia soma no topo do fio', /US\$ 0,\d+ · [\d,]+ s/.test(custo ?? '') && /Conversa hoje: US\$ 0,\d+ de US\$ 3,00/.test((await A.textContent('[data-teste=fio-gasto]')) ?? ''), `${custo} | ${await A.textContent('[data-teste=fio-gasto]')}`);
    ok('conversa: dois aparelhos abertos veem a mesma fala uma vez só', donoA === 1 && donoB === 1, `escuro ${donoA} · claro ${donoB}`);
    await A.click('[data-teste=ferramenta] details > summary');
    await print(A, '04-ferramenta-detalhe', 'escuro');
    await B.click('[data-teste=ferramenta] details > summary');
    await print(B, '04-ferramenta-detalhe', 'claro');
    await A.click('[data-teste=ferramenta] details > summary');
    await B.click('[data-teste=ferramenta] details > summary');

    // ---------- 3. pergunta de volta: botões, selo, título da aba, número em Projetos (A1.3, A1.22) ----------
    await mandar(A, 'Me faz uma pergunta sobre o gancho');
    await A.waitForSelector('[data-teste=pergunta][data-respondida=false]', { timeout: 10000 });
    await B.waitForSelector('[data-teste=pergunta][data-respondida=false]', { timeout: 10000 });
    await A.waitForFunction(() => document.title.startsWith('● Precisa de você'), null, { timeout: 8000 }).catch(() => {});
    const titulo = await A.title();
    const numero = await A.textContent('[data-teste=nav-esperando]').catch(() => '');
    await print(A, '05-pergunta', 'escuro');
    await print(B, '05-pergunta', 'claro');
    const L = await escuro.newPage();
    await L.goto(`${BASE}/projetos`);
    await L.waitForFunction(() => document.title.startsWith('(1) Precisa de você'), null, { timeout: 8000 }).catch(() => {});
    const selo = await L.locator(`a[href="/projetos/${pid}"] [data-teste=selo-espera]`).count();
    const tituloLista = await L.title();
    await print(L, '06-lista-precisa-de-voce', 'escuro');
    await L.close();
    const Lc = await claro.newPage();
    await Lc.goto(`${BASE}/projetos`);
    await Lc.waitForSelector('[data-teste=nav-esperando]', { timeout: 8000 }).catch(() => {});
    await print(Lc, '06-lista-precisa-de-voce', 'claro');
    await Lc.close();
    const opcoes = await contar(A, '[data-teste=pergunta-opcao]');
    const sugestao = await A.locator('[data-teste=pergunta-opcao][data-opcao=gancho] .opcao-fio__sugestao').count();
    ok('conversa (A1.22): pergunta esperando: título "● Precisa de você", número em Projetos e selo na lista',
      /^● Precisa de você · Aceite conversa/.test(titulo) && numero?.trim() === '1' && selo === 1 && /^\(1\) Precisa de você/.test(tituloLista), JSON.stringify({ titulo, numero, selo, tituloLista }));
    // a tela volta (celular destravado): o fio reabre com ?depois=
    const reabriu = [];
    const ouvir = (r) => { if (/\/eventos\?v=2&depois=\d+/.test(r.url())) reabriu.push(r.url()); };
    A.on('request', ouvir);
    await A.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await dormir(800);
    A.off('request', ouvir);
    ok('conversa: a tela volta a ficar visível e o fio reabre com ?depois=<último id> (sem perder a pergunta)', reabriu.length >= 1 && (await contar(A, '[data-teste=pergunta][data-respondida=false]')) === 1, reabriu[0]?.replace(/^.*\/eventos/, '/eventos') ?? 'não reabriu');
    await A.click('[data-teste=pergunta-opcao][data-opcao=gancho]');
    await A.waitForSelector('[data-teste=pergunta][data-respondida=true]', { timeout: 8000 });
    await B.waitForSelector('[data-teste=pergunta][data-respondida=true]', { timeout: 8000 });
    await esperarFim(A, 3);
    const escolha = await A.textContent('[data-teste=pergunta-escolha]');
    await A.waitForFunction(() => !document.title.startsWith('● Precisa'), null, { timeout: 8000 }).catch(() => {});
    ok('conversa (A1.3): tocar numa opção responde, o turno continua, e o outro aparelho vê a resposta',
      opcoes === 2 && sugestao === 1 && /Você escolheu: Pelo gancho/.test(escolha ?? '') && (await contar(B, '[data-teste=pergunta-escolha]')) === 1 && !(await A.title()).startsWith('●'),
      `${escolha} · título "${await A.title()}"`);
    await print(A, '07-pergunta-respondida', 'escuro');
    await print(B, '07-pergunta-respondida', 'claro');

    // responder do meu jeito (texto), e uma pergunta respondida por mensagem livre
    await mandar(A, 'Outra pergunta do gancho');
    await A.waitForSelector('[data-teste=pergunta][data-respondida=false]', { timeout: 10000 });
    await A.click('[data-teste=pergunta-livre]');
    const placeholder = await A.getAttribute('[data-teste=conversa-campo]', 'placeholder');
    await mandar(A, 'Abre com a minha risada');
    await A.waitForFunction(() => /Você respondeu: “Abre com a minha risada”/.test(document.querySelector('[data-teste=pergunta][data-respondida=true]:last-of-type, [data-teste=fio-lista]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    const respondeuTexto = await A.locator('[data-teste=pergunta-escolha]', { hasText: 'Abre com a minha risada' }).count();
    ok('conversa: "Responder do meu jeito" responde por texto (sem virar mensagem nova)', placeholder === 'Respondendo ao Nimbus…' && respondeuTexto === 1, `placeholder "${placeholder}" · ${respondeuTexto}`);
    await esperarFim(A, 5);

    // ---------- 4. erro com "tentar de novo" ----------
    const fimsAntes = await contar(A, '[data-teste=turno-fim]');
    await mandar(A, 'simula um erro agora');
    await A.waitForSelector('[data-teste=turno-fim][data-stop=erro] [data-teste=turno-tentar]', { timeout: 10000 });
    await print(A, '08-erro', 'escuro');
    await B.waitForSelector('[data-teste=turno-fim][data-stop=erro]', { timeout: 5000 });
    await print(B, '08-erro', 'claro');
    await A.click('[data-teste=turno-tentar]');
    await esperarFim(A, fimsAntes + 2);
    ok('conversa: erro aparece com o motivo e "Tentar de novo" manda de novo', (await contar(A, '[data-teste=turno-fim][data-stop=erro]')) === 2 && /A resposta parou\. O Claude não respondeu/.test((await A.locator('[data-teste=turno-fim][data-stop=erro]').first().textContent()) ?? ''));

    // ---------- 5. parar no meio + mensagem na fila + recarregar no meio (A1.2) ----------
    await mandar(A, 'fala devagar sobre o material');
    await A.waitForFunction(() => (document.querySelector('[data-teste=fio-rascunho]')?.textContent ?? '').length > 40, null, { timeout: 8000 });
    await mandar(A, 'e deixa a música mais baixa');
    await A.waitForSelector('.fala-dono__etiqueta >> text=na fila', { timeout: 6000 }).catch(() => {});
    const naFila = await A.locator('.fala-dono__etiqueta', { hasText: 'na fila · entra no próximo passo' }).count();
    await print(A, '09-na-fila', 'escuro');
    await print(B, '09-na-fila', 'claro');
    const antesRecarga = await A.evaluate(() => document.querySelector('[data-teste=fio-rascunho]')?.textContent?.length ?? 0);
    await A.reload();
    await A.waitForSelector('[data-teste=fio-rascunho]', { timeout: 8000 }).catch(() => {});
    const depoisRecarga = await A.evaluate(() => document.querySelector('[data-teste=fio-rascunho]')?.textContent?.length ?? 0);
    const dup = await idsUnicos(A);
    ok('conversa (A1.2): recarregar no meio mostra a resposta acumulada, a conversa segue aberta e nada duplica',
      depoisRecarga >= antesRecarga && (await contar(A, '[data-teste=fio]')) === 1 && dup.total === dup.unicos && naFila === 1, JSON.stringify({ antesRecarga, depoisRecarga, ...dup, naFila }));
    await print(A, '10-parar-disponivel', 'escuro');
    await A.click('[data-teste=conversa-parar]');
    await A.waitForSelector('[data-teste=turno-fim][data-stop=parado]', { timeout: 8000 });
    await B.waitForSelector('[data-teste=turno-fim][data-stop=parado]', { timeout: 8000 });
    const parado = await A.locator('[data-teste=turno-fim][data-stop=parado]').textContent();
    ok('conversa: "Parar a resposta" para, mostra o texto até ali e o custo estimado', /Você parou aqui\./.test(parado ?? '') && /≈ US\$ .* estimado/.test(parado ?? '') && (await contar(A, '[data-teste=fio-rodando]')) === 0, (parado ?? '').slice(0, 160));
    await print(A, '11-parado', 'escuro');
    await print(B, '11-parado', 'claro');

    // ---------- 6. motor reiniciou no meio: faixa "interrompida" e "Tentar de novo" (R8) ----------
    await mandar(A, 'fala devagar de novo');
    await A.waitForSelector('[data-teste=fio-rascunho]', { timeout: 8000 });
    await motor(`_teste/interromper/${pid}`, {});
    await A.waitForSelector('[data-teste=fio-retomar]', { timeout: 8000 });
    await B.waitForSelector('[data-teste=fio-retomar]', { timeout: 8000 });
    await print(A, '12-interrompida', 'escuro');
    await print(B, '12-interrompida', 'claro');
    await A.click('[data-teste=fio-retomar-botao]');
    await A.waitForSelector('[data-teste=fio-retomar]', { state: 'detached', timeout: 10000 }).catch(() => {});
    await A.waitForSelector('.fala-editor >> text=Voltei de onde parei', { timeout: 10000 }).catch(() => {});
    ok('conversa: interrompida pelo reinício mostra a faixa e "Tentar de novo" retoma o mesmo turno', (await contar(A, '[data-teste=fio-retomar]')) === 0 && (await A.locator('.fala-editor', { hasText: 'Voltei de onde parei' }).count()) === 1);

    // ---------- 7. pedido e ajuste por cartão, com a mesa trabalhando no fio (A1.24, A2.7) ----------
    const nFimAntes = await contar(A, '[data-teste=turno-fim]');
    await esperarFim(A, nFimAntes);
    await mandar(A, 'Troca o pedido: reel de 30 s abrindo com a melhor fala');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=pendente]', { timeout: 10000 });
    const exato = await A.textContent('[data-teste=confirmacao-texto]');
    await print(A, '13-confirmacao-pedido', 'escuro');
    await B.waitForSelector('[data-teste=confirmacao][data-resultado=pendente]', { timeout: 5000 });
    await print(B, '13-confirmacao-pedido', 'claro');
    const estadoNoTurno = await A.getAttribute('[data-teste=estado]', 'data-estado').catch(() => null);
    await A.click('[data-teste=confirmacao-sim]');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=feito]', { timeout: 10000 });
    ok('conversa (A1.24): o cartão mostra o texto exato entre aspas e o estado do projeto não muda durante a conversa',
      exato === '“Troca o pedido: reel de 30 s abrindo com a melhor fala”' && estadoAntes === estadoNoTurno, JSON.stringify({ exato, estadoAntes, estadoNoTurno }));
    await A.waitForSelector('[data-teste=mesa-grupo][data-aberto=true] [data-teste=mesa-linha][data-fase=rodando]', { timeout: 15000 });
    const offline = async () => { await escuro.setOffline(true); await dormir(2500); await escuro.setOffline(false); };
    await A.waitForSelector('[data-teste=mesa-linha][data-etapa=montagem]', { timeout: 20000 });
    await print(A, '14-mesa-trabalhando', 'escuro');
    await B.waitForSelector('[data-teste=mesa-linha][data-etapa=montagem]', { timeout: 10000 });
    await print(B, '14-mesa-trabalhando', 'claro');
    const nosMontagem = await A.evaluate(() => document.querySelectorAll('[data-teste=mesa-linha][data-etapa=montagem]').length);
    await offline();
    tirar('escuro', /ERR_INTERNET_DISCONNECTED/);
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.getAttribute('data-estado') === 'entregue', null, { timeout: 60000 });
    await dormir(600);
    const linhasMesa = await A.evaluate(() => [...document.querySelectorAll('[data-teste=mesa-linha]')].map((l) => l.dataset.etapa));
    const nMontagem = linhasMesa.filter((e) => e === 'montagem').length;
    ok('conversa (A2.7, A2.4): a mesa entra no fio com quem faz cada etapa, o progresso não cria linha nova e cair a rede não duplica',
      nosMontagem === 1 && nMontagem === 1 && ['catalogo', 'direcao', 'montagem', 'qa', 'entrega'].every((e) => linhasMesa.includes(e)), linhasMesa.join(','));

    // ajuste da versão pronta: "Agora não" cancela; "Pedir o ajuste" refaz (o mesmo que o botão Pedir ajuste)
    await mandar(A, 'Pede um ajuste: corta o silêncio do começo');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=pendente]', { timeout: 10000 });
    await A.click('[data-teste=confirmacao-nao]');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=cancelado]', { timeout: 8000 });
    await mandar(A, 'Pede um ajuste: corta o silêncio do começo');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=pendente]', { timeout: 10000 });
    await B.waitForSelector('[data-teste=confirmacao][data-resultado=pendente]', { timeout: 5000 });
    await print(A, '15-confirmacao-ajuste', 'escuro');
    await print(B, '15-confirmacao-ajuste', 'claro');
    const conta = await A.textContent('[data-teste=confirmacao][data-resultado=pendente] .cartao-fio__conta');
    await A.click('[data-teste=confirmacao-sim]');
    await A.waitForSelector('[data-teste=confirmacao][data-resultado=feito]:has-text("a direção recomeçou")', { timeout: 10000 });
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.getAttribute('data-estado') !== 'entregue', null, { timeout: 10000 }).catch(() => {});
    ok('conversa: ajuste da versão pronta por cartão: mostra o que refaz, custo e tempo; "Agora não" cancela; o toque refaz',
      /Direção → Montagem → Conferência/.test(conta ?? '') && /≈ US\$ 0,40/.test(conta ?? '') && /≈ 10 min/.test(conta ?? '') && (await contar(A, '[data-teste=confirmacao][data-resultado=cancelado]')) === 1,
      (conta ?? '').slice(0, 160));
    await print(A, '16-ajuste-feito', 'escuro');
    await print(B, '16-ajuste-feito', 'claro');
    const dup2 = await idsUnicos(B);
    ok('conversa: no fim, o outro aparelho tem o mesmo fio, sem nenhum item repetido', dup2.total === dup2.unicos && dup2.total === (await idsUnicos(A)).total, JSON.stringify({ B: dup2, A: await idsUnicos(A) }));

    // ---------- 8. áudio: gravar → transcrever → texto no campo, nada enviado sem o toque ----------
    const pidAudio = await projetoComMaterial(A, 'Aceite conversa · áudio');
    const posts = [];
    A.on('request', (r) => { if (r.method() === 'POST' && /\/conversa(\/audio)?$/.test(new URL(r.url()).pathname)) posts.push(new URL(r.url()).pathname.endsWith('/audio') ? `audio:${r.headers()['content-type']}` : 'mensagem'); });
    await A.goto(`${BASE}/projetos/${pidAudio}`);
    await abrirConversa(A);
    await A.click('[data-teste=conversa-microfone]');
    await A.waitForSelector('[data-teste=conversa-gravando]', { timeout: 8000 });
    await dormir(1800);
    await print(A, '17-gravando', 'escuro');
    await A.click('[data-teste=conversa-parar-gravacao]');
    await A.waitForSelector('[data-teste=conversa-transcrevendo]', { timeout: 8000 }).catch(() => {});
    await print(A, '18-transcrevendo', 'escuro');
    await A.waitForFunction(() => document.querySelector('[data-teste=conversa-campo]')?.value?.includes('Corta o silêncio'), null, { timeout: 15000 });
    await dormir(400);
    const naoMandou = posts.filter((x) => x === 'mensagem').length === 0 && (await contar(A, '[data-teste=fala-dono]')) === 0;
    await print(A, '19-texto-do-audio', 'escuro');
    const ouviuLinha = await A.locator('[data-teste=ferramenta][data-nome=ouvir_audio]').textContent().catch(() => '');
    await A.click('[data-teste=conversa-enviar]');
    await A.waitForSelector('[data-teste=fala-dono][data-via=audio]', { timeout: 8000 });
    ok('conversa: áudio grava, transcreve, o texto cai no campo e só sai no toque (via áudio)', naoMandou && posts.some((x) => /^audio:audio\/(webm|mp4|ogg)/.test(x)) && /Radar.*Ouvi/.test(ouviuLinha ?? ''), JSON.stringify({ posts, ouviuLinha }));
    await esperarFim(A, 1);
    // o mesmo no tema claro (gravação é deste aparelho)
    await B.goto(`${BASE}/projetos/${pidAudio}`);
    await abrirConversa(B);
    await B.click('[data-teste=conversa-microfone]');
    await B.waitForSelector('[data-teste=conversa-gravando]', { timeout: 8000 });
    await dormir(1500);
    await print(B, '17-gravando', 'claro');
    await B.click('[data-teste=conversa-parar-gravacao]');
    await B.waitForSelector('[data-teste=conversa-transcrevendo]', { timeout: 8000 }).catch(() => {});
    await print(B, '18-transcrevendo', 'claro');
    await B.waitForFunction(() => document.querySelector('[data-teste=conversa-campo]')?.value?.includes('Corta o silêncio'), null, { timeout: 15000 });
    await print(B, '19-texto-do-audio', 'claro');
    await B.fill('[data-teste=conversa-campo]', '');

    // sem permissão para o microfone: mensagem clara e o ditado do teclado continua valendo
    for (const [tema, ctx] of [['escuro', escuro], ['claro', claro]]) {
      const N = await ctx.newPage();
      vigiar(N, `negado-${tema}`);
      await N.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('negado'), { name: 'NotAllowedError' }));
      });
      await N.goto(`${BASE}/projetos/${pidAudio}`);
      await abrirConversa(N);
      await N.click('[data-teste=conversa-microfone]');
      await N.waitForSelector('[data-teste=conversa-nota]', { timeout: 6000 });
      const msg = await N.textContent('[data-teste=conversa-nota]');
      if (tema === 'escuro') ok('conversa: sem permissão do microfone, a barra diz o que fazer (ditado do teclado) e o campo segue', /Sem permissão para o microfone\. Toque no microfone do teclado/.test(msg ?? '') && !(await N.isDisabled('[data-teste=conversa-campo]')), msg ?? '');
      await print(N, '20-microfone-negado', tema);
      await N.close();
    }

    // ---------- 9. sessão vencida no meio: o texto volta depois de entrar de novo (A1.23) ----------
    {
      const S = await escuro.newPage();
      await S.goto(`${BASE}/projetos/${pidAudio}`);
      await abrirConversa(S);
      await S.fill('[data-teste=conversa-campo]', 'Mensagem escrita antes de a sessão vencer');
      const cookies = await escuro.cookies();
      await escuro.clearCookies();
      await S.click('[data-teste=conversa-enviar]');
      await S.waitForURL(/\/entrar\?volta=%2Fprojetos%2Fp_/, { timeout: 10000 });
      const urlEntrar = S.url();
      await S.fill('input[name=senha]', SENHA);
      await S.click('main button[type=submit]');
      await S.waitForURL(`${BASE}/projetos/${pidAudio}`, { timeout: 15000 });
      await S.waitForSelector('[data-teste=fala-dono]:has-text("Mensagem escrita antes de a sessão vencer")', { timeout: 15000 }).catch(() => {});
      const voltou = await S.locator('[data-teste=fala-dono]', { hasText: 'Mensagem escrita antes de a sessão vencer' }).count();
      ok('conversa (A1.23): sessão vencida no meio: vai para a senha com volta, e a mensagem guardada sai ao voltar, uma vez só', voltou === 1 && /volta=%2Fprojetos%2Fp_/.test(urlEntrar), `${urlEntrar.replace(BASE, '')} · ${voltou}`);
      if (!(await escuro.cookies()).length) await escuro.addCookies(cookies);
      // destino de volta de fora é ignorado
      const fora = await fetch(`${BASE}/entrar?volta=//site-malicioso.example`, { redirect: 'manual', headers: { cookie: (await escuro.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } });
      ok('conversa: "volta" para fora do site é ignorado (vai para /projetos)', [302, 303, 307, 308].includes(fora.status) && /\/projetos$/.test(fora.headers.get('location') ?? ''), `${fora.status} → ${fora.headers.get('location')}`);
      await esperarFim(S, 2).catch(() => {});
      await S.close();
    }

    // ---------- 10. teto do dia e chave liga/desliga ----------
    await motor('_teste/conversa', { gasto: 3 });
    const r429 = await api(A, `projetos/${pidAudio}/conversa`, { texto: 'mais uma', cliente_msg_id: 'm_teto_000001' });
    tirar('escuro', /status of 429/, 1);
    await A.goto(`${BASE}/projetos/${pidAudio}`);
    await abrirConversa(A);
    await A.waitForSelector('[data-teste=conversa-nota]', { timeout: 8000 });
    const notaTeto = await A.textContent('[data-teste=conversa-nota]');
    await print(A, '21-teto', 'escuro');
    await B.goto(`${BASE}/projetos/${pidAudio}`);
    await abrirConversa(B);
    await B.waitForSelector('[data-teste=conversa-nota]', { timeout: 8000 });
    await print(B, '21-teto', 'claro');
    ok('conversa: no teto do dia a conversa para e avisa em pt-BR; o campo trava e a mesa segue',
      r429.status === 429 && /Chegou no teto de hoje \(US\$ 3,00\)\. A conversa volta à meia-noite/.test(notaTeto ?? '') && (await A.isDisabled('[data-teste=conversa-campo]')), `${r429.status} ${JSON.stringify(r429.corpo)} | ${notaTeto}`);
    await motor('_teste/conversa', { gasto: 0.5 });

    // chave no menu Mais: desligar → a barra vira "Conversa desligada · Ligar" → ligar de novo
    await A.goto(`${BASE}/projetos/${pidAudio}`);
    await A.click('.nav__mais > summary');
    await A.waitForSelector('[data-teste=chave-conversa-menu][aria-checked=true]', { timeout: 8000 });
    await print(A, '22-menu-chave', 'escuro');
    await A.click('[data-teste=chave-conversa-menu]');
    await A.waitForSelector('[data-teste=chave-conversa-menu][aria-checked=false]', { timeout: 8000 });
    await A.keyboard.press('Escape');
    await A.reload();
    await A.waitForSelector('[data-teste=conversa-ligar]', { timeout: 10000 });
    const r503 = await api(A, `projetos/${pidAudio}/conversa`, { texto: 'desligada', cliente_msg_id: 'm_desl_000001' });
    tirar('escuro', /status of 503/, 1);
    await print(A, '23-desligada', 'escuro');
    await B.goto(`${BASE}/projetos/${pidAudio}`);
    await B.waitForSelector('[data-teste=conversa-ligar]', { timeout: 10000 });
    await print(B, '23-desligada', 'claro');
    await B.click('.nav__mais > summary');
    await B.waitForSelector('[data-teste=chave-conversa-menu]', { timeout: 8000 });
    await print(B, '22-menu-chave', 'claro');
    await B.keyboard.press('Escape');
    await A.click('[data-teste=conversa-ligar]');
    await A.waitForSelector('[data-teste=conversa-campo]', { timeout: 8000 });
    ok('conversa: a chave no menu Mais desliga (o motor recusa com 503) e "Ligar" na barra liga de novo', r503.status === 503 && (await contar(A, '[data-teste=conversa-campo]')) === 1, `${r503.status}`);
    // desligada no servidor: a tela não promete religar; no Caderno, a chave fica travada com o porquê
    await motor('_teste/conversa', { servidor: false });
    await A.reload();
    await A.waitForSelector('[data-teste=conversa-servidor]', { timeout: 10000 });
    await print(A, '24-desligada-no-servidor', 'escuro');
    const caderno = await escuro.newPage();
    await caderno.goto(`${BASE}/caderno#conversa`);
    await caderno.waitForSelector('[data-teste=chave-conversa-cartao][disabled]', { timeout: 10000 });
    await caderno.locator('[data-teste=caderno-conversa]').scrollIntoViewIfNeeded();
    await print(caderno, '25-caderno-servidor', 'escuro');
    const travada = await caderno.isDisabled('[data-teste=chave-conversa-cartao]');
    await caderno.close();
    ok('conversa: desligada no servidor, a barra só informa e a chave do Caderno fica travada', travada && (await contar(A, '[data-teste=conversa-ligar]')) === 0);
    await motor('_teste/conversa', { servidor: true, ligada: true });
    const cad2 = await claro.newPage();
    await cad2.goto(`${BASE}/caderno#conversa`);
    await cad2.waitForSelector('[data-teste=chave-conversa-cartao][aria-checked=true]', { timeout: 10000 });
    await cad2.locator('[data-teste=caderno-conversa]').scrollIntoViewIfNeeded();
    await print(cad2, '25-caderno-chave', 'claro');
    await cad2.close();

    // ---------- 11. a página sem a conversa aberta continua igual (os prints da onda 1 seguem válidos) ----------
    await A.goto(`${BASE}/projetos/${pid}`);
    await A.waitForSelector('[data-teste=conversa-barra]');
    await A.waitForSelector('[data-teste=fio]', { timeout: 3000 }).catch(() => {});
    if (await A.locator('[data-teste=fio]').count()) await A.click('[data-teste=fio-fechar]');
    await A.waitForSelector('[data-teste=fio]', { state: 'detached', timeout: 5000 }).catch(() => {});
    await print(A, '26-projeto-conversa-fechada', 'escuro');
    await B.goto(`${BASE}/projetos/${pid}`);
    await B.waitForSelector('[data-teste=fio]', { timeout: 3000 }).catch(() => {});
    if (await B.locator('[data-teste=fio]').count()) await B.click('[data-teste=fio-fechar]');
    await B.waitForSelector('[data-teste=fio]', { state: 'detached', timeout: 5000 }).catch(() => {});
    await print(B, '26-projeto-conversa-fechada', 'claro');
    ok('conversa: fechar o fio devolve a mesa do projeto (estado, relógio e barra de sempre)', (await contar(A, '[data-teste=estado]')) === 1 && (await A.isVisible('.mesa')));

    // com a conversa aberta, o próximo passo da barra continua valendo: "Escrever o pedido" fecha o fio e leva ao campo
    {
      const P = await escuro.newPage();
      vigiar(P, 'proximo-passo');
      await P.goto(`${BASE}/projetos/${pidAudio}`);
      await abrirConversa(P);
      await P.click('[data-teste=mandar-pedido]');
      await P.waitForSelector('[data-teste=fio]', { state: 'detached', timeout: 5000 }).catch(() => {});
      await dormir(900);
      const r = await P.evaluate(() => ({ foco: document.activeElement?.id, fio: Boolean(document.querySelector('[data-teste=fio]')), mesa: getComputedStyle(document.querySelector('.mesa')).display }));
      ok('conversa: com o fio aberto, o botão do próximo passo fecha a conversa e leva ao pedido (uma vez só)', r.foco === 'pedido-texto' && !r.fio && r.mesa !== 'none', JSON.stringify(r));
      await P.close();
    }

    // ---------- revisão das ondas 1 e 2 (25/11): toque duplo, texto longo, Voltar do celular, CSP ----------
    {
      const R = await escuro.newPage();
      vigiar(R, 'revisao');
      const cab = await R.goto(`${BASE}/projetos/${pidAudio}`);
      const csp = cab?.headers()['content-security-policy'] ?? '';
      ok('revisão: o site manda Content-Security-Policy (frame-ancestors none, sem origem de fora além do R2)',
        /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), csp.slice(0, 160));
      await abrirConversa(R);
      const antes = await contar(R, '[data-teste=turno-fim]');
      // toque duplo no Enviar: o segundo toque cai no Parar (mesmo lugar) e não pode parar a resposta
      let n = antes;
      for (const atraso of [0, 150, 400]) {
        await R.fill('[data-teste=conversa-campo]', `Me diz o que tem no material (${atraso})`);
        const caixa = await R.locator('[data-teste=conversa-enviar]').boundingBox();
        await R.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
        await dormir(atraso);
        await R.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
        n += 1;
        await esperarFim(R, n, 20000);
        await dormir(300);
      }
      const paradas = await R.locator('[data-teste=turno-fim]').evaluateAll((l) => l.map((x) => x.dataset.stop));
      const gravando = await contar(R, '[data-teste=conversa-gravando]');
      ok('revisão: toque duplo no Enviar (0, 150 e 400 ms) não para a resposta nem abre o microfone',
        paradas.slice(antes).every((s) => s !== 'parado') && gravando === 0, JSON.stringify(paradas.slice(antes)));
      // texto colado com mais de 4.000 letras: nada é cortado em silêncio; o contador avisa e o Enviar trava
      await R.fill('[data-teste=conversa-campo]', 'a'.repeat(4300));
      const longo = { valor: (await R.inputValue('[data-teste=conversa-campo]')).length, aviso: await R.textContent('[data-teste=conversa-contador]').catch(() => ''),
        trava: await R.isDisabled('[data-teste=conversa-enviar]') };
      await print(R, '28-texto-longo', 'escuro');
      ok('revisão: 4.300 letras coladas ficam inteiras, com aviso de quanto cortar e o Enviar travado',
        longo.valor === 4300 && /Passou de 4\.000 letras: corte 300/.test(longo.aviso ?? '') && longo.trava, JSON.stringify(longo));
      await R.fill('[data-teste=conversa-campo]', '');
      // Voltar do celular com o fio aberto: fecha o fio e fica no projeto
      const url = R.url().replace(/#.*$/, '');
      await R.goBack();
      await R.waitForSelector('[data-teste=fio]', { state: 'detached', timeout: 5000 }).catch(() => {});
      const voltou = { url: R.url().replace(/#.*$/, ''), fio: await contar(R, '[data-teste=fio]') };
      ok('revisão: o Voltar do celular fecha o fio e fica no projeto', voltou.url === url && voltou.fio === 0, JSON.stringify(voltou));
      await R.close();
    }

    // desktop (1440x900): a conversa aberta fica numa coluna de leitura, sem rolagem lateral
    for (const [tema, esquema] of [['escuro', 'dark'], ['claro', 'light']]) {
      const dctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', colorScheme: esquema });
      await dctx.addCookies(await escuro.cookies());
      const D = await dctx.newPage();
      vigiar(D, `desktop-${tema}`);
      await D.goto(`${BASE}/projetos/${pid}`);
      await abrirConversa(D);
      await D.waitForSelector('[data-teste=turno-fim]', { timeout: 8000 }).catch(() => {});
      const m = await medir(D);
      await D.screenshot({ path: path.join(PRINTS, `27-conversa-desktop-${tema}.png`) });
      prints.push(`27-conversa-desktop-${tema}.png`);
      if (m.rolagem) problemas.push(`27-conversa-desktop-${tema}: rolagem horizontal`);
      if (m.pequenos.length) problemas.push(`27-conversa-desktop-${tema}: texto < 11px`);
      await dctx.close();
    }

    const todosErros = [...erros.entries()].flatMap(([n, l]) => l.map((t) => `${n}: ${t}`));
    ok('conversa: nenhum erro de console nos dois aparelhos', todosErros.length === 0, todosErros.slice(0, 3).join(' | '));
    ok(`conversa: prints de celular claro e escuro de cada estado (${prints.length}) sem rolagem, texto pequeno ou alvo < 44 px`, problemas.length === 0 && prints.length >= 40,
      problemas.length ? problemas.slice(0, 5).join(' || ') : `em ${path.relative(WEB, PRINTS)}`);
    void errA; void errB;
  } catch (e) {
    ok('conversa: aceite da conversa rodou até o fim', false, String(e?.stack || e).slice(0, 700));
  } finally {
    await navegador.close().catch(() => {});
  }
}

// rodar sozinho (contra um site e um motor falso já de pé)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = [];
  await aceiteConversa({
    BASE: process.env.ACEITE_BASE, MOTOR: process.env.ACEITE_MOTOR, TOKEN: process.env.MOTOR_TOKEN, SENHA: process.env.ACEITE_SENHA, DADOS: process.env.EDITOR_DADOS,
    ok: (nome, passou, detalhe = '') => { res.push(passou); console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`); },
  });
  console.log(`\nCONVERSA: ${res.filter(Boolean).length}/${res.length} ok`);
  process.exit(res.every(Boolean) ? 0 : 1);
}
