// Edge Function send-whatsapp-message v4 — P2-S03-T02 + T03 + correções T04
// Consumidor da fila outbound_messages (pg_cron a cada 10s).
// v4 (2026-10-28, T04) — QUATRO CORREÇÕES DE FILA, todas provadas no banco real:
//   1. dead_letters.organization_id é NOT NULL e o insert não o enviava; o erro
//      era engolido (não se checava `error`). Resultado: 12.106 itens presos na
//      fila dead_letter e a tabela VAZIA — a fila de falha era invisível.
//   2. A mensagem que falhava NUNCA era arquivada no pgmq → voltava após a vt e
//      era reprocessada para sempre (itens vistos com read_ct 657 e 1579).
//   3. Sucesso, reenfileiramento e pedido já resolvido também passam a arquivar,
//      então a fila não cresce mais sozinha.
//   4. dead_letters.ref_id passa a gravar o ID DO PEDIDO (outbound_requests.id),
//      não o msg_id da fila — sem isso a linha da fila de falha não é rastreável.
// Autossuficiente: adaptadores meta/zapi inlined (o deploy por MCP não resolve
// imports relativos para _shared/providers). Nenhum segredo vai para log.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const MAX_TENTATIVAS = 5
const JANELA_30MIN_MS = 30 * 60 * 1000

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    const SUPABASE_URL0 = Deno.env.get('SUPABASE_URL') ?? ''
    const admin0 = createClient(SUPABASE_URL0, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const segredoHeader = req.headers.get('x-internal-job') ?? ''
    let autorizado = false
    const segredoEnv = Deno.env.get('INTERNAL_JOB_SECRET') ?? ''
    if (segredoEnv && segredoHeader === segredoEnv) autorizado = true
    if (!autorizado) {
      try {
        const { data: v } = await admin0.rpc('_edge_read_secret', {
          p_secret_ref: 'vault:cf1c1eb8-5f95-4de0-81b0-3fbd6b6af59c',
        })
        if (typeof v === 'string' && v !== '' && segredoHeader === v) autorizado = true
      } catch {}
    }
    if (!autorizado) {
      return json(403, {
        error: { code: 'sem_permissao', message: 'Acesso interno' },
        correlation_id: correlationId,
      })
    }

    const admin = admin0
    const { data: lote } = await admin.rpc('fila_ler', {
      p_fila: 'outbound_messages',
      p_vt: 60,
      p_qty: 10,
    })
    const itens = (lote ?? []) as { msg_id: number; message: Record<string, unknown> }[]
    if (!itens.length) return json(200, { data: { processados: 0 }, correlation_id: correlationId })

    let enviados = 0
    let reenfileirados = 0
    let mortos = 0

    for (const item of itens) {
      const msg = item.message ?? {}
      const refId = typeof msg.ref_id === 'string' ? msg.ref_id : null
      const attempt = Number(msg.attempt ?? 1)
      if (!refId) {
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          String(item.msg_id),
          'ref_id_ausente',
          attempt,
          correlationId,
          msg.organization_id ?? null,
          msg.clinic_id ?? null,
          item.msg_id,
        )
        mortos++
        continue
      }

      const { data: pedido } = await admin
        .from('outbound_requests')
        .select(
          'id, organization_id, clinic_id, channel_account_id, to_phone_e164, kind, test_body, template_name, template_language, status, attempts, created_at, origin',
        )
        .eq('id', refId)
        .maybeSingle()
      if (!pedido) {
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          refId,
          'pedido_inexistente',
          attempt,
          correlationId,
          msg.organization_id ?? null,
          msg.clinic_id ?? null,
          item.msg_id,
        )
        mortos++
        continue
      }
      if (pedido.status !== 'queued' && pedido.status !== 'sending') {
        await admin.rpc('fila_arquivar', { p_fila: 'outbound_messages', p_msg_id: item.msg_id })
        continue
      }

      const { data: conta } = await admin
        .from('channel_accounts')
        .select('id, provider, status, external_account_id, integration_connection_id')
        .eq('id', pedido.channel_account_id)
        .maybeSingle()
      if (!conta) {
        await falharPedido(admin, pedido.id, 'conta_inexistente')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          pedido.id,
          'conta_inexistente',
          attempt,
          correlationId,
          pedido.organization_id,
          pedido.clinic_id,
          item.msg_id,
        )
        mortos++
        continue
      }
      if (conta.status !== 'active') {
        await falharPedido(admin, pedido.id, 'conta_desconectada')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          pedido.id,
          'conta_desconectada',
          attempt,
          correlationId,
          pedido.organization_id,
          pedido.clinic_id,
          item.msg_id,
        )
        mortos++
        continue
      }

      let token: string | null = null
      let clientToken: string | null = null
      if (conta.integration_connection_id) {
        const { data: conn } = await admin
          .from('integration_connections')
          .select('secret_ref')
          .eq('id', conta.integration_connection_id)
          .maybeSingle()
        if (conn?.secret_ref?.startsWith('vault:')) {
          const { data: s } = await admin.rpc('_edge_read_secret', {
            p_secret_ref: conn.secret_ref,
          })
          token = typeof s === 'string' && s.length > 0 ? s : null
        }
        if (conta.provider === 'z_api') {
          const { data: conn2 } = await admin
            .from('integration_connections')
            .select('secret_ref')
            .eq('clinic_id', pedido.clinic_id)
            .eq('provider', 'canal_z_api')
            .eq('connection_key', `${conta.external_account_id}:client_token`)
            .maybeSingle()
          if (conn2?.secret_ref?.startsWith('vault:')) {
            const { data: s2 } = await admin.rpc('_edge_read_secret', {
              p_secret_ref: conn2.secret_ref,
            })
            clientToken = typeof s2 === 'string' && s2.length > 0 ? s2 : null
          }
        }
      }
      if (!token) {
        await falharPedido(admin, pedido.id, 'credencial_ausente')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          pedido.id,
          'credencial_ausente',
          attempt,
          correlationId,
          pedido.organization_id,
          pedido.clinic_id,
          item.msg_id,
        )
        mortos++
        continue
      }

      await admin
        .from('outbound_requests')
        .update({
          status: 'sending',
          attempts: pedido.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedido.id)

      let resultado: EnvioResultado
      if (conta.provider === 'z_api') {
        const texto =
          pedido.kind === 'text' ? (pedido.test_body ?? '') : (pedido.template_name ?? '')
        resultado = await enviarZapi(
          conta.external_account_id,
          token,
          clientToken ?? '',
          pedido.to_phone_e164,
          texto,
          correlationId,
        )
      } else {
        const corpo =
          pedido.kind === 'text'
            ? corpoTexto(pedido.to_phone_e164, pedido.test_body ?? '')
            : corpoModelo(
                pedido.to_phone_e164,
                pedido.template_name ?? '',
                pedido.template_language ?? 'pt_BR',
              )
        resultado = await enviarMeta(
          META_GRAPH_DEFAULT_VERSION,
          conta.external_account_id,
          token,
          corpo,
          correlationId,
        )
      }

      if (resultado.ok) {
        await admin
          .from('outbound_requests')
          .update({
            status: 'sent',
            provider_message_id: resultado.provider_message_id,
            last_error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pedido.id)
        await admin
          .from('channel_accounts')
          .update({ last_outbound_at: new Date().toISOString() })
          .eq('id', conta.id)
        await admin
          .from('messages')
          .update({ status: 'sent', provider_message_id: resultado.provider_message_id })
          .eq('outbound_request_id', pedido.id)
        if (resultado.provider_message_id) {
          await admin.from('provider_message_status').upsert(
            {
              organization_id: pedido.organization_id,
              clinic_id: pedido.clinic_id,
              channel_account_id: conta.id,
              provider: conta.provider,
              provider_message_id: resultado.provider_message_id,
              status: 'sent',
              error_code: null,
              occurred_at: new Date().toISOString(),
            },
            { onConflict: 'provider,provider_message_id,status' },
          )
        }
        await admin.rpc('fila_arquivar', { p_fila: 'outbound_messages', p_msg_id: item.msg_id })
        enviados++
        continue
      }

      const dentroJanela =
        Date.now() - new Date(pedido.created_at ?? Date.now()).getTime() < JANELA_30MIN_MS
      if (attempt < MAX_TENTATIVAS && dentroJanela) {
        await admin
          .from('outbound_requests')
          .update({
            status: 'queued',
            last_error_code: resultado.error_code,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pedido.id)
        await admin.rpc('fila_enviar', {
          p_fila: 'outbound_messages',
          p_msg: { ...msg, attempt: attempt + 1, enqueued_at: new Date().toISOString() },
        })
        await admin.rpc('fila_arquivar', { p_fila: 'outbound_messages', p_msg_id: item.msg_id })
        reenfileirados++
      } else {
        await falharPedido(admin, pedido.id, resultado.error_code ?? 'falha_envio')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          pedido.id,
          resultado.error_code ?? 'falha_envio',
          attempt,
          correlationId,
          pedido.organization_id,
          pedido.clinic_id,
          item.msg_id,
        )
        mortos++
      }
    }

    return json(200, {
      data: { processados: itens.length, enviados, reenfileirados, mortos },
      correlation_id: correlationId,
    })
  } catch (e) {
    return json(500, {
      error: { code: 'inesperado', message: 'Erro interno' },
      correlation_id: correlationId,
    })
  }
})

async function falharPedido(admin: any, pedidoId: string, errorCode: string) {
  await admin
    .from('outbound_requests')
    .update({ status: 'failed', last_error_code: errorCode, updated_at: new Date().toISOString() })
    .eq('id', pedidoId)
}

async function moverParaDeadLetter(
  admin: any,
  fila: string,
  refId: string,
  errorCode: string,
  attempts: number,
  correlationId: string,
  organizationId: string | null = null,
  clinicId: string | null = null,
  msgId: number | null = null,
) {
  const { error: errTabela } = await admin.from('dead_letters').insert({
    organization_id: organizationId,
    clinic_id: clinicId,
    source_queue: fila,
    ref_id: refId,
    error_code: errorCode,
    attempts,
  })
  if (errTabela) {
    console.error('dead_letters_insert_falhou', { code: errTabela.code })
  }
  await admin.rpc('fila_enviar', {
    p_fila: 'dead_letter',
    p_msg: {
      organization_id: organizationId,
      clinic_id: clinicId,
      source_queue: fila,
      ref_id: refId,
      error_code: errorCode,
      attempts,
      correlation_id: correlationId,
    },
  })
  if (msgId !== null) {
    await admin.rpc('fila_arquivar', { p_fila: fila, p_msg_id: msgId })
  }
}

// ---------- adaptadores (inlined) ----------
type EnvioResultado = {
  ok: boolean
  provider_message_id: string | null
  http_status: number
  error_code: string | null
}

const META_GRAPH_DEFAULT_VERSION = 'v21.0'
const ZAPI_BASE = 'https://api.z-api.io'

async function enviarMeta(
  graphVersion: string,
  phoneNumberId: string,
  token: string,
  corpo: Record<string, unknown>,
  correlationId: string,
): Promise<EnvioResultado> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify(corpo),
        signal: controller.signal,
      },
    )
    const data = (await resp.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { code?: number | string }
    }
    if (resp.ok) {
      return {
        ok: true,
        provider_message_id: data?.messages?.[0]?.id ?? null,
        http_status: resp.status,
        error_code: null,
      }
    }
    return {
      ok: false,
      provider_message_id: null,
      http_status: resp.status,
      error_code: data?.error?.code != null ? String(data.error.code) : `http_${resp.status}`,
    }
  } catch (e: unknown) {
    const nome = (e as { name?: string })?.name ?? ''
    return {
      ok: false,
      provider_message_id: null,
      http_status: 0,
      error_code: nome === 'AbortError' ? 'tempo_esgotado' : 'falha_rede',
    }
  } finally {
    clearTimeout(timer)
  }
}

function corpoTexto(to: string, texto: string): Record<string, unknown> {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }
}

function corpoModelo(
  to: string,
  templateName: string,
  templateLanguage: string,
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: templateLanguage }, components: [] },
  }
}

async function enviarZapi(
  instanceId: string,
  token: string,
  clientToken: string,
  destinoE164: string,
  texto: string,
  correlationId: string,
): Promise<EnvioResultado> {
  if (!instanceId || !token || !clientToken || !destinoE164 || !texto) {
    return {
      ok: false,
      provider_message_id: null,
      http_status: 0,
      error_code: 'credencial_ausente',
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const resp = await fetch(
      `${ZAPI_BASE}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`,
      {
        method: 'POST',
        headers: {
          'Client-Token': clientToken,
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ phone: destinoE164.replace(/^\+/, ''), message: texto }),
        signal: controller.signal,
      },
    )
    const data = (await resp.json().catch(() => ({}))) as { messageId?: string; error?: string }
    if (resp.ok && typeof data?.messageId === 'string') {
      return {
        ok: true,
        provider_message_id: data.messageId,
        http_status: resp.status,
        error_code: null,
      }
    }
    return {
      ok: false,
      provider_message_id: null,
      http_status: resp.status,
      error_code: data?.error ? String(data.error) : `http_${resp.status}`,
    }
  } catch (e: unknown) {
    const nome = (e as { name?: string })?.name ?? ''
    return {
      ok: false,
      provider_message_id: null,
      http_status: 0,
      error_code: nome === 'AbortError' ? 'tempo_esgotado' : 'falha_rede',
    }
  } finally {
    clearTimeout(timer)
  }
}
