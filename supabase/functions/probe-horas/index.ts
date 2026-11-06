// probe de conferência dos horários crus (CA-P3-S04-01)
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
Deno.serve(async (req) => {
  const token = await readSecret()
  const u = new URL(req.url)
  const prof = u.searchParams.get('prof')!
  const data = u.searchParams.get('data')!
  const r = await fetch(`${CE_BASE}/available-hours?professional_uuid=${prof}&date=${data}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0 (+integracao-interna)' },
  })
  const j = await r.json()
  return new Response(JSON.stringify({ status: r.status, horas: j.data ?? j }), { headers: { 'Content-Type': 'application/json' } })
});
