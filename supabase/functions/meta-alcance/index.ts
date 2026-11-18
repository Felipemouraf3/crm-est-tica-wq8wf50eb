// O que o token ainda alcança? (08/11/2026 — WABA e número desapareceram)
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
  return { status: r.status, erro: j?.error?.message ?? null, body: j }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const out: Record<string, unknown> = {}

  // o app
  out.app = await get('/1063262590063176?fields=id,name,link', token)

  // WABA ligada ao app
  out.app_waba = await get('/1063262590063176/whatsapp_business_accounts?fields=id,name', token)

  // usuário de sistema: negócios atribuídos
  out.sysuser_biz = await get('/122103812151520086/assigned_businesses?fields=id,name', token)
  out.sysuser_waba = await get('/122103812151520086/assigned_whatsapp_business_accounts?fields=id,name', token)

  // tentativa antiga, só para registrar o erro
  out.me_biz = await get('/me?fields=businesses{id,name}', token)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
