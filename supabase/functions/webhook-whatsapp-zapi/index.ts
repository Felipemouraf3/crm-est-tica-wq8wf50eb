// Edge Function webhook-whatsapp-zapi v5 — P2-S03-T03 + emenda payload (P2-S04-T01)
// v5: usa o adaptador zapi.ts corrigido (image.imageUrl + caption — mídia real da Z-API).
// Rota pública: /functions/v1/webhook-whatsapp-zapi?ca=<channel_account_id>&k=<segredo>
// Validação: segredo do caminho (tempo constante, contra o Vault) + instanceId.
// Limite: 120 pedidos/min por conta → 429 rejected_rate (RN-P2-S03-08).
// Cada item vira um recibo e, quando aceito, um item na fila inbound_events
// (envelope com ref_id — o consumidor lê o payload pelo bucket webhook-payloads).
// DisconnectedCallback → conta disconnected; ConnectedCallback NUNCA reativa.
// Logs sanitizados: nunca corpo, token, telefone completo ou texto.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mapearCorpoZapi, segredoValido, type ItemZapi } from '../_shared/providers/zapi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: corsHeaders })

const LIMITE_POR_MIN = 120

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  const url = new URL(req.url)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') {
      return json(405, {
        error: { code: 'metodo_invalido', message: 'Método não suportado' },
        correlation_id: correlationId,
      })
    }

    const caParam = url.searchParams.get('ca') ?? ''
    const kParam = url.searchParams.get('k') ?? ''
    if (!caParam || !kParam) {
      return json(401, {
        error: { code: 'caminho_invalido', message: 'Caminho incompleto' },
        correlation_id: correlationId,
      })
    }

    const { data: conta } = await admin
      .from('channel_accounts')
      .select('id, organization_id, clinic_id, external_account_id, status, webhook_secret_ref')
      .eq('id', caParam)
      .eq('provider', 'z_api')
      .in('status', ['active', 'paused', 'disconnected'])
      .maybeSingle()
    if (!conta?.webhook_secret_ref?.startsWith('vault:')) {
      return json(401, {
        error: { code: 'caminho_invalido', message: 'Caminho inválido' },
        correlation_id: correlationId,
      })
    }

    const { data: segredo } = await admin.rpc('_edge_read_secret', {
      p_secret_ref: conta.webhook_secret_ref,
    })
    if (!segredo || !segredoValido(segredo, kParam)) {
      await admin.from('webhook_receipts').insert({
        provider: 'z_api',
        channel_account_id: conta.id,
        organization_id: conta.organization_id,
        clinic_id: conta.clinic_id,
        external_event_id: `sig_${correlationId}`,
        event_kind: 'other',
        signature_valid: false,
        payload_hash: await sha256Hex(`${caParam}`),
        status: 'rejected_signature',
        correlation_id: correlationId,
      })
      return json(401, {
        error: { code: 'segredo_invalido', message: 'Segredo inválido' },
        correlation_id: correlationId,
      })
    }

    const { data: janela } = await admin
      .from('webhook_receipts')
      .select('id', { count: 'exact', head: false })
      .eq('channel_account_id', conta.id)
      .gte('received_at', new Date(Date.now() - 60_000).toISOString())
      .limit(LIMITE_POR_MIN + 1)
    const recebidos = janela?.length ?? 0
    if (recebidos >= LIMITE_POR_MIN) {
      await admin.from('webhook_receipts').insert({
        provider: 'z_api',
        channel_account_id: conta.id,
        organization_id: conta.organization_id,
        clinic_id: conta.clinic_id,
        external_event_id: `rate_${correlationId}`,
        event_kind: 'other',
        signature_valid: true,
        payload_hash: await sha256Hex(`${caParam}:rate`),
        status: 'rejected_rate',
        correlation_id: correlationId,
      })
      return json(429, {
        error: { code: 'rejected_rate', message: 'Limite de requisições por minuto' },
        correlation_id: correlationId,
      })
    }

    const corpoBruto = await req.text()
    let corpo: Record<string, unknown> = {}
    try {
      corpo = JSON.parse(corpoBruto)
    } catch {
      return json(400, {
        error: { code: 'entrada_invalida', message: 'Corpo não é JSON' },
        correlation_id: correlationId,
      })
    }
    const instanceIdCorpo = typeof corpo?.instanceId === 'string' ? corpo.instanceId : ''
    if (!instanceIdCorpo || instanceIdCorpo !== conta.external_account_id) {
      await admin.from('webhook_receipts').insert({
        provider: 'z_api',
        channel_account_id: conta.id,
        organization_id: conta.organization_id,
        clinic_id: conta.clinic_id,
        external_event_id: `inst_${correlationId}`,
        event_kind: 'other',
        signature_valid: true,
        payload_hash: await sha256Hex(corpoBruto.slice(0, 512)),
        status: 'rejected_signature',
        correlation_id: correlationId,
      })
      return json(401, {
        error: { code: 'instance_invalido', message: 'Instância não corresponde à conta' },
        correlation_id: correlationId,
      })
    }

    const itens = mapearCorpoZapi(corpo, {
      id: conta.id,
      organization_id: conta.organization_id,
      clinic_id: conta.clinic_id,
      external_account_id: conta.external_account_id,
    })

    let aceitos = 0
    let duplicados = 0
    let rejeitados = 0
    for (const item of itens as ItemZapi[]) {
      const statusRecibo = item.stale ? 'rejected_stale' : item.unsupported ? 'ignored' : 'accepted'

      const { data: dup } = await admin
        .from('webhook_receipts')
        .select('id')
        .eq('provider', 'z_api')
        .eq('external_event_id', item.external_event_id)
        .maybeSingle()
      if (dup) {
        duplicados++
        continue
      }

      const { error: errRecibo } = await admin.from('webhook_receipts').insert({
        provider: 'z_api',
        channel_account_id: item.channel_account_id,
        organization_id: item.organization_id,
        clinic_id: item.clinic_id,
        external_event_id: item.external_event_id,
        event_kind: item.kind,
        signature_valid: true,
        payload_hash: await sha256Hex(corpoBruto),
        payload_ref: await gravarPayload(
          admin,
          item.organization_id,
          item.external_event_id,
          corpoBruto,
        ),
        status: statusRecibo,
        correlation_id: correlationId,
      })
      if (errRecibo) {
        duplicados++
        continue
      }

      if (statusRecibo !== 'accepted') {
        rejeitados++
        continue
      }
      aceitos++

      if (item.desconectar) {
        await admin
          .from('channel_accounts')
          .update({
            status: 'disconnected',
            last_status_at: new Date().toISOString(),
            last_error_code: 'desconectada',
          })
          .eq('id', conta.id)
        continue
      }
      if (item.kind === 'connection') {
        await admin
          .from('channel_accounts')
          .update({ last_status_at: new Date().toISOString() })
          .eq('id', conta.id)
        continue
      }

      if (item.kind === 'status' && item.provider_message_id && item.status) {
        await admin.from('provider_message_status').upsert(
          {
            organization_id: item.organization_id,
            clinic_id: item.clinic_id,
            channel_account_id: conta.id,
            provider: 'z_api',
            provider_message_id: item.provider_message_id,
            status: item.status,
            error_code: item.error_code,
            occurred_at: item.occurred_at ?? new Date().toISOString(),
          },
          { onConflict: 'provider,provider_message_id,status' },
        )
        await admin
          .from('channel_accounts')
          .update({ last_status_at: new Date().toISOString() })
          .eq('id', conta.id)
        continue
      }

      if (item.kind === 'message') {
        await admin
          .from('channel_accounts')
          .update({ last_inbound_at: new Date().toISOString() })
          .eq('id', conta.id)
        await admin.schema('pgmq').rpc('send', {
          queue_name: 'inbound_events',
          msg: {
            type: 'inbound_message',
            organization_id: item.organization_id,
            clinic_id: item.clinic_id,
            channel_account_id: conta.id,
            provider: 'z_api',
            ref_id: item.external_event_id,
            external_event_id: item.external_event_id,
            correlation_id: correlationId,
            attempt: 1,
            enqueued_at: new Date().toISOString(),
          },
        })
      }
    }

    return json(200, { data: { aceitos, duplicados, rejeitados }, correlation_id: correlationId })
  } catch (e) {
    return json(500, {
      error: { code: 'inesperado', message: 'Erro interno' },
      correlation_id: correlationId,
    })
  }
})

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Emenda P2-S03 (destrava P2-S04-T01): grava o corpo bruto no bucket privado
// webhook-payloads e devolve o payload_ref. Falha de storage NÃO derruba o webhook.
async function gravarPayload(
  admin: any,
  organizationId: string,
  externalEventId: string,
  corpoBruto: string,
): Promise<string | null> {
  try {
    const hoje = new Date().toISOString().slice(0, 10)
    const caminho = `webhook-payloads/${organizationId}/${hoje}/${externalEventId}.json`
    const { error } = await admin.storage.from('webhook-payloads').upload(caminho, corpoBruto, {
      contentType: 'application/json',
      upsert: true,
    })
    if (error) return null
    return caminho
  } catch {
    return null
  }
}
