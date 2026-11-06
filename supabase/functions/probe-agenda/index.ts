// probe temporário de contrato: /available-hours, /procedures, /professionals
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
  const u = new URL(req.url)
  const acao = u.searchParams.get('acao') ?? 'proc'
  const out: any = {}
  try {
    if (acao === 'prof') out.prof = await ceGet('/professionals?per_page=3', token)
    else if (acao === 'proc') out.proc = await ceGet('/procedures?per_page=5', token)
    else if (acao === 'ah') {
      const prof = u.searchParams.get('prof')!
      const data = u.searchParams.get('data')!
      out.ah = await ceGet(`/available-hours?professional_uuid=${prof}&date=${data}`, token)
      out.ahSemProf = await ceGet(`/available-hours?date=${data}`, token)
    }
  } catch (e) { out.erro = String(e) }
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
});
