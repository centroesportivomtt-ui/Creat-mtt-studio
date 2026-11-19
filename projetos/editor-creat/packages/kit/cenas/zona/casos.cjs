// Casos do QA de zona segura (ferramentas/zona.cjs): para CADA modelo de kit/modelos, as props de uma camada por caso.
// Regra: modelo novo em kit/modelos sem entrada aqui faz o verificador (e o pytest) falhar.
// Cada entrada: { isento: "motivo" } (vem de kit/zona.json) ou { dur, casos: { nome: (txt, de, ate) => props } }.
//   txt.linhas  linhas do caso (com *destaque* e ponto final, como o autor escreveria)
//   txt.texto   as linhas juntas numa frase;  txt.limpo  sem os marcadores *;  txt.minusc  em minúsculas
//   txt.palavra a palavra mais longa do caso
//   de, ate     tempos ABSOLUTOS da camada (modelos como gancho2, abas e checklist usam tempo absoluto)
// Os textos são de propósito difíceis: frase de 3 a 4 linhas, palavra única gigante, acentos, preço e quebra forçada.
const LOGO = "assets/marca/logo_creatMTT_claro.png";

const TEXTOS = {
  curto: ["VENDA MAIS."],
  medio: ["O SITE QUE TRAZ *CLIENTE*."],
  longo: ["SEU SALÃO APARECE NO GOOGLE, RECEBE AGENDAMENTO PELO WHATSAPP E VENDE ENQUANTO VOCÊ ATENDE."],
  infraestrutura: ["INFRAESTRUTURA"],
  estaticos: ["ESTÁTICOS."],
  eletrodomesticos: ["ELETRODOMÉSTICOS"],
  acentos: ["ÁGUA, PÃO, CAFÉ E AÇÚCAR: É JÁ, NÃO É?"],
  numeros: ["R$ 12.999,90"],
  quebra: ["PROMOÇÃO DE", "*VERDADE*."],
};
// subconjunto do teste rápido (pytest sem a marca "lento")
const RAPIDOS = ["curto", "longo", "eletrodomesticos", "numeros", "quebra"];

function preparar(linhas) {
  const texto = linhas.join(" ");
  const limpo = texto.replace(/\*/g, "");
  const palavra = limpo.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  return { linhas, texto, limpo, minusc: limpo.toLowerCase(), palavra };
}

// fábrica: os 9 casos de texto para um construtor de props
const comTextos = (fn) => Object.fromEntries(Object.entries(TEXTOS).map(([k, l]) => [k, (de, ate) => fn(preparar(l), de, ate, k)]));

const MODELOS = {
  fundo: {},
  transicao: {},
  gancho: {
    dur: 2.6,
    casos: {
      ...comTextos((x) => ({ sobrelinha: "// creat.MTT · oferta", linhas: x.linhas, y: 0.44 })),
      demo_troca: () => ({ sobrelinha: "// creat.MTT · motion", linhas: ["ISSO NÃO", "FOI EDITADO"], troca: { de: "EDITADO", para: "ESCRITO", em: 0.62, dur: 0.36 }, y: 0.44 }),
      troca_longa: () => ({ linhas: ["NÃO É", "*ESTÁTICO*."], troca: { de: "ESTÁTICO", para: "ELETRODOMÉSTICOS", em: 0.5, dur: 0.36 }, y: 0.44 }),
    },
  },
  gancho2: {
    dur: 3.4,
    // o gancho2 não lê *destaque*: as linhas vão limpas
    casos: comTextos((x, de) => ({
      y: 0.55,
      a: { linhas: x.linhas.map((l) => l.replace(/\*/g, "")), risca: x.linhas[0].replace(/\*/g, "").replace(/\.$/, ""), riscaEm: de + 0.5, sai: de + 1.3 },
      b: { entra: de + 1.5, topo: x.linhas[0].replace(/\*/g, ""), trocas: [{ t: de + 1.6, p: x.palavra }, { t: de + 2.2, p: x.limpo }], fim: { t: de + 2.5, p: x.limpo } },
    })),
  },
  legenda: {
    // a duração sai do texto (ritmo 0,25 s por palavra): o verificador chama dur(nomeDoCaso)
    dur: (k) => (k === "motor_longo" ? 5.6 : k === "motor_gigante" ? 2.6 : 0.6 + TEXTOS[k].join(" ").split(/\s+/).length * 0.25 * 1.6),
    casos: {
      ...comTextos((x) => ({ texto: x.linhas.join(" | "), ritmo: 0.25, inicio: 0.1 })),
      // como o motor monta (overlay.camadas_legenda): palavras com tempo, 3 por página, tamanho 94, largura 0,72, y 0,62
      motor_longo: (de) => ({
        palavras: preparar(TEXTOS.longo).limpo.split(/\s+/).map((p, k) => ({ p: k === 5 ? `*${p}*` : p, i: +(de + 0.1 + k * 0.28).toFixed(3), f: +(de + 0.36 + k * 0.28).toFixed(3), quebra: k > 0 && k % 3 === 0 })),
        y: 0.62, porPagina: 3, tamanho: 94, largura: 0.72,
      }),
      motor_gigante: (de) => ({
        palavras: ["O", "*ELETRODOMÉSTICOS*", "CHEGOU", "INFRAESTRUTURA"].map((p, k) => ({ p, i: +(de + 0.1 + k * 0.5).toFixed(3), f: +(de + 0.5 + k * 0.5).toFixed(3), quebra: k > 0 && k % 3 === 0 })),
        y: 0.62, porPagina: 3, tamanho: 94, largura: 0.72,
      }),
    },
  },
  chip: {
    dur: 3.0,
    casos: comTextos((x) => ({ nome: x.limpo.replace(/\.$/, ""), cargo: x.minusc })),
  },
  rotulo: {
    dur: 2.4,
    casos: {
      ...comTextos((x) => ({ x: 60, y: 400, titulo: x.limpo, sub: "status · " + x.minusc })),
      direita: () => ({ x: 960, y: 520, direita: true, titulo: preparar(TEXTOS.longo).limpo, sub: "alinhado pela direita" }),
    },
  },
  selo: {
    dur: 2.6,
    casos: {
      ...comTextos((x) => ({ tipo: "cobertura", logo: LOGO, x: 60, y: 380, linhas: ["COBERTURA · " + x.palavra, x.limpo, "ao vivo · " + x.minusc] })),
      assinatura: () => ({ tipo: "assinatura", logo: LOGO, y: 292 }),
    },
  },
  checklist: {
    dur: 2.8,
    casos: comTextos((x, de) => ({ x: 60, y: 420, w: 400, titulo: "CHECKLIST · " + x.palavra, sub: x.limpo,
      itens: [{ t: de + 0.8, rot: x.linhas[0].replace(/\*/g, "") }, { t: de + 1.1, rot: x.limpo }, { t: de + 1.4, rot: "ENTREGA" }] })),
  },
  fecho: {
    dur: 3.0,
    casos: comTextos((x) => ({ cta: x.linhas, apoio: x.minusc, y: 0.53 })),
  },
  fecho2: {
    dur: 3.0,
    casos: comTextos((x, de, ate, k) => ({ cta: x.limpo, arroba: k === "longo" ? "@barbeariadobairro.oficial.atendimento" : "@creat.mtt", apoio: x.minusc, logo: LOGO })),
  },
  abas: {
    dur: 2.6,
    casos: comTextos((x, de, ate) => ({ x: 60, y: 292, abas: [{ t: de, n: "01", titulo: x.linhas[0].replace(/\*/g, "") }, { t: de + 1.0, n: "02", titulo: x.limpo }], some: ate - 0.05 })),
  },
  camadas: {
    dur: 2.4,
    casos: comTextos((x) => ({ x: 70, y: 620, itens: [x.linhas[0].replace(/\*/g, ""), x.limpo, "ENTREGA"] })),
  },
  stats: {
    dur: (k) => (k === "numeros_formatos" ? 3.6 : 3.0),
    casos: {
      ...comTextos((x, de, ate, k) => ({ x: 60, y: 420, w: 420, titulo: "BASTIDOR · " + x.palavra,
        itens: [{ n: k === "numeros" ? x.limpo : 71, rot: x.minusc }, { n: k === "numeros" ? "1.234.567" : 15, rot: "agentes\nna nuvem" }], rodape: x.limpo })),
      // números em texto: "4.8" e "2026" mantêm o formato antigo; "1.234,56" e preço contam no formato brasileiro
      numeros_formatos: () => ({ x: 60, y: 420, w: 420, titulo: "BASTIDOR · NÚMEROS",
        itens: [{ n: "4.8", rot: "nota" }, { n: "2026", rot: "desde" }, { n: "1.234,56", rot: "média" }, { n: "R$ 12.999,90", rot: "ticket" }], rodape: "formatos de número" }),
    },
  },
  pilha: {
    // a pilha não recebe texto do autor (só imagens e a contagem): os casos variam a contagem e os números
    dur: 3.0,
    semTexto: "a pilha não recebe texto do autor: o único texto é a legenda fixa \"ABAS ABERTAS\" e o número contado",
    casos: {
      padrao: (de) => ({ imgs: [LOGO], ini: 9, total: 70, dur: 2.0, cy: 0.44, final: de + 2.4 }),
      numeros: (de) => ({ imgs: [LOGO], ini: 1, total: 140, dur: 2.0, cy: 0.44 }),
    },
  },
  heroi: {
    dur: 2.6,
    casos: {
      ...comTextos((x) => ({ alvo: "texto", texto: x.limpo, tamanho: 560, cy: 0.5, passo: 6, poeira: 600 })),
      aba71: () => ({ alvo: "aba71", tamanho: 560, cy: 0.5, passo: 6, poeira: 600 }),
    },
  },
  hud: {
    dur: 2.6,
    casos: comTextos((x) => ({ rotulo: "CREAT NUVEM // " + x.limpo, linhas: [x.linhas[0].replace(/\*/g, ""), x.limpo], direita: "1080×1920 · 30P" })),
  },
};

module.exports = { TEXTOS, RAPIDOS, MODELOS, preparar };
