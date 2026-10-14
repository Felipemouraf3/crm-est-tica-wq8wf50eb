// Cliente server-side HTTP — API Clínica Experts (P1-S05-T01)
// SPEC: P1-S05-clinica-experts-paciente
// Recorte: timeout, rate limiter, retry/backoff para transitórios
//          e telemetria sanitizada (token NUNCA sai daqui).
// Compatível com Node/Deno/Web (fetch padrão) — usado pela Edge
// Function `search-expert-patient` (T02).
// (TS no repositório; conteúdo idêntico ao módulo aceito nos runners)

const LIMITE_REQ = 120 // contrato da API: até 120 req/min
const JANELA_MS = 60_000 // janela deslizante de 1 minuto
const TIMEOUT_MS = 10_000 // timeout por tentativa
const MAX_TENTATIVAS = 3 // retry limitado para transitórios
const BACKOFF_MS = 500 // base do backoff exponencial

// Rate limiter em janela deslizante (por processo/instância server-side)
const janela: any[] = []
export function resetRateLimiter() {
  janela.length = 0
}
export function usoAtual() {
  return janela.length
}

export class ErroOperacional extends Error {
  tipo: string
  detalhe: Record<string, unknown>
  constructor(tipo: string, mensagem: string, detalhe: Record<string, unknown> = {}) {
    super(mensagem)
    this.name = 'ErroOperacional'
    this.tipo = tipo
    this.detalhe = detalhe
  }
}

function registroTelemetria(
  status: string,
  duracaoMs: number,
  tentativas: number,
  extra: Record<string, unknown> = {},
) {
  // telemetria SANITIZADA: nunca inclui token, segredo ou payload bruto
  return { status, duracao_ms: duracaoMs, tentativas, ...extra }
}

async function dormir(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function aguardarJanela(): number {
  const agora = Date.now()
  while (janela.length && agora - janela[0] > JANELA_MS) janela.shift()
  if (janela.length >= LIMITE_REQ) {
    const espera = JANELA_MS - (agora - janela[0]) + 5
    return espera
  }
  janela.push(agora)
  return 0
}

/**
 * GET /patients?phone=<E.164> — busca por telefone normalizado.
 * Retorna { resultados: [...], telemetria } — a classificação
 * zero/um/múltiplos é feita pela camada de busca (T02), nunca aqui.
 */
export async function buscarPacientesPorTelefone(
  baseUrl: string,
  token: string,
  telefoneE164: string,
  opcoes: any = {},
) {
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS
  const correlationId = opcoes.correlationId ?? crypto.randomUUID()
  const t0 = Date.now()
  let tentativa = 0
  let ultimoErro: any = null

  if (!baseUrl || !token) {
    throw new ErroOperacional('credencial', 'Cliente não configurado (base ou credencial ausente).')
  }
  if (!/^\+[1-9]\d{7,14}$/.test(telefoneE164 || '')) {
    throw new ErroOperacional('entrada', 'Telefone deve estar em E.164 (ex.: +5581999990000).')
  }

  while (tentativa < MAX_TENTATIVAS) {
    tentativa++
    const espera = aguardarJanela()
    if (espera > 0) {
      await dormir(Math.min(espera, 5_000))
      tentativa-- // espera do limiter NÃO consome tentativa (só retem)
      continue
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(
        `${baseUrl.replace(/\/$/, '')}/patients?phone=${encodeURIComponent(telefoneE164)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`, // token SÓ aqui — nunca em telemetria
            Accept: 'application/json',
          },
          signal: controller.signal,
        },
      )
      clearTimeout(timer)

      if (resp.status === 401) {
        throw new ErroOperacional('credencial', 'Credencial rejeitada pela API (401).', {
          correlation_id: correlationId,
        })
      }
      if (resp.status === 422) {
        throw new ErroOperacional('entrada', 'Entrada rejeitada pela API (422).', {
          correlation_id: correlationId,
        })
      }
      if (resp.status === 404) {
        return {
          resultados: [],
          telemetria: registroTelemetria('ok', Date.now() - t0, tentativa, {
            correlation_id: correlationId,
          }),
        }
      }
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get('retry-after')) || BACKOFF_MS * 2 ** tentativa
        if (tentativa >= MAX_TENTATIVAS) {
          throw new ErroOperacional(
            'rate_limit_externo',
            'Limite de taxa da API atingido (429) após tentativas.',
            { correlation_id: correlationId, retry_after_s: retryAfter },
          )
        }
        await dormir(retryAfter * 1000)
        continue
      }
      if (resp.status >= 500) {
        if (tentativa >= MAX_TENTATIVAS) {
          throw new ErroOperacional(
            'servico',
            'Serviço externo indisponível (erro 5xx) após tentativas.',
            { correlation_id: correlationId },
          )
        }
        await dormir(BACKOFF_MS * 2 ** (tentativa - 1))
        continue
      }
      if (!resp.ok) {
        throw new ErroOperacional('servico', `Resposta inesperada da API (HTTP ${resp.status}).`, {
          correlation_id: correlationId,
        })
      }

      const corpo = await resp.json()
      const resultados = Array.isArray(corpo?.data) ? corpo.data : Array.isArray(corpo) ? corpo : []
      return {
        resultados,
        telemetria: registroTelemetria('ok', Date.now() - t0, tentativa, {
          correlation_id: correlationId,
        }),
      }
    } catch (e: any) {
      clearTimeout(timer)
      if (e instanceof ErroOperacional) throw e
      if (e.name === 'AbortError') {
        if (tentativa >= MAX_TENTATIVAS) {
          throw new ErroOperacional(
            'timeout',
            `Tempo esgotado após ${timeoutMs} ms por tentativa.`,
            { correlation_id: correlationId },
          )
        }
        await dormir(BACKOFF_MS * 2 ** (tentativa - 1))
        continue
      }
      // falha de rede/DNS — transitória
      ultimoErro = e
      if (tentativa >= MAX_TENTATIVAS) {
        throw new ErroOperacional('rede', 'Falha de rede ao contatar a API.', {
          correlation_id: correlationId,
        })
      }
      await dormir(BACKOFF_MS * 2 ** (tentativa - 1))
    }
  }
  throw new ErroOperacional('servico', 'Falha após tentativas.', {
    correlation_id: correlationId,
    origem: ultimoErro?.name,
  })
}

/**
 * GET /patients/{uuid} — detalhe do paciente (uso T02/T03).
 */
export async function obterPacientePorUuid(
  baseUrl: string,
  token: string,
  uuid: string,
  opcoes: any = {},
) {
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS
  const correlationId = opcoes.correlationId ?? crypto.randomUUID()
  const t0 = Date.now()
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid || '')) {
    throw new ErroOperacional('entrada', 'UUID inválido.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/patients/${uuid}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (resp.status === 404)
      return {
        paciente: null,
        telemetria: registroTelemetria('ok', Date.now() - t0, 1, { correlation_id: correlationId }),
      }
    if (resp.status === 401)
      throw new ErroOperacional('credencial', 'Credencial rejeitada pela API (401).', {
        correlation_id: correlationId,
      })
    if (!resp.ok)
      throw new ErroOperacional('servico', `Resposta inesperada da API (HTTP ${resp.status}).`, {
        correlation_id: correlationId,
      })
    const paciente = await resp.json()
    return {
      paciente,
      telemetria: registroTelemetria('ok', Date.now() - t0, 1, { correlation_id: correlationId }),
    }
  } catch (e: any) {
    clearTimeout(timer)
    if (e instanceof ErroOperacional) throw e
    if (e.name === 'AbortError')
      throw new ErroOperacional('timeout', `Tempo esgotado após ${timeoutMs} ms.`, {
        correlation_id: correlationId,
      })
    throw new ErroOperacional('rede', 'Falha de rede ao contatar a API.', {
      correlation_id: correlationId,
    })
  }
}
