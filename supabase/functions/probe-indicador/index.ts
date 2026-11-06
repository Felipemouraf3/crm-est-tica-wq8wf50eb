// probe de conferência: contagem de avaliações em setembro/2026 direto na API
// (CA-P3-S06-07 exige que o indicador bata com a contagem direta na fonte)
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'

async function readSecret() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
  return String(await r.json()).trim()
}

Deno.serve(async () => {
  const token = await readSecret()
  const AVAL = new Set([151746, 151771, 151747, 858867, 1033491, 1566849, 895051, 996914, 1041129])
  let page = 1,
    last = 1
  let total = 0,
    done = 0,
    cancel = 0
  const porStatus: Record<string, number> = {}
  do {
    const r = await fetch(
      `${CE_BASE}/bookings?starts_at=2026-09-01T00:00:00-03:00&ends_at=2026-09-30T23:59:59-03:00&page=${page}&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'PS-CRM/1.0',
        },
      },
    )
    const j = await r.json()
    last = Number(j?.meta?.last_page ?? 1)
    for (const b of j.data ?? []) {
      const procs = (b.procedures ?? []).map((p: any) => Number(p.id))
      if (!procs.some((id: number) => AVAL.has(id))) continue
      total++
      const st = String(b.status ?? '?')
      porStatus[st] = (porStatus[st] ?? 0) + 1
      if (st === 'done') done++
      if (['canceled', 'noshow', 'no_show'].includes(st)) cancel++
    }
    page++
  } while (page <= last)

  return new Response(
    JSON.stringify(
      {
        fonte: 'API /bookings',
        mes: '2026-09',
        agendadas: total,
        realizadas: done,
        canceladas: cancel,
        porStatus,
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
