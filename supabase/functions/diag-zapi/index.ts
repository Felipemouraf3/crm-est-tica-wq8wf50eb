// Status da instância Z-API — o outro canal que já usou este número.
// Pergunta do Felipe: “possuo um CRM que já utilizava antes, provavelmente está dando conflito?”
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INST = '3FB216D8001501EE233C3249377B3B8D'
const TOKEN_REF = 'vault:7b7e5ae8-b3d5-43f0-801f-25ed05993b55'
const CLIENT_REF = 'vault:562b6a58-9671-4143-9083-271227e53bd0'

async function segredo(ref: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_secret_ref: ref }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const client = await segredo(CLIENT_REF)
  const out: Record<string, unknown> = { instancia: INST }

  // status da instância: connected? phone?  (Z-API: GET /status)
  try {
    const r = await fetch(`https://api.z-api.io/instances/${INST}/token/${token}/status`, {
      headers: { 'Client-Token': client },
    })
    out.status = { http: r.status, corpo: await r.json().catch(() => null) }
  } catch (e) {
    out.status = { erro: String(e) }
  }

  // dispositivo: qual celular está pareado (GET /device)
  try {
    const r = await fetch(`https://api.z-api.io/instances/${INST}/token/${token}/device`, {
      headers: { 'Client-Token': client },
    })
    out.device = { http: r.status, corpo: await r.json().catch(() => null) }
  } catch (e) {
    out.device = { erro: String(e) }
  }

  return new Response(JSON.stringify(out, null, 1), {
    headers: { 'Content-Type': 'application/json' },
  })
})
