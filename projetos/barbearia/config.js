/*
 * config.js · Tudo o que é dado ou texto da barbearia mora aqui.
 *
 * Para vender o site a outra barbearia, troque só este arquivo:
 * nome, WhatsApp, endereço, horários, serviços, equipe, recados e cores.
 * Os outros arquivos (index.html, styles.css, efeito.js, agendamento.js,
 * som.js) leem tudo de window.FIO_CONFIG.
 *
 * É um script clássico (sem import/export) para funcionar abrindo
 * o index.html direto do disco, sem servidor.
 *
 * Marcadores entre chaves, como {hora} ou {dia}, são preenchidos pelo
 * código. Mantenha os marcadores ao reescrever um texto.
 */
window.FIO_CONFIG = {

  /* NEGÓCIO
   * whatsapp: só dígitos, com DDI 55 e DDD. É o número que recebe as reservas.
   * telefoneExibicao: o mesmo número, do jeito que aparece na tela.
   * endereco: usado no rodapé e no link do Google Maps.
   * instagram: usuário com @ e o link completo do perfil. */
  negocio: {
    nome: 'Barbearia Fio & Couro',
    nomeCurto: 'Fio & Couro',
    bordao: 'Toda cadeira começa no couro.',
    whatsapp: '5511987654321',
    telefoneExibicao: '(11) 98765-4321',
    endereco: {
      rua: 'Rua Domingos de Morais',
      numero: '1418',
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '04010-200'
    },
    instagram: {
      usuario: '@fioecouro',
      url: 'https://www.instagram.com/fioecouro'
    }
  },

  /* FUNCIONAMENTO
   * passoMin: intervalo entre um horário e o próximo na lista (em minutos).
   * antecedenciaMin: quanto tempo antes o cliente ainda pode marcar para hoje.
   * diasNaFita: quantos dias aparecem na fita de datas.
   * semana: 0 = domingo, 1 = segunda ... 6 = sábado.
   *   null = folga. Para abrir num dia, troque null por { abre: 'HH:MM', fecha: 'HH:MM' }. */
  funcionamento: {
    passoMin: 20,
    antecedenciaMin: 20,
    diasNaFita: 7,
    semana: {
      0: null,
      1: null,
      2: { abre: '09:00', fecha: '20:00' },
      3: { abre: '09:00', fecha: '20:00' },
      4: { abre: '09:00', fecha: '20:00' },
      5: { abre: '09:00', fecha: '20:00' },
      6: { abre: '09:00', fecha: '20:00' }
    }
  },

  /* SERVIÇOS
   * id: identificador sem espaço nem acento (não aparece na tela).
   * preco: número em reais, sem "R$" (o site formata).
   * duracaoMin: duração em minutos. Define quais serviços cabem num horário.
   * descricao: uma linha curta. Pode adicionar ou remover itens. */
  servicos: [
    {
      id: 'corte-regua',
      nome: 'Corte na régua',
      preco: 45,
      duracaoMin: 40,
      descricao: 'Tesoura, máquina e acabamento na régua. Sai alinhado até a nuca.'
    },
    {
      id: 'degrade-navalhado',
      nome: 'Degradê navalhado',
      preco: 55,
      duracaoMin: 50,
      descricao: 'Degradê do zero com a transição fechada na navalha.'
    },
    {
      id: 'barba-toalha',
      nome: 'Barba toalha quente',
      preco: 40,
      duracaoMin: 30,
      descricao: 'Toalha quente, espuma no pincel e navalha passada no couro.'
    },
    {
      id: 'corte-barba',
      nome: 'Corte + barba',
      preco: 85,
      duracaoMin: 80,
      descricao: 'O serviço completo. Reserve a manhã ou o fim de tarde.'
    },
    {
      id: 'pezinho-sobrancelha',
      nome: 'Pezinho e sobrancelha',
      preco: 20,
      duracaoMin: 15,
      descricao: 'Manutenção rápida entre um corte e outro.'
    },
    {
      id: 'pigmentacao',
      nome: 'Pigmentação',
      preco: 35,
      duracaoMin: 30,
      descricao: 'Preenche falha na barba ou no desenho do corte, sem cara de tinta.'
    }
  ],

  /* PROFISSIONAIS
   * Aparecem nos chips do agendamento e na seção da equipe.
   * especialidade: uma palavra. bio: uma frase. */
  profissionais: [
    {
      id: 'dirceu',
      nome: 'Seu Dirceu',
      especialidade: 'Navalha',
      bio: 'O mais antigo da casa. Afia a própria navalha toda manhã antes de abrir a porta.'
    },
    {
      id: 'tati',
      nome: 'Tati Moraes',
      especialidade: 'Degradê',
      bio: 'Fecha degradê sem marca e lembra o número da máquina de cada cliente.'
    },
    {
      id: 'wesley',
      nome: 'Wesley "Régua"',
      especialidade: 'Barba',
      bio: 'Ganhou o apelido no primeiro mês: barba dele sai reta como régua.'
    }
  ],

  /* AVALIAÇÕES
   * Recados curtos, como escritos a giz no quadro da barbearia.
   * detalhe: há quanto tempo é cliente ou de onde vem. Use de 4 a 6. */
  avaliacoes: [
    {
      texto: 'Sentei, pedi o de sempre e o Dirceu nem perguntou. Doze anos assim.',
      autor: 'Márcio',
      detalhe: 'cliente desde 2014'
    },
    {
      texto: 'Marquei às 18h40 pelo celular, cheguei 18h38 e já tinha cadeira.',
      autor: 'Rafa',
      detalhe: 'Vila Clementino'
    },
    {
      texto: 'A Tati salvou o degradê que fizeram em outro lugar. Agora só venho aqui.',
      autor: 'Gustavo',
      detalhe: 'cliente desde 2021'
    },
    {
      texto: 'Toalha quente do Wesley vale a semana inteira. Saí outra pessoa.',
      autor: 'Seu Antônio',
      detalhe: 'Chácara Klabin'
    },
    {
      texto: 'Trouxe meu filho pro primeiro corte. Ele saiu se achando. Eu também.',
      autor: 'Diego',
      detalhe: 'cliente desde 2019'
    }
  ],

  /* CORES
   * As quatro cores da marca, aplicadas como variáveis CSS ao abrir a página:
   * couro (fundo), aco (texto), latao (destaque) e giz (apoio).
   * O tema escuro usa estas cores direto. O tema claro é derivado delas
   * no styles.css (couro caramelo cru com aço mais escuro).
   * Ao trocar, confira o contraste entre couro e aco (mínimo AA). */
  cores: {
    couro: '#1f1612',
    aco: '#d9dde0',
    latao: '#b98a4e',
    giz: '#e9efe6'
  },

  /* DEMONSTRAÇÃO
   * ocupacaoFicticia: true deixa alguns horários ocupados de mentira,
   * para a agenda parecer viva na apresentação ao cliente.
   * Desligue (false) para uma barbearia real. */
  demo: {
    ocupacaoFicticia: true
  },

  /* TEXTOS DA INTERFACE
   * Tudo o que aparece em botões, avisos e títulos.
   * Mantenha os marcadores entre chaves: {hora}, {dia}, {n}, {negocio},
   * {servico}, {profissional}, {preco}, {nome} e {whats}. */
  textos: {
    pular: 'Pular para agendar',
    agendar: 'Agendar horário',

    hero: {
      dica: 'Dá o fio.',
      afiada: 'Afiada. Sua cadeira está esperando.',
      instrucaoTeclado: 'Use as setas ou a barra de espaço para afiar.'
    },

    /* Letreiro de status no topo. {hora} = 15h40, {dia} = terça, {n} = número de horários. */
    letreiro: {
      aberto: 'Aberto agora · próximo horário livre {hora}',
      abertoSemVaga: 'Hoje lotado · {dia} tem {n} horários',
      fechadoHoje: 'Fechado · abre hoje às {hora}',
      fechado: 'Fechado · abre {dia} às {hora}'
    },

    agenda: {
      titulo: 'Marque sua cadeira',
      passoDia: 'Escolha o dia',
      passoHora: 'Quando você tá livre?',
      ocupado: 'ocupado',
      passoServico: 'O que cabe nessa passada',
      naoCabe: 'não cabe nessa passada',
      passoProfissional: 'Com quem?',
      passoDados: 'Seus dados',
      nome: 'Seu nome',
      whats: 'Seu WhatsApp',
      erroNome: 'Escreva seu nome para a gente saber quem chamar.',
      erroWhats: 'Digite o WhatsApp com DDD, por exemplo (11) 91234-5678.',
      erroEscolha: 'Falta escolher dia, horário, serviço e profissional antes de confirmar.',
      deSempre: 'O de sempre',
      tira: 'Passe a navalha para confirmar',
      semArrastar: 'Confirmar sem arrastar',
      diaLotado: 'Esse dia lotou. {dia} tem vaga.',
      folga: 'folga'
    },

    espelho: {
      titulo: 'Confere atrás?',
      abrirWhats: 'Abrir WhatsApp de novo',
      novo: 'Marcar outro horário'
    },

    /* Mensagem que chega no WhatsApp da barbearia. */
    mensagemWhats: 'Fala, {negocio}! Quero confirmar meu horário: {servico} com {profissional}, {dia} às {hora}. Valor: {preco}. Nome: {nome}. Meu WhatsApp: {whats}.',

    secoes: {
      servicosTitulo: 'Tabela da casa',
      profissionaisTitulo: 'Quem está na cadeira',
      avaliacoesTitulo: 'Recado no quadro',
      enderecoTitulo: 'Onde fica',
      comoChegar: 'Como chegar no Google Maps',
      funcionamentoTitulo: 'Horário da casa',
      instagram: 'Ver cortes no Instagram',
      whatsFlutuante: 'Chamar no WhatsApp',
      somLigar: 'Ligar som',
      somDesligar: 'Desligar som',
      temaClaro: 'Usar tema claro',
      temaEscuro: 'Usar tema escuro',
      rodape: 'Navalha afiada, cadeira limpa e horário cumprido.'
    }
  }
};
