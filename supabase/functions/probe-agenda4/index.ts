// probe 4: inventariar procedimentos com profissionais e testar casamento por nome
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'

async function readSecret() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
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
  const t = await r.text()
  try {
    return { status: r.status, body: JSON.parse(t) }
  } catch {
    return { status: r.status, body: { raw: t.slice(0, 300) } }
  }
}
const norm = (s: string) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

Deno.serve(async () => {
  const token = await readSecret()
  const procs: any[] = []
  let page = 1,
    last = 1
  do {
    const r = await ceGet(`/procedures?per_page=100&page=${page}`, token)
    const b: any = r.body
    procs.push(...(b.data ?? []))
    last = b.meta?.last_page ?? 1
    page++
  } while (page <= last)

  const profs: any[] = []
  page = 1
  last = 1
  do {
    const r = await ceGet(`/professionals?per_page=100&page=${page}`, token)
    const b: any = r.body
    profs.push(...(b.data ?? []))
    last = b.meta?.last_page ?? 1
    page++
  } while (page <= last)

  const porNome = new Map<string, any[]>()
  for (const p of profs) {
    const k = norm(p.name)
    if (!porNome.has(k)) porNome.set(k, [])
    porNome.get(k)!.push(p)
  }

  const comProf = procs.filter((p) => Array.isArray(p.professionals) && p.professionals.length > 0)
  const linhas: any[] = []
  for (const p of comProf) {
    for (const pr of p.professionals) {
      const cands = porNome.get(norm(pr.name)) ?? []
      linhas.push({
        proc_id: p.id,
        proc: p.name,
        duracao: p.duration,
        prof_id_numerico: pr.id,
        prof_nome: pr.name,
        casou: cands.length,
        uuids: cands.map((c: any) => c.uuid),
      })
    }
  }

  return new Response(
    JSON.stringify(
      {
        total_procedimentos: procs.length,
        total_profissionais: profs.length,
        procedimentos_com_profissional: comProf.length,
        vinculos: linhas.length,
        ambiguos: linhas.filter((l) => l.casou !== 1).length,
        detalhe: linhas,
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
