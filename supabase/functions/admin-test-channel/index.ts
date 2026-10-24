// Edge Function admin-test-channel v1 — P2-S03-T03
// Teste de conexão REAL (rede) para os dois provedores:
//  - Meta: GET graph.facebook.com/<versão>/<phone_number_id> com Bearer
//  - Z-API: GET api.z-api.io/instances/<id>/token/<token>/status com Client-Token
// Entrada (JWT de usuário owner/clinic_admin): { channel_account_id }
// Devolve diagnóstico SANITIZADO (nunca token/URL completa/corpo do provedor).
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
      return json(401, {
        error: { code: 'nao_autenticado', message: 'Sessão necessária' },
        correlation_id: correlationId,
      })
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user?.id) {
      return json(401, {
        error: { code: 'nao_autenticado', message: 'Sessão necessária' },
        correlation_id: correlationId,
      })
    }

    const body = await req.json().catch(() => ({}))
    const channelId = body?.channel_account_id
    if (!channelId) {
      return json(400, {
        error: { code: 'entrada_invalida', message: 'channel_account_id é obrigatório' },
        correlation_id: correlationId,
      })
    }

    // papel: owner/clinic_admin da clínica do canal (RLS na leitura + checagem)
    const { data: conta, error: errConta } = await userClient
      .from('channel_accounts')
      .select(
        'id, organization_id, clinic_id, provider, status, external_account_id, integration_connection_id',
      )
      .eq('id', channelId)
      .maybeSingle()
    if (errConta || !conta) {
      return json(403, {
        error: { code: 'sem_permissao', message: 'Canal não encontrado' },
        correlation_id: correlationId,
      })
    }
    const { data: membro } = await userClient.rpc('is_org_member', { p_org: conta.organization_id })
    if (membro !== true) {
      return json(403, {
        error: { code: 'sem_permissao', message: 'Sem permissão neste canal' },
        correlation_id: correlationId,
      })
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
          const { data: s2 } = await admin.rpc('_edge_read_secret', {
            p_secret_ref: conn2.secret_ref,
          })
          clientToken = typeof s2 === 'string' && s2.length > 0 ? s2 : null
        }
      }
    }
    if (!token) {
      return json(200, {
        data: {
          channel_account_id: conta.id,
          health_status: 'not_configured',
          mensagem: 'Token não gravado — salve o canal novamente.',
          correlation_id: correlationId,
        },
        correlation_id: correlationId,
      })
    }

    // ---------- teste de rede real ----------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let httpStatus = 0
    let mensagem = ''
    let saudavel = false
    try {
      if (conta.provider === 'z_api') {
        if (!clientToken) {
          mensagem = 'Client-Token não gravado — salve o canal novamente.'
        } else {
          // URL com token no caminho — NUNCA em log/erro
          const r = await fetch(
            `https://api.z-api.io/instances/${encodeURIComponent(conta.external_account_id)}/token/${encodeURIComponent(token)}/status`,
            {
              headers: { 'Client-Token': clientToken, Accept: 'application/json' },
              signal: controller.signal,
            },
          )
          httpStatus = r.status
          saudavel = r.status === 200
          mensagem = saudavel
            ? 'Conexão com a instância Z-API OK.'
            : `Instância Z-API respondeu HTTP ${r.status}.`
        }
      } else {
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(conta.external_account_id)}`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: controller.signal,
          },
        )
        httpStatus = r.status
        saudavel = r.status === 200
        mensagem = saudavel
          ? 'Conexão com a Meta Cloud API OK.'
          : `Meta respondeu HTTP ${r.status}.`
      }
    } catch (e: unknown) {
      const nome = (e as { name?: string })?.name ?? ''
      mensagem =
        nome === 'AbortError' ? 'Tempo esgotado no teste de rede.' : 'Falha de rede no teste.'
    } finally {
      clearTimeout(timer)
    }

    await admin
      .from('channel_accounts')
      .update({
        last_status_at: new Date().toISOString(),
        last_error_code: saudavel ? null : `http_${httpStatus || 'rede'}`,
      })
      .eq('id', conta.id)

    return json(200, {
      data: {
        channel_account_id: conta.id,
        health_status: saudavel ? 'healthy' : 'error',
        http_status: httpStatus,
        mensagem,
        correlation_id: correlationId,
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
