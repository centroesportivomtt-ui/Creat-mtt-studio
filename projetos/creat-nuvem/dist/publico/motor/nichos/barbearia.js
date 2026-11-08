/*
 * motor/nichos/barbearia.js · preset do nicho barbearia (motor v1)
 *
 * Nasce do Fio no Couro (projetos/barbearia/), sem dado de cliente:
 *  - textos, serviços, mensagem e horário sugerido: conteudo/nichos/barbearia.json (Verbo, T3);
 *  - 3 paletas AA: assets/tokens.css e docs/DIRECAO.md §8.2 (Paleta, T2), ordem 1, 2, 3 = p=1..3;
 *  - ritual 'navalha': afiar a navalha no couro com o polegar (motor/v1/efeito.js).
 * Sem equipe e sem avaliação de exemplo; nenhum horário ocupado inventado.
 * Preços são exemplo; a prévia mostra o rótulo "exemplo".
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
    id: 'barbearia',
    rotulo: 'Barbearia',
    ritual: 'navalha',
    schemaOrgTipo: 'HairSalon',

    /* tipografia do nicho (Google Fonts; sem internet cai nas fontes de reserva) */
    fontes: {
      google: 'family=Big+Shoulders+Display:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600',
      display: "'Big Shoulders Display', 'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif",
      texto: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      dado: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    },

    /* T2 · contraste medido em docs/DIRECAO.md §8.2: todos os pares >= 4,5 nos dois temas */
    paletas: [
      {
        id: 'barbearia-1', nome: 'Fio no Couro',
        claro: { fundo: '#EFDCC0', superficie: '#F8EEDD', texto: '#1F1612', apoio: '#5A4232', destaque: '#7A4E1D', sobreDestaque: '#FFF6E6' },
        escuro: { fundo: '#1F1612', superficie: '#2B201A', texto: '#E9EFE6', apoio: '#C9BBA8', destaque: '#C9995A', sobreDestaque: '#1F1612' }
      },
      {
        id: 'barbearia-2', nome: 'Poste',
        claro: { fundo: '#F7F4EF', superficie: '#FFFFFF', texto: '#14213D', apoio: '#46506A', destaque: '#B3261E', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#0F1729', superficie: '#18223A', texto: '#F2EEE8', apoio: '#BFC5D4', destaque: '#FF6B5E', sobreDestaque: '#0F1729' }
      },
      {
        id: 'barbearia-3', nome: 'Lousa',
        claro: { fundo: '#E8EEEA', superficie: '#F5F8F5', texto: '#1B2D28', apoio: '#4A5C55', destaque: '#7C5A1E', sobreDestaque: '#FFFFFF' },
        escuro: { fundo: '#1B2D28', superficie: '#233932', texto: '#EEF2EA', apoio: '#B9C7BF', destaque: '#E0B76A', sobreDestaque: '#1B2D28' }
      }
    ],

    /* resolvidos na montagem do tenant (prévia e produzir.mjs), nunca no motor */
    pagina: {
      titulo: '{negocio} · barbearia em {cidade}',
      tituloSemCidade: '{negocio} · barbearia',
      descricao: 'Corte, degradê e barba em {cidade}. Escolha o serviço, o dia e o horário no site e mande o pedido pelo WhatsApp. O dono confirma por lá.'
    },

    textosPermitidos: textosPermitidos,

    /* microtexto do ritual (não é campo do tenant; vem do preset) */
    ritualTextos: {
      instrucao: 'Arraste o polegar sobre o couro para afiar a navalha e enviar.',
      instrucaoTeclado: 'Use as setas ou a barra de espaço para afiar e enviar.',
      semArrastar: 'Enviar sem arrastar',
      pronto: 'Afiada. O pedido está pronto.',
      heroiDica: 'Dá o fio.',
      heroiInstrucao: 'Afiar a navalha: arraste no couro, ou use as setas e a barra de espaço.',
      heroiPronto: 'Afiada. A cadeira está esperando.'
    },

    tenantBase: {
      versao: 1,
      slug: 'previa',
      nicho: 'barbearia',
      negocio: {
        nome: 'Seu negócio',
        nomeCurto: 'Seu negócio',
        bordao: 'Corte no capricho, horário pedido pelo WhatsApp.'
      },
      pagina: {
        titulo: 'Seu negócio · barbearia',
        descricao: 'Corte, degradê e barba. Escolha o serviço, o dia e o horário no site e mande o pedido pelo WhatsApp. O dono confirma por lá.'
      },
      funcionamento: {
        passoMin: 20,
        antecedenciaMin: 30,
        diasNaFita: 7,
        semana: {
          0: null,
          1: null,
          2: { abre: '09:00', fecha: '20:00' },
          3: { abre: '09:00', fecha: '20:00' },
          4: { abre: '09:00', fecha: '20:00' },
          5: { abre: '09:00', fecha: '20:00' },
          6: { abre: '09:00', fecha: '18:00' }
        }
      },
      servicos: [
        { id: 'corte', nome: 'Corte', preco: 45, duracaoMin: 40, descricao: 'Tesoura e máquina, com acabamento na nuca e no pezinho.' },
        { id: 'degrade', nome: 'Degradê', preco: 55, duracaoMin: 50, descricao: 'Degradê do zero, com a transição fechada na navalha.' },
        { id: 'barba', nome: 'Barba', preco: 40, duracaoMin: 30, descricao: 'Toalha quente, espuma no pincel e navalha.' },
        { id: 'corte-barba', nome: 'Corte + barba', preco: 85, duracaoMin: 80, descricao: 'O serviço completo numa passada só.' },
        { id: 'pezinho', nome: 'Pezinho', preco: 20, duracaoMin: 15, descricao: 'Manutenção rápida do contorno entre um corte e outro.' }
      ],
      profissionais: [],
      avaliacoes: [],
      cores: { fundo: '#EFDCC0', texto: '#1F1612', destaque: '#7A4E1D', apoio: '#5A4232' },
      agendamento: {
        modo: 'whatsapp',
        mensagem: 'Olá! Meu nome é {nome}. Quero pedir um horário: {servico}, {dia} às {hora}. Pode confirmar por aqui?'
      },
      textos: {
        heroTitulo: 'Cadeira de bairro, corte no capricho.',
        heroSubtitulo: 'Escolha o serviço, o dia e o horário. O pedido chega no WhatsApp da casa e o dono confirma pelo WhatsApp.',
        manifesto: 'Aqui a navalha passa no couro antes de cada cliente. Você escolhe o corte, o dia e o horário pelo celular, sem ligar e sem esperar alguém atender. O pedido chega no WhatsApp da casa, e a confirmação vem por lá, de gente para gente. Chegou, sentou, saiu alinhado.',
        servicosTitulo: 'Tabela da casa',
        servicosNota: 'Preços de exemplo. O dono troca pelos preços da casa antes de o site entrar no ar.',
        equipeTitulo: 'Quem está na cadeira',
        avaliacoesTitulo: 'Recado no quadro',
        pedidoTitulo: 'Peça o seu horário',
        pedidoNota: 'O pedido vai para o WhatsApp da barbearia e o dono confirma pelo WhatsApp.',
        ritualDica: 'Passe a navalha no couro para enviar',
        confirmacaoTitulo: 'Pedido pronto para enviar',
        confirmacaoTexto: 'Toque em enviar no WhatsApp. O horário vale depois que o dono confirma pelo WhatsApp.',
        letreiroAberto: 'Aberto agora · peça o seu horário',
        letreiroFechado: 'Fechado agora · abre {dia} às {hora}',
        localTitulo: 'Onde fica',
        faqTitulo: 'Antes de pedir',
        faq: [
          { pergunta: 'Pedir pelo site já marca o horário?', resposta: 'Ainda não. O pedido chega no WhatsApp da barbearia e o dono confirma pelo WhatsApp. O horário vale depois da confirmação.' },
          { pergunta: 'Posso pedir corte e barba juntos?', resposta: 'Pode. Escolha Corte + barba na lista de serviços.' },
          { pergunta: 'Como eu pago?', resposta: 'O pagamento é na barbearia. Pergunte no WhatsApp quais formas a casa aceita.' },
          { pergunta: 'Meu nome e meu WhatsApp ficam salvos?', resposta: 'Só neste aparelho, para preencher mais rápido da próxima vez. Use o botão Esquecer meus dados para apagar.' }
        ],
        rodapeFrase: 'Navalha afiada, cadeira limpa, horário combinado.'
      },
      meta: { previa: true, motorVersao: 'v1', criadoEm: '2026-11-08T12:00:00Z' }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
