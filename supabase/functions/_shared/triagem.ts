// _shared/triagem.ts — P2-S06-T02 (v2: pega o primeiro bloco type=text)
// AG-01 triagem de intenção + guardião determinístico (evaluateGuard).
// @ts-nocheck

export const INTENCOES = [
  'informacao_geral', 'interesse_procedimento', 'preco_condicao', 'pedido_agendamento',
  'reagendamento_cancelamento', 'pos_procedimento', 'reclamacao', 'financeiro',
  'atendimento_humano', 'desconhecido',
] as const

export const MODELO_PADRAO = 'claude-haiku-5-5'
export const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 30_000

export function evaluateGuard(acao: {
  intent: string
  confidence: number
  knowledgeItemId: string | null
  resposta: string | null
}, ctx: {
  automationPaused: boolean
  autoRespostaLigada: boolean
  recusaPromocional: boolean
  emExpediente: boolean
  rotaAutoReplyAllowed: boolean
  confiancaMin: number
  itemAprovadoAutoReply: boolean
  custoDiaEsgotado: boolean
  chamadasDiaEsgotadas: boolean
}): { effect: 'allow' | 'require_human' | 'deny'; reason: string | null } {
  try {
    if (ctx.automationPaused) return { effect: 'deny', reason: 'transbordo_ativo' }
    if (!ctx.autoRespostaLigada) return { effect: 'require_human', reason: 'auto_resposta_desligada' }
    if (ctx.recusaPromocional && acao.intent !== 'atendimento_humano') return { effect: 'deny', reason: 'recusa_do_contato' }
    if (!ctx.emExpediente) return { effect: 'require_human', reason: 'fora_do_horario' }
    if (!ctx.rotaAutoReplyAllowed) return { effect: 'require_human', reason: 'intencao_exige_humano' }
    if (!Number.isFinite(Number(ctx.confiancaMin)) || acao.confidence < Number(ctx.confiancaMin)) return { effect: 'require_human', reason: 'baixa_confianca' }
    if (temaSensivel(acao.intent)) return { effect: 'require_human', reason: 'tema_sensivel' }
    if (!acao.knowledgeItemId || !ctx.itemAprovadoAutoReply) return { effect: 'require_human', reason: 'sem_conteudo_aprovado' }
    if (acao.resposta == null || acao.resposta.trim() === '') return { effect: 'deny', reason: 'texto_nao_aprovado' }
    if (ctx.custoDiaEsgotado || ctx.chamadasDiaEsgotadas) return { effect: 'require_human', reason: 'orcamento_esgotado' }
    return { effect: 'allow', reason: null }
  } catch {
    return { effect: 'require_human', reason: 'falha_guardiao' }
  }
}

export function temaSensivel(intent: string): boolean {
  return ['preco_condicao', 'pos_procedimento', 'reclamacao', 'financeiro'].includes(intent)
}

export interface TriagemIA {
  intent: string
  confidence: number
  missing: string[]
  knowledge_item_id: string | null
}

export async function chamarIA(p: {
  baseUrl: string
  apiKey: string
  modelo: string
  ultimaMensagem: string
  historico: { direction: string; body: string }[]
  itensAprovados: { id: string; question_examples: string[] }[]
  clinica: string
  timeoutMs?: number
}): Promise<{ ok: true; saida: TriagemIA; usage: { input: number; output: number } } | { ok: false; error_code: string }> {
  const timeoutMs = p.timeoutMs ?? TIMEOUT_MS
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), timeoutMs)
  const listaItens = p.itensAprovados
    .map((i) => `- ${i.id}: ${i.question_examples.join(' | ')}`)
    .join('\n') || '(nenhum)'
  const historico = p.historico.slice(-10).map((m) => `${m.direction === 'inbound' ? 'Contato' : 'Clínica'}: ${m.body}`).join('\n')
  const system = [
    'Você é o agente de triagem de um CRM de clínica de estética.',
    'Classifique a ÚLTIMA mensagem do contato em UMA intenção e estime a confiança (0 a 1).',
    `Intenções possíveis: ${INTENCOES.join(', ')}.`,
    'Se a intenção for informacao_geral e um dos itens de conhecimento casar com a pergunta, devolva o id dele; senão null.',
    'Responda SOMENTE com JSON válido no formato exato:',
    '{"intent":"<intencao>","confidence":0.0,"missing":[],"knowledge_item_id":"uuid|null"}',
  ].join(' ')
  const user = [
    `Clínica: ${p.clinica}`,
    historico ? `Histórico recente:\n${historico}` : '',
    `Itens de conhecimento aprovados (id: perguntas exemplo):\n${listaItens}`,
    `Última mensagem do contato: "${p.ultimaMensagem}"`,
  ].filter(Boolean).join('\n\n')
  try {
    const resp = await fetch(`${p.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal: controle.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': p.apiKey,
        'anthropic-version': '2023-06-01',
        'user-agent': 'PSEstetica-CRM/1.0 (+supabase-edge)',
      },
      body: JSON.stringify({
        model: p.modelo,
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    clearTimeout(timer)
    if (resp.status === 401 || resp.status === 403) return { ok: false, error_code: 'credencial_invalida' }
    if (resp.status === 429) return { ok: false, error_code: 'limite_externo' }
    if (!resp.ok) return { ok: false, error_code: 'ia_erro' }
    const corpo = await resp.json()
    // o primeiro bloco pode não ser texto — pegar o PRIMEIRO bloco type=text
    const bloco = Array.isArray(corpo?.content) ? corpo.content.find((b: any) => b?.type === 'text' && typeof b.text === 'string') : null
    const texto = bloco ? bloco.text : null
    if (!texto) return { ok: false, error_code: 'ia_resposta_malformada' }
    const saida = validarSaida(texto)
    if (!saida) return { ok: false, error_code: 'ia_resposta_malformada' }
    return {
      ok: true,
      saida,
      usage: { input: Number(corpo?.usage?.input_tokens ?? 0), output: Number(corpo?.usage?.output_tokens ?? 0) },
    }
  } catch (e) {
    clearTimeout(timer)
    const msg = String(e?.message ?? e)
    if (msg.includes('abort') || msg.includes('Abort')) return { ok: false, error_code: 'ia_timeout' }
    return { ok: false, error_code: 'ia_indisponivel' }
  }
}

export function validarSaida(texto: string): TriagemIA | null {
  try {
    const inicio = texto.indexOf('{')
    const fim = texto.lastIndexOf('}')
    if (inicio < 0 || fim <= inicio) return null
    const bruto = JSON.parse(texto.slice(inicio, fim + 1))
    if (typeof bruto !== 'object' || bruto == null) return null
    if (!INTENCOES.includes(bruto.intent)) return null
    const conf = Number(bruto.confidence)
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) return null
    if (!Array.isArray(bruto.missing)) return null
    const kid = bruto.knowledge_item_id
    if (kid != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(kid))) return null
    return { intent: bruto.intent, confidence: conf, missing: bruto.missing.map(String), knowledge_item_id: kid }
  } catch {
    return null
  }
}
