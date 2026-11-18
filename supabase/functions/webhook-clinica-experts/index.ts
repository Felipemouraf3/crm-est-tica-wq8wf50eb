// webhook-clinica-experts — P4-S02
//
// Recebe os eventos do Clínica Experts e enfileira para aplicação.
// NÃO aplica nada na hora: grava em `ce_webhook_events` e o job `ce-webhook-apply`
// (30s) aplica. Assim um webhook que chega durante um deploy não se perde.
//
// EVENTOS (doc oficial): booking.*, patient.*, professional.*, procedure.*, room.*,
// healthcare_company.*
//
// AUTENTICAÇÃO: a documentação do CE NÃO descreve assinatura nem token. A proteção
// possível é um segredo na URL (?k=...), guardado no Vault. Um webhook sem o segredo
// é recusado com 401 e registrado — não descartado em silêncio.
//
// IDEMPOTÊNCIA: a RPC `ce_webhook_receber` usa `dedup_key` único
// (evento + id do recurso + timestamp). Reenvio devolve `duplicado: true`.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SECRET_REF = 'vault:ce_webhook_secret_ref'

async function segredoPorNome(nome: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret_by_name`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_name: nome }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return json({ error: 'metodo_invalido' }, 405)

  const url = new URL(req.url)
  const enviado = url.searchParams.get('k') ?? ''
  const esperado = await segredoPorNome('CE_WEBHOOK_SECRET')

  if (esperado && enviado !== esperado) {
    return json({ error: 'segredo_invalido' }, 401)
  }

  let corpo: any
  try {
    corpo = await req.json()
  } catch {
    return json({ error: 'corpo_nao_e_json' }, 400)
  }

  // o nome do evento pode vir em campos diferentes conforme o payload
  const evento: string =
    corpo?.event ?? corpo?.event_name ?? corpo?.type ?? corpo?.webhook_event ?? ''

  if (!evento) {
    return json({ error: 'evento_ausente', recebido: Object.keys(corpo ?? {}) }, 400)
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ce_webhook_receber`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_event_name: evento, p_payload: corpo }),
  })

  if (!r.ok) {
    return json({ error: 'falha_ao_gravar', detalhe: (await r.text()).slice(0, 300) }, 500)
  }

  const res = await r.json()
  // 200 sempre que gravou — mesmo duplicado. O CE não deve reenviar.
  return json({ ok: true, ...res })
})
