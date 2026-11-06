// scheduling-context — P3-S04 (T01/T02)
// Lê horários do Clínica Experts. SOMENTE GET: a lista expert_allowed_operations()
// é conferida ANTES de cada fetch; rota fora dela -> 403 sem sair da rede.
// CORS + OPTIONS: sem isso o navegador falha no pré-voo (visto em 04/11/2026).
const SB = Deno.env.get('SUPABASE_URL')!
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET = Deno.env.get('CE_SECRET_REF') ?? 'vault:11b03308-fb19-461a-b999-3e0205de494c'
const MAX = 20
const MEM_MS = 120000
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
const sb = (p: string, init: RequestInit = {}) =>
  fetch(SB + p, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
async function secret(): Promise<string> {
  const r = await sb('/rest/v1/rpc/_edge_read_secret', {
    method: 'POST',
    body: JSON.stringify({ p_secret_ref: SECRET }),
  })
  if (!r.ok) throw new Error('segredo: ' + r.status)
  return String(await r.json()).trim()
}
let permitidas: Set<string> | null = null
async function lista(): Promise<Set<string>> {
  if (permitidas) return permitidas
  const r = await sb('/rest/v1/rpc/expert_allowed_operations', { method: 'POST', body: '{}' })
  if (!r.ok) throw new Error('lista: ' + r.status)
  const linhas = (await r.json()) as { method: string; path: string }[]
  permitidas = new Set(linhas.map((l) => `${l.method} ${l.path}`))
  return permitidas
}
const memoria = new Map<string, { em: number; horas: string[] }>()
function ler(chave: string): string[] | null {
  const v = memoria.get(chave)
  if (!v) return null
  if (Date.now() - v.em > MEM_MS) { memoria.delete(chave); return null }
  return v.horas
}
async function get(token: string, rota: string, q: Record<string, string>, c: { n: number }) {
  const ok = await lista()
  if (!ok.has('GET ' + rota)) throw new Error('operacao_nao_permitida: GET ' + rota)
  if (++c.n > MAX) throw new Error('limite_de_chamadas: este pedido ja usou 20 chamadas')
  const qs = new URLSearchParams(q).toString()
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 10000)
  try {
    const r = await fetch(`${CE}${rota}${qs ? '?' + qs : ''}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'PS-CRM/1.0 (+integracao-interna)',
      },
      signal: ctl.signal,
    })
    const txt = await r.text()
    let corpo: any = {}
    try { corpo = txt ? JSON.parse(txt) : {} } catch { corpo = {} }
    if (!r.ok) throw new Error(`API ${r.status} ${corpo?.error?.code ?? ''}`.trim())
    return corpo
  } finally { clearTimeout(t) }
}
const norm = (s: string) =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const u = new URL(req.url)
  const acao = u.searchParams.get('acao') ?? 'horarios'
  try {
    const token = await secret()

    if (acao === 'carregar-relacao') {
      const clinic = u.searchParams.get('clinic')
      if (!clinic) throw new Error('informe ?clinic=')
      const c = { n: 0 }
      const procs: any[] = []
      let pg = 1, last = 1
      do {
        const b: any = await get(token, '/procedures', { per_page: '100', page: String(pg) }, c)
        procs.push(...(Array.isArray(b?.data) ? b.data : []))
        last = Number(b?.meta?.last_page ?? 1); pg++
      } while (pg <= last)
      const profs: any[] = []
      pg = 1; last = 1
      do {
        const b: any = await get(token, '/professionals', { per_page: '100', page: String(pg) }, c)
        profs.push(...(Array.isArray(b?.data) ? b.data : []))
        last = Number(b?.meta?.last_page ?? 1); pg++
      } while (pg <= last)
      const porNome = new Map<string, any[]>()
      for (const p of profs) {
        const k = norm(p.name)
        porNome.set(k, [...(porNome.get(k) ?? []), p])
      }
      const linhas: any[] = [], amb: any[] = []
      for (const proc of procs) {
        for (const pr of proc.professionals ?? []) {
          const cand = porNome.get(norm(pr.name)) ?? []
          if (cand.length === 1) {
            linhas.push({
              procedure_expert_id: proc.id,
              professional_expert_uuid: cand[0].uuid,
              professional_name: cand[0].name,
              professional_expert_id: pr.id,
              source: 'api',
              is_draft: false,
            })
          } else {
            amb.push({ procedure_expert_id: proc.id, nome: pr.name, candidatos: cand.length })
          }
        }
      }
      const s = await sb('/rest/v1/rpc/save_procedure_professionals', {
        method: 'POST',
        body: JSON.stringify({ p_clinic: clinic, p_linhas: linhas }),
      })
      if (!s.ok) throw new Error('gravacao: ' + s.status + ' ' + (await s.text()))
      return json({
        ok: true, procedimentos: procs.length, profissionais: profs.length,
        com_profissional: procs.filter((p) => (p.professionals ?? []).length > 0).length,
        vinculos: linhas.length, ambiguos: amb, chamadas: c.n,
      })
    }

    // acao=horarios
    const clinic = u.searchParams.get('clinic')
    const proc = u.searchParams.get('procedure')
    const dias = Math.max(1, Math.min(Number(u.searchParams.get('dias') ?? '1'), 7))
    if (!clinic || !proc) throw new Error('informe ?clinic=&procedure=')
    const ctxR = await sb('/rest/v1/rpc/get_scheduling_context', {
      method: 'POST',
      body: JSON.stringify({ p_clinic: clinic, p_procedure_expert_id: Number(proc) }),
    })
    if (!ctxR.ok) throw new Error('contexto: ' + ctxR.status + ' ' + (await ctxR.text()))
    const ctx = await ctxR.json()
    if (!ctx.tem_vinculo) {
      return json({
        ok: true, tem_vinculo: false,
        aviso: 'Este procedimento ainda não tem profissional relacionado. Escolha um dos profissionais da clínica ou cadastre a relação.',
        procedimento: ctx.procedure, professionals: [],
        alternatives: ctx.professionals_da_clinica, dias: [], chamadas: 0,
      })
    }
    const c = { n: 0 }
    const alvos: string[] = []
    for (let i = 0; i < dias; i++) {
      const d = new Date(); d.setDate(d.getDate() + i)
      alvos.push(d.toISOString().slice(0, 10))
    }
    const total = (ctx.professionals as any[]).length * alvos.length
    const saida: any[] = []
    for (const dia of alvos) {
      const noDia: any[] = []
      for (const p of ctx.professionals as any[]) {
        const k = p.expert_uuid + '|' + dia
        let horas = ler(k)
        const cache = horas !== null
        if (!horas) {
          if (c.n >= MAX) {
            noDia.push({
              professional: p, horas: [], erro: 'limite_de_chamadas',
              mensagem: 'Este pedido atingiu o limite de 20 consultas. Peça o próximo dia.',
            })
            continue
          }
          const b: any = await get(token, '/available-hours', {
            professional_uuid: p.expert_uuid, date: dia,
            procedure_id: String(proc),
            interval: String(ctx.procedure?.duration_efetiva_min ?? 30),
          }, c)
          horas = (Array.isArray(b?.data) ? b.data : []).filter((h: unknown) => typeof h === 'string')
          memoria.set(k, { em: Date.now(), horas: horas as string[] })
        }
        noDia.push({ professional: p, horas, de_memoria: cache })
      }
      saida.push({ dia, profissionais: noDia })
    }
    return json({
      ok: true, tem_vinculo: true, procedimento: ctx.procedure,
      default_interval_min: ctx.default_interval_min,
      default_is_draft: ctx.default_is_draft,
      bloqueado_por_limite: total > MAX,
      dias: saida, chamadas: c.n, limite_chamadas: MAX,
    })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    const bloqueio = msg.startsWith('operacao_nao_permitida')
    return json({ ok: false, erro: msg, bloqueado: bloqueio }, bloqueio ? 403 : 500)
  }
})
