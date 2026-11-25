// Aceite da onda 3 no site (docs/plano-onda3-25-11.md, 12.3: S3.1 a S3.12). Roda contra o motor falso
// (scripts/motor-falso.mjs), que tem as mesmas rotas e frases do motor real (R11 a R20 e os cartões novos da conversa).
// Sem rede e sem chave. Chamado pelo aceite.mjs depois do aceite da mesa; também roda sozinho:
//   ACEITE_BASE=… ACEITE_MOTOR=… MOTOR_TOKEN=… ACEITE_SENHA=… EDITOR_DADOS=… node scripts/aceite-onda3.mjs
// Prints de celular claro e escuro em apps/web/.verificacao/onda3/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function aceiteOnda3({ BASE, MOTOR, TOKEN, SENHA, DADOS, ok }) {
  const PRINTS = path.join(WEB, '.verificacao', 'onda3');
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
      // caixa de marcar dentro de um rótulo de 44 px: o alvo de toque é o rótulo inteiro
      .filter((el) => !(el.matches('input[type=checkbox], input[type=radio]') && (el.closest('label')?.getBoundingClientRect().height ?? 0) >= 44))
      .map((el) => `${el.tagName.toLowerCase()}${el.dataset.teste ? `[${el.dataset.teste}]` : ''}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    return { rolagem: document.documentElement.scrollWidth > larg + 1, pequenos, alvos };
  });
  async function print(pg, nome, tema, alvo) {
    if (alvo) await pg.locator(alvo).first().scrollIntoViewIfNeeded().catch(() => {});
    await dormir(150);
    const m = await medir(pg);
    const arq = `${nome}-celular-${tema}.png`;
    await pg.screenshot({ path: path.join(PRINTS, arq) });
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
  // projeto com N vídeos lidos (o arquivo vai direto ao armazenamento, como o tus faria); com pedido, a edição roda
  async function projeto(pg, nome, { videos = 1, pedido = false, fechar = true } = {}) {
    const r = await api(pg, 'projetos', { nome, tipo_video: 'evento' });
    const pid = r.corpo.id;
    fs.mkdirSync(path.join(DADOS, 'armazenamento', 'entrada', pid), { recursive: true });
    for (let i = 1; i <= videos; i++) {
      const chave = `entrada/${pid}/onda3-${i}.mp4`;
      fs.writeFileSync(path.join(DADOS, 'armazenamento', chave), randomBytes(4096));
      await api(pg, `projetos/${pid}/arquivos`, { chave, nome: `C00${30 + i}.MP4`, bytes: 4096 });
    }
    for (let i = 0; i < 60; i++) {
      const p = await motor(`projetos/${pid}`);
      if (p?.arquivos?.length === videos && p.arquivos.every((a) => a.estado === 'analisado')) break;
      await dormir(200);
    }
    if (fechar) await api(pg, `projetos/${pid}/fechar-envio`, {});
    if (pedido) await api(pg, `projetos/${pid}/pedido`, { texto: 'Reel do evento com a melhor fala no gancho' });
    return pid;
  }
  async function esperarEstado(pid, estado, limite = 40000) {
    const t = Date.now();
    while (Date.now() - t < limite) {
      const p = await motor(`projetos/${pid}`);
      if (p?.estado === estado && !p.rodando) return p;
      await dormir(250);
    }
    throw new Error(`o projeto ${pid} não chegou em ${estado}`);
  }
  // as requisições POST /refazer que a tela manda (corpo de cada uma)
  const vigiarRefazer = (pg) => {
    const l = [];
    pg.on('request', (q) => { if (q.method() === 'POST' && /\/projetos\/p_[a-z0-9]+\/refazer$/.test(q.url())) l.push(q.postDataJSON()); });
    return l;
  };
  const abrirConversa = async (pg) => {
    await pg.waitForSelector('[data-teste=conversa-barra]:not([data-estado=carregando])', { timeout: 15000 });
    if (!(await pg.locator('[data-teste=fio]').count())) await pg.click('[data-teste=conversa-abrir]');
    await pg.waitForSelector('[data-teste=fio]', { timeout: 8000 });
  };
  const mandar = async (pg, texto) => {
    await pg.fill('[data-teste=conversa-campo]', texto);
    await pg.click('[data-teste=conversa-enviar]');
  };
  const fecharConversa = async (pg) => { if (await pg.locator('[data-teste=fio]').count()) await pg.click('[data-teste=fio-fechar]'); };
  const texto = (pg, sel) => pg.locator(sel).first().textContent({ timeout: 8000 }).then((t) => (t ?? '').replace(/\s+/g, ' ').trim(), () => '');

  try {
    // equipe.json do site igual ao do pacote de schemas (versão 3, com os rótulos novos)
    {
      const a = JSON.parse(fs.readFileSync(path.join(WEB, 'lib', 'equipe.json'), 'utf8'));
      const b = JSON.parse(fs.readFileSync(path.resolve(WEB, '..', '..', 'packages', 'schemas', 'equipe.json'), 'utf8'));
      const tem = (a.passos ?? a.itens ?? []).some?.((x) => x.chave === 'conversa.ver_trilhas') ?? JSON.stringify(a).includes('conversa.ver_trilhas');
      ok('onda 3 · S3.12a: lib/equipe.json igual ao do pacote, com os rótulos novos (ver_trilhas, onde_esta, anotar…)', JSON.stringify(a) === JSON.stringify(b) && tem && JSON.stringify(a).includes('Ouvindo as trilhas da casa'));
    }
    await motor('_falso/entregas', { ligado: false });
    const escuro = await celular('dark');
    const claro = await celular('light');
    const A = await entrar(escuro);
    vigiar(A, 'escuro');
    await claro.addCookies(await escuro.cookies());
    const B = await claro.newPage();
    vigiar(B, 'claro');

    // ---------- S3.1: projeto em erro → "Tentar de novo" com o que faz e quanto custa; dois toques mandam UM pedido ----------
    const pidA = await projeto(A, 'Aceite onda3 · Super Kal', { pedido: true });
    await esperarEstado(pidA, 'entregue');
    await motor('_falso/cenario', { projeto: pidA, cenario: 'erro_montagem' });
    const posts = vigiarRefazer(A);
    await A.goto(`${BASE}/projetos/${pidA}`);
    await B.goto(`${BASE}/projetos/${pidA}`);
    await A.waitForSelector('[data-teste=tentar-de-novo]', { timeout: 15000 });
    await B.waitForSelector('[data-teste=tentar-de-novo]', { timeout: 15000 });
    const ctxErro = await texto(A, '[data-teste=refazer-contexto]');
    await print(A, '01-erro-tentar-de-novo', 'escuro');
    await print(B, '01-erro-tentar-de-novo', 'claro');
    await A.evaluate(() => { const b = document.querySelector('[data-teste=tentar-de-novo]'); b.click(); b.click(); });
    await A.waitForFunction(() => ['montando', 'conferindo', 'entregue'].includes(document.querySelector('[data-teste=estado]')?.dataset.estado ?? ''), null, { timeout: 15000 });
    await dormir(400);
    ok('onda 3 · S3.1: projeto em erro mostra "Tentar de novo", o que faz e quanto custa; dois toques rápidos mandam UM pedido com o de da sugerida',
      /A edição parou com erro/.test(ctxErro) && /Montar de novo a v1 com a mesma direção/.test(ctxErro) && /custa até US\$ 0,30/.test(ctxErro) && /≈ 9 min/.test(ctxErro)
        && posts.length === 1 && posts[0]?.de === 'montagem' && posts[0]?.versao === 'v1',
      `${ctxErro.slice(0, 140)} | ${posts.length} pedido(s): ${JSON.stringify(posts)}`);
    await esperarEstado(pidA, 'entregue');

    // ---------- S3.2: a conferência segurou: sem opção, nenhum botão novo; regras mudaram, "Conferir de novo" ----------
    await motor('_falso/cenario', { projeto: pidA, cenario: 'reprovado_qa', mudou: false });
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.dataset.estado === 'reprovado_qa', null, { timeout: 15000 });
    const respR11 = await A.waitForResponse((r) => /\/refazer$/.test(r.url()) && r.request().method() === 'GET', { timeout: 10000 }).catch(() => null);
    await dormir(600);
    const semBotao = (await A.locator('[data-teste=conferir-de-novo], [data-teste=tentar-de-novo]').count()) === 0;
    const barraSem = await texto(A, '.barra-comando__dentro');
    await motor('_falso/cenario', { projeto: pidA, cenario: 'regras_mudaram' });
    await A.waitForSelector('[data-teste=conferir-de-novo]', { timeout: 15000 });
    await B.waitForSelector('[data-teste=conferir-de-novo]', { timeout: 15000 });
    const ctxQa = await texto(A, '[data-teste=refazer-contexto]');
    await print(A, '02-conferir-de-novo', 'escuro');
    await print(B, '02-conferir-de-novo', 'claro');
    ok('onda 3 · S3.2: reprovado_qa sem opção não mostra botão novo; com as regras mudadas aparece "Conferir de novo" com o custo',
      Boolean(respR11) && semBotao && /A conferência segurou a entrega/.test(barraSem) && /As regras mudaram desde a última conferência/.test(ctxQa) && /custa ≈ US\$ 0,12/.test(ctxQa),
      `${barraSem.slice(0, 80)} | ${ctxQa.slice(0, 120)}`);
    const antes = posts.length;
    await A.click('[data-teste=conferir-de-novo]');
    await A.waitForFunction(() => ['conferindo', 'entregue'].includes(document.querySelector('[data-teste=estado]')?.dataset.estado ?? ''), null, { timeout: 15000 });
    ok('onda 3 · S3.2b: "Conferir de novo" manda o pedido da conferência e o projeto volta a conferir', posts.length === antes + 1 && posts[antes]?.de === 'conferencia', JSON.stringify(posts.slice(antes)));
    await esperarEstado(pidA, 'entregue');

    // ---------- S3.3: vídeo que ficou de fora → "Ler de novo" na linha do vídeo, com o arquivo certo ----------
    const pidC = await projeto(A, 'Aceite onda3 · leitura', { videos: 2, fechar: false });
    const c = await motor('_falso/cenario', { projeto: pidC, cenario: 'video_falhou', n: 2 });
    const postsC = vigiarRefazer(A);
    await A.goto(`${BASE}/projetos/${pidC}`);
    await B.goto(`${BASE}/projetos/${pidC}`);
    await A.waitForSelector('[data-teste=ler-de-novo]', { timeout: 15000 });
    await B.waitForSelector('[data-teste=ler-de-novo]', { timeout: 15000 });
    const linhaFora = await texto(A, '.arquivo--fora');
    await print(A, '03-ler-de-novo', 'escuro', '.arquivo--fora');
    await print(B, '03-ler-de-novo', 'claro', '.arquivo--fora');
    const semNotasC = (await A.locator('[data-teste=notas]').count()) === 0;
    await A.click('[data-teste=ler-de-novo]');
    await A.waitForFunction(() => document.querySelectorAll('[data-teste=ler-de-novo]').length === 0
      && [...document.querySelectorAll('.arquivo')].every((li) => li.textContent.includes('lido')), null, { timeout: 15000 });
    ok('onda 3 · S3.3: vídeo que ficou de fora mostra "Ler de novo" com o custo; o toque manda o arquivo_id certo e o vídeo é lido',
      /ficou de fora/.test(linhaFora) && /Ler de novo/.test(linhaFora) && /custa até US\$ 0,05/.test(linhaFora)
        && postsC.length === 1 && postsC[0]?.de === 'leitura' && postsC[0]?.arquivo_id === c?.arquivo_id,
      `${linhaFora.slice(0, 100)} | ${JSON.stringify(postsC)}`);

    // ---------- S3.4 + S3.12: cartões da conversa: trilha, refazer e nota ----------
    await A.goto(`${BASE}/projetos/${pidA}`);
    await B.goto(`${BASE}/projetos/${pidA}`);
    await abrirConversa(A);
    await abrirConversa(B);
    await mandar(A, 'troca a música');
    const viuEco = await A.waitForFunction(() => [...document.querySelectorAll('[data-teste=ferramenta][data-nome=ver_trilhas]')]
      .some((li) => /Eco/.test(li.textContent) && /Ouvindo as trilhas da casa/.test(li.textContent)), null, { timeout: 12000 }).then(() => true, () => false);
    await A.waitForSelector('[data-teste=confirmacao][data-acao=trilha][data-resultado=pendente]', { timeout: 15000 });
    await B.waitForSelector('[data-teste=confirmacao][data-acao=trilha][data-resultado=pendente]', { timeout: 10000 });
    const sel = '[data-teste=confirmacao][data-acao=trilha][data-resultado=pendente]';
    const tTrilha = await texto(A, sel);
    const fazTrilha = await texto(A, `${sel} [data-teste=confirmacao-texto]`);
    const botaoTrilha = await texto(A, `${sel} [data-teste=confirmacao-sim]`);
    const soAquiTrilha = await A.locator(`${sel} [data-teste=confirmacao-so-aqui]`).count();
    await print(A, '04-cartao-trilha', 'escuro', sel);
    await print(B, '04-cartao-trilha', 'claro', sel);
    ok('onda 3 · S3.12: rótulo novo do equipe.json na tela durante a ferramenta ("Eco · Ouvindo as trilhas da casa")', viuEco);
    ok('onda 3 · S3.4a: cartão de trilha com título, frase sem aspas, "Não muda", Música antes → depois, atenção, custo, demora e o verbo "Trocar a música"; sem "Só neste projeto"',
      /Trocar a música da v1/.test(tTrilha) && /^Trocar a música da v1 por “Pulso de Feira” \(104 bpm\), sem nova direção\.$/.test(fazTrilha)
        && /Não muda: Os mesmos trechos/.test(tTrilha) && /Música Noite Clara/.test(tTrilha) && /Pulso de Feira/.test(tTrilha) && /cortes andam até uma batida/.test(tTrilha)
        && /Encaixe na batida → Montagem → Conferência → Entrega/.test(tTrilha) && /≈ US\$ 0,12/.test(tTrilha) && /Olhar o filme novo com IA/.test(tTrilha) && /≈ 10 min/.test(tTrilha)
        && botaoTrilha === 'Trocar a música' && soAquiTrilha === 0,
      `${fazTrilha} | ${botaoTrilha} | ${tTrilha.slice(0, 160)}`);
    await A.click(`${sel} [data-teste=confirmacao-sim]`);
    await A.waitForSelector('[data-teste=confirmacao][data-acao=trilha][data-resultado=feito]', { timeout: 10000 });
    const feitoTrilha = await texto(A, '[data-teste=confirmacao][data-acao=trilha][data-resultado=feito]');
    await esperarEstado(pidA, 'entregue');
    const comV2 = (await motor(`projetos/${pidA}`))?.versoes?.length === 2;
    ok('onda 3 · S3.4b: tocar "Trocar a música" manda o toque e a linha diz "Feito · trocando a música"; sai a V2',
      /Feito · trocando a música/.test(feitoTrilha) && /a versão nova aparece na mesa/.test(feitoTrilha) && comV2, feitoTrilha);

    await motor('_falso/cenario', { projeto: pidA, cenario: 'erro_entrega' });
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.dataset.estado === 'erro', null, { timeout: 15000 });
    await mandar(A, 'tenta de novo');
    const selR = '[data-teste=confirmacao][data-acao=refazer][data-resultado=pendente]';
    await A.waitForSelector(selR, { timeout: 15000 });
    await B.waitForSelector(selR, { timeout: 10000 });
    const tRef = await texto(A, selR);
    const fazRef = await texto(A, `${selR} [data-teste=confirmacao-texto]`);
    const botaoRef = await texto(A, `${selR} [data-teste=confirmacao-sim]`);
    await print(A, '05-cartao-refazer', 'escuro', selR);
    await print(B, '05-cartao-refazer', 'claro', selR);
    await A.click(`${selR} [data-teste=confirmacao-sim]`);
    await A.waitForSelector('[data-teste=confirmacao][data-acao=refazer][data-resultado=feito]', { timeout: 10000 });
    const feitoRef = await texto(A, '[data-teste=confirmacao][data-acao=refazer][data-resultado=feito]');
    ok('onda 3 · S3.4c: cartão de refazer sem aspas, com o que roda, custo e o verbo "Entregar de novo"; o toque diz "Feito · recomeçou"',
      /Entregar de novo a v2/.test(tRef) && /^Conferir a v2 \(aproveita a conferência se nada mudou\) e entregar de novo\./.test(fazRef) && !/[“”]/.test(fazRef)
        && /Conferência → Entrega/.test(tRef) && /dá para voltar\s*O filme não muda\./.test(tRef) && botaoRef === 'Entregar de novo'
        && (await A.locator(`[data-teste=confirmacao][data-acao=refazer] [data-teste=confirmacao-so-aqui]`).count()) === 0
        && /Feito · recomeçou/.test(feitoRef) && /está sendo conferida e entregue de novo/.test(feitoRef),
      `${fazRef} | ${botaoRef} | ${feitoRef}`);
    await esperarEstado(pidA, 'entregue');

    await mandar(A, 'anota: usar este corte no reel de dezembro');
    const selN = '[data-teste=confirmacao][data-acao=nota][data-resultado=pendente]';
    await A.waitForSelector(selN, { timeout: 15000 });
    await B.waitForSelector(selN, { timeout: 10000 });
    const tNota = await texto(A, selN);
    const exatoNota = await texto(A, `${selN} [data-teste=confirmacao-texto]`);
    await print(A, '06-cartao-nota', 'escuro', selN);
    await print(B, '06-cartao-nota', 'claro', selN);
    await A.click(`${selN} [data-teste=confirmacao-sim]`);
    await A.waitForSelector('[data-teste=confirmacao][data-acao=nota][data-resultado=feito]', { timeout: 10000 });
    const feitoNota = await texto(A, '[data-teste=confirmacao][data-acao=nota][data-resultado=feito]');
    ok('onda 3 · S3.4d: cartão de nota com o texto entre aspas, "não refaz nada", o verbo "Guardar a nota"; o toque diz "Feito · nota guardada"',
      exatoNota === '“usar este corte no reel de dezembro”' && /Guardar esta nota no projeto/.test(tNota) && /nada · não refaz nada/.test(tNota)
        && /Guardar a nota/.test(tNota) && /Feito · nota guardada/.test(feitoNota), `${exatoNota} | ${feitoNota}`);
    await fecharConversa(A);
    await A.waitForSelector('[data-teste=notas] [data-teste=nota]', { timeout: 10000 });
    const notasTxt = await texto(A, '[data-teste=notas]');
    await print(A, '07-notas', 'escuro', '[data-teste=notas]');
    ok('onda 3 · S3.9: "Suas notas" aparece com a nota guardada e não existe no projeto sem nota', /Suas notas/.test(notasTxt) && /usar este corte no reel de dezembro/.test(notasTxt) && semNotasC, notasTxt.slice(0, 120));

    // ---------- S3.5: apagar: a prévia diz o que vai e o que fica; o nome digitado acende o botão; volta para a lista ----------
    const pidD = await projeto(A, 'Aceite onda3 · Apagar Já', { videos: 2 });
    await A.goto(`${BASE}/projetos/${pidD}`);
    await B.goto(`${BASE}/projetos/${pidD}`);
    await A.click('[data-teste=apagar-abrir]');
    await B.click('[data-teste=apagar-abrir]');
    await A.waitForSelector('[data-teste=apagar][data-pode=true]', { timeout: 10000 });
    await B.waitForSelector('[data-teste=apagar][data-pode=true]', { timeout: 10000 });
    const vai = await texto(A, '[data-teste=apagar-vai]');
    const fica = await texto(A, '[data-teste=apagar-fica]');
    await A.fill('[data-teste=apagar-nome]', 'Aceite onda3 · Apagar');
    const apagadoComErrado = await A.isDisabled('[data-teste=apagar-confirmar]');
    await A.fill('[data-teste=apagar-nome]', '  aceite ONDA3 ·  apagar já ');
    const acesoComCaixa = await A.isEnabled('[data-teste=apagar-confirmar]');
    await B.fill('[data-teste=apagar-nome]', 'Aceite onda3 · Apagar Já');
    await print(A, '08-apagar-aberto', 'escuro', '[data-teste=apagar]');
    await print(B, '08-apagar-aberto', 'claro', '[data-teste=apagar]');
    const longeDoAprovar = await A.evaluate(() => !document.querySelector('[data-teste=apagar] [data-teste=aprovar]') && !document.querySelector('.barra-comando [data-teste^=apagar]'));
    await A.click('[data-teste=apagar-confirmar]');
    await A.waitForURL(`${BASE}/projetos?apagado=1`, { timeout: 15000 });
    const aviso = await texto(A, '[data-teste=projeto-apagado]');
    const naLista = await A.locator(`a[href="/projetos/${pidD}"]`).count();
    await print(A, '09-projeto-apagado', 'escuro');
    const noMotor = await fetch(`${MOTOR}/v1/projetos/${pidD}`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.status);
    ok('onda 3 · S3.5: apagar mostra o que vai e o que fica; nome errado deixa o botão apagado, outra caixa acende; apaga e volta para a lista com "Projeto apagado."',
      /Vai apagar para sempre: 2 vídeos enviados \(8 KB\), 0 versões, a conversa e a mesa deste projeto/.test(vai) && /livro de gastos/.test(fica) && /backups/.test(fica)
        && apagadoComErrado && acesoComCaixa && longeDoAprovar && /^Projeto apagado\. Os arquivos somem do servidor em alguns minutos\.$/.test(aviso) && naLista === 0 && noMotor === 404,
      `${vai} | errado apagado=${apagadoComErrado} caixa aceso=${acesoComCaixa} | ${aviso} | motor ${noMotor}`);

    // ---------- S3.6: filme na página de entregas: recusa com frase, "Tirar a V1 da página", depois apaga ----------
    const pidE = await projeto(A, 'Aceite onda3 · Na Página', { pedido: true });
    await esperarEstado(pidE, 'entregue');
    await motor('_falso/entregas', { ligado: true, projeto: pidE, versao: 'v1', estado: 'no_ar' });
    const retiradas = [];
    A.on('request', (q) => { if (q.method() === 'POST' && /\/versoes\/v1\/retirar$/.test(q.url())) retiradas.push(q.url()); });
    await A.goto(`${BASE}/projetos/${pidE}`);
    await A.click('[data-teste=apagar-abrir]');
    await A.waitForSelector('[data-teste=apagar][data-pode=false]', { timeout: 10000 });
    const porque = await texto(A, '[data-teste=apagar-porque]');
    const botaoTirar = await texto(A, '[data-teste=apagar-tirar]');
    await print(A, '10-apagar-na-pagina', 'escuro', '[data-teste=apagar]');
    await B.goto(`${BASE}/projetos/${pidE}`);
    await B.click('[data-teste=apagar-abrir]');
    await B.waitForSelector('[data-teste=apagar][data-pode=false]', { timeout: 10000 });
    await print(B, '10-apagar-na-pagina', 'claro', '[data-teste=apagar]');
    await A.click('[data-teste=apagar-tirar]');
    await A.waitForSelector('[data-teste=apagar][data-pode=true]', { timeout: 20000 });
    await A.fill('[data-teste=apagar-nome]', 'Aceite onda3 · Na Página');
    await A.click('[data-teste=apagar-confirmar]');
    await A.waitForURL(`${BASE}/projetos?apagado=1`, { timeout: 15000 });
    ok('onda 3 · S3.6: filme na página de entregas: frase do motor e "Tirar a V1 da página" → retirar → a prévia libera → apaga',
      /^A v1 está na página de entregas; tire de lá primeiro \(botão Tirar da página\) e apague depois\.$/.test(porque) && botaoTirar === 'Tirar a V1 da página' && retiradas.length === 1,
      `${porque} | ${botaoTirar} | ${retiradas.length} retirada(s)`);
    await motor('_falso/entregas', { ligado: false });

    // ---------- S3.7 + S3.8: Caderno: regras do dono com origem e "Apagar"; fixas da casa sem botão; prazo da conversa ----------
    const sem = await motor('_falso/memoria', { projeto: pidA });
    const C1 = await escuro.newPage();
    vigiar(C1, 'caderno-escuro');
    await C1.goto(`${BASE}/caderno`);
    const regraDono = '[data-teste=caderno-regras] [data-id=r_dono_1a2b3c4d]';
    await C1.waitForSelector(regraDono, { timeout: 10000 });
    const origem = await texto(C1, `${regraDono} small`);
    const apagada = await texto(C1, '[data-teste=caderno-regras] [data-id=r_dono_5e6f7a8b] small');
    const casa = await texto(C1, '[data-teste=caderno-regras] [data-id=r_retencao]');
    const casaBotao = await C1.locator('[data-teste=caderno-regras] [data-id=r_retencao] button').count();
    const hoje = new Date();
    const dataBr = `${String(hoje.getUTCDate()).padStart(2, '0')}/${String(hoje.getUTCMonth() + 1).padStart(2, '0')}/${hoje.getUTCFullYear()}`;
    await C1.click(`${regraDono} [data-teste=memoria-apagar]`);
    await C1.waitForSelector(`${regraDono} [data-teste=memoria-confirma]`, { timeout: 5000 });
    const confirma = await texto(C1, `${regraDono} [data-teste=memoria-confirma]`);
    await print(C1, '11-caderno-regras', 'escuro', regraDono);
    const C2 = await claro.newPage();
    vigiar(C2, 'caderno-claro');
    await C2.goto(`${BASE}/caderno`);
    await C2.waitForSelector(regraDono, { timeout: 10000 });
    await C2.click(`${regraDono} [data-teste=memoria-apagar]`);
    await print(C2, '11-caderno-regras', 'claro', regraDono);
    await C1.click(`${regraDono} [data-teste=memoria-confirmar]`);
    await C1.waitForSelector(regraDono, { state: 'detached', timeout: 8000 });
    const feitoRegra = await texto(C1, '[data-teste=caderno-regras] [data-teste=memoria-feito]');
    ok('onda 3 · S3.7a: regra do dono com "De: {nome} · V2 · data" e "Apagar"; projeto apagado diz "projeto apagado"; a da casa diz "Fixa da casa" sem botão; confirmação com o que acontece; some e diz "Regra apagada."',
      origem === `De: Aceite onda3 · Super Kal · V2 · ${dataBr}` && apagada === 'De: projeto apagado · V1 · 12/11/2026' && /Fixa da casa/.test(casa) && casaBotao === 0
        && /Deixa de valer nos próximos filmes\. Nenhum filme é refeito\./.test(confirma) && /A conferência que nasceu junto continua/.test(confirma) && feitoRegra === 'Regra apagada.',
      `${origem} | ${apagada} | ${confirma.slice(0, 80)} | ${feitoRegra}`);
    const checaDono = '[data-teste=caderno-checagens] [data-id=c_dono_1a2b3c4d]';
    await C1.click(`${checaDono} [data-teste=memoria-apagar]`);
    const confChe = await texto(C1, `${checaDono} [data-teste=memoria-confirma]`);
    await C1.click(`${checaDono} [data-teste=memoria-confirmar]`);
    await C1.waitForSelector(checaDono, { state: 'detached', timeout: 8000 });
    const feitoChe = await texto(C1, '[data-teste=caderno-checagens] [data-teste=memoria-feito]');
    const vocDono = `[data-teste=caderno-vocabulario] [data-id=${sem?.vocabulario_id}]`;
    await C1.click(`${vocDono} [data-teste=memoria-apagar]`);
    const confVoc = await texto(C1, `${vocDono} [data-teste=memoria-confirma]`);
    await C1.click(`${vocDono} [data-teste=memoria-confirmar]`);
    await C1.waitForSelector(vocDono, { state: 'detached', timeout: 8000 });
    const feitoVoc = await texto(C1, '[data-teste=caderno-vocabulario] [data-teste=memoria-feito]');
    const depois = await motor('memoria');
    ok('onda 3 · S3.7b: o mesmo para conferência e palavra ("Conferência apagada.", "Palavra apagada.") e o motor não lista mais os três',
      /O editor para de conferir isto/.test(confChe) && feitoChe === 'Conferência apagada.' && /deixa de trocar “criete” por “creat”/.test(confVoc) && feitoVoc === 'Palavra apagada.'
        && !depois.regras.some((r) => r.id === 'r_dono_1a2b3c4d') && !depois.checagens.some((x) => x.id === 'c_dono_1a2b3c4d') && !depois.vocabulario.some((v) => v.id === sem?.vocabulario_id),
      `${feitoChe} | ${feitoVoc}`);
    const ret90 = await texto(C1, '[data-teste=caderno-retencao]');
    await C1.locator('[data-teste=caderno-conversa]').scrollIntoViewIfNeeded();
    await print(C1, '12-caderno-prazo', 'escuro', '[data-teste=caderno-conversa]');
    await motor('_teste/conversa', { retencao: 0 });
    await C2.reload();
    await C2.waitForSelector('[data-teste=caderno-retencao]', { timeout: 10000 });
    const ret0 = await texto(C2, '[data-teste=caderno-retencao]');
    await print(C2, '12-caderno-prazo', 'claro', '[data-teste=caderno-conversa]');
    await motor('_teste/conversa', { retencao: 90 });
    ok('onda 3 · S3.8: o Caderno diz por quanto tempo a conversa fica guardada (90 dias) e "sem prazo" com 0',
      /ficam guardadas 90 dias depois de encerradas/.test(ret90) && /a conversa em andamento nunca é apagada/.test(ret90) && ret0 === 'As mensagens da conversa ficam guardadas sem prazo.', `${ret90.slice(0, 70)} | ${ret0}`);

    // ---------- S3.11: proxy: só o formato do id do dono passa ----------
    {
      const P = await escuro.newPage();         // página sem vigia: os 404 daqui são de propósito
      await P.goto(`${BASE}/projetos`);
      const passa = await api(P, 'memoria/regras/r_dono_0123abcd/apagar', {});
      const casa2 = await api(P, 'memoria/regras/r_retencao/apagar', {});
      const volta = await api(P, 'memoria/regras/r_dono_0123abcd/../x', {});
      const cod = await api(P, 'memoria/regras/r_dono_0123abcd/%2e%2e/apagar', {});
      await P.close();
      const bloq = (r) => r.status === 404 && r.corpo?.detail === 'rota do motor não permitida';
      ok('onda 3 · S3.11: o proxy deixa passar /memoria/regras/r_dono_…/apagar até o motor e barra r_retencao e caminhos com ..',
        passa.status === 404 && passa.corpo?.detail === 'essa regra não existe mais' && bloq(casa2) && bloq(volta) && bloq(cod),
        `${passa.status} ${passa.corpo?.detail} | ${casa2.corpo?.detail} | ${volta.corpo?.detail} | ${cod.corpo?.detail}`);
    }

    await C1.close(); await C2.close();
    await escuro.close(); await claro.close();
  } catch (e) {
    ok('onda 3: o aceite rodou até o fim', false, String(e?.stack || e).slice(0, 600));
  } finally {
    await navegador.close().catch(() => {});
    await motor('_falso/entregas', { ligado: false }).catch(() => {});
  }
  ok('onda 3 · S3.10: prints de celular claro e escuro sem rolagem lateral, sem texto < 11 px e com alvos de 44 px', problemas.length === 0 && prints.length >= 20,
    problemas.length ? problemas.slice(0, 6).join(' || ') : `${prints.length} prints em ${path.relative(WEB, PRINTS)}`);
  ok('onda 3: nenhum erro de console nas telas novas', erros.length === 0, erros.slice(0, 4).join(' | '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = [];
  const ok = (nome, passou, detalhe = '') => { r.push(passou); console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`); };
  await aceiteOnda3({ BASE: process.env.ACEITE_BASE, MOTOR: process.env.ACEITE_MOTOR, TOKEN: process.env.MOTOR_TOKEN, SENHA: process.env.ACEITE_SENHA, DADOS: process.env.EDITOR_DADOS, ok });
  console.log(`\nACEITE ONDA 3: ${r.filter(Boolean).length}/${r.length} ok`);
  process.exit(r.every(Boolean) ? 0 : 1);
}
