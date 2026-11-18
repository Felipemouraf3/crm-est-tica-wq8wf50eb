// Ações no número da Meta — 08/11/2026
// Felipe pediu: excluir o número e refazer o registro junto com a Meta.
// Ações: listar | excluir | adicionar | verificar | registrar | estado
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const WABA = '1068799338488708'
const PHONE_ID = '707487385771432'
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

async function call(method: string, path: string, token: string, body?: unknown) {
  const r = await fetch(`${G}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let j: any
  try { j = await r.json() } catch { j = { raw: 'sem json' } }
  return { status: r.status, body: j }
}

Deno.serve(async (req) => {
  const token = await segredo(TOKEN_REF)
  const u = new URL(req.url)
  const acao = u.searchParams.get('acao') ?? 'estado'
  const out: Record<string, unknown> = { acao }

  try {
    if (acao === 'listar') {
      const r = await call('GET', `/${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,status,platform_type,is_on_biz_app,code_verification_status,quality_rating`, token)
      out.resultado = r
    } else if (acao === 'estado') {
      const r = await call('GET', `/${PHONE_ID}?fields=id,display_phone_number,verified_name,status,platform_type,is_on_biz_app,account_mode,code_verification_status,name_status`, token)
      out.resultado = r
    } else if (acao === 'excluir') {
      // remove o número da WABA (não apaga o número do mundo, só o vínculo)
      const r = await call('DELETE', `/${PHONE_ID}`, token)
      out.resultado = r
    } else if (acao === 'adicionar') {
      const cc = u.searchParams.get('cc') ?? '55'
      const numero = u.searchParams.get('numero') ?? ''
      const nome = u.searchParams.get('nome') ?? 'Ps Estetica'
      const r = await call('POST', `/${WABA}/phone_numbers`, token, {
        cc, phone_number: numero, verified_name: nome, type: 'SMS',
      })
      out.resultado = r
    } else if (acao === 'verificar') {
      const codigo = u.searchParams.get('codigo') ?? ''
      const r = await call('POST', `/${PHONE_ID}/verify_code`, token, { code: codigo })
      out.resultado = r
    } else if (acao === 'registrar') {
      const pin = u.searchParams.get('pin') ?? ''
      const r = await call('POST', `/${PHONE_ID}/register`, token, { messaging_product: 'whatsapp', pin })
      out.resultado = r
    } else {
      out.erro = 'acao desconhecida'
    }
  } catch (e) {
    out.erro = String(e)
  }

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
