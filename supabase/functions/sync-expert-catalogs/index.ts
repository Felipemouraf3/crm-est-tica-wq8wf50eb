// sync-expert-catalogs — catálogos do Clínica Experts (04/11/2026)
//
// POR QUE EXISTE: profissionais, procedimentos e salas só eram carregados
// MANUALMENTE (última carga 02/11). Um profissional novo não aparecia sozinho e a
// agenda assistida simplesmente não o oferecia, sem avisar.
//
// Autenticação no padrão de 04/11: verify_jwt = false + segredo interno do Vault
// (o pg_cron não manda JWT). Grava o próprio cursor no sucesso E na falha.
//
// AUSENTES: quem a API deixa de devolver fica `active=false` (soft delete, nunca
// DELETE — o histórico de agendamentos aponta para o uuid). A comparação é feita
// pela LISTA DE PRESENTES, não por horário: comparar `synced_at < inicio` desativou
// o catálogo inteiro no primeiro teste, porque o relógio da Edge estava atrás do banco.
// E carga vazia não desativa nada (trava contra API fora do ar).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CE_BASE = 'https://api.clinicaexperts.com.br/api/v1'
const SECRET_REF = Deno.env.get('CE_SECRET_REF') ?? 'vault:11b03308-fb19-461a-b999-3e0205de494c'
const ORG = 'a0000000-0000-0000-0000-000000000001'

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

async function todasAsPaginas(path: string, token: string): Promise<any[]> {
  const itens: any[] = []
  let page = 1
  let last = 1
  do {
    const j = await ceGet(`${path}?per_page=100&page=${page}`, token)
    if (Array.isArray(j?.data)) itens.push(...j.data)
    last = Number(j?.meta?.last_page ?? 1)
    page++
  } while (page <= last)
  return itens
}

const marcarCursor = (resource: string, ok: boolean, erro?: string) =>
  sb(`/rest/v1/sync_cursors?resource=eq.${resource}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: ok ? 'ok' : 'falha',
      ...(ok
        ? { last_success_at: new Date().toISOString(), last_error: null }
        : { last_error: String(erro ?? '').slice(0, 300) }),
      last_attempt_at: new Date().toISOString(),
    }),
  })

/** Desativa só quem NÃO veio nesta carga. Lista vazia = não mexe em nada. */
async function desativarAusentes(resource: string, presentes: string[]) {
  if (presentes.length === 0) return 0
  const r = await sb('/rest/v1/rpc/desativar_catalogo_ausente', {
    method: 'POST',
    body: JSON.stringify({ p_resource: resource, p_presentes: presentes }),
  })
  if (!r.ok) return null
  return Number(await r.json())
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

  const resultado: Record<string, unknown> = { ok: true }
  const agora = new Date().toISOString()

  try {
    const token = await readSecret()

    // ---------- profissionais ----------
    try {
      const profs = await todasAsPaginas('/professionals', token)
      const validos = profs.filter((p) => typeof p?.uuid === 'string')
      const linhas = validos.map((p) => ({
        organization_id: ORG,
        expert_uuid: p.uuid,
        name: String(p.name ?? '').trim() || p.uuid,
        active: p.active !== false,
        synced_at: agora,
      }))
      const up = await sb(
        '/rest/v1/expert_professionals_cache?on_conflict=organization_id,expert_uuid',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(linhas),
        },
      )
      if (!up.ok) throw new Error(`upsert: ${up.status} ${(await up.text()).slice(0, 200)}`)
      const presentes = validos.map((p) => String(p.uuid))
      const desativados = await desativarAusentes('professionals', presentes)
      await marcarCursor('professionals', true)
      resultado.profissionais = linhas.length
      resultado.profissionais_desativados = desativados
    } catch (e) {
      await marcarCursor('professionals', false, String(e))
      resultado.profissionais_erro = String(e)
    }

    // ---------- procedimentos ----------
    try {
      const procs = await todasAsPaginas('/procedures', token)
      const validos = procs.filter((p) => Number.isFinite(Number(p?.id)))
      const linhas = validos.map((p) => ({
        organization_id: ORG,
        expert_id: Number(p.id),
        name: String(p.name ?? '').trim() || String(p.id),
        duration_min: Number(p.duration ?? 0) || 0,
        // `price` vem em CENTAVOS (22000 = R$ 220,00)
        price_cents: Math.round(Number(p.price ?? 0)),
        active: p.active !== false,
        synced_at: agora,
      }))
      const up = await sb(
        '/rest/v1/expert_procedures_cache?on_conflict=organization_id,expert_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(linhas),
        },
      )
      if (!up.ok) throw new Error(`upsert: ${up.status} ${(await up.text()).slice(0, 200)}`)
      const desativados = await desativarAusentes(
        'procedures',
        validos.map((p) => String(p.id)),
      )
      await marcarCursor('procedures', true)
      resultado.procedimentos = linhas.length
      resultado.procedimentos_desativados = desativados
    } catch (e) {
      await marcarCursor('procedures', false, String(e))
      resultado.procedimentos_erro = String(e)
    }

    // ---------- salas ----------
    try {
      const salas = await todasAsPaginas('/rooms', token)
      const validas = salas.filter((r) => Number.isFinite(Number(r?.id)))
      const linhas = validas.map((r) => ({
        organization_id: ORG,
        expert_id: Number(r.id),
        name: String(r.name ?? '').trim() || String(r.id),
        active: r.active !== false,
        synced_at: agora,
      }))
      const up = await sb('/rest/v1/expert_rooms_cache?on_conflict=organization_id,expert_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(linhas),
      })
      if (!up.ok) throw new Error(`upsert: ${up.status} ${(await up.text()).slice(0, 200)}`)
      const desativadas = await desativarAusentes(
        'rooms',
        validas.map((r) => String(r.id)),
      )
      await marcarCursor('rooms', true)
      resultado.salas = linhas.length
      resultado.salas_desativadas = desativadas
    } catch (e) {
      await marcarCursor('rooms', false, String(e))
      resultado.salas_erro = String(e)
    }

    return json(resultado)
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500)
  }
})
