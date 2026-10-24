// Edge Function send-whatsapp-message v2 — P2-S03-T02 + T03
// Consumidor da fila outbound_messages (acionado por pg_cron a cada 10s).
// Lê o item (read), busca o outbound_request pelo ref_id, escolhe o adaptador
// pelo provider da conta (meta_cloud | z_api), envia texto ou modelo, grava
// provider_message_id + status sent; erro → nova tentativa da fila (5 em 30min,
// depois dead_letter — contrato comum 4.4). Nunca loga conteúdo nem token.
// Proteção: chamada interna com INTERNAL_JOB_SECRET (header x-internal-job).
// v2 (T03): branch Z-API (send-text com Client-Token) + leitura de segredos via
// RPC _edge_read_secret (schema vault não exposto na API PostgREST).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  enviarMeta,
  corpoTexto,
  corpoModelo,
  META_GRAPH_DEFAULT_VERSION,
} from '../_shared/providers/meta.ts'
import { enviarZapi } from '../_shared/providers/zapi.ts'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const MAX_TENTATIVAS = 5
const JANELA_30MIN_MS = 30 * 60 * 1000

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    // só o agendador interno chama
    if (req.headers.get('x-internal-job') !== (Deno.env.get('INTERNAL_JOB_SECRET') ?? '')) {
      return json(403, {
        error: { code: 'sem_permissao', message: 'Acesso interno' },
        correlation_id: correlationId,
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    // lote: até 10 itens por disparo (cron só dispara; não processa no banco)
    const { data: lote } = await admin.schema('pgmq').rpc('read', {
      queue_name: 'outbound_messages',
      vt: 60,
      qty: 10,
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
        )
        mortos++
        continue
      }

      const { data: pedido } = await admin
        .from('outbound_requests')
        .select(
          'id, organization_id, clinic_id, channel_account_id, to_phone_e164, kind, test_body, template_name, template_language, status, attempts, origin',
        )
        .eq('id', refId)
        .maybeSingle()
      if (!pedido) {
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          String(item.msg_id),
          'pedido_inexistente',
          attempt,
          correlationId,
        )
        mortos++
        continue
      }
      if (pedido.status !== 'queued' && pedido.status !== 'sending') {
        // já resolvido (ex.: duplicata processada por outro worker)
        continue
      }

      // conta + credenciais
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
          String(item.msg_id),
          'conta_inexistente',
          attempt,
          correlationId,
        )
        mortos++
        continue
      }
      if (conta.status !== 'active') {
        await falharPedido(admin, pedido.id, 'conta_desconectada')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          String(item.msg_id),
          'conta_desconectada',
          attempt,
          correlationId,
        )
        mortos++
        continue
      }

      // credenciais do Vault (via RPC SECURITY DEFINER — schema vault não
      // exposto na API PostgREST; lição de 2026-10-24)
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
        // Client-Token da Z-API: segunda conexão (connection_key = <instanceId>:client_token)
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
          String(item.msg_id),
          'credencial_ausente',
          attempt,
          correlationId,
        )
        mortos++
        continue
      }

      // monta o corpo e envia pelo adaptador do provider da conta
      await admin
        .from('outbound_requests')
        .update({
          status: 'sending',
          attempts: pedido.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedido.id)

      let resultado: {
        ok: boolean
        provider_message_id: string | null
        http_status: number
        error_code: string | null
      }
      if (conta.provider === 'z_api') {
        // Z-API: texto livre (send-text); a janela 24h/modelo é regra da Meta
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
        const versao = META_GRAPH_DEFAULT_VERSION // versão da Graph API é config da conexão (SPEC); default do contrato
        resultado = await enviarMeta(versao, conta.external_account_id, token, corpo, correlationId)
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
        enviados++
        continue
      }

      // falha: tenta de novo dentro da janela de 30min (5 tentativas), senão dead letter
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
        await admin.schema('pgmq').rpc('send', {
          queue_name: 'outbound_messages',
          msg: { ...msg, attempt: attempt + 1, enqueued_at: new Date().toISOString() },
        })
        reenfileirados++
      } else {
        await falharPedido(admin, pedido.id, resultado.error_code ?? 'falha_envio')
        await moverParaDeadLetter(
          admin,
          'outbound_messages',
          String(item.msg_id),
          resultado.error_code ?? 'falha_envio',
          attempt,
          correlationId,
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
) {
  await admin.from('dead_letters').insert({
    source_queue: fila,
    ref_id: refId,
    error_code: errorCode,
    attempts,
    correlation_hint: correlationId,
  })
  await admin.schema('pgmq').rpc('send', {
    queue_name: 'dead_letter',
    msg: {
      source_queue: fila,
      ref_id: refId,
      error_code: errorCode,
      correlation_id: correlationId,
    },
  })
}
