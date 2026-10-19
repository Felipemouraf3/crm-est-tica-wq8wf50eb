// supabase/functions/_shared/providers/expert-search.ts — P2-S02-T02
// Busca em duas etapas na API Clínica Experts (SPEC P2-S02):
//   (a) GET /patients?phone=<E.164 sem +>&per_page=10
//   (b) se zero E o número tem 9º dígito: GET /patients?phone=<últimos 8>&per_page=50,
//       filtrando localmente pelo mesmo DDD (números antigos sem o 9º dígito)
// Classificação: (a)=1 → um · (a)>=2 → multiplos · (b)>=1 (mesmo DDD) → provavel · nada → zero.
// Candidatos: leitor mínimo + birth_masked (**/**/AAAA). Múltiplos NUNCA são escolhidos aqui.
import { expertGet, lerPacienteMinimo, type ExpertPatientMin } from './clinica-experts.ts'

export type ClasseBusca = 'um' | 'multiplos' | 'provavel' | 'zero'
export type Candidato = ExpertPatientMin & { birth_masked: string | null }

export type HttpGetFn = (
  caminho: string,
  query: Record<string, string>,
) => Promise<{ status: number; data: unknown }>

export type BudgetLocal = { take: () => number; marcar: () => void }

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Máscara do nascimento para a tela: ** / ** / 1990 (nunca dia/mês inteiros). */
export function mascararNascimento(birth: string | null): string | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null
  return `**/**/${birth.slice(0, 4)}`
}

/** DDD de um E.164 BR (+55DD...); não-BR: 2 dígitos após o DDI. */
export function dddDe(e164: string): string | null {
  const m = /^\+55(\d{2})/.exec(e164)
  if (m) return m[1]
  const m2 = /^\+\d{2}(\d{2})/.exec(e164)
  return m2 ? m2[1] : null
}

/**
 * Budget local parametrizável (mesma lógica do rateBudget do cliente T01,
 * com janela compressível para testes de carga). Uso padrão: 90/min, 60 s.
 */
export function criarBudgetLocal(porMinuto = 90, janelaMs = 60_000): BudgetLocal {
  const stamps: number[] = []
  return {
    take(): number {
      const agora = Date.now()
      while (stamps.length && agora - stamps[0] > janelaMs) stamps.shift()
      if (stamps.length >= porMinuto) return janelaMs - (agora - stamps[0]) + 5
      return 0
    },
    marcar() {
      stamps.push(Date.now())
    },
  }
}

export type ResultadoBusca = {
  result_class: ClasseBusca
  phone_e164: string
  candidatos: Candidato[]
  etapas: { a: boolean; b: boolean } // quais etapas foram à API
  telemetria: Record<string, unknown>
}

/**
 * Busca em duas etapas. `opcoes.httpGet`/`opcoes.budget` permitem testar sem rede
 * (padrão: expertGet do cliente T01 + rateBudget global 90/min).
 */
export async function buscarEmDuasEtapas(
  baseUrl: string,
  token: string,
  phoneE164: string,
  opcoes: Record<string, any> = {},
): Promise<ResultadoBusca> {
  const correlationId = opcoes.correlationId ?? crypto.randomUUID()
  const httpGet: HttpGetFn =
    opcoes.httpGet ??
    ((caminho, query) =>
      expertGet(baseUrl, token, caminho, query, {
        connectionId: opcoes.connectionId ?? 'principal',
        correlationId,
      }).then((r) => ({ status: r.status, data: r.data })))
  const budget: BudgetLocal | null = opcoes.budget ?? null

  const chamar = async (caminho: string, query: Record<string, string>) => {
    if (budget) {
      const espera = budget.take()
      if (espera > 0) await dormir(espera)
      budget.marcar()
    }
    return httpGet(caminho, query)
  }

  const paraCandidatos = (lista: unknown[]): Candidato[] =>
    lista
      .map((p) => lerPacienteMinimo(p as Record<string, unknown>))
      .filter((p): p is ExpertPatientMin => p !== null)
      .map((p) => ({ ...p, birth_masked: mascararNascimento(p.birth_date) }))

  const extrairLista = (data: unknown): unknown[] => {
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object' && Array.isArray((data as any).data))
      return (data as any).data
    return []
  }

  // ---------- Etapa (a): E.164 sem o "+" ----------
  const digitos = phoneE164.replace(/\D/g, '')
  const ra = await chamar('patients', { phone: digitos, per_page: '10' })
  if (ra.status === 429) {
    const e: any = new Error('Limite de taxa da API atingido (429).')
    e.code = 'limite_externo'
    e.correlationId = correlationId
    throw e
  }
  const pacientesA = paraCandidatos(extrairLista(ra.data))

  if (pacientesA.length === 1) {
    return {
      result_class: 'um',
      phone_e164: phoneE164,
      candidatos: pacientesA,
      etapas: { a: true, b: false },
      telemetria: { etapas: 1, correlation_id: correlationId },
    }
  }
  if (pacientesA.length >= 2) {
    return {
      result_class: 'multiplos',
      phone_e164: phoneE164,
      candidatos: pacientesA,
      etapas: { a: true, b: false },
      telemetria: { etapas: 1, correlation_id: correlationId },
    }
  }

  // ---------- Etapa (b): zero resultados e número tem 9º dígito ----------
  const temNonoDigito = /^\+55\d{11}$/.test(phoneE164) // 55 + DDD(2) + 9 dígitos
  if (!temNonoDigito) {
    return {
      result_class: 'zero',
      phone_e164: phoneE164,
      candidatos: [],
      etapas: { a: true, b: false },
      telemetria: { etapas: 1, correlation_id: correlationId },
    }
  }

  const ultimos8 = digitos.slice(-8)
  const rb = await chamar('patients', { phone: ultimos8, per_page: '50' })
  if (rb.status === 429) {
    const e: any = new Error('Limite de taxa da API atingido (429).')
    e.code = 'limite_externo'
    e.correlationId = correlationId
    throw e
  }
  const ddd = dddDe(phoneE164)
  const mesmoDdd = paraCandidatos(extrairLista(rb.data)).filter(
    (p) => p.phone_e164 && dddDe(p.phone_e164) === ddd,
  )

  if (mesmoDdd.length >= 1) {
    return {
      result_class: 'provavel',
      phone_e164: phoneE164,
      candidatos: mesmoDdd,
      etapas: { a: true, b: true },
      telemetria: { etapas: 2, correlation_id: correlationId },
    }
  }
  return {
    result_class: 'zero',
    phone_e164: phoneE164,
    candidatos: [],
    etapas: { a: true, b: true },
    telemetria: { etapas: 2, correlation_id: correlationId },
  }
}
