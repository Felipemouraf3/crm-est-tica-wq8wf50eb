// probe 2: descobrir como o id numérico do profissional se liga ao uuid
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
async function ceGet(path: string, token: string) {
  const r = await fetch(`${CE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'PS-CRM/1.0 (+integracao-interna)',
    },
  })
  const t = await r.text()
  let j: any = {}
  try {
    j = JSON.parse(t)
  } catch {
    j = { raw: t.slice(0, 400) }
  }
  return { status: r.status, body: j }
}
Deno.serve(async (req) => {
  const token = await readSecret()
  const u = new URL(req.url)
  const acao = u.searchParams.get('acao') ?? 'det'
  const out: any = {}
  try {
    if (acao === 'det') {
      // detalhe de um profissional: tem id numérico?
      out.profDetalhe = await ceGet('/professionals/6f9758fd-18f7-4808-b34a-5dfe9b0df9db', token)
      // procedimento 151746 (que lista 10438 e 63646) — ver o que volta
      out.procDetalhe = await ceGet('/procedures/151746', token)
      // available-hours com id numérico no lugar do uuid
      out.ahComId = await ceGet('/available-hours?professional_uuid=10438&date=2026-11-10', token)
      // available-hours com procedure e interval
      out.ahComProc = await ceGet(
        '/available-hours?professional_uuid=6f9758fd-18f7-4808-b34a-5dfe9b0df9db&date=2026-11-10&procedure_id=151746&interval=30',
        token,
      )
    }
  } catch (e) {
    out.erro = String(e)
  }
  return new Response(JSON.stringify(out, null, 1), {
    headers: { 'Content-Type': 'application/json' },
  })
})
