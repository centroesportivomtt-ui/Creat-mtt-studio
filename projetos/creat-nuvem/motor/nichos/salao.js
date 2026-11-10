/*
 * motor/nichos/salao.js · preset do nicho salão, unhas e estética (motor v1, T8)
 *
 * Sem dado de cliente:
 *  - textos, serviços, mensagem e horário sugerido: conteudo/nichos/salao.json (Verbo, T3);
 *  - 3 paletas AA: assets/tokens.css e docs/DIRECAO.md §8.2 (Paleta, T2), ordem 1, 2, 3 = p=1..3;
 *  - ritual 'esmalte': tirar o pincel do vidrinho e pintar a unha (motor/v1/rituais/esmalte.js).
 * Fora do preset (conteudo/nichos/salao.json, foraDoPreset): procedimento de saúde ou injetável,
 * antes e depois, promessa de resultado na pele ou no corpo.
 * Sem equipe e sem avaliação de exemplo; nenhum horário ocupado inventado.
 * Preços são exemplo; a prévia mostra o rótulo "exemplo" e a nota da tabela diz isso.
 *
 * Script clássico: precisa de motor/nichos/index.js carregado antes.
 */
(function (raiz) {
  'use strict';
  var N = raiz.CreatNichos;
  if (!N) return;

  var textosPermitidos = [
    'heroTitulo', 'heroSubtitulo', 'manifesto', 'servicosTitulo', 'servicosNota', 'equipeTitulo', 'avaliacoesTitulo',
    'pedidoTitulo', 'pedidoNota', 'ritualDica', 'confirmacaoTitulo', 'confirmacaoTexto', 'letreiroAberto',
    'letreiroFechado', 'localTitulo', 'faqTitulo', 'faq', 'rodapeFrase'
  ];

  N.registrar({
    id: 'salao',
    rotulo: 'Salão e estética',
    ritual: 'esmalte',
    /* arquivos do ritual, relativos a motor/ (a prévia carrega pelo CreatNichos.carregar; o site entregue, pelo template) */
    ritualArquivos: { js: ['v1/rituais/comum.js', 'v1/rituais/esmalte.js'], css: 'v1/rituais/rituais.css' },
    schemaOrgTipo: 'BeautySalon',

    /* Bodoni Moda: o contraste de revista de beleza, em caixa alta no nome; Figtree lê bem no corpo */
    fontes: {
      google: 'family=Bodoni+Moda:opsz,wght@6..96,700;6..96,800&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;600',
      display: "'Bodoni Moda', 'Didot', 'Bodoni 72', Georgia, serif",
      texto: "'Figtree', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      dado: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    },

    /* T2 · contraste medido em docs/DIRECAO.md §8.2: todos os pares >= 4,5 nos dois temas */
    paletas: [
      {
        id: 'salao-1', nome: 'Esmalte cereja',
        claro: { fundo: '#FBF1EE', superficie: '#FFFFFF', texto: '#2A1418', apoio: '#6A4A50', destaque: '#A8123A', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#1E1013', superficie: '#2A171C', texto: '#F8E9EC', apoio: '#D9BEC4', destaque: '#FF7A98', sobreDestaque: '#1E1013' }
      },
      {
        id: 'salao-2', nome: 'Sálvia',
        claro: { fundo: '#EEF2EA', superficie: '#FAFCF8', texto: '#1D2A22', apoio: '#4C5C51', destaque: '#3A644A', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#141C17', superficie: '#1D2821', texto: '#E7EFE6', apoio: '#B8C6BB', destaque: '#8FC79F', sobreDestaque: '#141C17' }
      },
      {
        id: 'salao-3', nome: 'Base nude',
        claro: { fundo: '#F6EADF', superficie: '#FFF8F1', texto: '#2B1D14', apoio: '#634D3E', destaque: '#85532A', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#1C140F', superficie: '#281D16', texto: '#F3E6D8', apoio: '#D2BFAE', destaque: '#E0A86A', sobreDestaque: '#1C140F' }
      }
    ],

    /* resolvidos na montagem do tenant (prévia e produzir.mjs), nunca no motor */
    pagina: {
      titulo: '{negocio} · salão em {cidade}',
      tituloSemCidade: '{negocio} · salão',
      descricao: 'Corte, escova, coloração, unhas e sobrancelha em {cidade}. Escolha o serviço e o horário no site e mande o pedido pelo WhatsApp.'
    },

    textosPermitidos: textosPermitidos,

    /* microtexto do ritual (não é campo do tenant; vem do preset). instrucao, instrucaoTeclado,
       semArrastar e pronto são da T3; os heroi* foram escritos na T8 no mesmo tom */
    ritualTextos: {
      instrucao: 'Arraste o pincel sobre a unha para pintar e enviar.',
      instrucaoTeclado: 'Use as setas ou a barra de espaço para pintar e enviar.',
      semArrastar: 'Enviar sem arrastar',
      pronto: 'Pintada. O pedido está pronto.',
      heroiDica: 'Pinte a unha.',
      heroiInstrucao: 'Pintar a unha: arraste o pincel sobre a unha, ou use as setas e a barra de espaço.',
      heroiPronto: 'Pintada. O seu horário está a um pedido.'
    },

    tenantBase: {
      versao: 1,
      slug: 'previa',
      nicho: 'salao',
      negocio: {
        nome: 'Seu negócio',
        nomeCurto: 'Seu negócio',
        bordao: 'Escolha o serviço, peça o horário, chegue e relaxe.'
      },
      pagina: {
        titulo: 'Seu negócio · salão',
        descricao: 'Corte, escova, coloração, unhas e sobrancelha. Escolha o serviço e o horário no site e mande o pedido pelo WhatsApp.'
      },
      funcionamento: {
        passoMin: 30,
        antecedenciaMin: 60,
        diasNaFita: 7,
        semana: {
          0: null,
          1: null,
          2: { abre: '09:00', fecha: '19:00' },
          3: { abre: '09:00', fecha: '19:00' },
          4: { abre: '09:00', fecha: '19:00' },
          5: { abre: '09:00', fecha: '19:00' },
          6: { abre: '09:00', fecha: '17:00' }
        }
      },
      servicos: [
        { id: 'corte', nome: 'Corte', preco: 70, duracaoMin: 60, descricao: 'Lavagem, corte e finalização do jeito que você pedir.' },
        { id: 'escova', nome: 'Escova', preco: 50, duracaoMin: 45, descricao: 'Lavagem e escova, lisa ou modelada.' },
        { id: 'progressiva', nome: 'Progressiva', preco: 180, duracaoMin: 180, descricao: 'Alisamento progressivo, com teste de mecha antes e escova no final.' },
        { id: 'coloracao', nome: 'Coloração', preco: 150, duracaoMin: 120, descricao: 'Cor do fio inteiro ou retoque de raiz. O tom é combinado na hora.' },
        { id: 'mechas', nome: 'Mechas', preco: 220, duracaoMin: 180, descricao: 'Mechas ou luzes no tom que você escolher, com tonalização no final.' },
        { id: 'hidratacao', nome: 'Hidratação', preco: 80, duracaoMin: 45, descricao: 'Máscara de tratamento para os fios, com escova no final.' },
        { id: 'manicure', nome: 'Manicure', preco: 35, duracaoMin: 45, descricao: 'Cutícula, lixa e esmalte da sua escolha.' },
        { id: 'pedicure', nome: 'Pedicure', preco: 40, duracaoMin: 50, descricao: 'Cuidado dos pés, cutícula e esmalte.' },
        { id: 'alongamento-gel', nome: 'Alongamento em gel', preco: 150, duracaoMin: 120, descricao: 'Unhas alongadas em gel, no formato e no tamanho que você pedir.' },
        { id: 'sobrancelha', nome: 'Design de sobrancelha', preco: 35, duracaoMin: 30, descricao: 'Desenho e acabamento com pinça e linha.' },
        { id: 'maquiagem', nome: 'Maquiagem', preco: 90, duracaoMin: 60, descricao: 'Maquiagem para festa, formatura ou ensaio, com a pele preparada antes.' }
      ],
      profissionais: [],
      avaliacoes: [],
      cores: { fundo: '#FBF1EE', texto: '#2A1418', destaque: '#A8123A', apoio: '#6A4A50' },
      agendamento: {
        modo: 'whatsapp',
        mensagem: 'Olá! Meu nome é {nome}. Quero pedir um horário: {servico}, {dia} às {hora}. Pode confirmar por aqui?'
      },
      textos: {
        heroTitulo: 'Seu horário no salão, pedido em um minuto.',
        heroSubtitulo: 'Escolha o serviço, o dia e o horário. O pedido chega no WhatsApp do salão e o dono confirma pelo WhatsApp.',
        manifesto: 'Aqui a cor é escolhida olhando o seu fio, na luz do espelho. O esmalte leva o tempo de cada camada secar, sem ninguém apressando a próxima. Você sai do jeito que pediu, e não do jeito que deu tempo.',
        servicosTitulo: 'Serviços da casa',
        servicosNota: 'Preços de exemplo. O salão troca pelos preços da casa antes de o site entrar no ar.',
        equipeTitulo: 'Quem atende',
        avaliacoesTitulo: 'Recados de quem vem',
        pedidoTitulo: 'Peça o seu horário',
        pedidoNota: 'O pedido vai para o WhatsApp do salão e o dono confirma pelo WhatsApp.',
        ritualDica: 'Passe o pincel na unha para enviar',
        confirmacaoTitulo: 'Pedido pronto para enviar',
        confirmacaoTexto: 'Toque em enviar no WhatsApp. O horário vale depois que o dono confirma pelo WhatsApp.',
        letreiroAberto: 'Aberto agora · peça o seu horário',
        letreiroFechado: 'Fechado agora · abre {dia} às {hora}',
        localTitulo: 'Onde fica',
        faqTitulo: 'Antes de pedir',
        faq: [
          { pergunta: 'Pedir pelo site já marca o horário?', resposta: 'Ainda não. O pedido chega no WhatsApp do salão e o dono confirma pelo WhatsApp. O horário vale depois da confirmação.' },
          { pergunta: 'Posso pedir mais de um serviço?', resposta: 'Pode. Escolha o primeiro serviço no site e escreva os outros na mensagem do WhatsApp antes de enviar.' },
          { pergunta: 'Quanto custa a coloração?', resposta: 'O valor está na lista de serviços. Se o tom pedir mais produto, o salão avisa antes de confirmar.' },
          { pergunta: 'Meu nome e meu WhatsApp ficam salvos?', resposta: 'Só neste aparelho, para preencher mais rápido da próxima vez. Use o botão Esquecer meus dados para apagar.' }
        ],
        rodapeFrase: 'Cadeira pronta, toalha limpa, horário combinado.'
      },
      meta: { previa: true, motorVersao: 'v1', criadoEm: '2026-11-08T12:00:00Z' }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
