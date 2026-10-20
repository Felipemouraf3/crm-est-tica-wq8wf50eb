// supabase/functions/_shared/providers/meta.ts — P2-S03-T02
// Adaptador da Meta Cloud API (WhatsApp) conforme SPEC-P2-S03 e contrato comum:
//  - verificação GET (hub.mode/hub.verify_token/hub.challenge) → 200 challenge | 403
//  - assinatura X-Hub-Signature-256 = sha256=HMAC_SHA256(app_secret, corpo_bruto),
//    comparação em tempo constante → 200 válido | 401 inválida
//  - mapeamento entry[].changes[].value → recibos por item (wamid / wamid:status)
//  - stale: messages[].timestamp > 24h → rejected_stale (RN-P2-S03-08)
//  - envio: POST graph.facebook.com/<versão>/<phone_number_id>/messages
//    (texto e modelo); resposta messages[0].id → provider_message_id
//  - janela 24h: texto livre só com entrada < 24h; fora → blocked janela_fechada
//    (RN-P2-S03-06/07)
// Telemetria sanitizada: token/segredo/corpo NUNCA em log ou erro.
// Compatível Deno (WebCrypto). Sem `as any`.

// ---------- constantes ----------
export const META_GRAPH_DEFAULT_VERSION = 'v21.0'
export const JANELA_24H_MS = 24 * 60 * 60 * 1000
export const TOLERANCIA_STALE_MS = JANELA_24H_MS // reenvio > 24h → rejected_stale

// ---------- assinatura ----------
/** HMAC-SHA256 em tempo constante: X-Hub-Signature-256 = "sha256=<hex>" */
export async function assinaturaValida(
  appSecret: string,
  corpoBruto: string,
  headerAssinatura: string | null,
): Promise<boolean> {
  if (!headerAssinatura || !headerAssinatura.startsWith('sha256=')) return false
  const recebida = headerAssinatura.slice('sha256='.length).trim().toLowerCase()
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpoBruto))
  const esperada = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (recebida.length !== esperada.length) return false
  // comparação em tempo constante
  let diff = 0
  for (let i = 0; i < esperada.length; i++) {
    diff |= esperada.charCodeAt(i) ^ recebida.charCodeAt(i)
  }
  return diff === 0
}

// ---------- verificação GET ----------
export function respostaVerificacao(
  url: URL,
  verifyTokensValidos: string[],
): { status: number; corpo: string } {
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token') ?? ''
  const challenge = url.searchParams.get('hub.challenge') ?? ''
  if (mode === 'subscribe' && challenge && verifyTokensValidos.includes(token)) {
    return { status: 200, corpo: challenge }
  }
  return { status: 403, corpo: 'forbidden' }
}

// ---------- mapeamento do corpo ----------
export type ItemMeta = {
  kind: 'message' | 'status' | 'other'
  external_event_id: string
  channel_account_id: string | null
  organization_id: string | null
  clinic_id: string | null
  from_phone_e164: string | null
  contact_name: string | null
  message_type: string | null // text/image/audio/... (null em status)
  text_body: string | null // vai para o banco; NUNCA para log
  media_id: string | null
  provider_message_id: string | null
  status: string | null // sent/delivered/read/failed (em status)
  error_code: string | null
  occurred_at: string | null // ISO
  stale: boolean
  unsupported: boolean
}

type MetaValue = {
  metadata?: { phone_number_id?: string }
  contacts?: { wa_id?: string; profile?: { name?: string } }[]
  messages?: {
    id?: string
    from?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
  } & Record<string, unknown>[]
  statuses?: {
    id?: string
    status?: string
    timestamp?: string
    errors?: { code?: number | string }[]
  }[]
}

/** Converte "dígitos" da Meta em E.164 (+DDI já vem no from). */
export function paraE164Meta(from: string | undefined): string | null {
  if (!from || !/^\d{10,15}$/.test(from)) return null
  return `+${from}`
}

/** timestamp em segundos Unix → ISO; null se inválido. */
export function isoDeTimestampSegundos(ts: string | number | undefined): string | null {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}

/**
 * Mapeia o corpo do webhook da Meta em itens normalizados.
 * `contasPorPhoneNumberId` traz as contas ativas mapeadas (id/org/clinic).
 * Itens de número não mapeado voltam com channel_account_id null (RN-04:
 * recibo rejected_unmapped + fila técnica — decisão de gravação é do chamador).
 */
export function mapearCorpoMeta(
  corpo: Record<string, unknown>,
  contasPorPhoneNumberId: Map<string, { id: string; organization_id: string; clinic_id: string }>,
): ItemMeta[] {
  const itens: ItemMeta[] = []
  const entries = Array.isArray(corpo?.entry) ? corpo.entry : []
  for (const entry of entries as Record<string, unknown>[]) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes as Record<string, unknown>[]) {
      const value = (change?.value ?? {}) as MetaValue
      const phoneNumberId = value?.metadata?.phone_number_id ?? ''
      const conta = contasPorPhoneNumberId.get(phoneNumberId) ?? null
      const contact = value?.contacts?.[0]
      const waId = contact?.wa_id ?? null
      const contactName = contact?.profile?.name ?? null

      for (const msg of value?.messages ?? []) {
        const tipo = typeof msg?.type === 'string' ? msg.type : 'unknown'
        const occurredAt = isoDeTimestampSegundos(msg?.timestamp)
        const stale =
          occurredAt !== null && Date.now() - new Date(occurredAt).getTime() > TOLERANCIA_STALE_MS
        const suportados = new Set([
          'text',
          'image',
          'audio',
          'document',
          'video',
          'sticker',
          'location',
          'reaction',
        ])
        const midiaId =
          typeof (msg as Record<string, unknown>)?.[tipo]?.id === 'string'
            ? ((msg as Record<string, unknown>)[tipo] as { id: string }).id
            : null
        itens.push({
          kind: 'message',
          external_event_id: typeof msg?.id === 'string' ? msg.id : '',
          channel_account_id: conta?.id ?? null,
          organization_id: conta?.organization_id ?? null,
          clinic_id: conta?.clinic_id ?? null,
          from_phone_e164: paraE164Meta(msg?.from),
          contact_name: contactName,
          message_type: tipo,
          text_body: tipo === 'text' && typeof msg?.text?.body === 'string' ? msg.text.body : null,
          media_id: midiaId,
          provider_message_id: typeof msg?.id === 'string' ? msg.id : null,
          status: null,
          error_code: null,
          occurred_at: occurredAt,
          stale,
          unsupported: !suportados.has(tipo),
        })
        if (waId && !itens[itens.length - 1].from_phone_e164) {
          itens[itens.length - 1].from_phone_e164 = paraE164Meta(waId)
        }
      }

      for (const st of value?.statuses ?? []) {
        const occurredAt = isoDeTimestampSegundos(st?.timestamp)
        const stale =
          occurredAt !== null && Date.now() - new Date(occurredAt).getTime() > TOLERANCIA_STALE_MS
        itens.push({
          kind: 'status',
          external_event_id: `${typeof st?.id === 'string' ? st.id : ''}:status`,
          channel_account_id: conta?.id ?? null,
          organization_id: conta?.organization_id ?? null,
          clinic_id: conta?.clinic_id ?? null,
          from_phone_e164: null,
          contact_name: null,
          message_type: null,
          text_body: null,
          media_id: null,
          provider_message_id: typeof st?.id === 'string' ? st.id : null,
          status: typeof st?.status === 'string' ? st.status : null,
          error_code:
            Array.isArray(st?.errors) && st.errors.length ? String(st.errors[0]?.code ?? '') : null,
          occurred_at: occurredAt,
          stale,
          unsupported: false,
        })
      }
    }
  }
  return itens
}

// ---------- envio (adaptador de saída) ----------
export type EnvioMetaResultado = {
  ok: boolean
  provider_message_id: string | null
  http_status: number
  error_code: string | null // código curto sanitizado (sem corpo da Meta)
}

/**
 * POST /<versão>/<phone_number_id>/messages com Bearer do Vault.
 * `texto` e `modelo` montam o corpo conforme a SPEC. Timeout 10s.
 * Retries NÃO acontecem aqui — a fila controla (contrato comum 4.4).
 */
export async function enviarMeta(
  graphVersion: string,
  phoneNumberId: string,
  token: string,
  corpo: Record<string, unknown>,
  correlationId: string,
  opcoes: Record<string, unknown> = {},
): Promise<EnvioMetaResultado> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`, // só no header — nunca em log
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
    }
    // gancho de teste (runner): roteia o fetch stub por cenário sem tocar na URL
    if (opcoes.cenarioTeste) headers['x-cenario-teste'] = String(opcoes.cenarioTeste)
    const resp = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(corpo),
        signal: controller.signal,
      },
    )
    const data = (await resp.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { code?: number | string; message?: string }
    }
    if (resp.ok) {
      return {
        ok: true,
        provider_message_id: data?.messages?.[0]?.id ?? null,
        http_status: resp.status,
        error_code: null,
      }
    }
    return {
      ok: false,
      provider_message_id: null,
      http_status: resp.status,
      error_code: data?.error?.code != null ? String(data.error.code) : `http_${resp.status}`,
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

/** Corpo de envio de TEXTO livre (janela aberta). */
export function corpoTexto(to: string, texto: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: texto },
  }
}

/** Corpo de envio de MODELO aprovado (janela fechada). */
export function corpoModelo(
  to: string,
  templateName: string,
  templateLanguage: string,
  components: unknown[] = [],
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: templateLanguage }, components },
  }
}
