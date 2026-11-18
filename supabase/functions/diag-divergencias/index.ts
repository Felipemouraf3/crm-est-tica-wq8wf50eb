// Diagnóstico das divergências da reconciliação — 11/11/2026
// 1) outubro: 84 vendas no espelho vs 85 na API → qual falta?
// 2) novembro: 444 agendamentos no espelho vs 442 na API → quais sobram?
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE = 'https://api.clinicaexperts.com.br/api/v1'
const REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'

const sb = (p: string, i: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${p}`, { ...i, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(i.headers ?? {}) } })

async function token(): Promise<string> {
  const r = await sb('/rest/v1/rpc/_edge_read_secret', { method: 'POST', body: JSON.stringify({ p_secret_ref: REF }) })
  return String(await r.json()).trim()
}

async function pagina(rota: string, ini: string, fim: string, tk: string) {
  const out: any[] = []
  let page = 1, last = 1
  do {
    const r = await fetch(`${CE}/${rota}?starts_at=${ini}&ends_at=${fim}&page=${page}&per_page=100`,
      { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0' } })
    const j = await r.json()
    last = Number(j?.meta?.last_page ?? 1)
    out.push(...(j.data ?? []))
    page++
  } while (page <= last)
  return out
}

Deno.serve(async () => {
  const tk = await token()
  const out: Record<string, unknown> = {}

  // ---- outubro: vendas
  const vendasAPI = await pagina('sales', '2026-10-01T00:00:00-03:00', '2026-10-31T23:59:59-03:00', tk)
  const idsAPI = new Set(vendasAPI.map((v: any) => String(v.uuid)))

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sales_mirror?select=expert_uuid,buyer_name,sale_date,final_amount_cents&clinic_id=eq.c0000000-0000-0000-0000-000000000001&sale_date=gte.2026-10-01&sale_date=lt.2026-11-01&limit=1000`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  )
  const vendasEspelho = await r.json() as any[]
  const idsEspelho = new Set(vendasEspelho.map((v) => v.expert_uuid))

  const faltamNoEspelho = vendasAPI.filter((v: any) => !idsEspelho.has(String(v.uuid)))
    .map((v: any) => ({ uuid: v.uuid, valor: v.final_amount, data: v.sale_date, status: v.status, comprador: v.buyer?.name }))

  out.outubro_vendas = {
    api: idsAPI.size,
    espelho: idsEspelho.size,
    faltando_no_espelho: faltamNoEspelho,
    sobrando_no_espelho: vendasEspelho.filter((v) => !idsAPI.has(v.expert_uuid))
      .map((v) => ({ uuid: v.expert_uuid, nome: v.buyer_name, data: v.sale_date })),
  }

  // ---- novembro: agendamentos
  const agAPI = await pagina('bookings', '2026-11-01T00:00:00-03:00', '2026-11-30T23:59:59-03:00', tk)
  const idsAgAPI = new Set(agAPI.map((b: any) => String(b.uuid)))

  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/appointments_mirror?select=expert_uuid,patient_name,starts_at,status&clinic_id=eq.c0000000-0000-0000-0000-000000000001&starts_at=gte.2026-11-01T00:00:00-03:00&starts_at=lt.2026-12-01T00:00:00-03:00&limit=2000`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  )
  const agEspelho = await r2.json() as any[]

  out.novembro_agendamentos = {
    api: idsAgAPI.size,
    espelho: agEspelho.length,
    sobrando_no_espelho: agEspelho.filter((a) => !idsAgAPI.has(a.expert_uuid))
      .map((a) => ({ uuid: a.expert_uuid, paciente: a.patient_name, inicio: a.starts_at, status: a.status })),
  }

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
