// Diagnóstico: por que a mensagem não chegou? — 08/11/2026
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const WABA = '1158502057234375'
const PHONE = '1482747711582760'
const APP_ID = '1063262590063176'
const APP_SECRET_REF = 'vault:f29cf9b3-46d8-4cd7-8e04-a687350c6ee3'
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

  out.webhook_app = await g(`/${APP_ID}/subscriptions`, appToken)
  out.apps_na_waba = await g(`/${WABA}/subscribed_apps`, token)
  out.numero = await g(`/${PHONE}?fields=status,platform_type,is_on_biz_app,code_verification_status,quality_rating,name_status`, token)
  out.waba = await g(`/${WABA}?fields=id,name,account_review_status`, token)

  // verificar se o numero esta registrado para envio (o que confirma coexistencia ativa)
  out.registro = await g(`/${PHONE}/register`, token).catch?.(() => null) ?? null

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
