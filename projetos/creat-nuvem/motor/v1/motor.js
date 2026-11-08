/*
 * motor/v1/motor.js · Porta Aberta, motor v1 (congelado: ADR-001)
 *
 * Generalização do Fio no Couro (projetos/barbearia/): o site inteiro sai de
 * window.TENANT (schema/tenant.schema.json). Este arquivo não tem dado de cliente.
 *
 * Script clássico (sem import/export): abre por file:// com duplo clique.
 * Também roda no node: `const M = require('motor/v1/motor.js')` dá as funções puras
 * (construirEstado, jsonLd, preencherTemplate, scriptTenant, montarTenantPrevia,
 * lerFragmento) para o build-site.cjs e o produzir.mjs (T9). Ver docs/relatorio/T4.md.
 *
 * Ordem no navegador: nichos/index.js → nichos/<k>.js → tenant.js (window.TENANT)
 * → motor/v1/motor.js → efeito.js → som.js → agendamento.js.
 * Boot: automático no DOMContentLoaded quando há window.TENANT; a prévia usa
 * window.CREAT_SITE = { manual: true } e chama CreatMotor.iniciar(tenant).
 *
 * window.CREAT_SITE (opções do site, escritas pelo build; não é campo do tenant):
 *   { home: 'https://.../', rodape: true|false, url: 'https://site-do-cliente/', manual, nomeExemplo }
 *   rodape:false só sai do build-site.cjs --sem-rodape (decisão do Marcos).
 *
 * Segurança: nenhum innerHTML com dado. Tudo por createElement/textContent.
 */
(function (raiz) {
  'use strict';

  var VERSAO = 'v1.0.0';
  var W = typeof window !== 'undefined' ? window : null;
  var DOC = W && W.document ? W.document : null;

  var DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var DIAS_TITULO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_SCHEMA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* textos de interface do motor (genéricos, sem dado de cliente; o tenant sobrepõe as chaves da lista branca) */
  var TEXTOS_PADRAO = {
    heroTitulo: 'Peça o seu horário pelo celular.',
    heroSubtitulo: 'Escolha o serviço, o dia e o horário. O pedido chega no WhatsApp e o dono confirma pelo WhatsApp.',
    manifesto: '',
    servicosTitulo: 'Serviços',
    servicosNota: '',
    equipeTitulo: 'Equipe',
    avaliacoesTitulo: 'Recados',
    pedidoTitulo: 'Peça o seu horário',
    pedidoNota: 'O pedido vai para o WhatsApp do negócio e o dono confirma pelo WhatsApp.',
    ritualDica: 'Arraste para enviar',
    confirmacaoTitulo: 'Pedido pronto para enviar',
    confirmacaoTexto: 'Toque em enviar no WhatsApp. O horário vale depois que o dono confirma pelo WhatsApp.',
    letreiroAberto: 'Aberto agora · peça o seu horário',
    letreiroFechado: 'Fechado agora · abre {dia} às {hora}',
    localTitulo: 'Onde fica',
    faqTitulo: 'Perguntas',
    rodapeFrase: ''
  };
  var CHAVES_TEXTO = Object.keys(TEXTOS_PADRAO).concat(['faq']);

  var UI = {
    pular: 'Pular para pedir horário',
    pedir: 'Pedir horário',
    agendarExterno: 'Agendar',
    agendarExternoNota: 'Abre a página de horários que o negócio já usa.',
    temaRotulo: 'Tema',
    temaClaro: 'Usar tema claro',
    temaEscuro: 'Usar tema escuro',
    somRotulo: 'Som',
    somLigar: 'Ligar o som',
    somDesligar: 'Desligar o som',
    faixaPrevia: 'Prévia. Serviços, preços e textos são exemplo até o dono aprovar.',
    exemplo: 'exemplo',
    sobConsulta: 'sob consulta',
    min: 'min',
    folga: 'fechado',
    horarioTitulo: 'Horário da casa',
    comoChegar: 'Como chegar no Google Maps',
    instagram: 'Ver no Instagram',
    whatsFlutuante: 'Chamar no WhatsApp',
    whatsRodape: 'WhatsApp',
    enderecoPrevia: 'O endereço completo entra quando o site for para o ar.',
    creat: 'Aberto pela Creat',
    creatChamada: 'veja o seu',
    semTenant: 'Este site não carregou os dados. Recarregue a página.',
    fechadoSemPrevisao: 'Fechado agora'
  };

  var FONTES_PADRAO = {
    google: '',
    display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    texto: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    dado: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
  };

  /* ===================================================================
     1. FUNÇÕES PURAS
     =================================================================== */
  function tem(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(s) {
    var p = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim());
    return p ? (+p[1]) * 60 + (+p[2]) : NaN;
  }
  function minParaHHMM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  /* 9h quando os minutos são zero; 15h40 nos demais */
  function horaTexto(m) { var h = Math.floor(m / 60), mi = m % 60; return h + 'h' + (mi ? pad(mi) : ''); }
  function minutosDe(d) { return d.getHours() * 60 + d.getMinutes(); }
  function chaveData(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dataDaChave(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function inicioDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function somarDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function diferencaDias(a, b) { return Math.round((inicioDia(b) - inicioDia(a)) / 864e5); }
  function diaRelativo(d, agora) {
    var n = diferencaDias(agora, d);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    return DIAS_LONGO[d.getDay()];
  }
  /* 'sábado, 15/11' (mensagem e conferência, sem ambiguidade) */
  function diaLongo(d, agora) { return diaRelativo(d, agora) + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }

  function fmt(str, vars) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && tem(vars, k) && vars[k] != null ? String(vars[k]) : m;
    });
  }
  function colapsar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function moeda(v) {
    if (v === null || v === undefined || v === '' || isNaN(+v)) return UI.sobConsulta;
    var n = +v, inteiro = Math.round(n) === n;
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 }).format(n);
    } catch (e) { return 'R$ ' + (inteiro ? String(n) : n.toFixed(2).replace('.', ',')); }
  }

  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  /* WhatsApp digitado pelo cliente final: DDD + 8 ou 9 dígitos, sem 55 e sem zero de operadora */
  function normalizarWhats(v) {
    var d = soDigitos(v);
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length > 11 && d.charAt(0) === '0') d = d.slice(1);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 11);
  }
  function mascararWhats(digitos) {
    var d = soDigitos(digitos).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    var ddd = d.slice(0, 2), r = d.slice(2);
    if (r.length <= 4) return '(' + ddd + ') ' + r;
    if (d.length <= 10) return '(' + ddd + ') ' + r.slice(0, 4) + '-' + r.slice(4);
    return '(' + ddd + ') ' + r.slice(0, 5) + '-' + r.slice(5);
  }
  function whatsValido(v) { return /^[1-9]{2}\d{8,9}$/.test(normalizarWhats(v)); }
  /* WhatsApp do negócio no tenant: 55 + DDD + 8/9 dígitos, nunca 5500... */
  function whatsNegocioValido(v) { return /^55[1-9]\d\d{8,9}$/.test(String(v || '')); }
  function nomeValido(v) {
    var letras;
    try { letras = String(v || '').match(/\p{L}/gu); } catch (e) { letras = String(v || '').match(/[A-Za-zÀ-ÿ]/g); }
    return !!letras && letras.length >= 2;
  }

  function horarioDoDia(funcionamento, diaSemana) {
    var s = funcionamento && funcionamento.semana;
    if (!s) return null;
    var h = s[diaSemana];
    if (h === undefined) h = s[String(diaSemana)];
    if (!h) return null;
    var a = hm(h.abre), f = hm(h.fecha);
    if (!(f > a)) return null;
    return { abre: a, fecha: f };
  }
  function passoDe(funcionamento) { var p = +(funcionamento && funcionamento.passoMin); return p >= 5 ? p : 20; }
  function menorDuracao(servicos) {
    var m = Infinity;
    (servicos || []).forEach(function (s) { var d = +s.duracaoMin; if (d > 0 && d < m) m = d; });
    return m === Infinity ? 15 : m;
  }

  /*
   * Horários de pedido de um dia: de abre até fecha, de passo em passo, enquanto o menor
   * serviço couber até fechar; hoje, só a partir de agora + antecedência.
   * Não existe "ocupado": o motor não sabe a agenda do dono e não inventa (regra dura 1).
   */
  function gerarHorarios(funcionamento, servicos, chave, agora) {
    var d = dataDaChave(chave);
    var h = horarioDoDia(funcionamento, d.getDay());
    if (!h) return [];
    var dif = diferencaDias(agora, d);
    if (dif < 0) return [];
    var minimo = -Infinity;
    if (dif === 0) minimo = minutosDe(agora) + (+(funcionamento.antecedenciaMin) || 0);
    var passo = passoDe(funcionamento), menor = menorDuracao(servicos), out = [];
    for (var t = h.abre; t + menor <= h.fecha; t += passo) if (t >= minimo) out.push(t);
    return out;
  }
  /* serviço cabe se termina até o fechamento (limite real do dia, não ocupação) */
  function servicosQueCabem(servicos, inicio, fecha) {
    return (servicos || []).map(function (s) { return { servico: s, cabe: inicio + (+s.duracaoMin || 0) <= fecha }; });
  }
  function resumoDia(funcionamento, servicos, chave, agora) {
    var d = dataDaChave(chave);
    var h = horarioDoDia(funcionamento, d.getDay());
    var horarios = h ? gerarHorarios(funcionamento, servicos, chave, agora) : [];
    return { chave: chave, data: d, horario: h, aberto: !!h, horarios: horarios, livres: horarios.length };
  }

  function calcularLetreiro(funcionamento, textos, agora) {
    var h = horarioDoDia(funcionamento, agora.getDay());
    var m = minutosDe(agora);
    if (h && m >= h.abre && m < h.fecha) return { estado: 'aberto', texto: fmt(textos.letreiroAberto, {}) };
    if (h && m < h.abre) return { estado: 'fechado', texto: fmt(textos.letreiroFechado, { dia: 'hoje', hora: horaTexto(h.abre) }) };
    for (var k = 1; k <= 7; k++) {
      var d = somarDias(agora, k);
      var hd = horarioDoDia(funcionamento, d.getDay());
      if (hd) return { estado: 'fechado', texto: fmt(textos.letreiroFechado, { dia: diaRelativo(d, agora), hora: horaTexto(hd.abre) }) };
    }
    return { estado: 'fechado', texto: UI.fechadoSemPrevisao };
  }

  /* agrupa dias iguais: "Terça a Sexta 9h às 20h", "Domingo e Segunda fechado" */
  function linhasHorario(funcionamento) {
    var ordem = [1, 2, 3, 4, 5, 6, 0], grupos = [], folgas = [];
    ordem.forEach(function (dia) {
      var h = horarioDoDia(funcionamento, dia);
      if (!h) { folgas.push(dia); return; }
      var ass = h.abre + '-' + h.fecha, ult = grupos[grupos.length - 1];
      if (ult && ult.ass === ass && ordem.indexOf(dia) === ordem.indexOf(ult.dias[ult.dias.length - 1]) + 1) ult.dias.push(dia);
      else grupos.push({ ass: ass, dias: [dia], h: h });
    });
    var linhas = grupos.map(function (g) {
      var rot = g.dias.length === 1 ? DIAS_TITULO[g.dias[0]]
        : g.dias.length === 2 ? DIAS_TITULO[g.dias[0]] + ' e ' + DIAS_TITULO[g.dias[1]]
          : DIAS_TITULO[g.dias[0]] + ' a ' + DIAS_TITULO[g.dias[g.dias.length - 1]];
      return { rotulo: rot, valor: horaTexto(g.h.abre) + ' às ' + horaTexto(g.h.fecha), dias: g.dias, folga: false };
    });
    if (folgas.length) {
      var nomes = folgas.map(function (d) { return DIAS_TITULO[d]; });
      var rot = nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
      linhas.push({ rotulo: rot, valor: UI.folga, dias: folgas, folga: true });
    }
    return linhas;
  }

  function enderecoLinhas(e) {
    if (!e) return [];
    return [
      [e.rua, e.numero].filter(Boolean).join(', '),
      [e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · '),
      e.cep ? 'CEP ' + e.cep : ''
    ].filter(Boolean);
  }
  function enderecoTexto(e) {
    if (!e) return '';
    var l1 = [e.rua, e.numero].filter(Boolean).join(', ');
    var l2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    return [l1, l2, e.cep].filter(Boolean).join(' - ');
  }

  /* avaliação só aparece com origem e aprovação datada (regra dura 1) */
  function avaliacoesValidas(lista, previa) {
    if (previa || !Array.isArray(lista)) return [];
    return lista.filter(function (a) {
      return a && typeof a.texto === 'string' && colapsar(a.texto) && typeof a.autor === 'string' && colapsar(a.autor) &&
        (a.origem === 'dono' || a.origem === 'cliente_autorizado') &&
        typeof a.aprovadoEm === 'string' && !isNaN(Date.parse(a.aprovadoEm));
    });
  }

  /* ---------- fragmento da prévia (CONTRATOS-DETALHE.md, item c) ---------- */
  var RE_NOME = /^[\p{L}\p{N} &.'-]+$/u;
  var RE_CIDADE = /^[\p{L}\p{N} .'-]+$/u;
  var RE_UTM = /^[A-Za-z0-9._-]{1,64}$/;
  var CHAVES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  /* nunca lança; campo inválido some ou vira padrão */
  function lerFragmento(hash) {
    var out = { k: null, n: null, c: null, p: 1, utm: {}, nomeExemplo: true, invalidos: [] };
    var bruto = String(hash == null ? '' : hash);
    if (bruto.charAt(0) === '#') bruto = bruto.slice(1);
    if (bruto.length > 512) { out.invalidos.push('fragmento'); return out; }
    var q;
    try { q = new URLSearchParams(bruto); } catch (e) { out.invalidos.push('fragmento'); return out; }
    var k = q.get('k');
    if (k && /^[a-z][a-z0-9-]{1,30}$/.test(k)) out.k = k; else if (k != null) out.invalidos.push('k');
    var n = colapsar(q.get('n'));
    if (n && n.length <= 40 && RE_NOME.test(n)) { out.n = n; out.nomeExemplo = false; } else if (q.get('n') != null) out.invalidos.push('n');
    var c = colapsar(q.get('c'));
    if (c && c.length <= 40 && RE_CIDADE.test(c)) out.c = c; else if (q.get('c') != null && c) out.invalidos.push('c');
    var p = q.get('p');
    if (p != null) { if (/^[1-3]$/.test(p)) out.p = +p; else out.invalidos.push('p'); }
    CHAVES_UTM.forEach(function (u) { var v = q.get(u); if (v != null) { if (RE_UTM.test(v)) out.utm[u] = v; else out.invalidos.push(u); } });
    return out;
  }

  /* corta em até `max` caracteres na última palavra inteira */
  function cortarNaPalavra(s, max) {
    s = colapsar(s);
    if (s.length <= max) return s;
    var corte = s.slice(0, max + 1), i = corte.lastIndexOf(' ');
    return (i > 0 ? corte.slice(0, i) : s.slice(0, max)).replace(/[\s&.'-]+$/, '');
  }
  /* descrição: tira frases do fim até caber */
  function cortarFrases(s, max) {
    s = colapsar(s);
    while (s.length > max) {
      var i = s.lastIndexOf('. ', s.length - 2);
      if (i < 0) return cortarNaPalavra(s, max - 1) + '.';
      s = s.slice(0, i + 1);
    }
    return s;
  }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function slugDe(s) {
    var t = colapsar(s).toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    t = t.replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return t.length >= 2 ? t : 'site';
  }

  /*
   * Monta um TenantConfig v1 a partir do preset + nome + cidade + paleta.
   * Usado pela prévia (meta.previa = true) e reaproveitável pelo produzir.mjs.
   * opc = { nome, cidade, paleta (1..3), agora: Date, previa (padrão true), slug }
   */
  function montarTenantPrevia(preset, opc) {
    opc = opc || {};
    var t = copia(preset.tenantBase);
    var nome = colapsar(opc.nome) || t.negocio.nome;
    var cidade = colapsar(opc.cidade);
    var paletas = preset.paletas || [];
    var i = Math.max(1, Math.min(paletas.length || 1, +opc.paleta || 1)) - 1;
    var pal = paletas[i] && paletas[i].claro;
    t.nicho = preset.id;
    t.slug = opc.slug || (opc.previa === false ? slugDe(nome + (cidade ? ' ' + cidade : '')) : 'previa');
    t.negocio.nome = nome.slice(0, 40);
    t.negocio.nomeCurto = cortarNaPalavra(nome, 28) || t.negocio.nomeCurto;
    if (cidade) t.negocio.endereco = { cidade: cidade };
    var pg = preset.pagina || {};
    var vars = { negocio: t.negocio.nome, cidade: cidade };
    var titulo = cidade && pg.titulo ? fmt(pg.titulo, vars) : '';
    if (!titulo || titulo.length > 70) titulo = fmt(pg.tituloSemCidade || pg.titulo || '{negocio}', vars);
    if (titulo.length > 70 || /\{cidade\}/.test(titulo)) titulo = cortarNaPalavra(t.negocio.nome, 70);
    var desc = pg.descricao || t.pagina.descricao;
    desc = cidade ? fmt(desc, vars) : desc.replace(/ em \{cidade\}/g, '').replace(/\{cidade\}/g, '');
    t.pagina = { titulo: titulo, descricao: cortarFrases(fmt(desc, vars), 160) };
    if (pal) t.cores = { fundo: pal.fundo, texto: pal.texto, destaque: pal.destaque, apoio: pal.apoio };
    t.meta = { previa: opc.previa !== false, motorVersao: 'v1', criadoEm: (opc.agora || new Date()).toISOString() };
    if (t.meta.previa) { t.profissionais = []; t.avaliacoes = []; delete t.negocio.whatsapp; }
    return t;
  }

  /* paleta do preset que bate com tenant.cores (claro); senão as cores do tenant, sem tema escuro desenhado */
  function paletaDoTenant(tenant, preset) {
    var c = tenant.cores || {};
    var lista = (preset && preset.paletas) || [];
    for (var i = 0; i < lista.length; i++) {
      var p = lista[i].claro;
      if (p && ['fundo', 'texto', 'destaque', 'apoio'].every(function (k) { return String(p[k]).toUpperCase() === String(c[k] || '').toUpperCase(); })) {
        return { id: lista[i].id, indice: i + 1, claro: p, escuro: lista[i].escuro || null };
      }
    }
    var cor = /^#[0-9A-Fa-f]{6}$/;
    if (['fundo', 'texto', 'destaque', 'apoio'].every(function (k) { return cor.test(String(c[k] || '')); })) {
      return { id: null, indice: 0, claro: { fundo: c.fundo, superficie: c.fundo, texto: c.texto, apoio: c.apoio, destaque: c.destaque, sobreDestaque: c.fundo }, escuro: null };
    }
    return lista[0] ? { id: lista[0].id, indice: 1, claro: lista[0].claro, escuro: lista[0].escuro || null } : null;
  }

  function textosDe(tenant) {
    var t = {}, src = tenant.textos || {};
    Object.keys(TEXTOS_PADRAO).forEach(function (k) { t[k] = typeof src[k] === 'string' && colapsar(src[k]) ? src[k] : TEXTOS_PADRAO[k]; });
    t.faq = Array.isArray(src.faq) ? src.faq.filter(function (f) { return f && f.pergunta && f.resposta; }) : [];
    return t;
  }

  function hrefRodape(home, nicho) {
    if (!home) return '';
    var base = String(home).split('#')[0];
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep + 'utm_source=rodape&utm_medium=ref&utm_campaign=rodape-v1&utm_content=' + encodeURIComponent(nicho || 'site');
  }

  /* JSON-LD LocalBusiness do site entregue (prévia não tem) */
  function jsonLd(tenant, opc) {
    opc = opc || {};
    if (!tenant || !tenant.meta || tenant.meta.previa) return null;
    var preset = opc.preset || null, neg = tenant.negocio || {}, e = neg.endereco || {};
    var o = {
      '@context': 'https://schema.org',
      '@type': (preset && preset.schemaOrgTipo) || 'LocalBusiness',
      name: neg.nome,
      description: tenant.pagina && tenant.pagina.descricao
    };
    var site = opc.site || {};
    if (site.url) o.url = site.url;
    if (neg.whatsapp) o.telephone = '+' + soDigitos(neg.whatsapp);
    if (e.cidade) {
      o.address = { '@type': 'PostalAddress', addressLocality: e.cidade, addressCountry: 'BR' };
      if (e.rua) o.address.streetAddress = [e.rua, e.numero].filter(Boolean).join(', ');
      if (e.uf) o.address.addressRegion = e.uf;
      if (e.cep) o.address.postalCode = e.cep;
    }
    var grupos = {};
    for (var d = 0; d < 7; d++) {
      var h = horarioDoDia(tenant.funcionamento, d);
      if (!h) continue;
      var k = minParaHHMM(h.abre) + '-' + minParaHHMM(h.fecha);
      (grupos[k] = grupos[k] || []).push(DIAS_SCHEMA[d]);
    }
    var esp = Object.keys(grupos).map(function (k) {
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: grupos[k], opens: k.split('-')[0], closes: k.split('-')[1] };
    });
    if (esp.length) o.openingHoursSpecification = esp;
    if (neg.instagram && neg.instagram.url) o.sameAs = [neg.instagram.url];
    var ofertas = (tenant.servicos || []).filter(function (s) { return typeof s.preco === 'number'; }).map(function (s) {
      return { '@type': 'Offer', name: s.nome, price: String(s.preco), priceCurrency: 'BRL' };
    });
    if (ofertas.length) o.makesOffer = ofertas;
    return o;
  }

  /*
   * Estado de tela a partir do tenant (função pura; o build-site.cjs pode usar).
   * opc = { preset, site: window.CREAT_SITE, agora: Date }
   */
  function construirEstado(tenant, opc) {
    opc = opc || {};
    var preset = opc.preset || null, site = opc.site || {};
    var neg = tenant.negocio || {}, end = neg.endereco || {};
    var previa = !!(tenant.meta && tenant.meta.previa);
    var textos = textosDe(tenant);
    var servicos = (Array.isArray(tenant.servicos) ? tenant.servicos : []).filter(function (s) { return s && s.id && s.nome; }).map(function (s) {
      return {
        id: String(s.id), nome: String(s.nome), preco: typeof s.preco === 'number' ? s.preco : null,
        precoTexto: moeda(typeof s.preco === 'number' ? s.preco : null),
        duracaoMin: +s.duracaoMin || 0, duracaoTexto: (+s.duracaoMin || 0) + ' ' + UI.min,
        descricao: s.descricao ? String(s.descricao) : ''
      };
    });
    var profissionais = previa ? [] : (Array.isArray(tenant.profissionais) ? tenant.profissionais : []).filter(function (p) { return p && p.id && p.nome; });
    var whats = whatsNegocioValido(neg.whatsapp) ? String(neg.whatsapp) : '';
    var ag = tenant.agendamento || {};
    var modo = ag.modo === 'link_externo' && /^https:\/\//.test(String(ag.urlExterna || '')) ? 'link_externo' : 'whatsapp';
    var fontes = (preset && preset.fontes) || FONTES_PADRAO;
    var rodapeMostrar = site.rodape !== false;
    var rotulo = (preset && preset.rotulo) || '';
    return {
      versao: VERSAO,
      slug: String(tenant.slug || 'site'),
      nicho: String(tenant.nicho || ''),
      rotuloNicho: rotulo,
      previa: previa,
      nomeExemplo: !!(previa && site.nomeExemplo),
      nome: neg.nome || '',
      nomeCurto: neg.nomeCurto || neg.nome || '',
      bordao: neg.bordao || '',
      cidade: end.cidade || '',
      titulo: (tenant.pagina && tenant.pagina.titulo) || neg.nome || '',
      descricao: (tenant.pagina && tenant.pagina.descricao) || '',
      robots: previa ? 'noindex, nofollow' : 'index, follow',
      paleta: paletaDoTenant(tenant, preset),
      fontes: fontes,
      fontesHref: fontes.google ? 'https://fonts.googleapis.com/css2?' + fontes.google + '&display=swap' : '',
      ritual: (preset && preset.ritual) || null,
      ritualTextos: (preset && preset.ritualTextos) || {},
      textos: textos,
      ui: UI,
      servicos: servicos,
      profissionais: profissionais,
      avaliacoes: avaliacoesValidas(tenant.avaliacoes, previa),
      funcionamento: tenant.funcionamento || { passoMin: 20, antecedenciaMin: 0, diasNaFita: 7, semana: {} },
      linhasHorario: linhasHorario(tenant.funcionamento),
      contato: {
        whatsapp: whats,
        waBase: whats ? 'https://wa.me/' + whats : '',
        telefone: neg.telefoneExibicao || (whats ? mascararWhats(whats.slice(2)) : ''),
        enderecoLinhas: enderecoLinhas(end),
        enderecoCompleto: !!(end.rua && end.cidade),
        mapaUrl: end.rua ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([enderecoTexto(end), neg.nome].filter(Boolean).join(', ')) : '',
        instagram: neg.instagram && /^https:\/\//.test(String(neg.instagram.url || '')) ? { usuario: neg.instagram.usuario || '', url: neg.instagram.url } : null
      },
      pedido: {
        modo: modo,
        urlExterna: modo === 'link_externo' ? String(ag.urlExterna) : '',
        mensagem: ag.mensagem || 'Olá! Meu nome é {nome}. Quero pedir um horário: {servico}, {dia} às {hora}.',
        destino: previa ? 'teste' : 'negocio'
      },
      rodape: {
        mostrar: rodapeMostrar,
        texto: UI.creat,
        chamada: UI.creatChamada,
        href: rodapeMostrar ? hrefRodape(site.home, tenant.nicho) : ''
      },
      jsonLd: jsonLd(tenant, { preset: preset, site: site }),
      temaCor: (function () { var p = paletaDoTenant(tenant, preset); return p ? p.claro.fundo : '#FFFFFF'; })(),
      armazemPrefixo: 'site:' + String(tenant.slug || 'site') + ':'
    };
  }

  /*
   * Mensagem do pedido para o WhatsApp do negócio (ou do teste, na prévia).
   * Os marcadores do schema vêm do tenant; o motor acrescenta o profissional (se o modelo
   * não o cita) e o WhatsApp do cliente, que o dono usa para responder.
   */
  function mensagemPedido(estado, dados) {
    var msg = fmt(estado.pedido.mensagem, {
      nome: dados.nome, servico: dados.servico, dia: dados.dia, hora: dados.hora,
      profissional: dados.profissional || '', cidade: estado.cidade
    });
    if (dados.profissional && estado.pedido.mensagem.indexOf('{profissional}') === -1) msg += ' Com ' + dados.profissional + '.';
    if (dados.whats) msg += ' Meu WhatsApp: ' + dados.whats + '.';
    return colapsar(msg.replace(/\{\w+\}/g, ''));
  }
  function urlWhats(numero55, texto) { return 'https://wa.me/' + soDigitos(numero55) + '?text=' + encodeURIComponent(texto); }

  /* ---------- build (T9): template + tenant → index.html e tenant.js ---------- */
  function escaparHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function jsonSeguro(o) {
    return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  /*
   * Preenche motor/v1/template.html. opc = { preset, site:{home,url,rodape}, caminhoMotor:'motor/' }
   * Marcadores: {{TITULO}} {{DESCRICAO}} {{ROBOTS}} {{TEMA_COR}} {{FONTES_HREF}} {{NICHO}} {{MOTOR}}
   * <!--{{JSONLD}}--> <!--{{CANONICAL}}--> <!--{{NOSCRIPT}}-->
   */
  function preencherTemplate(texto, tenant, opc) {
    opc = opc || {};
    var e = construirEstado(tenant, { preset: opc.preset, site: opc.site });
    var ld = e.jsonLd ? '<script type="application/ld+json">' + jsonSeguro(e.jsonLd) + '</script>' : '';
    var canonical = opc.site && opc.site.url ? '<link rel="canonical" href="' + escaparHtml(opc.site.url) + '">' : '';
    var nos = '<p>' + escaparHtml(e.nome) + (e.bordao ? ' · ' + escaparHtml(e.bordao) : '') + '</p>';
    if (e.contato.waBase) nos += '<p>Para pedir horário sem JavaScript, chame no WhatsApp: <a href="' + escaparHtml(e.contato.waBase) + '">' + escaparHtml(e.contato.telefone) + '</a></p>';
    if (e.contato.enderecoLinhas.length) nos += '<p>' + e.contato.enderecoLinhas.map(escaparHtml).join('<br>') + '</p>';
    var trocas = {
      '{{TITULO}}': escaparHtml(e.titulo),
      '{{DESCRICAO}}': escaparHtml(e.descricao),
      '{{ROBOTS}}': escaparHtml(e.robots),
      '{{TEMA_COR}}': escaparHtml(e.temaCor),
      '{{FONTES_HREF}}': escaparHtml(e.fontesHref || 'data:text/css,'),
      '{{NICHO}}': escaparHtml(/^[a-z][a-z0-9-]{1,30}$/.test(e.nicho) ? e.nicho : 'barbearia'),
      '{{MOTOR}}': escaparHtml(opc.caminhoMotor || 'motor/'),
      '<!--{{JSONLD}}-->': ld,
      '<!--{{CANONICAL}}-->': canonical,
      '<!--{{NOSCRIPT}}-->': nos
    };
    var html = String(texto).replace(/\{\{[A-Z_]+\}\}|<!--\{\{[A-Z_]+\}\}-->/g, function (m) { return tem(trocas, m) ? trocas[m] : m; });
    return comRitual(html, opc.preset, opc.caminhoMotor || 'motor/');
  }
  /* T8 (aditivo): o ritual do nicho que mora em motor/v1/rituais/ entra como <link> + <script defer> antes de </head> */
  function comRitual(html, preset, caminho) {
    var a = preset && preset.ritualArquivos, ok = /^v1\/rituais\/[a-z][a-z0-9-]{0,30}\.(js|css)$/, tags = '';
    if (!a || typeof a !== 'object') return html;
    if (ok.test(String(a.css || '')) && /\.css$/.test(a.css)) tags += '<link rel="stylesheet" href="' + escaparHtml(caminho + a.css) + '" data-rituais-css>\n';
    (Array.isArray(a.js) ? a.js : []).forEach(function (c) { if (ok.test(String(c)) && /\.js$/.test(c)) tags += '<script src="' + escaparHtml(caminho + c) + '" defer></script>\n'; });
    return tags && html.indexOf('</head>') !== -1 ? html.replace('</head>', tags + '</head>') : html;
  }
  /* conteúdo do tenant.js que o template carrega (o site abre do disco: file:// não faz fetch de JSON) */
  function scriptTenant(tenant, site) {
    var s = { home: site && site.home ? String(site.home) : '', rodape: !(site && site.rodape === false) };
    if (site && site.url) s.url = String(site.url);
    return '/* gerado pelo build-site.cjs a partir de tenant.json; não editar à mão */\n' +
      'window.TENANT = ' + jsonSeguro(tenant) + ';\n' +
      'window.CREAT_SITE = ' + jsonSeguro(s) + ';\n';
  }

  var puro = {
    hm: hm, minParaHHMM: minParaHHMM, horaTexto: horaTexto, chaveData: chaveData, dataDaChave: dataDaChave,
    somarDias: somarDias, diferencaDias: diferencaDias, diaRelativo: diaRelativo, diaLongo: diaLongo,
    DIAS_CURTO: DIAS_CURTO, fmt: fmt, moeda: moeda, colapsar: colapsar,
    soDigitos: soDigitos, normalizarWhats: normalizarWhats, mascararWhats: mascararWhats, whatsValido: whatsValido,
    whatsNegocioValido: whatsNegocioValido, nomeValido: nomeValido,
    horarioDoDia: horarioDoDia, gerarHorarios: gerarHorarios, servicosQueCabem: servicosQueCabem, resumoDia: resumoDia,
    calcularLetreiro: calcularLetreiro, linhasHorario: linhasHorario, avaliacoesValidas: avaliacoesValidas,
    mensagemPedido: mensagemPedido, urlWhats: urlWhats, cortarNaPalavra: cortarNaPalavra, slugDe: slugDe,
    escaparHtml: escaparHtml, jsonSeguro: jsonSeguro
  };

  var api = {
    VERSAO: VERSAO,
    TEXTOS_PADRAO: TEXTOS_PADRAO,
    CHAVES_TEXTO: CHAVES_TEXTO,
    lerFragmento: lerFragmento,
    montarTenantPrevia: montarTenantPrevia,
    construirEstado: construirEstado,
    paletaDoTenant: paletaDoTenant,
    jsonLd: jsonLd,
    preencherTemplate: preencherTemplate,
    scriptTenant: scriptTenant,
    _puro: puro
  };

  if (!DOC) {
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    raiz.CreatMotor = api;
    return;
  }

  /* ===================================================================
     2. NAVEGADOR
     =================================================================== */
  var modulos = [];
  var estadoAtual = null, iniciado = false;

  /* localStorage com reserva em memória; na prévia, só memória (nada fica no aparelho) */
  function criarArmazem(prefixo, soMemoria) {
    var mem = {}, falhou = !!soMemoria;
    return {
      ler: function (k) {
        k = prefixo + k;
        if (!falhou) { try { var v = W.localStorage.getItem(k); if (v !== null) return v; } catch (e) { falhou = true; } }
        return tem(mem, k) ? mem[k] : null;
      },
      gravar: function (k, v) {
        k = prefixo + k; mem[k] = String(v);
        if (falhou) return;
        try { W.localStorage.setItem(k, String(v)); } catch (e) { falhou = true; }
      },
      remover: function (k) {
        k = prefixo + k; delete mem[k];
        if (soMemoria) return;
        try { W.localStorage.removeItem(k); } catch (e) {}
      },
      soMemoria: !!soMemoria,
      emMemoria: function () { return falhou; }
    };
  }

  function $(id) { return DOC.getElementById(id); }
  function criar(tag, attrs, filhos) {
    var el = DOC.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'texto') el.textContent = String(v);
      else if (k === 'classe') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (filhos || []).forEach(function (f) { if (f) el.appendChild(typeof f === 'string' ? DOC.createTextNode(f) : f); });
    return el;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function icone(caminhos, extra) {
    var s = DOC.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    caminhos.forEach(function (d) {
      var p = DOC.createElementNS(SVGNS, d.indexOf('c:') === 0 ? 'circle' : 'path');
      if (d.indexOf('c:') === 0) { var a = d.slice(2).split(','); p.setAttribute('cx', a[0]); p.setAttribute('cy', a[1]); p.setAttribute('r', a[2]); }
      else p.setAttribute('d', d);
      if (extra && extra[d]) p.setAttribute('class', extra[d]);
      s.appendChild(p);
    });
    return s;
  }
  function iconeWhats() {
    var s = DOC.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var p = DOC.createElementNS(SVGNS, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', 'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z');
    s.appendChild(p);
    return s;
  }
  function selo(texto) { return criar('span', { classe: 'selo', texto: texto }); }

  /* ---------- cabeça do documento ---------- */
  function meta(nome, valor) {
    var m = DOC.querySelector('meta[name="' + nome + '"]');
    if (!m) { m = criar('meta', { name: nome }); DOC.head.appendChild(m); }
    m.setAttribute('content', valor);
  }
  function aplicarCabeca(e) {
    if (e.titulo) DOC.title = e.titulo;
    if (e.descricao) meta('description', e.descricao);
    if (e.previa) meta('robots', e.robots);
    meta('theme-color', e.temaCor);
    if (e.fontesHref && !DOC.querySelector('link[data-motor-fontes]')) {
      if (!DOC.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"]')) {
        DOC.head.appendChild(criar('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }));
        DOC.head.appendChild(criar('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }));
      }
      DOC.head.appendChild(criar('link', { rel: 'stylesheet', href: e.fontesHref, 'data-motor-fontes': '' }));
    }
    if (e.jsonLd && !DOC.querySelector('script[type="application/ld+json"]')) {
      var s = criar('script', { type: 'application/ld+json' });
      s.textContent = jsonSeguro(e.jsonLd);
      DOC.head.appendChild(s);
    }
  }

  var PAPEIS = { fundo: 'fundo', superficie: 'superficie', texto: 'texto', apoio: 'apoio', destaque: 'destaque', sobreDestaque: 'sobre' };
  function aplicarCores(e) {
    var r = DOC.documentElement.style, p = e.paleta;
    if (!p) return;
    Object.keys(PAPEIS).forEach(function (k) {
      r.setProperty('--pc-' + PAPEIS[k], p.claro[k]);
      r.setProperty('--pe-' + PAPEIS[k], (p.escuro || p.claro)[k]);
    });
    r.setProperty('--fonte-display', e.fontes.display);
    r.setProperty('--fonte-texto', e.fontes.texto);
    r.setProperty('--fonte-dado', e.fontes.dado);
    if (p.id) DOC.documentElement.setAttribute('data-paleta', p.id);
    if (!p.escuro) DOC.documentElement.setAttribute('data-sem-escuro', '');
  }

  /* ---------- tema ---------- */
  var armazem = null;
  function temaAtual() {
    var t = DOC.documentElement.getAttribute('data-tema');
    if (t === 'claro' || t === 'escuro') return t;
    try { if (W.matchMedia && W.matchMedia('(prefers-color-scheme: dark)').matches) return 'escuro'; } catch (e) {}
    return 'claro';
  }
  function pintarBotaoTema() {
    var b = $('alternar-tema');
    if (!b) return;
    var t = temaAtual();
    b.setAttribute('aria-pressed', t === 'escuro' ? 'true' : 'false');
    b.title = t === 'escuro' ? UI.temaClaro : UI.temaEscuro;
  }
  function iniciarTema(e) {
    var b = $('alternar-tema');
    if (!e.paleta || !e.paleta.escuro) {
      DOC.documentElement.setAttribute('data-tema', 'claro');
      if (b) b.hidden = true;
      return;
    }
    var salvo = armazem.ler('tema');
    if (salvo === 'claro' || salvo === 'escuro') DOC.documentElement.setAttribute('data-tema', salvo);
    pintarBotaoTema();
    if (b) b.addEventListener('click', function () {
      var novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
      DOC.documentElement.setAttribute('data-tema', novo);
      armazem.gravar('tema', novo);
      pintarBotaoTema();
      emitir('motor:tema', { tema: novo });
    });
    try {
      var mq = W.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', pintarBotaoTema);
    } catch (er) {}
  }

  function emitir(nome, det) { try { W.dispatchEvent(new CustomEvent(nome, { detail: det })); } catch (e) {} }

  /* ---------- corpo ---------- */
  function tamanhoNome(nome) {
    var maior = colapsar(nome).split(' ').reduce(function (m, p) { return Math.max(m, p.length); }, 0);
    var n = colapsar(nome).length;
    if (n <= 11 && maior <= 9) return 'curto';
    if (n <= 20 && maior <= 12) return 'medio';
    return 'longo';
  }

  function secao(id, titulo, classe, extraTitulo) {
    var h = criar('h2', { id: id + '-titulo', texto: titulo });
    if (extraTitulo) h.appendChild(extraTitulo);
    return criar('section', { id: id, classe: 'secao' + (classe ? ' ' + classe : ''), 'aria-labelledby': id + '-titulo' }, [h]);
  }

  function renderTopo(e) {
    var topo = criar('header', { classe: 'topo' });
    topo.appendChild(criar('p', { id: 'letreiro', classe: 'letreiro', role: 'status', 'aria-live': 'polite' }, [criar('span', { classe: 'letreiro-texto' })]));
    var pedir = e.pedido.modo === 'link_externo'
      ? criar('a', { classe: 'btn btn-pedir', id: 'btn-pedir', href: e.pedido.urlExterna, target: '_blank', rel: 'noopener', texto: UI.agendarExterno })
      : criar('a', { classe: 'btn btn-pedir', id: 'btn-pedir', href: '#pedir', texto: UI.pedir });
    topo.appendChild(pedir);
    var bt = criar('button', { type: 'button', id: 'alternar-tema', classe: 'btn-icone', 'aria-pressed': 'false', 'aria-label': UI.temaRotulo });
    bt.appendChild(icone(['c:12,12,4.5', 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4']));
    topo.appendChild(bt);
    var bs = criar('button', { type: 'button', id: 'alternar-som', classe: 'btn-icone', 'aria-pressed': 'false', 'aria-label': UI.somRotulo });
    bs.appendChild(icone(['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'], { 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11': 'som-onda' }));
    topo.appendChild(bs);
    return topo;
  }

  function renderHeroi(e) {
    var h = criar('section', { id: 'heroi', classe: 'heroi', 'aria-labelledby': 'heroi-nome', 'data-ritual': e.ritual || '' });
    var olho = [e.rotuloNicho, e.cidade].filter(Boolean).join(' · ');
    if (olho) h.appendChild(criar('p', { classe: 'heroi-olho', texto: olho }));
    var nome = criar('h1', { id: 'heroi-nome', classe: 'heroi-nome', 'data-tamanho': tamanhoNome(e.nome), texto: e.nome });
    h.appendChild(nome);
    if (e.nomeExemplo) h.appendChild(criar('p', { classe: 'heroi-exemplo' }, [selo(UI.exemplo)]));
    if (e.bordao) h.appendChild(criar('p', { classe: 'heroi-bordao', texto: e.bordao }));
    if (e.textos.heroSubtitulo) h.appendChild(criar('p', { classe: 'heroi-sub', texto: e.textos.heroSubtitulo }));
    return h;
  }

  function renderManifesto(e) {
    if (!e.textos.manifesto) return null;
    var s = secao('manifesto', e.textos.heroTitulo, 'manifesto');
    s.appendChild(criar('p', { texto: e.textos.manifesto }));
    if (e.bordao) s.appendChild(criar('p', { classe: 'manifesto-bordao', texto: e.bordao }));
    return s;
  }

  function renderPedido(e) {
    var s = secao('pedir', e.pedido.modo === 'link_externo' ? UI.agendarExterno : e.textos.pedidoTitulo, 'pedido');
    if (e.pedido.modo !== 'link_externo') s.appendChild(criar('p', { classe: 'pedido-nota', id: 'pedido-nota', texto: e.textos.pedidoNota }));
    s.appendChild(criar('div', { id: 'pedir-corpo' }));
    return s;
  }

  function renderServicos(e) {
    if (!e.servicos.length) return null;
    var s = secao('servicos', e.textos.servicosTitulo, null, e.previa ? selo(UI.exemplo) : null);
    var ul = criar('ul', { classe: 'precos', id: 'lista-precos' });
    e.servicos.forEach(function (sv) {
      ul.appendChild(criar('li', null, [
        criar('span', { classe: 'nome', texto: sv.nome }),
        criar('span', { classe: 'duracao', texto: sv.duracaoTexto }),
        criar('span', { classe: 'preco' + (sv.preco === null ? ' is-consulta' : ''), texto: sv.precoTexto }),
        sv.descricao ? criar('span', { classe: 'descricao', texto: sv.descricao }) : null
      ]));
    });
    s.appendChild(ul);
    if (e.textos.servicosNota) s.appendChild(criar('p', { classe: 'nota servicos-nota', texto: e.textos.servicosNota }));
    return s;
  }

  function renderEquipe(e) {
    if (!e.profissionais.length) return null;
    var s = secao('equipe', e.textos.equipeTitulo);
    var ul = criar('ul', { classe: 'profissionais' });
    e.profissionais.forEach(function (p) {
      ul.appendChild(criar('li', null, [
        criar('h3', { classe: 'nome', texto: p.nome }),
        p.especialidade ? criar('p', { classe: 'especialidade', texto: p.especialidade }) : null,
        p.bio ? criar('p', { classe: 'bio', texto: p.bio }) : null
      ]));
    });
    s.appendChild(ul);
    return s;
  }

  function renderRecados(e) {
    if (!e.avaliacoes.length) return null;
    var s = secao('recados', e.textos.avaliacoesTitulo, 'quadro');
    var ul = criar('ul');
    e.avaliacoes.forEach(function (a) {
      ul.appendChild(criar('li', null, [criar('blockquote', null, [criar('p', { texto: a.texto })]), criar('cite', { texto: a.autor })]));
    });
    s.appendChild(ul);
    return s;
  }

  function renderOnde(e) {
    var s = secao('onde', e.textos.localTitulo, 'contato');
    var local = criar('div', { classe: 'contato-local' });
    if (e.contato.enderecoLinhas.length) {
      var ad = criar('address', { classe: 'endereco' });
      e.contato.enderecoLinhas.forEach(function (l, i) { if (i) ad.appendChild(criar('br')); ad.appendChild(DOC.createTextNode(l)); });
      local.appendChild(ad);
    }
    if (!e.contato.enderecoCompleto && e.previa) local.appendChild(criar('p', { classe: 'nota' }, [selo(UI.exemplo), ' ' + UI.enderecoPrevia]));
    if (e.contato.mapaUrl) local.appendChild(criar('p', null, [criar('a', { classe: 'link-forte', href: e.contato.mapaUrl, target: '_blank', rel: 'noopener', texto: UI.comoChegar })]));
    if (e.contato.instagram) local.appendChild(criar('p', null, [criar('a', { classe: 'link-forte', href: e.contato.instagram.url, target: '_blank', rel: 'noopener', texto: UI.instagram + (e.contato.instagram.usuario ? ' · ' + e.contato.instagram.usuario : '') })]));
    s.appendChild(local);
    var hor = criar('div', { classe: 'contato-horario' }, [criar('h3', { texto: UI.horarioTitulo })]);
    var tab = criar('table', { classe: 'funcionamento' }, [criar('caption', { classe: 'so-leitor', texto: UI.horarioTitulo })]);
    var tb = criar('tbody');
    var hoje = new Date().getDay();
    e.linhasHorario.forEach(function (l) {
      var tr = criar('tr', { classe: [l.folga ? 'is-folga' : '', l.dias.indexOf(hoje) !== -1 ? 'is-hoje' : ''].join(' ').trim() || null }, [
        criar('th', { scope: 'row', texto: l.rotulo }), criar('td', { texto: l.valor })
      ]);
      tb.appendChild(tr);
    });
    tab.appendChild(tb);
    hor.appendChild(tab);
    s.appendChild(hor);
    return s;
  }

  function renderFaq(e) {
    if (!e.textos.faq.length) return null;
    var s = secao('perguntas', e.textos.faqTitulo, 'faq');
    e.textos.faq.forEach(function (f) {
      s.appendChild(criar('details', null, [criar('summary', { texto: f.pergunta }), criar('p', { texto: f.resposta })]));
    });
    return s;
  }

  function renderRodape(e) {
    var r = criar('footer', { classe: 'rodape' });
    var l1 = criar('p', null, [criar('strong', { texto: e.nome })]);
    if (e.textos.rodapeFrase) l1.appendChild(DOC.createTextNode(' · ' + e.textos.rodapeFrase));
    r.appendChild(l1);
    var resumo = e.linhasHorario.filter(function (l) { return !l.folga; }).map(function (l) { return l.rotulo + ', ' + l.valor; }).join(' · ');
    var l2 = criar('p', null, resumo ? [criar('span', { texto: resumo })] : []);
    if (e.contato.waBase) {
      if (resumo) l2.appendChild(DOC.createTextNode(' · '));
      l2.appendChild(criar('a', { href: e.contato.waBase, target: '_blank', rel: 'noopener', texto: UI.whatsRodape + ' ' + e.contato.telefone }));
    }
    if (l2.childNodes.length) r.appendChild(l2);
    if (e.rodape.mostrar) {
      var txt = e.rodape.texto + ' · ' + e.rodape.chamada;
      r.appendChild(criar('p', { classe: 'creat' }, [
        e.rodape.href ? criar('a', { href: e.rodape.href, target: e.previa ? '_top' : null, rel: 'noopener', texto: txt }) : criar('span', { texto: e.rodape.texto })
      ]));
    }
    return r;
  }

  function render(e, alvo) {
    while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
    alvo.appendChild(criar('a', { classe: 'pular-link', href: e.pedido.modo === 'link_externo' ? '#pedir' : '#pedir', texto: UI.pular }));
    if (e.previa) alvo.appendChild(criar('p', { classe: 'faixa-previa', role: 'note' }, [selo('prévia'), ' ' + UI.faixaPrevia.replace(/^Prévia\.\s*/, '')]));
    alvo.appendChild(renderTopo(e));
    alvo.appendChild(renderHeroi(e));
    var main = criar('main', { id: 'conteudo' });
    [renderManifesto(e), renderPedido(e), renderServicos(e), renderEquipe(e), renderRecados(e), renderOnde(e), renderFaq(e)]
      .forEach(function (s) { if (s) main.appendChild(s); });
    alvo.appendChild(main);
    if (e.contato.waBase) {
      var fab = criar('a', { id: 'whats-flutuante', classe: 'whats-flutuante', href: e.contato.waBase, target: '_blank', rel: 'noopener', 'aria-label': UI.whatsFlutuante });
      fab.appendChild(iconeWhats());
      alvo.appendChild(fab);
    }
    alvo.appendChild(renderRodape(e));
  }

  function atualizarLetreiro() {
    var el = $('letreiro');
    if (!el || !estadoAtual) return;
    var r = calcularLetreiro(estadoAtual.funcionamento, estadoAtual.textos, new Date());
    (el.querySelector('.letreiro-texto') || el).textContent = r.texto;
    el.setAttribute('data-estado', r.estado);
  }

  /* "Pedir horário" desce para a zona do polegar quando o herói sai da tela ou o ritual termina */
  function vigiarPolegar() {
    var btn = $('btn-pedir'), heroi = $('heroi'), pedir = $('pedir');
    if (!btn || !('IntersectionObserver' in W)) return;
    var foraHeroi = false, naSecao = false;
    function pintar() {
      btn.classList.toggle('is-polegar', foraHeroi || btn.classList.contains('is-ritual-pronto'));
      btn.classList.toggle('is-na-secao', naSecao);
    }
    if (heroi) new W.IntersectionObserver(function (ents) { foraHeroi = !ents[ents.length - 1].isIntersecting; pintar(); }, { threshold: 0, rootMargin: '-35% 0px 0px 0px' }).observe(heroi);
    if (pedir) new W.IntersectionObserver(function (ents) { naSecao = ents[ents.length - 1].isIntersecting; pintar(); }).observe(pedir);
    W.addEventListener('motor:ritual-pronto', function () { btn.classList.add('is-ritual-pronto'); pintar(); });
    var fab = $('whats-flutuante');
    if (fab && pedir) new W.IntersectionObserver(function (ents) { fab.classList.toggle('is-escondido', ents[ents.length - 1].isIntersecting); }, { rootMargin: '0px 0px -20% 0px' }).observe(pedir);
  }

  function semTenant(alvo) {
    while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
    alvo.appendChild(criar('main', { classe: 'sem-tenant' }, [criar('p', { texto: UI.semTenant })]));
    DOC.documentElement.classList.add('motor-pronto');
  }

  function iniciar(tenant) {
    if (iniciado) return estadoAtual;
    var alvo = $('motor-raiz') || DOC.body;
    tenant = tenant || W.TENANT;
    if (!tenant || typeof tenant !== 'object' || tenant.versao !== 1 || !tenant.negocio || !tenant.funcionamento) { semTenant(alvo); return null; }
    iniciado = true;
    var preset = W.CreatNichos ? W.CreatNichos.obter(tenant.nicho) : null;
    var e = estadoAtual = construirEstado(tenant, { preset: preset, site: W.CREAT_SITE || {}, agora: new Date() });
    armazem = criarArmazem(e.armazemPrefixo, e.previa);
    var reduz = false;
    try { reduz = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (er) {}
    aplicarCabeca(e);
    aplicarCores(e);
    render(e, alvo);
    iniciarTema(e);
    atualizarLetreiro();
    var ctx = {
      estado: e, tenant: tenant, preset: preset, armazem: armazem, puro: puro, emitir: emitir,
      criar: criar, selo: selo, reduzMovimento: reduz, ritual: e.ritual && W.CREAT_RITUAIS ? W.CREAT_RITUAIS[e.ritual] || null : null
    };
    /* o ritual do nicho (CREAT_RITUAIS[preset.ritual]) transforma o herói no palco do gesto */
    if (ctx.ritual && typeof ctx.ritual.montarHeroi === 'function') {
      try { ctx.ritual.montarHeroi($('heroi'), ctx); } catch (er) { if (W.console) W.console.error('[motor] ritual:', er); }
    }
    modulos.forEach(function (m) {
      try { m.fn(ctx); } catch (er) { if (W.console) W.console.error('[motor] módulo ' + m.nome + ':', er); }
    });
    vigiarPolegar();
    setInterval(atualizarLetreiro, 60000);
    DOC.addEventListener('visibilitychange', function () { if (!DOC.hidden) atualizarLetreiro(); });
    DOC.documentElement.classList.add('motor-pronto');
    emitir('motor:pronto', { slug: e.slug, previa: e.previa });
    return e;
  }

  api.iniciar = iniciar;
  api.registrarModulo = function (nome, fn) { modulos.push({ nome: nome, fn: fn }); };
  Object.defineProperty(api, 'estado', { get: function () { return estadoAtual; }, enumerable: true });
  raiz.CreatMotor = api;

  function autoIniciar() {
    if (W.CREAT_SITE && W.CREAT_SITE.manual) return;
    iniciar();
  }
  if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', autoIniciar, { once: true });
  else setTimeout(autoIniciar, 0);
})(typeof window !== 'undefined' ? window : globalThis);
