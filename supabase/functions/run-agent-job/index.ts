// Edge Function run-agent-job v2 — P2-S06-T02
// v2: usa _shared/triagem.ts v2 (primeiro bloco type=text da IA).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { evaluateGuard, chamarIA, MODELO_PADRAO, PRAZO_TOTAL_MS } from '../_shared/triagem.ts'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  const inicio = Date.now()
  try {
    const admin0 = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const segredoHeader = req.headers.get('x-internal-job') ?? ''
    let autorizado = false
    const segredoEnv = Deno.env.get('INTERNAL_JOB_SECRET') ?? ''
    if (segredoEnv && segredoHeader === segredoEnv) autorizado = true
    if (!autorizado) {
      try {
        const { data: v } = await admin0.rpc('_edge_read_secret', { p_secret_ref: 'vault:cf1c1eb8-5f95-4de0-81b0-3fbd6b6af59c' })
        if (typeof v === 'string' && v !== '' && segredoHeader === v) autorizado = true
      } catch {}
    }
    if (!autorizado) {
      return json(403, { error: { code: 'sem_permissao', message: 'Acesso interno' }, correlation_id: correlationId })
    }
    const admin = admin0
    const { data: lote } = await admin.rpc('fila_ler', { p_fila: 'agent_jobs', p_vt: 60, p_qty: 10 })
    const itens = (lote ?? []) as { msg_id: number; message: Record<string, unknown> }[]
    if (!itens.length) return json(200, { data: { processados: 0 }, correlation_id: correlationId })

    const { data: connIA } = await admin.from('integration_connections')
      .select('secret_ref').eq('provider', 'anthropic').eq('connection_key', 'api_key').limit(1).maybeSingle()
    let apiKey: string | null = null
    if (connIA?.secret_ref?.startsWith('vault:')) {
      const { data: s } = await admin.rpc('_edge_read_secret', { p_secret_ref: connIA.secret_ref })
      apiKey = typeof s === 'string' && s.length > 0 ? s : null
    }

    let ok = 0, falhas = 0
    for (const item of itens) {
      const msg = item.message ?? {}
      const conversationId = typeof msg.conversation_id === 'string' ? msg.conversation_id : null
      if (!conversationId) { falhas++; await admin.rpc('fila_arquivar', { p_fila: 'agent_jobs', p_msg_id: item.msg_id }); continue }
      try {
        const r = await processar(admin, conversationId, apiKey, correlationId, inicio)
        if (r === 'ok') ok++; else falhas++
      } catch { falhas++ }
      await admin.rpc('fila_arquivar', { p_fila: 'agent_jobs', p_msg_id: item.msg_id })
    }
    return json(200, { data: { processados: itens.length, ok, falhas }, correlation_id: correlationId })
  } catch (e) {
    return json(500, { error: { code: 'inesperado', message: 'Erro interno' }, correlation_id: correlationId })
  }
})

async function processar(admin: any, conversationId: string, apiKey: string | null, correlationId: string, inicioTurno: number): Promise<'ok' | 'falha'> {
  const { data: conv } = await admin.from('conversations')
    .select('id, organization_id, clinic_id, status, automation_paused, contact_id, contacts(name)').eq('id', conversationId).maybeSingle()
  if (!conv) return 'falha'

  let cfg: any = null
  const { data: cfgClinica } = await admin.from('agent_clinic_configs')
    .select('enabled, model_policy, thresholds, budgets').eq('clinic_id', conv.clinic_id).eq('agent_key', 'AG-01').maybeSingle()
  const { data: cfgOrg } = cfgClinica ? { data: null } : await admin.from('agent_clinic_configs')
    .select('enabled, model_policy, thresholds, budgets').eq('organization_id', conv.organization_id).is('clinic_id', null).eq('agent_key', 'AG-01').maybeSingle()
  cfg = cfgClinica ?? cfgOrg
  const enabled = cfg?.enabled === true
  const confiancaMin = Number(cfg?.thresholds?.confianca_min ?? 0.85)
  const modelo = String(cfg?.model_policy?.model ?? MODELO_PADRAO)

  const { data: flag } = await admin.from('feature_flags')
    .select('enabled').eq('clinic_id', conv.clinic_id).eq('flag_key', 'auto_resposta').maybeSingle()
  const autoRespostaLigada = flag?.enabled === true

  const { data: recusa } = await admin.from('consents')
    .select('id').eq('contact_id', conv.contact_id).eq('purpose', 'promocional').eq('status', 'revoked').limit(1).maybeSingle()

  const { data: emExp } = await admin.rpc('em_expediente', { p_clinic: conv.clinic_id })

  const { data: msgs } = await admin.from('messages')
    .select('direction, body, content_type').eq('conversation_id', conversationId)
    .eq('content_type', 'text').order('occurred_at', { ascending: false }).limit(10)
  const historico = (msgs ?? []).filter((m: any) => typeof m.body === 'string' && m.body.trim() !== '').reverse()
  const ultima = historico.length ? historico[historico.length - 1] : null

  const { data: itens } = await admin.from('knowledge_items')
    .select('id, question_examples, answer').eq('organization_id', conv.organization_id)
    .or(`clinic_id.is.null,clinic_id.eq.${conv.clinic_id}`)
    .eq('status', 'approved').eq('auto_reply_allowed', true)

  const { data: run, error: errRun } = await admin.from('agent_runs').insert({
    organization_id: conv.organization_id, clinic_id: conv.clinic_id, agent_key: 'AG-01', agent_version: 1,
    trigger_ref: conversationId, status: 'running', correlation_id: correlationId, started_at: new Date().toISOString(),
  }).select('id').single()
  if (errRun || !run) return 'falha'
  const runId = run.id

  let resultado: any = null
  let errorCode: string | null = null
  if (!enabled) errorCode = 'auto_resposta_desligada'
  else if (!ultima) errorCode = 'sem_mensagem_texto'
  else if (!apiKey) errorCode = 'credencial_ausente'
  else {
    const ia = await chamarIA({
      baseUrl: 'https://api.anthropic.com', apiKey, modelo,
      ultimaMensagem: ultima.body, historico,
      itensAprovados: (itens ?? []).map((i: any) => ({ id: i.id, question_examples: i.question_examples ?? [] })),
      clinica: conv.contacts?.name ? String(conv.contacts.name) : 'clínica',
    })
    if (!ia.ok) errorCode = ia.error_code
    else resultado = ia
  }

  if (!resultado) {
    await admin.from('agent_runs').update({ status: 'failed', error_code: errorCode, finished_at: new Date().toISOString() }).eq('id', runId)
    await admin.from('agent_steps').insert({ run_id: runId, step: 1, tool: 'ia', status: 'failed', error_code: errorCode })
    await abrirTicket(admin, conv, 'falha_automacao', 2)
    return 'ok'
  }

  const saida = resultado.saida
  const item = saida.knowledge_item_id ? (itens ?? []).find((i: any) => i.id === saida.knowledge_item_id) ?? null : null
  const { data: rota } = await admin.from('intent_routes')
    .select('queue_id, auto_reply_allowed').eq('clinic_id', conv.clinic_id).eq('intent', saida.intent).maybeSingle()
  const rotaAutoReplyAllowed = rota ? rota.auto_reply_allowed === true : saida.intent === 'informacao_geral'
  const resposta = item ? String(item.answer) : null

  const guard = evaluateGuard(
    { intent: saida.intent, confidence: saida.confidence, knowledgeItemId: item?.id ?? null, resposta },
    {
      automationPaused: conv.automation_paused === true,
      autoRespostaLigada,
      recusaPromocional: !!recusa,
      emExpediente: emExp === true,
      rotaAutoReplyAllowed,
      confiancaMin,
      itemAprovadoAutoReply: !!item,
      custoDiaEsgotado: false,
      chamadasDiaEsgotadas: false,
    },
  )

  await admin.from('agent_decisions').insert({
    run_id: runId, decision_type: 'intent', value: saida.intent, confidence: saida.confidence,
    guard_effect: guard.effect, guard_reason: guard.reason, knowledge_item_id: item?.id ?? null,
  })
  await admin.from('agent_steps').insert({ run_id: runId, step: 1, tool: 'ia', status: 'succeeded', duration_ms: Date.now() - inicioTurno })
  await admin.from('agent_runs').update({
    status: 'succeeded', input_tokens: resultado.usage.input, output_tokens: resultado.usage.output,
    finished_at: new Date().toISOString(),
  }).eq('id', runId)

  if (guard.effect === 'allow' && resposta) {
    const { data: conta } = await admin.from('channel_accounts')
      .select('id').eq('clinic_id', conv.clinic_id).eq('status', 'active').order('created_at').limit(1).maybeSingle()
    const { data: contato } = await admin.from('contacts').select('primary_phone_e164').eq('id', conv.contact_id).maybeSingle()
    if (conta && contato?.primary_phone_e164) {
      const { data: pedido } = await admin.from('outbound_requests').insert({
        organization_id: conv.organization_id, clinic_id: conv.clinic_id, channel_account_id: conta.id,
        idempotency_key: `auto_reply:${conversationId}:${crypto.randomUUID()}`,
        to_phone_e164: contato.primary_phone_e164, kind: 'text', test_body: resposta,
        origin: 'auto_reply', status: 'queued',
      }).select('id').single()
      if (pedido) {
        await admin.rpc('fila_enviar', { p_fila: 'outbound_messages', p_msg: {
          type: 'outbound_send', outbound_request_id: pedido.id, organization_id: conv.organization_id,
          clinic_id: conv.clinic_id, correlation_id: correlationId, attempt: 1, enqueued_at: new Date().toISOString(),
        }})
      }
    }
  } else {
    await abrirTicket(admin, conv, guard.effect === 'deny' ? 'regra_negocio' : 'risco', guard.reason === 'fora_do_horario' ? 3 : 2)
  }
  return 'ok'
}

async function abrirTicket(admin: any, conv: any, motivo: string, prioridade: number) {
  const { data: fila } = await admin.from('ticket_queues')
    .select('id').eq('clinic_id', conv.clinic_id).eq('active', true).order('priority_default').limit(1).maybeSingle()
  if (!fila) return
  const { data: aberto } = await admin.from('tickets')
    .select('id').eq('conversation_id', conv.id).not('status', 'in', '(resolved,cancelled)').maybeSingle()
  if (aberto) return
  await admin.from('tickets').insert({
    organization_id: conv.organization_id, clinic_id: conv.clinic_id, conversation_id: conv.id,
    queue_id: fila.id, status: 'new', priority: prioridade, handoff_reason: motivo,
  })
}
