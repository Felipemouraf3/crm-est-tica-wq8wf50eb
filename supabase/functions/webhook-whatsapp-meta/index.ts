// Edge Function webhook-whatsapp-meta v4 — P2-S03-T02 (correção 27/10)
// v4 (2026-10-28): grava o corpo bruto no bucket privado `webhook-payloads` e
// guarda o `payload_ref` no recibo — mesmo padrão da Z-API. SEM ISSO O CANAL META
// NÃO FUNCIONAVA: o consumidor (process-inbound-event) lê o payload por
// payload_ref; como era null, `extrairFromE164` devolvia null e TODO item era
// arquivado sem criar contato/conversa/mensagem (recibo ficava 'accepted', o que
// escondia a falha). O payload_hash passou a ser o SHA-256 do corpo real
// (antes era o hash do id do evento, inútil para auditoria).
// v3 (2026-10-27): o schema `vault` NÃO é exposto na API PostgREST (pgrst.db_schemas
// vazio; REST com Accept-Profile: vault -> 406), então admin.schema('vault') devolvia
// vazio e o webhook recusava TODO GET (403) e TODO POST (401). Agora lê pela RPC
// SECURITY DEFINER `_edge_read_secret` — mesmo padrão já usado na Z-API.
// Além disso, o App Secret vem da SEGUNDA conexão `<external_account_id>:app_secret`
// (antes o código usava o access token da conexão principal como chave HMAC).
// Rota pública: /functions/v1/webhook-whatsapp-meta (sem JWT — assinatura HMAC).
// GET: verificação hub.verify_token contra os verify_tokens no Vault das contas
//      Meta ativas -> 200 hub.challenge | 403.
// POST: X-Hub-Signature-256 (HMAC app_secret, tempo constante) -> 401 se inválida.
//       200 SEMPRE que a assinatura for válida (mesmo duplicata) — RN-P2-S03-02/03.
// Cada item vira um recibo (webhook_receipts) e, quando mapeado e fresco,
// um item na fila inbound_events (envelope do contrato comum — sem conteúdo).
// RN-P2-S03-04: número não mapeado -> recibo rejected_unmapped + fila técnica.
// RN-P2-S03-08: evento > 24h -> recibo rejected_stale, sem fila.
// Logs sanitizados: nunca corpo, token, telefone completo ou texto.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assinaturaValida,
  respostaVerificacao,
  mapearCorpoMeta,
  type ItemMeta,
} from '../_shared/providers/meta.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const txt = (status: number, corpo: string) =>
  new Response(corpo, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } })
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: corsHeaders })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  const url = new URL(req.url)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // ---------- contas Meta ativas + segredos do Vault ----------
    const { data: contas } = await admin
      .from('channel_accounts')
      .select(
        'id, organization_id, clinic_id, external_account_id, integration_connection_id, webhook_secret_ref',
      )
      .eq('provider', 'meta_cloud')
      .in('status', ['active', 'paused'])
    const contasAtivas = contas ?? []

    // v3: segredos SEMPRE pela RPC SECURITY DEFINER (_edge_read_secret).
    // Motivo: o schema `vault` não está exposto no PostgREST — a leitura direta
    // devolvia vazio e derrubava a verificação (403) e a assinatura (401).
    const lerSegredo = async (ref: string | null): Promise<string | null> => {
      if (!ref || !ref.startsWith('vault:')) return null
      const { data } = await admin.rpc('_edge_read_secret', { p_secret_ref: ref })
      return typeof data === 'string' && data.length > 0 ? data : null
    }

    const segredosWebhook = new Map<string, string>() // channel_account_id -> verify_token
    const appSecrets = new Map<string, string>() // channel_account_id -> app_secret
    for (const conta of contasAtivas) {
      const verify = await lerSegredo(conta.webhook_secret_ref)
      if (verify) segredosWebhook.set(conta.id, verify)

      // App Secret: segunda conexão do canal `<external_account_id>:app_secret`
      const { data: conn2 } = await admin
        .from('integration_connections')
        .select('secret_ref')
        .eq('clinic_id', conta.clinic_id)
        .eq('provider', 'canal_meta_cloud')
        .eq('connection_key', `${conta.external_account_id}:app_secret`)
        .maybeSingle()
      const appSecret = await lerSegredo(conn2?.secret_ref ?? null)
      if (appSecret) appSecrets.set(conta.id, appSecret)
    }

    // ---------- GET: verificação ----------
    if (req.method === 'GET') {
      const tokensValidos = contasAtivas
        .map((c) => segredosWebhook.get(c.id))
        .filter((t): t is string => !!t)
      const r = respostaVerificacao(url, tokensValidos)
      return txt(r.status, r.corpo)
    }

    // ---------- POST: assinatura ----------
    if (req.method !== 'POST')
      return json(405, {
        error: { code: 'metodo_invalido', message: 'Método não suportado' },
        correlation_id: correlationId,
      })

    const corpoBruto = await req.text()
    const assinatura = req.headers.get('X-Hub-Signature-256')

    // assinatura válida contra ALGUM app_secret de conta Meta ativa
    let assinaturaOk = false
    for (const secret of appSecrets.values()) {
      if (await assinaturaValida(secret, corpoBruto, assinatura)) {
        assinaturaOk = true
        break
      }
    }
    if (!assinaturaOk) {
      // recibo rejeitado (sem conta mapeada — assinatura falhou antes do mapeamento)
      await admin.from('webhook_receipts').insert({
        provider: 'meta_cloud',
        channel_account_id: null,
        organization_id: null,
        clinic_id: null,
        external_event_id: `sig_${correlationId}`,
        event_kind: 'other',
        signature_valid: false,
        payload_hash: await sha256Hex(corpoBruto),
        status: 'rejected_signature',
        correlation_id: correlationId,
      })
      return json(401, {
        error: { code: 'assinatura_invalida', message: 'Assinatura inválida' },
        correlation_id: correlationId,
      })
    }

    // ---------- mapeamento ----------
    let corpo: Record<string, unknown> = {}
    try {
      corpo = JSON.parse(corpoBruto)
    } catch {
      return json(400, {
        error: { code: 'entrada_invalida', message: 'Corpo não é JSON' },
        correlation_id: correlationId,
      })
    }

    // contas por phone_number_id (external_account_id)
    const contasPorId = new Map<
      string,
      { id: string; organization_id: string; clinic_id: string }
    >()
    for (const c of contasAtivas)
      contasPorId.set(c.external_account_id, {
        id: c.id,
        organization_id: c.organization_id,
        clinic_id: c.clinic_id,
      })

    const itens = mapearCorpoMeta(corpo, contasPorId)
    if (!itens.length) {
      await admin.from('webhook_receipts').insert({
        provider: 'meta_cloud',
        external_event_id: `empty_${correlationId}`,
        event_kind: 'other',
        signature_valid: true,
        payload_hash: await sha256Hex(corpoBruto),
        status: 'ignored',
        correlation_id: correlationId,
      })
      return json(200, { data: { recibos: 0 }, correlation_id: correlationId })
    }

    // ---------- recibos + fila (por item; idempotente) ----------
    let aceitos = 0
    let duplicados = 0
    let rejeitados = 0
    for (const item of itens) {
      const statusRecibo = !item.channel_account_id
        ? 'rejected_unmapped'
        : item.stale
          ? 'rejected_stale'
          : item.unsupported
            ? 'ignored'
            : 'accepted'

      // idempotência: (provider, external_event_id) único
      const { data: dup } = await admin
        .from('webhook_receipts')
        .select('id')
        .eq('provider', 'meta_cloud')
        .eq('external_event_id', item.external_event_id)
        .maybeSingle()
      if (dup) {
        duplicados++
        continue
      }

      // v4: grava o corpo bruto no bucket privado webhook-payloads e guarda o
      // payload_ref — o consumidor (process-inbound-event) lê o payload por ali.
      // Sem isso, extrairFromE164 devolvia null e TODO item era descartado.
      const { error: errRecibo } = await admin.from('webhook_receipts').insert({
        provider: 'meta_cloud',
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
        // corrida: outro worker inseriu primeiro -> duplicata
        duplicados++
        continue
      }

      if (statusRecibo !== 'accepted') {
        rejeitados++
        continue
      }
      aceitos++

      // situação do provedor (statuses) -> provider_message_status
      if (item.kind === 'status' && item.provider_message_id && item.status) {
        await admin.from('provider_message_status').upsert(
          {
            organization_id: item.organization_id,
            clinic_id: item.clinic_id,
            channel_account_id: item.channel_account_id,
            provider: 'meta_cloud',
            provider_message_id: item.provider_message_id,
            status: item.status,
            error_code: item.error_code,
            occurred_at: item.occurred_at ?? new Date().toISOString(),
          },
          { onConflict: 'provider,provider_message_id,status' },
        )
        // atualiza last_status_at da conta
        await admin
          .from('channel_accounts')
          .update({ last_status_at: new Date().toISOString() })
          .eq('id', item.channel_account_id)
      }

      // mensagem recebida -> fila inbound_events (envelope sem conteúdo)
      if (item.kind === 'message') {
        await admin
          .from('channel_accounts')
          .update({ last_inbound_at: new Date().toISOString() })
          .eq('id', item.channel_account_id)
        await admin.schema('pgmq').rpc('send', {
          queue_name: 'inbound_events',
          msg: {
            type: 'inbound_message',
            organization_id: item.organization_id,
            clinic_id: item.clinic_id,
            channel_account_id: item.channel_account_id,
            provider: 'meta_cloud',
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

// Emenda P2-S03-T02 (destrava o consumidor): grava o corpo bruto no bucket
// privado webhook-payloads e devolve o payload_ref — mesmo padrão da Z-API.
// Falha de storage NÃO derruba o webhook (o recibo fica sem ref e o item é
// descartado pelo consumidor, mas a Meta recebe 200 e não reentrega em loop).
async function gravarPayload(
  admin: any,
  organizationId: string | null,
  externalEventId: string,
  corpoBruto: string,
): Promise<string | null> {
  if (!organizationId) return null
  try {
    const hoje = new Date().toISOString().slice(0, 10)
    const seguro = externalEventId.replace(/[^A-Za-z0-9._-]/g, '_')
    const caminho = `webhook-payloads/${organizationId}/${hoje}/${seguro}.json`
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
