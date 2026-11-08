/*
 * motor/nichos/academia.js · preset do nicho academia, studio e personal (motor v1, T8)
 *
 * Sem dado de cliente:
 *  - textos, modalidades, mensagem e horário sugerido: conteudo/nichos/academia.json (Verbo, T3);
 *  - 3 paletas AA nas cores oficiais das anilhas olímpicas (25 kg vermelha, 20 kg azul,
 *    15 kg amarela): assets/tokens.css e docs/DIRECAO.md §8.2 (Paleta, T2), ordem 1, 2, 3 = p=1..3;
 *  - ritual 'barra': levantar a barra carregada do chão até o alto (motor/v1/rituais/barra.js).
 * O pedido é aula experimental ou avaliação. Valores "sob consulta" por padrão (preco: null).
 * Fora do preset: promessa de mudar o corpo em prazo, antes e depois, nome de aluno ou de
 * academia real sem autorização por escrito. Sem equipe e sem avaliação de exemplo;
 * nenhum horário ocupado inventado.
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
    id: 'academia',
    rotulo: 'Academia e studio',
    ritual: 'barra',
    /* arquivos do ritual, relativos a motor/ (a prévia carrega pelo CreatNichos.carregar; o site entregue, pelo template) */
    ritualArquivos: { js: ['v1/rituais/comum.js', 'v1/rituais/barra.js'], css: 'v1/rituais/rituais.css' },
    schemaOrgTipo: 'ExerciseGym',

    /* Barlow Condensed 800: letra de cartaz de sala de pesos; Barlow no corpo */
    fontes: {
      google: 'family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;600',
      display: "'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif",
      texto: "'Barlow', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      dado: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    },

    /* T2 · contraste medido em docs/DIRECAO.md §8.2: todos os pares >= 4,5 nos dois temas */
    paletas: [
      {
        id: 'academia-1', nome: 'Anilha 25',
        claro: { fundo: '#F1F0EC', superficie: '#FFFFFF', texto: '#161616', apoio: '#4D4B47', destaque: '#B8141E', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#131313', superficie: '#1E1E1E', texto: '#F1F0EC', apoio: '#BDBAB3', destaque: '#FF5A5F', sobreDestaque: '#131313' }
      },
      {
        id: 'academia-2', nome: 'Anilha 20',
        claro: { fundo: '#EDF0F2', superficie: '#FFFFFF', texto: '#111A22', apoio: '#47525C', destaque: '#1556A8', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#10161C', superficie: '#1A222A', texto: '#ECF0F3', apoio: '#B5C0CA', destaque: '#6FA8F0', sobreDestaque: '#10161C' }
      },
      {
        id: 'academia-3', nome: 'Anilha 15',
        claro: { fundo: '#F4F1E8', superficie: '#FFFDF6', texto: '#181611', apoio: '#514B3E', destaque: '#8A6400', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#151410', superficie: '#211F19', texto: '#F4F1E8', apoio: '#C8C1AF', destaque: '#FFD23F', sobreDestaque: '#151410' }
      }
    ],

    /* resolvidos na montagem do tenant (prévia e produzir.mjs), nunca no motor */
    pagina: {
      titulo: '{negocio} · academia em {cidade}',
      tituloSemCidade: '{negocio} · academia e studio',
      descricao: 'Musculação, funcional e aulas em {cidade}. Peça uma aula experimental ou uma avaliação pelo site e combine o horário no WhatsApp.'
    },

    textosPermitidos: textosPermitidos,

    /* microtexto do ritual (não é campo do tenant; vem do preset). instrucao, instrucaoTeclado,
       semArrastar e pronto são da T3; os heroi* foram escritos na T8 no mesmo tom */
    ritualTextos: {
      instrucao: 'Arraste a barra para cima para levantar e enviar.',
      instrucaoTeclado: 'Use as setas ou a barra de espaço para levantar e enviar.',
      semArrastar: 'Enviar sem arrastar',
      pronto: 'Levantou. O pedido está pronto.',
      heroiDica: 'Levante a barra.',
      heroiInstrucao: 'Levantar a barra: arraste a barra para cima, ou use a seta para cima e a barra de espaço.',
      heroiPronto: 'Levantou. A primeira aula está a um pedido.'
    },

    tenantBase: {
      versao: 1,
      slug: 'previa',
      nicho: 'academia',
      negocio: {
        nome: 'Seu negócio',
        nomeCurto: 'Seu negócio',
        bordao: 'Venha treinar uma vez antes de decidir.'
      },
      pagina: {
        titulo: 'Seu negócio · academia e studio',
        descricao: 'Musculação, funcional e aulas. Peça uma aula experimental ou uma avaliação pelo site e combine o horário no WhatsApp.'
      },
      funcionamento: {
        passoMin: 60,
        antecedenciaMin: 120,
        diasNaFita: 7,
        semana: {
          0: null,
          1: { abre: '06:00', fecha: '22:00' },
          2: { abre: '06:00', fecha: '22:00' },
          3: { abre: '06:00', fecha: '22:00' },
          4: { abre: '06:00', fecha: '22:00' },
          5: { abre: '06:00', fecha: '22:00' },
          6: { abre: '08:00', fecha: '13:00' }
        }
      },
      servicos: [
        { id: 'aula-experimental', nome: 'Aula experimental', preco: null, duracaoMin: 60, descricao: 'Uma aula para conhecer o espaço, os professores e o ritmo da casa.' },
        { id: 'avaliacao', nome: 'Avaliação para começar', preco: null, duracaoMin: 45, descricao: 'Conversa com o professor sobre a sua rotina e o seu objetivo, para montar o primeiro treino.' },
        { id: 'musculacao', nome: 'Musculação', preco: null, duracaoMin: 60, descricao: 'Treino com aparelhos e pesos livres, com professor na sala.' },
        { id: 'funcional', nome: 'Funcional', preco: null, duracaoMin: 50, descricao: 'Aula em grupo com circuito de exercícios.' },
        { id: 'pilates', nome: 'Pilates', preco: null, duracaoMin: 50, descricao: 'Aula em turma pequena, no solo ou nos aparelhos.' },
        { id: 'personal', nome: 'Treino com personal', preco: null, duracaoMin: 60, descricao: 'Treino individual, com horário combinado com o professor.' }
      ],
      profissionais: [],
      avaliacoes: [],
      cores: { fundo: '#F1F0EC', texto: '#161616', destaque: '#B8141E', apoio: '#4D4B47' },
      agendamento: {
        modo: 'whatsapp',
        mensagem: 'Olá! Meu nome é {nome}. Quero pedir {servico} para {dia} às {hora}. Pode confirmar por aqui?'
      },
      textos: {
        heroTitulo: 'Sua primeira aula começa com um pedido.',
        heroSubtitulo: 'Escolha a aula experimental ou a avaliação, o dia e o horário. O pedido chega no WhatsApp da academia e o dono confirma pelo WhatsApp.',
        manifesto: 'Aqui a primeira aula serve para você conhecer a casa sem compromisso. Você escolhe a modalidade, o dia e o horário pelo celular, e o pedido chega no WhatsApp da academia. A confirmação vem por lá, com o nome de quem vai te receber. Traga roupa confortável e água.',
        servicosTitulo: 'Modalidades',
        servicosNota: 'Valores sob consulta. Pergunte os planos no WhatsApp.',
        equipeTitulo: 'Professores',
        avaliacoesTitulo: 'Recados de quem treina',
        pedidoTitulo: 'Peça a sua aula experimental',
        pedidoNota: 'O pedido vai para o WhatsApp da academia e o dono confirma pelo WhatsApp.',
        ritualDica: 'Levante a barra para enviar',
        confirmacaoTitulo: 'Pedido pronto para enviar',
        confirmacaoTexto: 'Toque em enviar no WhatsApp. A aula vale depois que o dono confirma pelo WhatsApp.',
        letreiroAberto: 'Aberto agora · peça a sua aula',
        letreiroFechado: 'Fechado agora · abre {dia} às {hora}',
        localTitulo: 'Onde fica',
        faqTitulo: 'Antes de vir',
        faq: [
          { pergunta: 'Pedir pelo site já marca a aula?', resposta: 'Ainda não. O pedido chega no WhatsApp da academia e o dono confirma pelo WhatsApp. A aula vale depois da confirmação.' },
          { pergunta: 'Quanto custa?', resposta: 'Os valores e os planos são passados pelo WhatsApp, de acordo com a modalidade e a frequência.' },
          { pergunta: 'Preciso levar alguma coisa?', resposta: 'Roupa confortável, tênis e uma garrafa de água. Se tiver alguma dúvida sobre a aula, pergunte no WhatsApp.' },
          { pergunta: 'Meu nome e meu WhatsApp ficam salvos?', resposta: 'Só neste aparelho, para preencher mais rápido da próxima vez. Use o botão Esquecer meus dados para apagar.' }
        ],
        rodapeFrase: 'Barra montada, sala aberta, horário combinado.'
      },
      meta: { previa: true, motorVersao: 'v1', criadoEm: '2026-11-08T12:00:00Z' }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
