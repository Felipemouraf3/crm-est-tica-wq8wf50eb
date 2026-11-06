// Quem está inscrito na WABA e no número? — 05/11/2026
// Pergunta do Felipe: "possuo um CRM que já utilizava antes, provavelmente está dando conflito?"
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const WABA = '1068799338488708'
const PHONE_ID = '707487385771432'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'
const APP_SECRET_REF = 'vault:f29cf9b3-46d8-4cd7-8e04-a687350c6ee3'
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
  const out: Record<string, unknown> = {}

  // 1) TODOS os apps inscritos nesta WABA — é aqui que aparece o "CRM antigo"
  const subs = await g(`/${WABA}/subscribed_apps`, token)
  out.apps_inscritos_na_waba = subs.status === 200
    ? (subs.body?.data ?? []).map((a: any) => ({
        app_id: a.whatsapp_business_api_data?.id ?? a.id ?? null,
        nome: a.whatsapp_business_api_data?.name ?? a.name ?? null,
        link: a.whatsapp_business_api_data?.link ?? null,
      }))
    : { erro: subs.body?.error?.message ?? subs.status }

  // 2) detalhes do número: quem é o dono/plataforma
  const num = await g(
    `/${PHONE_ID}?fields=display_phone_number,verified_name,status,platform_type,is_on_biz_app,account_mode,quality_rating,code_verification_status,throughput,webhook_configuration`,
    token,
  )
  out.numero = num.status === 200 ? num.body : { erro: num.body?.error?.message, status: num.status }

  // 3) WABAs do negócio (pode haver mais de uma — indício de cadastro duplicado)
  const biz = await g(`/${WABA}?fields=id,name,account_review_status,business_verification_status,ownership_type`, token)
  out.waba = biz.status === 200 ? biz.body : { erro: biz.body?.error?.message }

  // 4) apps do próprio negócio
  const bizApps = await g(`/1063262590063176/subscriptions?access_token=${APP_ID}|${appSecret}`, '')
  out.webhook_do_nosso_app = bizApps.status === 200 ? bizApps.body : { status: bizApps.status, erro: bizApps.body?.error?.message }

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
