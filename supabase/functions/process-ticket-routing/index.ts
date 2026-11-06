// Edge Function process-ticket-routing v1 — P2-S05-T02
// Motor de distribuição: varre tickets new/queued/offered e aplica os 7 passos
// da SPEC (expediente → elegíveis → estratégia → oferta → vencida/reoferta →
// reserva/escalonamento → SLA). Chamado por pg_cron a cada 30s com o segredo
// interno (header x-internal-job). Nunca envia conteúdo ao contato.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    const segredoHeader = req.headers.get('x-internal-job') ?? ''
    const admin0 = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
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
    const agora = new Date()
    let ofertas = 0, reofertas = 0, escalados = 0, slaBreaches = 0, avisosFora = 0

    // ===== 1) Ofertas vencidas → reoferta / reserva / escalonamento (passo 5) =====
    const { data: vencidas } = await admin
      .from('tickets')
      .select('id, organization_id, clinic_id, queue_id, offered_to, reoffer_count, version')
      .eq('status', 'offered')
      .lt('offer_expires_at', agora.toISOString())
      .limit(50)
    for (const t of vencidas ?? []) {
      const reoffer = Number(t.reoffer_count ?? 0) + 1
      const { data: pol } = await admin
        .from('routing_policies')
        .select('max_reoffers, backup_queue_id, escalation_role, accept_timeout_seconds')
        .eq('queue_id', t.queue_id)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      const maxReoffers = Number(pol?.max_reoffers ?? 2)
      if (reoffer <= maxReoffers) {
        const { data: eleg } = await admin.rpc('fila_elegiveis', { p_queue: t.queue_id })
        const lista = (eleg ?? []).filter((e: any) => e.user_id !== t.offered_to)
        if (lista.length > 0) {
          const alvo = lista.reduce((m: any, e: any) => (Number(e.active_load) < Number(m.active_load) ? e : m), lista[0])
          const timeout = Number(pol?.accept_timeout_seconds ?? 120)
          await admin.from('tickets').update({
            offered_to: alvo.user_id,
            offer_expires_at: new Date(agora.getTime() + timeout * 1000).toISOString(),
            reoffer_count: reoffer,
            version: Number(t.version) + 1,
            updated_at: agora.toISOString(),
          }).eq('id', t.id).eq('version', t.version)
          await admin.from('ticket_events').insert({
            organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
            event_type: 'offered', to_user_id: alvo.user_id, reason_code: 'reoferta',
            metadata_sanitized: { reoffer },
          })
          reofertas++
          continue
        }
      }
      if (pol?.backup_queue_id) {
        await admin.from('tickets').update({
          queue_id: pol.backup_queue_id, offered_to: null, offer_expires_at: null,
          status: 'queued', version: Number(t.version) + 1, updated_at: agora.toISOString(),
        }).eq('id', t.id).eq('version', t.version)
        await admin.from('ticket_events').insert({
          organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
          event_type: 'transferred', reason_code: 'fila_reserva',
          metadata_sanitized: { backup_queue_id: pol.backup_queue_id },
        })
        continue
      }
      await admin.from('tickets').update({
        status: 'escalated', offered_to: null, offer_expires_at: null,
        version: Number(t.version) + 1, updated_at: agora.toISOString(),
      }).eq('id', t.id).eq('version', t.version)
      await admin.from('ticket_events').insert({
        organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
        event_type: 'escalated', reason_code: 'sem_aceite_cadeia_completa',
        metadata_sanitized: { escalation_role: pol?.escalation_role ?? 'manager' },
      })
      escalados++
    }

    // ===== 2) Tickets new/queued → expediente + oferta (passos 1, 2, 3, 4) =====
    const { data: naFila } = await admin
      .from('tickets')
      .select('id, organization_id, clinic_id, queue_id, created_at, version, priority')
      .in('status', ['new', 'queued'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(50)
    for (const t of naFila ?? []) {
      const { data: dentro } = await admin.rpc('em_expediente', { p_clinic: t.clinic_id })
      if (dentro === false) {
        const { data: jaAvisou } = await admin
          .from('ticket_events')
          .select('id')
          .eq('ticket_id', t.id)
          .eq('event_type', 'after_hours_notice')
          .limit(1)
        if (!jaAvisou?.length) {
          await admin.from('ticket_events').insert({
            organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
            event_type: 'after_hours_notice', reason_code: 'fora_do_expediente',
            metadata_sanitized: { observacao: 'aviso de espera aprovado enviado uma única vez' },
          })
          avisosFora++
        }
        const proximo = new Date(agora.getTime() + 24 * 3600 * 1000)
        proximo.setUTCHours(12, 0, 0, 0) // 9h em Recife (UTC-3)
        await admin.from('tickets').update({
          status: 'queued', next_action_at: proximo.toISOString(),
          version: Number(t.version) + 1, updated_at: agora.toISOString(),
        }).eq('id', t.id).eq('version', t.version)
        continue
      }
      const { data: eleg } = await admin.rpc('fila_elegiveis', { p_queue: t.queue_id })
      const lista = eleg ?? []
      if (lista.length === 0) {
        const { data: jaAlertou } = await admin
          .from('ticket_events')
          .select('id')
          .eq('ticket_id', t.id)
          .eq('event_type', 'escalated')
          .eq('reason_code', 'ninguem_elegivel')
          .limit(1)
        if (!jaAlertou?.length) {
          await admin.from('ticket_events').insert({
            organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
            event_type: 'escalated', reason_code: 'ninguem_elegivel',
            metadata_sanitized: { alerta: 'gestor deve assumir ou aguardar próximo expediente' },
          })
        }
        await admin.from('tickets').update({ status: 'queued', updated_at: agora.toISOString() }).eq('id', t.id)
        continue
      }
      const { data: pol } = await admin
        .from('routing_policies')
        .select('strategy, accept_timeout_seconds')
        .eq('queue_id', t.queue_id)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      const estrategia = pol?.strategy ?? 'least_load'
      if (estrategia === 'manual') continue // passo 3: manual não oferece
      let alvo: any
      if (estrategia === 'round_robin') {
        alvo = lista.reduce((m: any, e: any) => (new Date(e.last_received) < new Date(m.last_received) ? e : m), lista[0])
      } else {
        alvo = lista.reduce((m: any, e: any) =>
          Number(e.active_load) < Number(m.active_load) ||
          (Number(e.active_load) === Number(m.active_load) && new Date(e.last_received) < new Date(m.last_received)) ? e : m, lista[0])
      }
      const timeout = Number(pol?.accept_timeout_seconds ?? 120)
      const { data: upd } = await admin.from('tickets').update({
        status: 'offered', offered_to: alvo.user_id,
        offer_expires_at: new Date(agora.getTime() + timeout * 1000).toISOString(),
        sla_due_at: new Date(agora.getTime() + 10 * 60 * 1000).toISOString(),
        version: Number(t.version) + 1, updated_at: agora.toISOString(),
      }).eq('id', t.id).eq('version', t.version).select('id')
      if (upd?.length) {
        await admin.from('ticket_events').insert({
          organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
          event_type: 'offered', to_user_id: alvo.user_id,
          metadata_sanitized: { estrategia, timeout_seconds: timeout },
        })
        await admin.from('ticket_sla_events').upsert({
          ticket_id: t.id, metric: 'accept',
          due_at: new Date(agora.getTime() + timeout * 1000).toISOString(),
        }, { onConflict: 'ticket_id,metric' })
        ofertas++
      }
    }

    // ===== 3) SLA de primeira resposta vencido (passo 7) =====
    const { data: emServico } = await admin
      .from('tickets')
      .select('id, organization_id, clinic_id, sla_due_at, version')
      .in('status', ['assigned', 'in_service', 'waiting_customer'])
      .not('sla_due_at', 'is', null)
      .lt('sla_due_at', agora.toISOString())
      .limit(50)
    for (const t of emServico ?? []) {
      await admin.from('ticket_sla_events').upsert({
        ticket_id: t.id, metric: 'first_response',
        due_at: t.sla_due_at, breached_at: agora.toISOString(),
      }, { onConflict: 'ticket_id,metric' })
      await admin.from('tickets').update({
        status: 'sla_breached', version: Number(t.version) + 1, updated_at: agora.toISOString(),
      }).eq('id', t.id).eq('version', t.version)
      await admin.from('ticket_events').insert({
        organization_id: t.organization_id, clinic_id: t.clinic_id, ticket_id: t.id,
        event_type: 'sla_breached', reason_code: 'primeira_resposta',
      })
      slaBreaches++
    }

    return json(200, {
      data: { ofertas, reofertas, escalados, slaBreaches, avisosFora },
      correlation_id: correlationId,
    })
  } catch (e) {
    return json(500, { error: { code: 'erro_interno', message: (e as Error).message }, correlation_id: correlationId })
  }
})
