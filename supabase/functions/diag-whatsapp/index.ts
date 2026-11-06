// Diagnóstico do canal WhatsApp/Meta — 05/11/2026
// Responde 4 perguntas em uma chamada:
//   1) o token ainda vale?
//   2) o número está CONNECTED?
//   3) o webhook está inscrito e ativo?
//   4) qual o platform_type (a causa do silêncio em outubro)
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const WABA = '1068799338488708'
const PHONE_ID = '707487385771432'
// app secret guardado como "<phone_id>:app_secret"
const APP_SECRET_REF = 'vault:f29cf9b3-46d8-4cd7-8e04-a687350c6ee3'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'
const APP_ID = '1063262590063176'

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
  let body: any
  try { body = await r.json() } catch { body = { raw: 'sem json' } }
  return { status: r.status, body }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const appSecret = await segredo(APP_SECRET_REF)
  const out: Record<string, unknown> = {
    token_presente: token.length > 20,
    app_secret_presente: appSecret.length > 10,
  }

  if (token.length > 20) {
    // 1) token vale?
    const me = await g('/me', token)
    out.token = { status: me.status, id: me.body?.id ?? null, erro: me.body?.error?.code ?? null,
                  mensagem: me.body?.error?.message ?? null }

    // 2) número
    const num = await g(`/${PHONE_ID}?fields=display_phone_number,verified_name,status,quality_rating,platform_type,is_on_biz_app,account_mode,code_verification_status`, token)
    out.numero = num.status === 200 ? num.body : { status: num.status, erro: num.body?.error?.code, mensagem: num.body?.error?.message }

    // 3) webhook inscrito
    const subsApp = await g(`/${APP_ID}/subscriptions?access_token=${APP_ID}|${appSecret}`, '')
    out.webhook = { status: subsApp.status, data: subsApp.body?.data ?? subsApp.body }

    // 4) WABA inscrita
    const wabaSubs = await g(`/${WABA}/subscribed_apps`, token)
    out.waba_inscrita = { status: wabaSubs.status, data: wabaSubs.body?.data ?? wabaSubs.body }
  }

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
