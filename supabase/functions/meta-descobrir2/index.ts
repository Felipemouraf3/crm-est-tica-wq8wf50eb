// Descoberta pós-coexistência — 08/11/2026
// A WABA nova foi criada pelo painel. O token de sistema antigo pode não enxergá-la.
// Tenta por vários caminhos e devolve o que existir.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'
const APP_ID = '1063262590063176'
const APP_SECRET_REF = 'vault:f29cf9b3-46d8-4cd7-8e04-a687350c6ee3'

async function segredo(ref: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: ref }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

async function g(path: string, token: string) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${G}${path}${sep}access_token=${encodeURIComponent(token)}`)
  let j: any
  try { j = await r.json() } catch { j = { raw: 'sem json' } }
  return { status: r.status, erro: j?.error?.message ?? null, body: j }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const secret = await segredo(APP_SECRET_REF)
  const appToken = `${APP_ID}|${secret}`
  const out: Record<string, unknown> = {}

  // 1) WABAs do app (o caminho mais provável depois do signup pelo painel)
  out.app_waba = await g(`/${APP_ID}/whatsapp_business_accounts?fields=id,name,account_review_status`, appToken)
  out.app_waba_tok = await g(`/${APP_ID}/whatsapp_business_accounts?fields=id,name`, token)

  // 2) negócios do usuário de sistema
  out.sys_businesses = await g('/me/businesses?fields=id,name', token)
  out.sys_info = await g('/122103812151520086?fields=id,name', token)

  // 3) clientes do app (o que o signup criou)
  out.app_clients = await g(`/${APP_ID}/clients?fields=id,name`, appToken)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
