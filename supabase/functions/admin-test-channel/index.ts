// Edge Function admin-test-channel v3 — Fase A do plano WhatsApp Cloud API (12/11)
// Teste de conexão REAL com veredito honesto (substitui o teste por HTTP 200).
// Meta: GET /{phone_id}?fields=status,platform_type,code_verification_status,quality_rating,webhook_configuration
//   Veredito: healthy SÓ SE status=CONNECTED E platform_type=CLOUD_API E VERIFIED.
//   inoperante: qualquer outro estado (ex.: ON_PREMISE, NOT_VERIFIED) — não envia nem recebe.
//   O veredito e os campos lidos são gravados no banco via RPC canal_registrar_verificacao
//   (que também deriva o status da conta) e, quando inoperante, cria tarefa para o
//   gestor (canal_tarefa_alerta, idempotente/dia).
// Z-API: GET status (Client-Token) — veredito por HTTP 200 (mantido).
// Entrada (JWT de usuário owner/clinic_admin): { channel_account_id }
// Resposta SANITIZADA: nunca token, URL completa ou corpo do provedor.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const META_GRAPH_VERSION = 'v26.0'
const META_FIELDS = 'status,platform_type,code_verification_status,quality_rating,webhook_configuration'

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
    const channelId = body?.channel_account_id
    if (!channelId) {
      return json(400, { error: { code: 'entrada_invalida', message: 'channel_account_id é obrigatório' }, correlation_id: correlationId })
    }

    const { data: conta, error: errConta } = await userClient
      .from('channel_accounts')
      .select('id, organization_id, clinic_id, provider, status, external_account_id, integration_connection_id')
      .eq('id', channelId)
      .maybeSingle()
    if (errConta || !conta) {
      return json(403, { error: { code: 'sem_permissao', message: 'Canal não encontrado' }, correlation_id: correlationId })
    }
    const { data: membro } = await userClient.rpc('is_org_member', { p_org: conta.organization_id })
    if (membro !== true) {
      return json(403, { error: { code: 'sem_permissao', message: 'Sem permissão neste canal' }, correlation_id: correlationId })
    }

    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    // credenciais do Vault (via RPC SECURITY DEFINER)
    let token: string | null = null
    let clientToken: string | null = null
    if (conta.integration_connection_id) {
      const { data: conn } = await admin
        .from('integration_connections')
        .select('secret_ref')
        .eq('id', conta.integration_connection_id)
        .maybeSingle()
      if (conn?.secret_ref?.startsWith('vault:')) {
        const { data: s } = await admin.rpc('_edge_read_secret', { p_secret_ref: conn.secret_ref })
        token = typeof s === 'string' && s.length > 0 ? s : null
      }
      if (conta.provider === 'z_api') {
        const { data: conn2 } = await admin
          .from('integration_connections')
          .select('secret_ref')
          .eq('clinic_id', conta.clinic_id)
          .eq('provider', 'canal_z_api')
          .eq('connection_key', `${conta.external_account_id}:client_token`)
          .maybeSingle()
        if (conn2?.secret_ref?.startsWith('vault:')) {
          const { data: s2 } = await admin.rpc('_edge_read_secret', { p_secret_ref: conn2.secret_ref })
          clientToken = typeof s2 === 'string' && s2.length > 0 ? s2 : null
        }
      }
    }
    if (!token) {
      await admin.rpc('canal_registrar_verificacao', {
        p_channel_account_id: conta.id, p_status: null, p_platform_type: null,
        p_code_verification_status: null, p_health_status: 'not_configured', p_detail: null,
      })
      return json(200, {
        data: { channel_account_id: conta.id, health_status: 'not_configured', mensagem: 'Token não gravado — salve o canal novamente.', correlation_id: correlationId },
        correlation_id: correlationId,
      })
    }

    // ---------- teste de rede real com veredito honesto ----------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let httpStatus = 0
    let mensagem = ''
    let veredito = 'erro_rede'
    let camposMeta: Record<string, unknown> | null = null
    try {
      if (conta.provider === 'z_api') {
        if (!clientToken) {
          veredito = 'not_configured'
          mensagem = 'Client-Token não gravado — salve o canal novamente.'
        } else {
          const r = await fetch(
            `https://api.z-api.io/instances/${encodeURIComponent(conta.external_account_id)}/token/${encodeURIComponent(token)}/status`,
            { headers: { 'Client-Token': clientToken, Accept: 'application/json' }, signal: controller.signal },
          )
          httpStatus = r.status
          veredito = r.status === 200 ? 'healthy' : 'error'
          mensagem = r.status === 200 ? 'Conexão com a instância Z-API OK.' : `Instância Z-API respondeu HTTP ${r.status}.`
        }
      } else {
        // META CLOUD API — veredito real (Fase A)
        const r = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(conta.external_account_id)}?fields=${META_FIELDS}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal },
        )
        httpStatus = r.status
        const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null
        if (r.status !== 200 || !corpo) {
          veredito = 'error'
          mensagem = `Meta respondeu HTTP ${r.status}.`
        } else {
          camposMeta = corpo
          const st = typeof corpo.status === 'string' ? corpo.status : null
          const pt = typeof corpo.platform_type === 'string' ? corpo.platform_type : null
          const cvs = typeof corpo.code_verification_status === 'string' ? corpo.code_verification_status : null
          if (st === 'CONNECTED' && pt === 'CLOUD_API' && cvs === 'VERIFIED') {
            veredito = 'healthy'
            mensagem = 'Conexão com a Meta Cloud API OK.'
          } else if (pt && pt !== 'CLOUD_API') {
            veredito = 'inoperante'
            mensagem = `Número em ${pt} — não envia nem recebe mensagens pela API. É preciso migrar para CLOUD_API (suporte da Meta).`
          } else if (cvs && cvs !== 'VERIFIED') {
            veredito = 'inoperante'
            mensagem = `Número não verificado (${cvs}) — registre/verifique o número no painel da Meta.`
          } else {
            veredito = 'inoperante'
            mensagem = `Número ${st ?? 'em estado desconhecido'} — não está pronto para a Cloud API.`
          }
        }
      }
    } catch (e: unknown) {
      const nome = (e as { name?: string })?.name ?? ''
      veredito = 'erro_rede'
      mensagem = nome === 'AbortError' ? 'Tempo esgotado no teste de rede.' : 'Falha de rede no teste.'
    } finally {
      clearTimeout(timer)
    }

    // grava o veredito no banco (RPC deriva o status da conta)
    const { data: reg } = await admin.rpc('canal_registrar_verificacao', {
      p_channel_account_id: conta.id,
      p_status: camposMeta ? (camposMeta.status as string) : null,
      p_platform_type: camposMeta ? (camposMeta.platform_type as string) : null,
      p_code_verification_status: camposMeta ? (camposMeta.code_verification_status as string) : null,
      p_health_status: veredito,
      p_detail: camposMeta
        ? { qualidade: camposMeta.quality_rating ?? null, webhook: camposMeta.webhook_configuration ?? null, http: httpStatus }
        : { http: httpStatus },
    })

    // canal inoperante → tarefa para o gestor (idempotente por dia)
    if (veredito === 'inoperante') {
      await admin.rpc('canal_tarefa_alerta', { p_channel_account_id: conta.id, p_motivo: mensagem })
    }

    return json(200, {
      data: {
        channel_account_id: conta.id,
        health_status: veredito,
        http_status: httpStatus,
        mensagem,
        platform_type: camposMeta ? camposMeta.platform_type : undefined,
        code_verification_status: camposMeta ? camposMeta.code_verification_status : undefined,
        status_meta: camposMeta ? camposMeta.status : undefined,
        status_derived: reg?.status_derived ?? undefined,
        correlation_id: correlationId,
      },
      correlation_id: correlationId,
    })
  } catch (e) {
    return json(500, { error: { code: 'inesperado', message: 'Erro interno' }, correlation_id: correlationId })
  }
})
