// supabase/functions/_shared/providers/clinica-experts.ts — P2-S02-T01
// Cliente HTTP da conexão REAL com a API Clínica Experts (contrato P2-S02).
// User-Agent próprio, classificação de erros, rateBudget, telemetria sanitizada.
export const EXPERT_USER_AGENT = 'PSEstetica-CRM/1.0 (+supabase-edge)'
export const EXPERT_BASE_URL_DEFAULT = 'https://api.clinicaexperts.com.br/api/v1'

const BUDGET_POR_MIN = 90
const REstanteMin = 10
const TIMEOUT_MS = 10_000
const MAX_TENTATIVAS = 3
const BACKOFF_MS = 500

export class ErroOperacional extends Error {
  code: string
  correlationId: string
  detalhe: Record<string, unknown>
  constructor(code: string, mensagem: string, correlationId: string, detalhe: Record<string, unknown> = {}) {
    super(mensagem)
    this.name = 'ErroOperacional'
    this.code = code
    this.correlationId = correlationId
    this.detalhe = detalhe
  }
}

type Budget = { stamps: number[]; restanteServidor: number | null; virada: number | null }
const budgets = new Map<string, Budget>()

export function resetRateBudget() {
  budgets.clear()
}

export const rateBudget = {
  take(connectionId: string): number {
    const agora = Date.now()
    let b = budgets.get(connectionId)
    if (!b) {
      b = { stamps: [], restanteServidor: null, virada: null }
      budgets.set(connectionId, b)
    }
    while (b.stamps.length && agora - b.stamps[0] > 60_000) b.stamps.shift()
    if (b.stamps.length >= BUDGET_POR_MIN) {
      return 60_000 - (agora - b.stamps[0]) + 5
    }
    if (b.restanteServidor !== null && b.restanteServidor < REstanteMin && b.virada) {
      const espera = Math.max(0, b.virada - agora)
      if (espera > 0) return espera
    }
    b.stamps.push(agora)
    return 0
  },
  updateFromHeaders(connectionId: string, headers: Headers) {
    const b = budgets.get(connectionId) ?? { stamps: [], restanteServidor: null, virada: null }
    const limite = Number(headers.get('x-ratelimit-limit'))
    const restante = Number(headers.get('x-ratelimit-remaining'))
    if (!Number.isNaN(limite) && !Number.isNaN(restante)) {
      b.restanteServidor = restante
      b.virada = Date.now() + 60_000 * (1 - (limite - restante) / Math.max(limite, 1))
      budgets.set(connectionId, b)
    }
  },
}

export type CorpoErro = {
  error?: { code?: string; title?: string; fields?: unknown } | string
  success?: boolean
  message?: string
  cloudflare_error?: boolean
  code?: string | number
}

export function classifyExpertError(status: number, corpo: CorpoErro): string {
  const err = corpo?.error
  if (corpo?.cloudflare_error === true) return 'bloqueio_de_borda'
  if (status === 401) return 'credencial_invalida'
  if (status === 403) {
    if (typeof err === 'string' && /feature/i.test(err)) return 'modulo_desabilitado'
    return 'bloqueio_de_borda'
  }
  if (status === 404) return 'paciente_nao_encontrado'
  if (status === 422) return 'entrada_recusada'
  if (status === 429) return 'limite_externo'
  if (status >= 500) return 'falha_transitoria'
  return 'falha_externa'
}

export function httpDeErro(code: string): number {
  switch (code) {
    case 'paciente_nao_encontrado':
      return 404
    case 'entrada_recusada':
      return 400
    case 'modulo_desabilitado':
      return 503
    case 'limite_externo':
      return 503
    case 'tempo_esgotado':
      return 504
    default:
      return 502
  }
}

const RETENTAVEIS = new Set(['limite_externo', 'falha_transitoria', 'tempo_esgotado'])

export type ExpertGetResult = {
  status: number
  data: unknown
  meta: unknown
  headers: Headers
  telemetria: { status: string; duracao_ms: number; tentativas: number; correlation_id: string }
}

export async function expertGet(
  baseUrl: string,
  token: string,
  caminho: string,
  query: Record<string, string> = {},
  opcoes: Record<string, unknown> = {},
): Promise<ExpertGetResult> {
  if (!baseUrl || !token) {
    throw new ErroOperacional('credencial_invalida', 'Conexão não configurada (base ou token ausente).', opcoes.correlationId ?? '-')
  }
  const connectionId = (opcoes.connectionId as string) ?? 'principal'
  const correlationId = (opcoes.correlationId as string) ?? crypto.randomUUID()
  const timeoutMs = (opcoes.timeoutMs as number) ?? TIMEOUT_MS
  const maxTentativas = (opcoes.maxTentativas as number) ?? MAX_TENTATIVAS
  const t0 = Date.now()
  let tentativa = 0

  while (tentativa < maxTentativas) {
    tentativa++
    const espera = rateBudget.take(connectionId)
    if (espera > 0) {
      await new Promise((r) => setTimeout(r, Math.min(espera, 5_000)))
      tentativa--
      continue
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const qs = new URLSearchParams(query).toString()
      const resp = await fetch(
        `${baseUrl.replace(/\/$/, '')}/${caminho.replace(/^\//, '')}${qs ? `?${qs}` : ''}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'User-Agent': EXPERT_USER_AGENT,
            'x-correlation-id': correlationId,
          },
          signal: controller.signal,
        },
      )
      clearTimeout(timer)
      rateBudget.updateFromHeaders(connectionId, resp.headers)

      const texto = await resp.text()
      let corpo: CorpoErro & { data?: unknown; meta?: unknown } = {}
      try {
        corpo = texto ? JSON.parse(texto) : {}
      } catch {
        corpo = {}
      }

      if (resp.ok) {
        return {
          status: resp.status,
          data: corpo.data ?? corpo,
          meta: corpo.meta ?? null,
          headers: resp.headers,
          telemetria: { status: 'ok', duracao_ms: Date.now() - t0, tentativas: tentativa, correlation_id: correlationId },
        }
      }

      const code = classifyExpertError(resp.status, corpo)
      if (!RETENTAVEIS.has(code) || tentativa >= maxTentativas) {
        throw new ErroOperacional(code, mensagemDe(code, resp.status), correlationId, {
          http_status: resp.status,
          fields: (corpo?.error as { fields?: unknown })?.fields ?? undefined,
        })
      }
      await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** (tentativa - 1)))
    } catch (e: unknown) {
      clearTimeout(timer)
      if (e instanceof ErroOperacional) throw e
      const nome = (e as { name?: string })?.name ?? ''
      if (nome === 'AbortError') {
        if (tentativa >= maxTentativas) {
          throw new ErroOperacional('tempo_esgotado', `Tempo esgotado após ${timeoutMs} ms.`, correlationId)
        }
        await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** (tentativa - 1)))
        continue
      }
      if (tentativa >= maxTentativas) {
        throw new ErroOperacional('falha_transitoria', 'Falha de rede ao contatar a API.', correlationId)
      }
      await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** (tentativa - 1)))
    }
  }
  throw new ErroOperacional('falha_transitoria', 'Falha após esgotar as tentativas.', correlationId)
}

function mensagemDe(code: string, httpStatus: number): string {
  switch (code) {
    case 'credencial_invalida':
      return 'Credencial rejeitada pela API (401).'
    case 'bloqueio_de_borda':
      return 'Acesso bloqueado pela borda da API (verificar User-Agent/assinatura).'
    case 'modulo_desabilitado':
      return 'Módulo desabilitado na API Clínica Experts.'
    case 'paciente_nao_encontrado':
      return 'Paciente não encontrado (404 API0011).'
    case 'entrada_recusada':
      return 'Entrada recusada pela API (422 API0422).'
    case 'limite_externo':
      return 'Limite de taxa da API atingido (429).'
    case 'falha_transitoria':
      return `Serviço externo indisponível (HTTP ${httpStatus}).`
    default:
      return `Resposta inesperada da API (HTTP ${httpStatus}).`
  }
}

export type ExpertPatientMin = {
  expert_patient_uuid: string
  name: string
  phone_e164: string | null
  birth_date: string | null
  active: boolean
  source_created_at: string
}

export function lerPacienteMinimo(bruto: Record<string, unknown>): ExpertPatientMin | null {
  const uuid = typeof bruto?.id === 'string' ? bruto.id : typeof bruto?.uuid === 'string' ? bruto.uuid : null
  if (!uuid) return null
  return {
    expert_patient_uuid: uuid,
    name: typeof bruto?.name === 'string' ? bruto.name : '',
    phone_e164: typeof bruto?.phone === 'string' ? bruto.phone : null,
    // A API v1 devolve `date_birth` (confirmado na doc oficial e na resposta real);
    // `birth_date` fica como tolerância para variações.
    birth_date:
      typeof bruto?.date_birth === 'string'
        ? bruto.date_birth
        : typeof bruto?.birth_date === 'string'
          ? bruto.birth_date
          : null,
    active: bruto?.active !== false,
    source_created_at: typeof bruto?.created_at === 'string' ? bruto.created_at : '',
  }
}
