// reconcilia-clinica-experts — P4-S03 (AG-12)
//
// Confere, mês a mês, se a contagem do ESPELHO bate com a CONTAGEM DIRETA na API.
// Divergência NÃO é corrigida sozinha: registra o diff exato e o tipo
// (missing / extra / source_unavailable). Só o re-sync corrige — e se persistir,
// escala para dead-letter.
//
// A comparação usa a MESMA janela nos dois lados (fuso da clínica), porque comparar
// períodos diferentes é a forma mais fácil de "achar" uma divergência que não existe.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = 'vault:11b03308-fb19-461a-b999-3e0205de494c'
const CLINIC = 'c0000000-0000-0000-0000-000000000001'

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

async function segredo(): Promise<string> {
  const r = await sb('/rest/v1/rpc/_edge_read_secret', {
    method: 'POST',
    body: JSON.stringify({ p_secret_ref: SECRET_REF }),
  })
  if (!r.ok) throw new Error(`segredo ${r.status}`)
  return String(await r.json()).trim()
}

async function ceGet(path: string, token: string) {
  const r = await fetch(`${CE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'PS-CRM/1.0' },
  })
  if (!r.ok) throw new Error(`CE ${path} -> ${r.status}`)
  return await r.json()
}

function janela(ano: number, mes: number) {
  const mm = String(mes).padStart(2, '0')
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const dd = String(ultimo).padStart(2, '0')
  return {
    inicio: `${ano}-${mm}-01`,
    fim: `${ano}-${mm}-${dd}`,
    isoIni: `${ano}-${mm}-01T00:00:00-03:00`,
    isoFim: `${ano}-${mm}-${dd}T23:59:59-03:00`,
  }
}

async function contarNaFonte(rota: 'bookings' | 'sales', isoIni: string, isoFim: string, token: string) {
  let page = 1
  let last = 1
  let total = 0
  const vistos = new Set<string>()
  do {
    const j = await ceGet(`${'/' + rota}?starts_at=${isoIni}&ends_at=${isoFim}&page=${page}&per_page=100`, token)
    last = Number(j?.meta?.last_page ?? 1)
    for (const item of (j.data ?? [])) {
      const id = String(item?.uuid ?? '')
      if (id && !vistos.has(id)) {
        vistos.add(id)
        total++
      }
    }
    page++
  } while (page <= last)
  return total
}

Deno.serve(async () => {
  const out: Record<string, unknown> = {}
  let token = ''
  try {
    token = await segredo()
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500 })
  }

  const agora = new Date()
  // confere o mês atual e o anterior
  const alvos = [0, -1].map((delta) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() + delta, 1)
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 }
  })

  const resultados: unknown[] = []

  for (const alvo of alvos) {
    const w = janela(alvo.ano, alvo.mes)

    for (const recurso of ['bookings', 'sales'] as const) {
      // contagem no espelho
      const rm = await sb('/rest/v1/rpc/reconciliation_mirror_count', {
        method: 'POST',
        body: JSON.stringify({ p_clinic: CLINIC, p_resource: recurso, p_start: w.inicio, p_end: w.fim }),
      })
      const espelho = rm.ok ? Number(await rm.json()) : 0

      // contagem na fonte
      let fonte: number | null = null
      let erroFonte: string | null = null
      try {
        fonte = await contarNaFonte(recurso, w.isoIni, w.isoFim, token)
      } catch (e) {
        erroFonte = String(e).slice(0, 200)
      }

      // registra
      const rr = await sb('/rest/v1/rpc/reconciliation_register', {
        method: 'POST',
        body: JSON.stringify({
          p_clinic: CLINIC,
          p_resource: recurso,
          p_period_start: w.inicio,
          p_period_end: w.fim,
          p_mirror_count: espelho,
          p_source_count: fonte,
          p_detail: { erro_fonte: erroFonte, janela: w },
        }),
      })
      const reg = rr.ok ? await rr.json() : { erro: await rr.text() }
      resultados.push({ recurso, periodo: `${w.inicio}..${w.fim}`, espelho, fonte, ...reg })
    }
  }

  return new Response(JSON.stringify({ ok: true, conferencias: resultados }, null, 1),
    { headers: { 'Content-Type': 'application/json' } })
})
