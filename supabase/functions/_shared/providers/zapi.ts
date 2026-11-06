// supabase/functions/_shared/providers/zapi.ts — P2-S03-T03 (v3 com imageUrl + caption)
// Adaptador da Z-API conforme SPEC-P2-S03. Telemetria sanitizada. Sem `as any`.
export const ZAPI_BASE = 'https://api.z-api.io'
export const JANELA_24H_MS = 24 * 60 * 60 * 1000
export const TOLERANCIA_STALE_MS = JANELA_24H_MS

export type ItemZapi = {
  kind: 'message' | 'status' | 'connection' | 'other'
  external_event_id: string
  channel_account_id: string | null
  organization_id: string | null
  clinic_id: string | null
  from_phone_e164: string | null
  contact_name: string | null
  message_type: string | null
  text_body: string | null
  media_id: string | null
  provider_message_id: string | null
  status: string | null
  error_code: string | null
  occurred_at: string | null
  stale: boolean
  unsupported: boolean
  desconectar: boolean
  reconectar: boolean
}

type ZapiBody = Record<string, unknown> & {
  type?: string
  instanceId?: string
  messageId?: string
  zaapId?: string
  phone?: string
  momment?: number | string
  senderName?: string
  fromMe?: boolean
  isGroup?: boolean
  isNewsletter?: boolean
  text?: { message?: string }
  image?: { id?: string; caption?: string; imageUrl?: string; link?: string; url?: string }
  audio?: { id?: string; link?: string; url?: string }
  video?: { id?: string; videoUrl?: string; link?: string; url?: string }
  document?: { id?: string; link?: string; url?: string }
  ids?: unknown[]
  status?: string
  connected?: boolean
  error?: string
  errorCode?: string
}

export function paraE164Zapi(phone: string | undefined | null): string | null {
  if (!phone) return null
  const digitos = String(phone).replace(/@c\.us$/, '').replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(digitos)) return null
  return `+${digitos}`
}

export function isoDeMomment(momment: number | string | undefined): string | null {
  const n = Number(momment)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n < 1e12 ? n * 1000 : n
  return new Date(ms).toISOString()
}

export function statusZapiParaInterno(status: string | undefined): string | null {
  switch (status) {
    case 'SENT':
      return 'sent'
    case 'RECEIVED':
      return 'delivered'
    case 'READ':
    case 'PLAYED':
      return 'read'
    default:
      return null
  }
}

function midiaIdDe(msg: ZapiBody): { tipo: string; id: string } | null {
  for (const tipo of ['image', 'audio', 'video', 'document'] as const) {
    const obj = msg[tipo] as { id?: string; imageUrl?: string; link?: string; url?: string } | undefined
    if (!obj || typeof obj !== 'object') continue
    // Z-API real: image.imageUrl (sem id); doc oficial também aceita link/url.
    const id = [obj.id, obj.imageUrl, obj.link, obj.url].find((v) => typeof v === 'string' && v !== '')
    if (id) return { tipo, id }
  }
  return null
}

export function mapearCorpoZapi(
  corpo: ZapiBody,
  conta: { id: string; organization_id: string; clinic_id: string; external_account_id: string } | null,
): ItemZapi[] {
  const itens: ItemZapi[] = []
  const tipo = typeof corpo?.type === 'string' ? corpo.type : ''
  const occurredAt = isoDeMomment(corpo?.momment)
  const stale = occurredAt !== null && Date.now() - new Date(occurredAt).getTime() > TOLERANCIA_STALE_MS

  const base = {
    channel_account_id: conta?.id ?? null,
    organization_id: conta?.organization_id ?? null,
    clinic_id: conta?.clinic_id ?? null,
  }

  if (tipo === 'DisconnectedCallback') {
    itens.push({
      ...base,
      kind: 'connection',
      external_event_id: `${corpo?.instanceId ?? ''}:${corpo?.momment ?? ''}`,
      from_phone_e164: null,
      contact_name: null,
      message_type: 'disconnected',
      text_body: null,
      media_id: null,
      provider_message_id: null,
      status: null,
      error_code: null,
      occurred_at: occurredAt,
      stale,
      unsupported: false,
      desconectar: true,
      reconectar: false,
    })
    return itens
  }

  if (tipo === 'ConnectedCallback') {
    itens.push({
      ...base,
      kind: 'connection',
      external_event_id: `${corpo?.instanceId ?? ''}:${corpo?.momment ?? ''}`,
      from_phone_e164: null,
      contact_name: null,
      message_type: 'connected',
      text_body: null,
      media_id: null,
      provider_message_id: null,
      status: null,
      error_code: null,
      occurred_at: occurredAt,
      stale,
      unsupported: false,
      desconectar: false,
      reconectar: false,
    })
    return itens
  }

  if (tipo === 'MessageStatusCallback') {
    const ids = Array.isArray(corpo?.ids) ? (corpo.ids as unknown[]) : []
    const primeiroId = typeof ids[0] === 'string' ? ids[0] : ''
    const statusInterno = statusZapiParaInterno(typeof corpo?.status === 'string' ? corpo.status : undefined)
    itens.push({
      ...base,
      kind: 'status',
      external_event_id: `${primeiroId}:status`,
      from_phone_e164: null,
      contact_name: null,
      message_type: null,
      text_body: null,
      media_id: null,
      provider_message_id: primeiroId || null,
      status: statusInterno,
      error_code: null,
      occurred_at: occurredAt,
      stale,
      unsupported: statusInterno === null,
      desconectar: false,
      reconectar: false,
    })
    return itens
  }

  // DeliveryCallback: confirmação de envio (webhook Ao enviar) — sucesso = sem error
  if (tipo === 'DeliveryCallback') {
    const messageId = typeof corpo?.messageId === 'string' ? corpo.messageId : ''
    const temErro = typeof corpo?.error === 'string' && corpo.error.length > 0
    itens.push({
      ...base,
      kind: 'status',
      external_event_id: `${messageId}:status`,
      from_phone_e164: null,
      contact_name: null,
      message_type: null,
      text_body: null,
      media_id: null,
      provider_message_id: messageId || null,
      status: temErro ? 'failed' : 'sent',
      error_code: temErro
        ? (typeof corpo?.errorCode === 'string' ? corpo.errorCode : 'delivery_error')
        : null,
      occurred_at: occurredAt,
      stale,
      unsupported: false,
      desconectar: false,
      reconectar: false,
    })
    return itens
  }

  if (tipo === 'ReceivedCallback') {
    const isGroup = corpo?.isGroup === true || corpo?.isNewsletter === true
    const messageId = typeof corpo?.messageId === 'string' ? corpo.messageId : ''
    const midia = midiaIdDe(corpo)
    const texto =
      typeof corpo?.text?.message === 'string' && corpo.text.message !== ''
        ? corpo.text.message
        : midia && typeof (corpo?.[midia.tipo] as { caption?: string })?.caption === 'string'
          ? ((corpo?.[midia.tipo] as { caption?: string }).caption as string)
          : null
    itens.push({
      ...base,
      kind: 'message',
      external_event_id: messageId,
      from_phone_e164: paraE164Zapi(typeof corpo?.phone === 'string' ? corpo.phone : undefined),
      contact_name: typeof corpo?.senderName === 'string' ? corpo.senderName : null,
      message_type: midia ? midia.tipo : texto !== null ? 'text' : 'unknown',
      text_body: texto,
      media_id: midia?.id ?? null,
      provider_message_id: messageId || null,
      status: null,
      error_code: null,
      occurred_at: occurredAt,
      stale,
      unsupported: isGroup || (!texto && !midia),
      desconectar: false,
      reconectar: false,
    })
    return itens
  }

  itens.push({
    ...base,
    kind: 'other',
    external_event_id: `${corpo?.instanceId ?? ''}:${corpo?.momment ?? ''}`,
    from_phone_e164: null,
    contact_name: null,
    message_type: tipo || 'unknown',
    text_body: null,
    media_id: null,
    provider_message_id: null,
    status: null,
    error_code: null,
    occurred_at: occurredAt,
    stale,
    unsupported: true,
    desconectar: false,
    reconectar: false,
  })
  return itens
}

export type EnvioZapiResultado = {
  ok: boolean
  provider_message_id: string | null
  http_status: number
  error_code: string | null
}

export async function enviarZapi(
  instanceId: string,
  token: string,
  clientToken: string,
  destinoE164: string,
  texto: string,
  correlationId: string,
  opcoes: Record<string, unknown> = {},
): Promise<EnvioZapiResultado> {
  if (!instanceId || !token || !clientToken || !destinoE164 || !texto) {
    return { ok: false, provider_message_id: null, http_status: 0, error_code: 'credencial_ausente' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const headers: Record<string, string> = {
      'Client-Token': clientToken,
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
    }
    if (opcoes.cenarioTeste) headers['x-cenario-teste'] = String(opcoes.cenarioTeste)
    const resp = await fetch(
      `${ZAPI_BASE}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: destinoE164.replace(/^\+/, ''), message: texto }),
        signal: controller.signal,
      },
    )
    const data = (await resp.json().catch(() => ({}))) as {
      messageId?: string
      zaapId?: string
      error?: string
      message?: string
    }
    if (resp.ok && typeof data?.messageId === 'string') {
      return { ok: true, provider_message_id: data.messageId, http_status: resp.status, error_code: null }
    }
    return {
      ok: false,
      provider_message_id: null,
      http_status: resp.status,
      error_code: data?.error ? String(data.error) : `http_${resp.status}`,
    }
  } catch (e: unknown) {
    const nome = (e as { name?: string })?.name ?? ''
    return {
      ok: false,
      provider_message_id: null,
      http_status: 0,
      error_code: nome === 'AbortError' ? 'tempo_esgotado' : 'falha_rede',
    }
  } finally {
    clearTimeout(timer)
  }
}

export function corpoTextoZapi(destinoE164: string, texto: string): Record<string, unknown> {
  return { phone: destinoE164.replace(/^\+/, ''), message: texto }
}

export function segredoValido(esperado: string, recebido: string | null): boolean {
  if (!recebido || recebido.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i)
  }
  return diff === 0
}
