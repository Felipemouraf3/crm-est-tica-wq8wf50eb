// probe: contagem de vendas de setembro/2026 direto na API (CA-P3-S07-03)
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'

async function readSecret() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
  return String(await r.json()).trim()
}

Deno.serve(async () => {
  const token = await readSecret()
  let page = 1, last = 1
  const uuids = new Set<string>()
  const porStatus: Record<string, number> = {}
  let valor = 0
  do {
    const r = await fetch(
      `${CE_BASE}/sales?starts_at=2026-09-01T00:00:00-03:00&ends_at=2026-09-30T23:59:59-03:00&page=${page}&per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0' } },
    )
    const j = await r.json()
    last = Number(j?.meta?.last_page ?? 1)
    for (const s of (j.data ?? [])) {
      uuids.add(s.uuid)
      const st = String(s.status ?? '?')
      porStatus[st] = (porStatus[st] ?? 0) + 1
      valor += Number(s.final_amount ?? 0)
    }
    page++
  } while (page <= last)

  return new Response(JSON.stringify({ fonte: 'API /sales', mes: '2026-09',
    vendas_unicas: uuids.size, porStatus, valor_total_reais: valor / 100 }, null, 1),
    { headers: { 'Content-Type': 'application/json' } })
})
