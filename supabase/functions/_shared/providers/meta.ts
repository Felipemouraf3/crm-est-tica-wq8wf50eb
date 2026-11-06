// supabase/functions/_shared/providers/meta.ts — P2-S03-T02
// Adaptador da Meta Cloud API: assinatura HMAC, verificação de webhook,
// mapeamento de corpos recebidos, envio de texto e de modelo.
export const META_GRAPH_VERSION = 'v21.0'
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`

/** Tempo máximo (ms) de um evento considerada fresco (RN-P2-S03-08: 24h). */
export const META_STALE_MS = 24 * 60 * 60 * 1000

export type ItemMeta = {
  kind: 'message' | 'status' | 'other'
  external_event_id: string
  channel_account_id: string | null
  organization_id: string | null
  clinic_id: string | null
  provider_message_id?: string | null
  status?: string | null
  error_code?: string | null
  occurred_at?: string | null
  stale?: boolean
  unsupported?: boolean
}

/** Compara em tempo constante (evita vazamento por tempo de resposta). */
export function tempoConstanteIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

/** Verificação GET (hub.mode=subscribe + hub.verify_token). */
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

export { assinaturaValida }

/** Verifica X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o app secret). */
async function assinaturaValida(
  appSecret: string,
  corpoBruto: string,
  cabecalho: string | null,
): Promise<boolean> {
  if (!cabecalho || !appSecret) return false
  const esperadoPrefixo = 'sha256='
  if (!cabecalho.startsWith(esperadoPrefixo)) return false
  const recebido = cabecalho.slice(esperadoPrefixo.length).toLowerCase()
  const calculado = await hmacSha256Hex(appSecret, corpoBruto)
  return tempoConstanteIgual(calculado, recebido)
}

async function hmacSha256Hex(chave: string, texto: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(texto))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type MapaContas = Map<
  string,
  { id: string; organization_id: string; clinic_id: string }
>

/** Mapeia o corpo do webhook da Meta em itens normalizados. */
export function mapearCorpoMeta(
  corpo: Record<string, unknown>,
  contasPorPhoneId: MapaContas,
  agoraMs = Date.now(),
): ItemMeta[] {
  const itens: ItemMeta[] = []
  const entries = Array.isArray(corpo?.entry) ? (corpo.entry as Record<string, unknown>[]) : []
  for (const entry of entries) {
    const mudancas = Array.isArray(entry?.changes)
      ? (entry.changes as Record<string, unknown>[])
      : []
    for (const mudanca of mudancas) {
      const valor = (mudanca?.value ?? {}) as Record<string, unknown>
      const metadata = (valor?.metadata ?? {}) as Record<string, unknown>
      const phoneId = typeof metadata?.phone_number_id === 'string' ? metadata.phone_number_id : null
      const conta = phoneId ? contasPorPhoneId.get(phoneId) : undefined

      const base = {
        channel_account_id: conta?.id ?? null,
        organization_id: conta?.organization_id ?? null,
        clinic_id: conta?.clinic_id ?? null,
      }

      // ----- mensagens recebidas -----
      const mensagens = Array.isArray(valor?.messages) ? (valor.messages as Record<string, unknown>[]) : []
      for (const m of mensagens) {
        const id = typeof m?.id === 'string' ? m.id : null
        if (!id) continue
        const tipo = typeof m?.type === 'string' ? m.type : 'unknown'
        const suportado = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'button', 'interactive'].includes(tipo)
        const ts = Number(m?.timestamp)
        const ocorridoMs = Number.isFinite(ts) ? ts * 1000 : agoraMs
        itens.push({
          kind: 'message',
          external_event_id: `msg_${id}`,
          ...base,
          provider_message_id: id,
          occurred_at: new Date(ocorridoMs).toISOString(),
          stale: agoraMs - ocorridoMs > META_STALE_MS,
          unsupported: !suportado,
        })
      }

      // ----- situações (statuses) -----
      const statuses = Array.isArray(valor?.statuses) ? (valor.statuses as Record<string, unknown>[]) : []
      for (const s of statuses) {
        const id = typeof s?.id === 'string' ? s.id : null
        const status = typeof s?.status === 'string' ? s.status : null
        if (!id || !status) continue
        const ts = Number(s?.timestamp)
        const ocorridoMs = Number.isFinite(ts) ? ts * 1000 : agoraMs
        const erros = Array.isArray(s?.errors) ? (s.errors as Record<string, unknown>[]) : []
        const codigo = erros.length && erros[0]?.code != null ? String(erros[0].code) : null
        itens.push({
          kind: 'status',
          external_event_id: `sts_${id}_${status}_${s?.timestamp ?? ''}`,
          ...base,
          provider_message_id: id,
          status,
          error_code: codigo,
          occurred_at: new Date(ocorridoMs).toISOString(),
          stale: agoraMs - ocorridoMs > META_STALE_MS,
        })
      }
    }
  }
  return itens
}

export type EnvioMeta =
  | { tipo: 'texto'; para: string; texto: string }
  | { tipo: 'modelo'; para: string; modelo: string; idioma: string; variaveis?: string[] }
