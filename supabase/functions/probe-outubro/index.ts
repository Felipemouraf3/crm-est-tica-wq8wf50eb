// probe: outubro/2026 na API, para o aceite do painel
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'
const AVAL = new Set([151746, 151771, 151747, 858867, 1033491, 1566849, 895051, 996914, 1041129])

async function readSecret() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
  return String(await r.json()).trim()
}

async function paginar(rota: string, ini: string, fim: string, token: string) {
  const out: any[] = []
  let page = 1, last = 1
  do {
    const r = await fetch(`${CE_BASE}/${rota}?starts_at=${ini}&ends_at=${fim}&page=${page}&per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0' } })
    const j = await r.json()
    last = Number(j?.meta?.last_page ?? 1)
    out.push(...(j.data ?? []))
    page++
  } while (page <= last)
  return out
}

Deno.serve(async () => {
  const token = await readSecret()
  const ini = '2026-10-01T00:00:00-03:00'
  const fim = '2026-10-31T23:59:59-03:00'

  const bookings = await paginar('bookings', ini, fim, token)
  const vendas = await paginar('sales', ini, fim, token)

  const avalia = bookings.filter((b: any) =>
    (b.procedures ?? []).some((p: any) => AVAL.has(Number(p.id))))

  return new Response(JSON.stringify({
    fonte: 'API', mes: '2026-10',
    agendamentos: bookings.length,
    realizados: bookings.filter((b: any) => b.status === 'done').length,
    cancelados: bookings.filter((b: any) => ['canceled','noshow','no_show'].includes(b.status)).length,
    avaliacoes: avalia.length,
    avaliacoes_realizadas: avalia.filter((b: any) => b.status === 'done').length,
    vendas: vendas.length,
    valor_reais: vendas.reduce((s: number, v: any) => s + Number(v.final_amount ?? 0), 0) / 100,
  }, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
