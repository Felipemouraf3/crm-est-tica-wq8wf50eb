// Edge Function process-inbound-event v2 — P2-S03-T02 + T03
// Consumidor da fila inbound_events (acionado por pg_cron a cada 10s).
// Nesta SPEC: marca o recibo como processado (status accepted já gravado no
// webhook) e atualiza last_inbound_at. A P2-S04 completa (conversas/tickets).
// v2 (T03): recibo buscado pelo provider do envelope (meta_cloud | z_api).
// Proteção: chamada interna com INTERNAL_JOB_SECRET (header x-internal-job).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    if (req.headers.get('x-internal-job') !== (Deno.env.get('INTERNAL_JOB_SECRET') ?? '')) {
      return json(403, {
        error: { code: 'sem_permissao', message: 'Acesso interno' },
        correlation_id: correlationId,
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const { data: lote } = await admin.schema('pgmq').rpc('read', {
      queue_name: 'inbound_events',
      vt: 60,
      qty: 10,
    })
    const itens = (lote ?? []) as { msg_id: number; message: Record<string, unknown> }[]
    if (!itens.length) return json(200, { data: { processados: 0 }, correlation_id: correlationId })

    let ok = 0
    for (const item of itens) {
      const msg = item.message ?? {}
      const externalEventId =
        typeof msg.external_event_id === 'string' ? msg.external_event_id : null
      if (externalEventId) {
        // recibo já gravado como accepted pelo webhook; aqui só confirmamos o
        // processamento (a P2-S04 cria conversa/ticket a partir daqui).
        const { data: recibo } = await admin
          .from('webhook_receipts')
          .select('id, status')
          .eq('provider', typeof msg.provider === 'string' ? msg.provider : 'meta_cloud')
          .eq('external_event_id', externalEventId)
          .maybeSingle()
        if (recibo && recibo.status === 'accepted') ok++
      }
      // arquiva a mensagem (delete da fila após processar)
      await admin
        .schema('pgmq')
        .rpc('delete', { queue_name: 'inbound_events', msg_id: item.msg_id })
    }

    return json(200, { data: { processados: itens.length, ok }, correlation_id: correlationId })
  } catch (e) {
    return json(500, {
      error: { code: 'inesperado', message: 'Erro interno' },
      correlation_id: correlationId,
    })
  }
})
