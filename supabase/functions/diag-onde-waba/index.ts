// Onde está a WABA? — 08/11/2026
// A tela do portfólio psesteticaa está vazia, mas a API diz que a WABA é dele.
// Lista TODAS as WABAs do negócio 956598555466534 e detalhes.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const BIZ = '956598555466534'
const WABA = '1158502057234375'
const PHONE = '1482747711582760'
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
  const out: Record<string, unknown> = {}

  // o negócio existe?
  out.biz = await g(`/${BIZ}?fields=id,name,verification_status`, token)
  // WABAs próprias e de cliente
  out.biz_owned = await g(`/${BIZ}/owned_whatsapp_business_accounts?fields=id,name`, token)
  out.biz_client = await g(`/${BIZ}/client_whatsapp_business_accounts?fields=id,name`, token)
  // todos os números da WABA, com estado completo
  out.numeros = await g(`/${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,status,platform_type,is_on_biz_app,code_verification_status,quality_rating`, token)
  // detalhe do número
  out.phone = await g(`/${PHONE}?fields=id,display_phone_number,status,platform_type,is_on_biz_app,code_verification_status,name_status,quality_rating,throughput`, token)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
