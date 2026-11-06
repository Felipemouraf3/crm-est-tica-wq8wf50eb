// probe 3: achar rota que ligue procedimento -> profissional com uuid
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
async function ceGet(path: string, token: string) {
  const r = await fetch(`${CE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0 (+integracao-interna)' },
  })
  const t = await r.text()
  let j: any = {}
  try { j = JSON.parse(t) } catch { j = { raw: t.slice(0, 300) } }
  return { status: r.status, body: j }
}
Deno.serve(async (req) => {
  const token = await readSecret()
  const out: any = {}
  const tentativas = [
    '/procedures/151746/professionals',
    '/professionals?procedure_id=151746',
    '/professionals?consultation_type_id=151746',
    '/procedures?professional_uuid=6f9758fd-18f7-4808-b34a-5dfe9b0df9db&per_page=3',
    '/available-hours?professional_uuid=6f9758fd-18f7-4808-b34a-5dfe9b0df9db&date=2026-11-10&procedure_id=151746',
  ]
  for (const t of tentativas) {
    try { out[t] = await ceGet(t, token) } catch (e) { out[t] = { erro: String(e) } }
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
});
