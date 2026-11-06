// probe: o /bookings traz o PROCEDIMENTO de cada agendamento?
// Sem isso, a P3-S06 (resultado da avaliação) não tem como identificar avaliação.
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
  const r = await fetch(
    `${CE_BASE}/bookings?starts_at=2026-11-05T00:00:00-03:00&ends_at=2026-11-05T23:59:59-03:00&per_page=3`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'PS-CRM/1.0',
      },
    },
  )
  const j = await r.json()
  const primeiro = j.data?.[0] ?? null
  return new Response(
    JSON.stringify(
      {
        status: r.status,
        campos_do_booking: primeiro ? Object.keys(primeiro) : [],
        amostra: primeiro,
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
