export const meta = {
  name: 'agencia',
  description: 'Creat Nuvem: Faísca cria 3 conceitos e o júri escolhe, Nimbus planeja, os especialistas constroem em ondas, Crivo revisa, Lupa e Muralha testam, Nimbus entrega',
  whenToUse: 'Projetos com várias etapas (site, app, landing page, feature grande). Passe o briefing como args (texto), ou { briefing, conceito: false } para pular a etapa de conceito.',
  phases: [
    { title: 'Conceito', detail: 'três Faíscas criam conceitos por ângulos diferentes; o júri escolhe e enxerta' },
    { title: 'Briefing', detail: 'Nimbus lê o repositório e monta o plano em ondas' },
    { title: 'Construção', detail: 'especialistas executam cada onda em paralelo, com revisão do Crivo' },
    { title: 'QA', detail: 'Lupa, Muralha e Crivo procuram problemas; cada achado é verificado' },
    { title: 'Correções', detail: 'o responsável corrige os achados confirmados' },
    { title: 'Entrega', detail: 'Nimbus confere os critérios de aceite e escreve o relatório' },
  ],
}

const ESPECIALISTAS = ['arquiteto', 'frontend', 'backend', 'designer', 'motion-3d', 'shader', 'som', 'copywriter', 'pesquisador', 'criativo', 'devops']

const briefing = typeof args === 'string' ? args : (args && args.briefing) || ''
const comConceito = !(args && typeof args === 'object' && args.conceito === false)
if (!briefing) throw new Error('Passe o briefing do projeto em args, por exemplo: "Landing page para minha barbearia com agendamento".')

const PLANO = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    ondas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          tarefas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                responsavel: { type: 'string', enum: ESPECIALISTAS },
                titulo: { type: 'string' },
                instrucoes: { type: 'string' },
                arquivos: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'responsavel', 'titulo', 'instrucoes', 'arquivos'],
            },
          },
        },
        required: ['nome', 'tarefas'],
      },
    },
    criterios_aceite: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'ondas', 'criterios_aceite'],
}

const VEREDITO = {
  type: 'object',
  properties: {
    aprovado: { type: 'boolean' },
    ajustes: { type: 'array', items: { type: 'string' } },
  },
  required: ['aprovado', 'ajustes'],
}

const ACHADOS = {
  type: 'object',
  properties: {
    achados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          severidade: { type: 'string', enum: ['critico', 'alto', 'medio', 'baixo'] },
          arquivo: { type: 'string' },
          cenario: { type: 'string' },
          correcao: { type: 'string' },
          responsavel: { type: 'string', enum: ESPECIALISTAS },
        },
        required: ['titulo', 'severidade', 'arquivo', 'cenario', 'correcao', 'responsavel'],
      },
    },
  },
  required: ['achados'],
}

const CONFIRMACAO = {
  type: 'object',
  properties: { real: { type: 'boolean' }, motivo: { type: 'string' } },
  required: ['real', 'motivo'],
}

// ── Conceito: três ângulos independentes, um júri ───────────────────────────
const CONCEITO = {
  type: 'object',
  properties: {
    nome: { type: 'string' },
    ideia: { type: 'string' },
    momento_assinatura: { type: 'string' },
    celular: { type: 'string' },
    risco: { type: 'integer', minimum: 1, maximum: 5 },
    custo_tecnico: { type: 'string' },
  },
  required: ['nome', 'ideia', 'momento_assinatura', 'celular', 'risco', 'custo_tecnico'],
}
const ESCOLHA = {
  type: 'object',
  properties: {
    vencedor: { type: 'string' },
    pontuacao: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, total: { type: 'integer' }, motivo: { type: 'string' } }, required: ['nome', 'total', 'motivo'] } },
    conceito_final: { type: 'string' },
  },
  required: ['vencedor', 'pontuacao', 'conceito_final'],
}
let conceito = ''
if (comConceito) {
  phase('Conceito')
  const ANGULOS = [
    { chave: 'metafora', pedido: 'pelo ângulo da METÁFORA: a experiência inteira é um objeto ou lugar do mundo do cliente' },
    { chave: 'inversao', pedido: 'pelo ângulo da INVERSÃO: descubra o que todos os concorrentes fazem e faça o contrário de propósito' },
    { chave: 'ritual', pedido: 'pelo ângulo do RITUAL: um gesto real do mundo do cliente vira a interação principal' },
  ]
  const conceitos = (await parallel(ANGULOS.map(an => () => agent(
    `Briefing do cliente:\n\n${briefing}\n\nCrie UM conceito ${an.pedido}. Siga a skill ideacao. Seja ousado, mas construível por uma equipe com frontend, backend, 3D, shaders e som, e que funcione no celular.`,
    { label: `faisca:${an.chave}`, phase: 'Conceito', agentType: 'criativo', schema: CONCEITO },
  )))).filter(Boolean)
  if (conceitos.length) {
    const escolha = await agent(
      `Briefing:\n${briefing}\n\nConceitos candidatos:\n${conceitos.map(c => `### ${c.nome} (risco ${c.risco})\n${c.ideia}\nMomento-assinatura: ${c.momento_assinatura}\nNo celular: ${c.celular}\nCusto: ${c.custo_tecnico}`).join('\n\n')}\n\nPontue cada um de 1 a 5 em: memorável, fiel ao cliente, viável, funciona no celular, acessível (total até 25). Escolha o vencedor e escreva o conceito final, enxertando a melhor ideia de um dos perdedores.`,
      { label: 'juri:conceito', phase: 'Conceito', agentType: 'diretor', schema: ESCOLHA },
    )
    if (escolha) {
      conceito = escolha.conceito_final
      log(`Conceito escolhido: ${escolha.vencedor}`)
    }
  }
}

// ── Briefing ────────────────────────────────────────────────────────────────
phase('Briefing')
const plano = await agent(
  `Briefing do cliente:\n\n${briefing}\n\n${conceito ? `Conceito criativo aprovado (todas as tarefas devem servir a ele, inclusive o momento-assinatura):\n${conceito}\n\n` : ''}Leia o repositório e monte o plano em ondas. Tarefas da mesma onda não podem tocar os mesmos arquivos.`,
  { label: 'nimbus:plano', agentType: 'diretor', schema: PLANO },
)
if (!plano) throw new Error('O Diretor não conseguiu montar o plano.')
const totalTarefas = plano.ondas.reduce((n, o) => n + o.tarefas.length, 0)
log(`Plano: ${plano.resumo} · ${plano.ondas.length} ondas · ${totalTarefas} tarefas`)

// ── Construção: ondas em sequência, tarefas da onda em paralelo ─────────────
phase('Construção')
const entregas = []
for (const onda of plano.ondas) {
  log(`Onda "${onda.nome}": ${onda.tarefas.map(t => t.responsavel).join(', ')}`)
  const resultados = await pipeline(
    onda.tarefas,
    t => agent(
      `Projeto: ${plano.resumo}\n${conceito ? `Conceito: ${conceito}\n` : ''}\nSua tarefa (${t.id}): ${t.titulo}\n\n${t.instrucoes}\n\nArquivos sob sua responsabilidade: ${t.arquivos.join(', ') || 'a definir'}. Não edite arquivos de outras tarefas.\n\nAo terminar, relate em poucas linhas o que fez e como verificar.`,
      { label: `${t.responsavel}:${t.id}`, phase: 'Construção', agentType: t.responsavel },
    ),
    (relato, t) => agent(
      `Revise a entrega da tarefa ${t.id} ("${t.titulo}") feita por ${t.responsavel}.\nArquivos: ${t.arquivos.join(', ')}\nRelato do especialista:\n${relato}\n\nAprove se está correta e completa. Caso contrário, liste ajustes objetivos.`,
      { label: `crivo:${t.id}`, phase: 'Construção', agentType: 'revisor', schema: VEREDITO },
    ).then(v => ({ t, relato, v })),
    async ({ t, relato, v }) => {
      if (!v || v.aprovado || !v.ajustes.length) return { t, relato, aprovado: true }
      const ajuste = await agent(
        `O revisor pediu ajustes na sua tarefa ${t.id} ("${t.titulo}"):\n- ${v.ajustes.join('\n- ')}\n\nAplique os ajustes e relate o que mudou.`,
        { label: `${t.responsavel}:${t.id}:ajuste`, phase: 'Construção', agentType: t.responsavel },
      )
      return { t, relato: `${relato}\n\nAjustes: ${ajuste}`, aprovado: true }
    },
  )
  entregas.push(...resultados.filter(Boolean))
}

// ── QA: três lentes diferentes procuram problemas ───────────────────────────
phase('QA')
const LENTES = [
  { tipo: 'qa', foco: 'Rode build e testes, abra as páginas com Playwright em celular e desktop, exercite os fluxos e casos de borda.' },
  { tipo: 'seguranca', foco: 'Audite segredos, entrada do usuário, autenticação, dependências e dados pessoais.' },
  { tipo: 'revisor', foco: 'Revise o diff completo do projeto em busca de bugs e código que pode ser simplificado.' },
]
const resumoEntregas = entregas.map(e => `- ${e.t.id} (${e.t.responsavel}): ${e.t.titulo}`).join('\n')
const verificados = await pipeline(
  LENTES,
  l => agent(
    `Projeto: ${plano.resumo}\nEntregas:\n${resumoEntregas}\nCritérios de aceite:\n- ${plano.criterios_aceite.join('\n- ')}\n\n${l.foco}\nReporte só problemas reais, com cenário concreto. Indique o especialista que deve corrigir.`,
    { label: `${l.tipo}:busca`, phase: 'QA', agentType: l.tipo, schema: ACHADOS },
  ),
  (r, l) => parallel((r ? r.achados : []).map(a => () =>
    agent(
      `Tente REFUTAR este achado olhando o código real. Se não conseguir reproduzir ou confirmar no código, responda real=false.\n\n${a.titulo} [${a.severidade}] em ${a.arquivo}\nCenário: ${a.cenario}`,
      { label: `verifica:${a.arquivo}`, phase: 'QA', agentType: l.tipo === 'revisor' ? 'qa' : 'revisor', schema: CONFIRMACAO },
    ).then(c => (c && c.real ? a : null)),
  )),
)
const confirmados = verificados.filter(Boolean).flat().filter(Boolean)
log(`${confirmados.length} achados confirmados`)

// ── Correções: agrupadas por responsável para não haver conflito ────────────
phase('Correções')
const porResponsavel = {}
for (const a of confirmados) (porResponsavel[a.responsavel] = porResponsavel[a.responsavel] || []).push(a)
const correcoes = await parallel(Object.entries(porResponsavel).map(([quem, lista]) => () =>
  agent(
    `Corrija estes problemas confirmados pelo QA:\n\n${lista.map((a, i) => `${i + 1}. [${a.severidade}] ${a.titulo} — ${a.arquivo}\n   Cenário: ${a.cenario}\n   Correção sugerida: ${a.correcao}`).join('\n')}\n\nRelate o que foi corrigido e como verificar.`,
    { label: `${quem}:correcoes`, phase: 'Correções', agentType: quem },
  ).then(r => ({ quem, r })),
))

// ── Entrega ─────────────────────────────────────────────────────────────────
phase('Entrega')
const relatorio = await agent(
  `Feche o projeto "${plano.resumo}".\n\nEntregas:\n${entregas.map(e => `### ${e.t.id} · ${e.t.responsavel}\n${e.relato}`).join('\n\n')}\n\nCorreções do QA:\n${correcoes.filter(Boolean).map(c => `### ${c.quem}\n${c.r}`).join('\n\n') || 'nenhuma'}\n\nConfira cada critério de aceite no repositório (rode os comandos necessários):\n- ${plano.criterios_aceite.join('\n- ')}\n\nEscreva o relatório final em português: o que foi feito, status de cada critério (ok / falhou / não verificado), como rodar, e próximos passos.`,
  { label: 'nimbus:entrega', agentType: 'diretor' },
)

return { conceito, plano: plano.resumo, tarefas: totalTarefas, achados_confirmados: confirmados.length, relatorio }
