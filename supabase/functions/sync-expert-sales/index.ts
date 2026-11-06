// sync-expert-sales — P3-S01-T02/T04 (corrigido em 04/11/2026)
//
// Dois defeitos corrigidos na validação de 04/11:
// 1) NUNCA existiu sincronizador de vendas — a carga de 1.378 foi manual, e por
//    isso out/2026 tinha 84 na API contra 73 no espelho.
// 2) verify_jwt=true com o cron mandando só `x-internal-job` -> 401 em todas as
//    execuções agendadas. O sync automático nunca rodou.
//    Agora: verify_jwt=false + validação do segredo interno contra o Vault.
//
// A API /sales usa `starts_at`/`ends_at` em ISO SEM milissegundos, com fuso.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = Deno.env.get('CE_SECRET_REF') ?? 'vault:11b03308-fb19-461a-b999-3e0205de494c'
const ORG = 'a0000000-0000-0000-0000-000000000001'
const CLINIC_FALLBACK = 'c0000000-0000-0000-0000-000000000001'

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

async function segredoDoCofre(nome: string): Promise<string> {
  const r = await sb('/rest/v1/rpc/_edge_read_secret_by_name', {
    method: 'POST',
    body: JSON.stringify({ p_name: nome }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function readSecret(): Promise<string> {
  const r = await sb('/rest/v1/rpc/_edge_read_secret', {
    method: 'POST',
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
  if (!r.ok) throw new Error(`segredo: ${r.status} ${await r.text()}`)
  return String(await r.json()).trim()
}

async function ceGet(path: string, token: string) {
  const r = await fetch(`${CE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'PS-CRM/1.0 (+integracao-interna)',
    },
  })
  if (!r.ok) throw new Error(`CE ${path} -> ${r.status} ${(await r.text()).slice(0, 250)}`)
  return await r.json()
}

async function mapVendedores(): Promise<Record<string, string>> {
  const r = await sb(
    '/rest/v1/integration_mappings?select=expert_ref,clinic_id&kind=eq.vendedor_clinica&is_draft=eq.false',
  )
  if (!r.ok) return {}
  const rows = (await r.json()) as { expert_ref: string; clinic_id: string }[]
  const m: Record<string, string> = {}
  for (const x of rows) if (x.clinic_id) m[x.expert_ref] = x.clinic_id
  return m
}

function janelaMes(ano: number, m: number): [string, string] {
  const mm = String(m).padStart(2, '0')
  const dd = String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, '0')
  return [`${ano}-${mm}-01T00:00:00-03:00`, `${ano}-${mm}-${dd}T23:59:59-03:00`]
}

function toRow(s: any, mapa: Record<string, string>) {
  const seller = s.seller?.uuid ?? s.seller_uuid ?? null
  const clinic = (seller && mapa[seller]) || CLINIC_FALLBACK
  const buyer = s.buyer ?? s.patient ?? null
  return {
    organization_id: ORG,
    clinic_id: clinic,
    expert_uuid: s.uuid,
    sale_type: s.type ?? s.sale_type ?? null,
    status: s.status ?? null,
    sale_date: s.date ?? s.sale_date ?? s.created_at ?? null,
    buyer_expert_uuid: buyer?.uuid ?? s.buyer_uuid ?? null,
    buyer_name: buyer?.name ?? s.buyer_name ?? null,
    buyer_phone_e164: buyer?.phone ?? null,
    seller_expert_uuid: seller,
    items_json: s.items ?? [],
    final_amount_cents: Math.round(
      Number(s.final_amount ?? s.amount ?? 0) *
        (String(s.final_amount ?? '').includes('.') ? 100 : 1),
    ),
    discount_cents: Math.round(
      Number(s.discount_amount ?? 0) * (String(s.discount_amount ?? '').includes('.') ? 100 : 1),
    ),
    generate_credits: Boolean(s.generate_credits ?? false),
    synced_at: new Date().toISOString(),
  }
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  const esperado = await segredoDoCofre('INTERNAL_JOB_SECRET')
  const enviado = req.headers.get('x-internal-job') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!esperado || !(iguais(enviado, esperado) || iguais(bearer, esperado))) {
    return json({ code: 'UNAUTHORIZED', message: 'Segredo interno inválido ou ausente' }, 401)
  }

  try {
    const token = await readSecret()
    const mapa = await mapVendedores()

    const url = new URL(req.url)
    const de = url.searchParams.get('de') ?? '2026-09'
    const ate = url.searchParams.get('ate') ?? '2026-11'
    const [anoDe, mesDe] = de.split('-').map(Number)
    const [anoAte, mesAte] = ate.split('-').map(Number)

    const vistos = new Set<string>()
    let gravados = 0
    const janelas: string[] = []

    for (let a = anoDe, m = mesDe; a < anoAte || (a === anoAte && m <= mesAte); ) {
      const [ini, fim] = janelaMes(a, m)
      let page = 1
      let last = 1
      let of = 0
      do {
        const j = await ceGet(`/sales?starts_at=${ini}&ends_at=${fim}&page=${page}`, token)
        of = j.meta?.of ?? 0
        last = j.meta?.last_page ?? 1
        const rows = (j.data ?? [])
          .map((s: any) => toRow(s, mapa))
          .filter((r: any) => !vistos.has(r.expert_uuid))
        for (const r of rows) vistos.add(r.expert_uuid)

        for (let i = 0; i < rows.length; i += 200) {
          const lote = rows.slice(i, i + 200)
          if (!lote.length) continue
          const up = await sb('/rest/v1/sales_mirror?on_conflict=organization_id,expert_uuid', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(lote),
          })
          if (!up.ok) throw new Error(`upsert: ${up.status} ${(await up.text()).slice(0, 300)}`)
          gravados += lote.length
        }
        page++
      } while (page <= last)
      janelas.push(`${a}-${String(m).padStart(2, '0')}: api_of=${of}`)
      m++
      if (m > 12) {
        m = 1
        a++
      }
    }

    await sb('/rest/v1/sync_cursors?resource=eq.sales', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'ok',
        last_success_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        last_error: null,
      }),
    })

    return json({ ok: true, gravados, janelas })
  } catch (e) {
    await sb('/rest/v1/sync_cursors?resource=eq.sales', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'falha',
        last_attempt_at: new Date().toISOString(),
        last_error: String(e).slice(0, 300),
      }),
    })
    return json({ ok: false, erro: String(e) }, 500)
  }
})
