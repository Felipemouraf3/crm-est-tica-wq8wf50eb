// Edge Function search-expert-patient v5 — P2-S02-T02
// v5 (2026-10-27): corrige o mapeamento do nascimento (a API devolve `date_birth`,
// não `birth_date`) e invalida cache antigo sem birth_masked via force_refresh.
// v4 (2026-10-24): leitura do token via RPC _edge_read_secret (com sanitização
// de whitespace). v3 provou: schema vault não exposto na API PostgREST.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buscarEmDuasEtapas } from '../_shared/providers/expert-search.ts'
import { EXPERT_BASE_URL_DEFAULT } from '../_shared/providers/clinica-experts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: corsHeaders })

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ') || authHeader === 'Bearer ') {
      return resp(401, { erro: 'autenticacao', correlation_id: correlationId })
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user?.id) {
      return resp(401, { erro: 'autenticacao', correlation_id: correlationId })
    }

    const body = await req.json().catch(() => ({}))
    const clinicId = body?.clinic_id
    const phoneRaw = body?.phone
    const forceRefresh = body?.force_refresh === true || body?.forcar_api === true
    if (!clinicId || !phoneRaw) {
      return resp(400, { erro: 'entrada', mensagem: 'clinic_id e phone são obrigatórios', correlation_id: correlationId })
    }

    const { data: phoneE164, error: normErr } = await userClient.rpc('normalize_e164', { p_raw: phoneRaw })
    if (normErr || !phoneE164) {
      return resp(400, { erro: 'entrada', mensagem: 'Telefone inválido para E.164', correlation_id: correlationId })
    }

    const { data: clinicRow, error: clinicErr } = await userClient
      .from('clinics')
      .select('id, organization_id, status')
      .eq('id', clinicId)
      .maybeSingle()
    if (clinicErr || !clinicRow || clinicRow.status !== 'active') {
      return resp(403, { erro: 'permissao', mensagem: 'Clínica não encontrada ou inativa', correlation_id: correlationId })
    }
    const { data: membro, error: membroErr } = await userClient.rpc('is_org_member', { p_org: clinicRow.organization_id })
    if (membroErr || membro !== true) {
      return resp(403, { erro: 'permissao', mensagem: 'Sem permissão nesta clínica', correlation_id: correlationId })
    }

    if (!forceRefresh) {
      const { data: cacheRow } = await userClient
        .from('expert_patients_cache')
        .select('payload, result_class, expires_at')
        .eq('clinic_id', clinicId)
        .eq('phone_e164', phoneE164)
        .eq('invalidated', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (cacheRow) {
        return resp(200, {
          data: {
            result_class: cacheRow.result_class,
            phone_e164: phoneE164,
            candidates: cacheRow.payload?.candidates ?? [],
            linked_patient_uuid: cacheRow.payload?.linked_patient_uuid ?? null,
            cache_hit: true,
          },
          correlation_id: correlationId,
        })
      }
    }

    const baseUrl = Deno.env.get('EXPERT_API_BASE_URL') ?? EXPERT_BASE_URL_DEFAULT
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
      // v4: ler via RPC SECURITY DEFINER (com sanitização de whitespace)
      const { data: segredo } = await adminClient.rpc('_edge_read_secret', { p_secret_ref: conn.secret_ref })
      token = typeof segredo === 'string' && segredo.length > 0 ? segredo : null
    }
    if (!token) {
      return resp(503, { erro: 'credencial', mensagem: 'Token da API não configurado (salve via /admin)', correlation_id: correlationId })
    }

    let busca
    try {
      busca = await buscarEmDuasEtapas(baseUrl, token, phoneE164, { correlationId })
    } catch (e) {
      const code = e?.code ?? 'falha_transitoria'
      const statusMap: Record<string, number> = {
        credencial_invalida: 502,
        bloqueio_de_borda: 502,
        modulo_desabilitado: 503,
        paciente_nao_encontrado: 404,
        entrada_recusada: 400,
        limite_externo: 503,
        falha_transitoria: 502,
        tempo_esgotado: 504,
        falha_externa: 502,
      }
      return resp(statusMap[code] ?? 502, {
        erro: code,
        mensagem: e?.message ?? 'Falha na API externa',
        correlation_id: e?.correlationId ?? correlationId,
        falha_nao_bloqueia: true,
      })
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
    const payload = {
      candidates: busca.candidatos.map((c) => ({
        expert_patient_uuid: c.expert_patient_uuid,
        name: c.name,
        birth_masked: c.birth_masked,
        active: c.active,
      })),
      linked_patient_uuid: null,
    }
    await adminClient.from('expert_patients_cache').upsert(
      {
        organization_id: clinicRow.organization_id,
        clinic_id: clinicId,
        phone_e164: phoneE164,
        payload,
        result_class: busca.result_class,
        expires_at: expiresAt,
        invalidated: false,
        correlation_id: correlationId,
      },
      { onConflict: 'clinic_id,phone_e164' },
    )

    return resp(200, {
      data: {
        result_class: busca.result_class,
        phone_e164: phoneE164,
        candidates: payload.candidates,
        linked_patient_uuid: null,
        cache_hit: false,
      },
      correlation_id: correlationId,
    })
  } catch (e) {
    return resp(500, { erro: 'inesperado', correlation_id: correlationId })
  }
})
