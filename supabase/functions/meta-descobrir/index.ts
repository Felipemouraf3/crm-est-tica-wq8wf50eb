// Descoberta: quais WABAs e números o token realmente enxerga hoje (08/11/2026)
// Os IDs antigos sumiram. Precisamos saber o que existe agora.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'

async function segredo(ref: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: ref }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

async function get(path: string, token: string) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${G}${path}${sep}access_token=${encodeURIComponent(token)}`)
  let j: any
  try { j = await r.json() } catch { j = { raw: 'sem json' } }
  return { status: r.status, body: j }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const out: Record<string, unknown> = {}

  // 1) quem é este token (usuário de sistema? app?)
  out.me = await get('/me?fields=id,name', token)

  // 2) negócios visíveis
  out.businesses = await get('/me/businesses?fields=id,name', token)

  // 3) WABAs de cada negócio
  const biz = out.businesses as any
  const ids: string[] = Array.isArray(biz?.body?.data) ? biz.body.data.map((b: any) => b.id) : []
  const wabas: Record<string, unknown> = {}
  for (const id of ids) {
    wabas[id] = await get(`/${id}/owned_whatsapp_business_accounts?fields=id,name,account_review_status,business_verification_status`, token)
  }
  out.wabas_por_negocio = wabas
  out.wabas_client = await get('/me/whatsapp_business_accounts?fields=id,name', token)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
