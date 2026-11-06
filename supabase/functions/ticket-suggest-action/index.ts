// Edge Function ticket-suggest-action v3 — P2-S07-T01/T02
// v3: CORS — preflight OPTIONS aceito (204) + Access-Control-Allow-Origin nas respostas
// (o navegador faz OPTIONS antes do POST com Authorization; sem isso o painel não gera).
// v2: modelo configurável por clínica (agent_clinic_configs.model_policy, fallback sonnet-5-5).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gerarSugestao, guardiaoSugestao, MODELO_COPILOTO } from '../_shared/copiloto.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  try {
    if (req.method !== 'POST')
      return json(405, { error: { code: 'metodo_invalido' }, correlation_id: correlationId })
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer '))
      return json(401, { error: { code: 'nao_autenticado' }, correlation_id: correlationId })
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: userData, error: errUser } = await admin.auth.getUser(authHeader.slice(7))
    if (errUser || !userData?.user)
      return json(401, { error: { code: 'nao_autenticado' }, correlation_id: correlationId })
    const userId = userData.user.id

    const corpo = await req.json().catch(() => ({}))
    const ticketId = typeof corpo?.ticket_id === 'string' ? corpo.ticket_id : null
    if (!ticketId)
      return json(400, { error: { code: 'ticket_invalido' }, correlation_id: correlationId })

    const { data: ticket } = await admin
      .from('tickets')
      .select('id, organization_id, clinic_id, conversation_id, intent, handoff_reason, status')
      .eq('id', ticketId)
      .maybeSingle()
    if (!ticket)
      return json(404, { error: { code: 'ticket_inexistente' }, correlation_id: correlationId })
    const { data: membro } = await admin
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('clinic_id', ticket.clinic_id)
      .eq('active', true)
      .maybeSingle()
    if (!membro) return json(403, { error: { code: 'sem_vinculo' }, correlation_id: correlationId })

    const { data: conv } = await admin
      .from('conversations')
      .select('id, identification, contact_id, contacts(name)')
      .eq('id', ticket.conversation_id)
      .maybeSingle()
    const { data: msgs } = await admin
      .from('messages')
      .select('id, direction, body, content_type')
      .eq('conversation_id', ticket.conversation_id)
      .eq('content_type', 'text')
      .order('occurred_at', { ascending: false })
      .limit(30)
    const mensagens = (msgs ?? [])
      .filter((m: any) => typeof m.body === 'string' && m.body.trim() !== '')
      .reverse()
    const { data: itens } = await admin
      .from('knowledge_items')
      .select('id, question_examples, answer')
      .eq('organization_id', ticket.organization_id)
      .or(`clinic_id.is.null,clinic_id.eq.${ticket.clinic_id}`)
      .eq('status', 'approved')
      .eq('auto_reply_allowed', true)

    let prompt: string | null = null
    const { data: setCli } = await admin
      .from('prompt_sets')
      .select('id, active_version_id')
      .eq('organization_id', ticket.organization_id)
      .eq('clinic_id', ticket.clinic_id)
      .eq('agent_key', 'AG-01')
      .maybeSingle()
    const { data: setOrg } = setCli
      ? { data: null }
      : await admin
          .from('prompt_sets')
          .select('id, active_version_id')
          .eq('organization_id', ticket.organization_id)
          .is('clinic_id', null)
          .eq('agent_key', 'AG-01')
          .maybeSingle()
    const ps = setCli ?? setOrg
    if (ps?.active_version_id) {
      const { data: pv } = await admin
        .from('prompt_versions')
        .select('content, status')
        .eq('id', ps.active_version_id)
        .maybeSingle()
      if (pv?.status === 'published') prompt = pv.content
    }

    const { data: connIA } = await admin
      .from('integration_connections')
      .select('secret_ref')
      .eq('provider', 'anthropic')
      .eq('connection_key', 'api_key')
      .limit(1)
      .maybeSingle()
    let apiKey: string | null = null
    if (connIA?.secret_ref?.startsWith('vault:')) {
      const { data: s } = await admin.rpc('_edge_read_secret', { p_secret_ref: connIA.secret_ref })
      apiKey = typeof s === 'string' && s.length > 0 ? s : null
    }
    const { data: cfgCop } = await admin
      .from('agent_clinic_configs')
      .select('model_policy')
      .eq('clinic_id', ticket.clinic_id)
      .eq('agent_key', 'AG-01')
      .maybeSingle()

    const inicio = Date.now()
    const { data: run } = await admin
      .from('agent_runs')
      .insert({
        organization_id: ticket.organization_id,
        clinic_id: ticket.clinic_id,
        agent_key: 'AG-01',
        agent_version: 1,
        trigger_ref: ticket.conversation_id,
        status: 'running',
        correlation_id: correlationId,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!run) return json(500, { error: { code: 'inesperado' }, correlation_id: correlationId })
    if (!apiKey || !prompt || mensagens.length === 0) {
      const errorCode = !apiKey
        ? 'credencial_ausente'
        : !prompt
          ? 'sem_prompt_publicado'
          : 'sem_mensagens'
      await admin
        .from('agent_runs')
        .update({ status: 'failed', error_code: errorCode, finished_at: new Date().toISOString() })
        .eq('id', run.id)
      return json(200, {
        data: {
          disponivel: false,
          motivo_indisponivel: errorCode,
          lista_manual: [
            'Confirmar o nome',
            'Confirmar a unidade',
            'Entender o interesse',
            'Oferecer agendamento com a recepção',
          ],
        },
        correlation_id: correlationId,
      })
    }

    const ia = await gerarSugestao({
      baseUrl: 'https://api.anthropic.com',
      apiKey,
      prompt,
      modelo: String(cfgCop?.model_policy?.model ?? MODELO_COPILOTO),
      mensagens,
      nomeContato: String(conv?.contacts?.name ?? 'contato'),
      identificacao: conv?.identification ?? null,
      intent: ticket.intent,
      handoffReason: ticket.handoff_reason,
      itensAprovados: (itens ?? []).map((i: any) => ({
        id: i.id,
        question_examples: i.question_examples ?? [],
      })),
      clinica: 'PS Estética',
    })
    if (!ia.ok) {
      await admin
        .from('agent_runs')
        .update({
          status: 'failed',
          error_code: ia.error_code,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
      await admin.from('agent_steps').insert({
        run_id: run.id,
        step: 1,
        tool: 'ia',
        status: 'failed',
        error_code: ia.error_code,
      })
      return json(200, {
        data: {
          disponivel: false,
          motivo_indisponivel: ia.error_code,
          lista_manual: [
            'Confirmar o nome',
            'Confirmar a unidade',
            'Entender o interesse',
            'Oferecer agendamento com a recepção',
          ],
        },
        correlation_id: correlationId,
      })
    }

    const guard = guardiaoSugestao(ia.saida)
    const status = guard.effect === 'allow' ? 'generated' : 'blocked'
    await admin.from('agent_decisions').insert({
      run_id: run.id,
      decision_type: 'reply',
      value: status,
      confidence: ia.saida.confianca,
      guard_effect: guard.effect === 'allow' ? 'allow' : 'deny',
      guard_reason: guard.reason,
    })
    await admin.from('agent_steps').insert({
      run_id: run.id,
      step: 1,
      tool: 'ia',
      status: 'succeeded',
      duration_ms: Date.now() - inicio,
    })
    await admin
      .from('agent_runs')
      .update({
        status: 'succeeded',
        input_tokens: ia.usage.input,
        output_tokens: ia.usage.output,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    const { data: sug, error: errSug } = await admin
      .from('ai_suggestions')
      .insert({
        organization_id: ticket.organization_id,
        clinic_id: ticket.clinic_id,
        ticket_id: ticket.id,
        conversation_id: ticket.conversation_id,
        agent_run_id: run.id,
        kind: 'resumo_e_resposta',
        content: ia.saida,
        confidence: ia.saida.confianca,
        guard_effect: guard.effect === 'allow' ? 'allow' : 'deny',
        guard_reason: guard.reason,
        status,
      })
      .select('id')
      .single()
    if (errSug || !sug)
      return json(500, { error: { code: 'inesperado' }, correlation_id: correlationId })

    return json(200, {
      data: {
        disponivel: true,
        suggestion_id: sug.id,
        status,
        bloqueio: guard.effect === 'allow' ? null : guard.reason,
        resumo: ia.saida.resumo,
        motivo: ia.saida.motivo,
        resposta_sugerida: guard.effect === 'allow' ? ia.saida.resposta_sugerida : null,
        proxima_acao: ia.saida.proxima_acao,
        dados_faltantes: ia.saida.dados_faltantes,
        sinal_de_risco: ia.saida.sinal_de_risco,
        evidencias: ia.saida.evidencias,
        confianca: ia.saida.confianca,
        duracao_ms: Date.now() - inicio,
      },
      correlation_id: correlationId,
    })
  } catch (e) {
    return json(500, {
      error: { code: 'inesperado', message: 'Erro interno' },
      correlation_id: correlationId,
    })
  }
})
