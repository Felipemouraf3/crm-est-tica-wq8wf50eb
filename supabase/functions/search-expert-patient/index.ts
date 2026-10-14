// Edge Function search-expert-patient — P1-S05-T02 (repo: supabase/functions)
// Fluxo: JWT do usuário → valida acesso (RPCs RLS) → normaliza E.164
// → cache (TTL) → API Clínica Experts (módulo T01 em _shared/, fase 1 aceito)
// → classifica zero/um/múltiplos (nunca escolhe múltiplos) → grava cache.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buscarPacientesPorTelefone } from '../_shared/clinic_experts_client.ts'

// ==================== Edge Function ====================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // 1. Autenticação: JWT do usuário (nunca anon)
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ') || authHeader === 'Bearer ') {
      return new Response(JSON.stringify({ erro: 'autenticacao', correlation_id: correlationId }), {
        status: 401,
        headers: corsHeaders,
      })
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user?.id) {
      return new Response(JSON.stringify({ erro: 'autenticacao', correlation_id: correlationId }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // 2. Entrada: { clinic_id, phone, forcar_api? }
    const body = await req.json().catch(() => ({}))
    const clinicId = body?.clinic_id
    const phoneRaw = body?.phone
    const forcarApi = body?.forcar_api === true
    if (!clinicId || !phoneRaw) {
      return new Response(
        JSON.stringify({
          erro: 'entrada',
          mensagem: 'clinic_id e phone são obrigatórios',
          correlation_id: correlationId,
        }),
        { status: 400, headers: corsHeaders },
      )
    }

    // 3. Normalização E.164 server-side (RPC da migration)
    const { data: normData, error: normErr } = await userClient.rpc('normalize_e164', {
      p_raw: phoneRaw,
    })
    if (normErr || !normData) {
      return new Response(
        JSON.stringify({
          erro: 'entrada',
          mensagem: 'Telefone inválido para E.164',
          correlation_id: correlationId,
        }),
        { status: 400, headers: corsHeaders },
      )
    }
    const phoneE164: string = normData

    // 4. Acesso: membro ativo da organização da clínica (RLS decide)
    const { data: clinicRow, error: clinicErr } = await userClient
      .from('clinics')
      .select('id, organization_id, status')
      .eq('id', clinicId)
      .maybeSingle()
    if (clinicErr || !clinicRow || clinicRow.status !== 'active') {
      return new Response(
        JSON.stringify({
          erro: 'permissao',
          mensagem: 'Clínica não encontrada ou inativa',
          correlation_id: correlationId,
        }),
        { status: 403, headers: corsHeaders },
      )
    }
    const { data: membro, error: membroErr } = await userClient.rpc('is_org_member', {
      p_org: clinicRow.organization_id,
    })
    if (membroErr || membro !== true) {
      return new Response(
        JSON.stringify({
          erro: 'permissao',
          mensagem: 'Sem permissão nesta clínica',
          correlation_id: correlationId,
        }),
        { status: 403, headers: corsHeaders },
      )
    }

    // 5. Cache (TTL): válido se não invalidado e dentro do prazo
    if (!forcarApi) {
      const { data: cacheRow } = await userClient
        .from('expert_patients_cache')
        .select('payload, result_class, expires_at')
        .eq('clinic_id', clinicId)
        .eq('phone_e164', phoneE164)
        .eq('invalidated', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (cacheRow) {
        return new Response(
          JSON.stringify({
            origem: 'cache',
            classificacao: cacheRow.result_class,
            resultados: cacheRow.payload?.resultados ?? [],
            valido_ate: cacheRow.expires_at,
            correlation_id: correlationId,
          }),
          { headers: corsHeaders },
        )
      }
    }

    // 6. Config: base URL (env) + token (Vault via service role)
    const baseUrl = Deno.env.get('EXPERT_API_BASE_URL')
    if (!baseUrl) {
      return new Response(
        JSON.stringify({
          erro: 'api_nao_configurada',
          mensagem: 'EXPERT_API_BASE_URL ausente',
          correlation_id: correlationId,
        }),
        { status: 503, headers: corsHeaders },
      )
    }
    const adminClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: conn } = await adminClient
      .from('integration_connections')
      .select('id, secret_ref')
      .eq('provider', 'clinica_experts')
      .eq('connection_key', 'api_token')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    let token: string | null = null
    if (conn?.secret_ref?.startsWith('vault:')) {
      const { data: sec } = await adminClient
        .schema('vault')
        .from('secrets')
        .select('secret')
        .eq('id', conn.secret_ref.replace('vault:', ''))
        .maybeSingle()
      token = sec?.secret ?? null
    }
    if (!token) {
      return new Response(
        JSON.stringify({
          erro: 'credencial',
          mensagem: 'Token da API não configurado (salve via /admin)',
          correlation_id: correlationId,
        }),
        { status: 503, headers: corsHeaders },
      )
    }

    // 7. Busca na API (módulo T01: timeout, rate limiter, retry, sanitização)
    let busca
    try {
      busca = await buscarPacientesPorTelefone(baseUrl, token, phoneE164, { correlationId })
    } catch (e) {
      const tipo = e?.tipo ?? 'servico'
      const statusMap: Record<string, number> = {
        credencial: 503,
        entrada: 400,
        timeout: 504,
        rede: 502,
        servico: 502,
        rate_limit_externo: 429,
      }
      return new Response(
        JSON.stringify({
          erro: tipo,
          mensagem: e.message,
          correlation_id: e?.detalhe?.correlation_id ?? correlationId,
          falha_nao_bloqueia: true,
        }),
        { status: statusMap[tipo] ?? 502, headers: corsHeaders },
      )
    }

    // 8. Classificação zero/um/múltiplos — múltiplos NUNCA escolhidos
    const resultados = busca.resultados
    const classificacao =
      resultados.length === 0 ? 'zero' : resultados.length === 1 ? 'um' : 'multiplos'

    // 9. Grava cache (TTL 1h) — service role (dado derivado da busca)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
    await adminClient.from('expert_patients_cache').upsert(
      {
        organization_id: clinicRow.organization_id,
        clinic_id: clinicId,
        phone_e164: phoneE164,
        payload: { resultados },
        result_class: classificacao,
        expires_at: expiresAt,
        invalidated: false,
        correlation_id: correlationId,
      },
      { onConflict: 'clinic_id,phone_e164' },
    )

    return new Response(
      JSON.stringify({
        origem: 'api',
        classificacao,
        resultados,
        valido_ate: expiresAt,
        correlation_id: correlationId,
        telemetria: busca.telemetria,
      }),
      { headers: corsHeaders },
    )
  } catch (e) {
    return new Response(JSON.stringify({ erro: 'inesperado', correlation_id: correlationId }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
