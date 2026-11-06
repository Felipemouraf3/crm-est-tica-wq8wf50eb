// Edge Function enqueue-outbound-message v2 — P2-S03-T02 + P2-S04-T03
// Confere conta ativa, recusa (RN-P2-S04-06, todas as origens), janela de 24h
// (RN-P2-S03-06/07) e enfileira em outbound_messages (envelope sem conteúdo).
// Entrada (JWT de usuário): { clinic_id, channel_account_id, to_phone,
//   kind: 'text'|'template', test_body?, template_name?, template_language?, origin? }
// Idempotência: idempotency_key = hash(destino+origem+conteúdo+minuto).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: corsHeaders })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ') || authHeader === 'Bearer ') {
      return json(401, { error: { code: 'nao_autenticado', message: 'Sessão necessária' }, correlation_id: correlationId })
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user?.id) {
      return json(401, { error: { code: 'nao_autenticado', message: 'Sessão necessária' }, correlation_id: correlationId })
    }

    const body = await req.json().catch(() => ({}))
    const { clinic_id, channel_account_id, to_phone, kind, test_body, template_name, template_language, origin: originBody } = body
    if (!clinic_id || !channel_account_id || !to_phone || !['text', 'template'].includes(kind)) {
      return json(400, { error: { code: 'entrada_invalida', message: 'clinic_id, channel_account_id, to_phone e kind são obrigatórios' }, correlation_id: correlationId })
    }
    const origin = ['human','auto_reply','followup','campaign','system_test'].includes(originBody) ? originBody : 'human'
    if (kind === 'text' && !test_body) {
      return json(400, { error: { code: 'entrada_invalida', message: 'test_body é obrigatório para texto' }, correlation_id: correlationId })
    }
    if (kind === 'template' && !template_name) {
      return json(400, { error: { code: 'entrada_invalida', message: 'template_name é obrigatório para modelo' }, correlation_id: correlationId })
    }

    // acesso: membro da clínica (RLS decide na leitura)
    const { data: conta } = await userClient
      .from('channel_accounts')
      .select('id, organization_id, clinic_id, status, phone_e164, external_account_id')
      .eq('id', channel_account_id)
      .eq('clinic_id', clinic_id)
      .maybeSingle()
    if (!conta) {
      return json(403, { error: { code: 'sem_permissao', message: 'Canal não encontrado nesta clínica' }, correlation_id: correlationId })
    }

    // conta precisa estar ativa (RN-P2-S03-07: desconectada não envia)
    if (conta.status !== 'active') {
      return json(422, { error: { code: 'regra_de_negocio', message: `Conta ${conta.status} — envio não permitido` }, correlation_id: correlationId })
    }

    // destino em E.164 (RPC server-side)
    const { data: toE164, error: normErr } = await userClient.rpc('normalize_e164', { p_raw: to_phone })
    if (normErr || !toE164) {
      return json(400, { error: { code: 'entrada_invalida', message: 'Telefone de destino inválido' }, correlation_id: correlationId })
    }

    // contato do destino (para a conferência de recusa)
    const { data: identDestino } = await admin(SUPABASE_URL)
      .from('contact_identities')
      .select('contact_id, contacts!inner(organization_id)')
      .eq('channel', 'whatsapp')
      .eq('external_id', toE164)
      .eq('contacts.organization_id', conta.organization_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const contatoId = identDestino?.contact_id ?? null

    // ---------- RN-P2-S04-06: conferência de recusa (todas as origens) ----------
    // Contato com promocional=revoked: origem humana em conversa aberta pelo próprio
    // contato passa (atendimento); qualquer origem automática/promocional é bloqueada.
    if (contatoId) {
      const { data: consent } = await admin(SUPABASE_URL)
        .from('consents')
        .select('status')
        .eq('contact_id', contatoId)
        .eq('channel', 'whatsapp')
        .eq('purpose', 'promocional')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (consent?.status === 'revoked' && origin !== 'human') {
        const idem = await idempotencyKey(conta.id, toE164, kind, test_body ?? '')
        await admin(SUPABASE_URL).from('outbound_requests').upsert(
          {
            organization_id: conta.organization_id,
            clinic_id: conta.clinic_id,
            channel_account_id: conta.id,
            idempotency_key: idem,
            to_phone_e164: toE164,
            kind,
            test_body,
            origin,
            status: 'blocked',
            block_reason: 'recusa_do_contato',
          },
          { onConflict: 'idempotency_key' },
        )
        return json(422, { error: { code: 'regra_de_negocio', message: 'Contato recusou mensagens promocionais' }, correlation_id: correlationId })
      }
    }

    // RN-P2-S03-06: janela de 24h — texto livre só com entrada < 24h
    if (kind === 'text') {
      const { data: ultimaEntrada } = await admin(SUPABASE_URL)
        .from('webhook_receipts')
        .select('received_at')
        .eq('channel_account_id', channel_account_id)
        .eq('event_kind', 'message')
        .eq('status', 'accepted')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const dentroJanela =
        ultimaEntrada?.received_at &&
        Date.now() - new Date(ultimaEntrada.received_at).getTime() < 24 * 60 * 60 * 1000
      if (!dentroJanela) {
        const idem = await idempotencyKey(conta.id, toE164, kind, test_body ?? '')
        await admin(SUPABASE_URL).from('outbound_requests').upsert(
          {
            organization_id: conta.organization_id,
            clinic_id: conta.clinic_id,
            channel_account_id: conta.id,
            idempotency_key: idem,
            to_phone_e164: toE164,
            kind,
            test_body,
            origin,
            status: 'blocked',
            block_reason: 'janela_fechada',
          },
          { onConflict: 'idempotency_key' },
        )
        return json(422, { error: { code: 'regra_de_negocio', message: 'Fora da janela de 24h — use um modelo aprovado' }, correlation_id: correlationId })
      }
    }

    // idempotência e gravação do pedido
    const idem = await idempotencyKey(conta.id, toE164, kind, kind === 'text' ? test_body : `${template_name}:${template_language ?? ''}`)
    const { data: existente } = await admin(SUPABASE_URL)
      .from('outbound_requests')
      .select('id, status')
      .eq('idempotency_key', idem)
      .maybeSingle()
    if (existente) {
      return json(200, { data: { outbound_request_id: existente.id, status: existente.status, duplicado: true }, correlation_id: correlationId })
    }

    const { data: novo, error: errIns } = await admin(SUPABASE_URL)
      .from('outbound_requests')
      .insert({
        organization_id: conta.organization_id,
        clinic_id: conta.clinic_id,
        channel_account_id: conta.id,
        idempotency_key: idem,
        to_phone_e164: toE164,
        kind,
        test_body: kind === 'text' ? test_body : null,
        template_name: kind === 'template' ? template_name : null,
        template_language: kind === 'template' ? (template_language ?? 'pt_BR') : null,
        origin,
        status: 'queued',
      })
      .select('id')
      .single()
    if (errIns || !novo) {
      return json(500, { error: { code: 'inesperado', message: 'Falha ao registrar envio' }, correlation_id: correlationId })
    }

    await admin(SUPABASE_URL).schema('pgmq').rpc('send', {
      queue_name: 'outbound_messages',
      msg: {
        type: 'outbound_send',
        organization_id: conta.organization_id,
        clinic_id: conta.clinic_id,
        ref_id: novo.id,
        correlation_id: correlationId,
        attempt: 1,
        enqueued_at: new Date().toISOString(),
      },
    })

    return json(200, { data: { outbound_request_id: novo.id, status: 'queued' }, correlation_id: correlationId })
  } catch (e) {
    return json(500, { error: { code: 'inesperado', message: 'Erro interno' }, correlation_id: correlationId })
  }
})

function admin(supabaseUrl: string) {
  return createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

async function idempotencyKey(channelId: string, to: string, kind: string, conteudo: string): Promise<string> {
  const minuto = Math.floor(Date.now() / 60_000)
  const base = `${channelId}|${to}|${kind}|${conteudo}|${minuto}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
