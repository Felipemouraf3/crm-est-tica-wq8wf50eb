// Probe de diagnóstico temporária: lê as credenciais do canal Z-API via RPC e chama /status
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return new Response('unauth', { status: 401 })
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: conn } = await admin
    .from('integration_connections')
    .select('secret_ref')
    .eq('provider', 'canal_z_api')
    .eq('connection_key', '3FB216D8001501EE233C3249377B3B8D')
    .maybeSingle()
  const { data: conn2 } = await admin
    .from('integration_connections')
    .select('secret_ref')
    .eq('provider', 'canal_z_api')
    .eq('connection_key', '3FB216D8001501EE233C3249377B3B8D:client_token')
    .maybeSingle()
  const { data: tok } = await admin.rpc('_edge_read_secret', {
    p_secret_ref: conn?.secret_ref ?? '',
  })
  const { data: ct } = await admin.rpc('_edge_read_secret', {
    p_secret_ref: conn2?.secret_ref ?? '',
  })
  if (!tok || !ct)
    return new Response(JSON.stringify({ erro: 'sem credenciais', tok: !!tok, ct: !!ct }), {
      status: 200,
    })
  try {
    const r = await fetch(
      `https://api.z-api.io/instances/3FB216D8001501EE233C3249377B3B8D/token/${tok}/status`,
      {
        headers: { 'Client-Token': ct, Accept: 'application/json' },
      },
    )
    const texto = await r.text()
    return new Response(
      JSON.stringify({
        status: r.status,
        corpo: texto.slice(0, 200),
        token_len: tok.length,
        ct_len: ct.length,
        token_prefixo: tok.slice(0, 4),
      }),
      { status: 200 },
    )
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e?.message ?? e) }), { status: 200 })
  }
})
