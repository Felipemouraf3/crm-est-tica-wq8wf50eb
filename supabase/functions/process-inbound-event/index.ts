// Edge Function process-inbound-event v10 — P2-S04-T01+T03
// v10: _shared REAIS no bundle (expert-search + clinica-experts-v2 — o deploy v9 saiu com stub).
// v9: FIX mídia Z-API real — image.imageUrl (não link/url) + caption da mídia como texto.
// v8: fila via wrappers fila_* (pgmq.send via PostgREST dava 406); segredo interno via Vault
// (destrava o cron — fecha DÚVIDA-2026-10-20-01); FIX selo: update final não sobrescreve mais
// a identificação do passo 5 com valor stale 'pendente'; FIX evento contato_ambiguo (FK de conversa).
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buscarEmDuasEtapas } from '../_shared/providers/expert-search.ts'
import { EXPERT_BASE_URL_DEFAULT } from '../_shared/providers/clinica-experts-v2.ts'

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const PALAVRAS_SAIDA = ['sair', 'parar', 'cancelar inscrição', 'não quero receber']

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    const SUPABASE_URL0 = Deno.env.get('SUPABASE_URL') ?? ''
    const admin0 = createClient(SUPABASE_URL0, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const segredoHeader = req.headers.get('x-internal-job') ?? ''
    let autorizado = false
    const segredoEnv = Deno.env.get('INTERNAL_JOB_SECRET') ?? ''
    if (segredoEnv && segredoHeader === segredoEnv) autorizado = true
    if (!autorizado) {
      try {
        const { data: v } = await admin0.rpc('_edge_read_secret', { p_secret_ref: 'vault:cf1c1eb8-5f95-4de0-81b0-3fbd6b6af59c' })
        if (typeof v === 'string' && v !== '' && segredoHeader === v) autorizado = true
      } catch {}
    }
    if (!autorizado) {
      return json(403, { error: { code: 'sem_permissao', message: 'Acesso interno' }, correlation_id: correlationId })
    }
    const SUPABASE_URL = SUPABASE_URL0
    const admin = admin0
    const { data: lote } = await admin.rpc('fila_ler', { p_fila: 'inbound_events', p_vt: 60, p_qty: 10 })
    const itens = (lote ?? []) as { msg_id: number; message: Record<string, unknown> }[]
    if (!itens.length) return json(200, { data: { processados: 0 }, correlation_id: correlationId })
    let ok = 0
    let falhas = 0
    for (const item of itens) {
      try {
        const msg = item.message ?? {}
        const externalEventId = typeof msg.external_event_id === 'string' ? msg.external_event_id : null
        const provider = typeof msg.provider === 'string' ? msg.provider : null
        const channelAccountId = typeof msg.channel_account_id === 'string' ? msg.channel_account_id : null
        if (!externalEventId || !provider || !channelAccountId) { falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue }
        const { data: recibo } = await admin.from('webhook_receipts').select('id, status, payload_ref, organization_id, clinic_id').eq('provider', provider).eq('external_event_id', externalEventId).maybeSingle()
        if (!recibo || recibo.status !== 'accepted') { await arquivar(admin, 'inbound_events', item.msg_id); ok++; continue }
        const { data: conta } = await admin.from('channel_accounts').select('id, organization_id, clinic_id, provider').eq('id', channelAccountId).maybeSingle()
        if (!conta) { falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue }
        const corpo = await lerPayload(admin, recibo.payload_ref)
        const texto = extrairTexto(corpo, provider)
        const providerMessageId = extrairMessageId(corpo, provider, externalEventId)
        const occurredAt = extrairOccurredAt(corpo, provider)
        const e164 = extrairFromE164(corpo, provider)
        if (!e164) { falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue }
        const { data: identidades } = await admin.from('contact_identities').select('id, contact_id, contacts!inner(organization_id, status)').eq('channel', 'whatsapp').eq('external_id', e164).order('created_at', { ascending: false }).limit(5)
        const daOrg = (identidades ?? []).filter((i: any) => i.contacts?.organization_id === conta.organization_id)
        let contactId: string | null = null
        let ambiguo = false
        if (daOrg.length === 0) {
          const nome = extrairNome(corpo, provider) ?? e164
          const { data: novoContato, error: errContato } = await admin.from('contacts').insert({ organization_id: conta.organization_id, name: nome, primary_phone_e164: e164, status: 'active' }).select('id').single()
          if (errContato || !novoContato) { falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue }
          contactId = novoContato.id
          await admin.from('contact_identities').insert({ contact_id: contactId, channel: 'whatsapp', external_id: e164, normalized_value: e164 })
        } else {
          contactId = daOrg[0].contact_id
          ambiguo = daOrg.length > 1
        }
        const { data: conversa, error: errConv, nova: conversaNova } = await abrirOuReaproveitar(admin, conta, contactId)
        if (errConv || !conversa) { falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue }
        if (ambiguo) await registrarEvento(admin, conta, conversa.id, 'contato_ambiguo', { candidatos: daOrg.length })

        if (conversaNova) {
          const selo = await identificarContato(admin, conta, e164)
          if (selo) {
            await admin.from('conversations').update({ identification: selo }).eq('id', conversa.id)
            await registrarEvento(admin, conta, conversa.id, 'identified', { identification: selo })
          }
        }

        const midia = extrairMidia(corpo, provider)
        let contentType = 'text'
        let anexoInfo: { path: string; mime: string; size: number } | null = null
        if (midia) {
          contentType = midia.tipo
          const baixada = await baixarMidia(admin, provider, midia)
          if (baixada) {
            const tipoReal = tipoRealPorMagicBytes(baixada.bytes)
            if (!tipoReal || tipoReal !== midia.mimeEsperado) {
              await registrarEvento(admin, conta, conversa.id, 'attachment_rejected', { motivo: tipoReal ? 'tipo_diverge' : 'tipo_nao_permitido', mime_declarado: midia.mimeEsperado, mime_detectado: tipoReal })
            } else if (baixada.bytes.length > 16 * 1024 * 1024) {
              await registrarEvento(admin, conta, conversa.id, 'attachment_rejected', { motivo: 'tamanho' })
            } else {
              const caminho = `attachments/${conta.organization_id}/${conta.clinic_id}/${conversa.id}/${crypto.randomUUID()}`
              const { error: errUp } = await admin.storage.from('attachments').upload(caminho, baixada.bytes, { contentType: midia.mimeEsperado, upsert: false })
              if (!errUp) anexoInfo = { path: caminho, mime: midia.mimeEsperado, size: baixada.bytes.length }
            }
          }
        }

        const { error: errMsg } = await admin.from('messages').insert({
          organization_id: conta.organization_id, clinic_id: conta.clinic_id, conversation_id: conversa.id,
          direction: 'inbound', sender_type: 'contact', provider, provider_message_id: providerMessageId,
          content_type: contentType, body: texto, status: 'received', occurred_at: occurredAt ?? new Date().toISOString(),
        })
        if (errMsg) {
          if (errMsg.code === '23505') { await arquivar(admin, 'inbound_events', item.msg_id); ok++; continue }
          falhas++; await arquivar(admin, 'inbound_events', item.msg_id); continue
        }

        if (anexoInfo) {
          const { data: msgId } = await admin.from('messages').select('id').eq('provider', provider).eq('provider_message_id', providerMessageId).maybeSingle()
          if (msgId) {
            await admin.from('message_attachments').insert({
              organization_id: conta.organization_id, clinic_id: conta.clinic_id, message_id: msgId.id,
              storage_path: anexoInfo.path, mime_declared: anexoInfo.mime, mime_detected: anexoInfo.mime,
              size_bytes: anexoInfo.size, scan_status: 'pending',
            })
          }
        }

        if (texto && PALAVRAS_SAIDA.some((p) => texto.trim().toLowerCase() === p)) {
          await admin.from('consents').insert({ organization_id: conta.organization_id, contact_id: contactId, channel: 'whatsapp', purpose: 'promocional', status: 'revoked', source: 'palavra_chave' })
          await registrarEvento(admin, conta, conversa.id, 'opt_out', { canal: 'whatsapp' })
        }

        const agora = new Date().toISOString()
        await admin.from('conversations').update({
          last_inbound_at: occurredAt ?? agora, last_message_at: occurredAt ?? agora,
          unread_count: (conversa.unread_count ?? 0) + 1,
          ...(ambiguo ? { identification: 'ambiguo' } : {}),
        }).eq('id', conversa.id)
        await admin.rpc('fila_enviar', { p_fila: 'agent_jobs', p_msg: {
          type: 'inbound_processed', organization_id: conta.organization_id, clinic_id: conta.clinic_id,
          conversation_id: conversa.id, contact_id: contactId, provider, correlation_id: correlationId,
          attempt: 1, enqueued_at: agora,
        }})
        await arquivar(admin, 'inbound_events', item.msg_id)
        ok++
      } catch {
        falhas++
        await arquivar(admin, 'inbound_events', item.msg_id)
      }
    }
    return json(200, { data: { processados: itens.length, ok, falhas }, correlation_id: correlationId })
  } catch (e) {
    return json(500, { error: { code: 'inesperado', message: 'Erro interno' }, correlation_id: correlationId })
  }
})

async function arquivar(admin: any, fila: string, msgId: number) {
  await admin.rpc('fila_arquivar', { p_fila: fila, p_msg_id: msgId })
}

async function lerPayload(admin: any, payloadRef: string | null): Promise<any> {
  if (!payloadRef) return null
  try {
    const { data, error } = await admin.storage.from('webhook-payloads').download(payloadRef)
    if (error || !data) return null
    const texto = await data.text()
    return JSON.parse(texto)
  } catch { return null }
}

function extrairTexto(corpo: any, provider: string): string | null {
  if (!corpo) return null
  if (provider === 'z_api') {
    if (corpo.type === 'ReceivedCallback') {
      if (corpo.text?.message) return String(corpo.text.message)
      // legenda da mídia (image.caption, video.caption, document.caption…)
      for (const t of ['image', 'audio', 'video', 'document'] as const) {
        const cap = corpo[t]?.caption
        if (typeof cap === 'string' && cap !== '') return cap
      }
    }
    return null
  }
  try {
    const msgs = corpo?.entry?.[0]?.changes?.[0]?.value?.messages
    if (Array.isArray(msgs) && msgs[0]?.text?.body) return String(msgs[0].text.body)
  } catch {}
  return null
}

function extrairMessageId(corpo: any, provider: string, fallback: string): string | null {
  if (!corpo) return fallback
  if (provider === 'z_api') {
    if (typeof corpo.messageId === 'string') return corpo.messageId
    return fallback
  }
  try {
    const msgs = corpo?.entry?.[0]?.changes?.[0]?.value?.messages
    if (Array.isArray(msgs) && typeof msgs[0]?.id === 'string') return msgs[0].id
  } catch {}
  return fallback
}

function extrairOccurredAt(corpo: any, provider: string): string | null {
  if (!corpo) return null
  if (provider === 'z_api') {
    const m = corpo.momment
    if (typeof m === 'number' || typeof m === 'string') {
      const n = Number(m)
      if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString()
    }
    return null
  }
  try {
    const msgs = corpo?.entry?.[0]?.changes?.[0]?.value?.messages
    if (Array.isArray(msgs) && msgs[0]?.timestamp) return new Date(Number(msgs[0].timestamp) * 1000).toISOString()
  } catch {}
  return null
}

function extrairFromE164(corpo: any, provider: string): string | null {
  if (!corpo) return null
  if (provider === 'z_api') {
    if (corpo.type === 'ReceivedCallback' && typeof corpo.phone === 'string') {
      const digitos = corpo.phone.replace(/@c\.us$/, '').replace(/\D/g, '')
      if (digitos.length >= 10) return `+${digitos}`
    }
    return null
  }
  try {
    const msgs = corpo?.entry?.[0]?.changes?.[0]?.value?.messages
    if (Array.isArray(msgs) && typeof msgs[0]?.from === 'string') return `+${msgs[0].from.replace(/\D/g, '')}`
  } catch {}
  return null
}

function extrairNome(corpo: any, provider: string): string | null {
  if (!corpo) return null
  if (provider === 'z_api' && typeof corpo.senderName === 'string' && corpo.senderName.trim()) return corpo.senderName.trim()
  try {
    const contatos = corpo?.entry?.[0]?.changes?.[0]?.value?.contacts
    if (Array.isArray(contatos) && contatos[0]?.profile?.name) return String(contatos[0].profile.name)
  } catch {}
  return null
}

async function abrirOuReaproveitar(admin: any, conta: any, contactId: string) {
  const { data: aberta } = await admin.from('conversations').select('id, unread_count, identification, status').eq('contact_id', contactId).eq('channel_account_id', conta.id).not('status', 'in', '(resolved,spam)').maybeSingle()
  if (aberta) return { data: aberta, error: null, nova: false }
  const { data: nova, error } = await admin.from('conversations').insert({
    organization_id: conta.organization_id, clinic_id: conta.clinic_id, contact_id: contactId,
    channel_account_id: conta.id, status: 'new', identification: 'pendente',
  }).select('id, unread_count, identification, status').single()
  if (error || !nova) return { data: null, error, nova: false }
  await registrarEvento(admin, conta, nova.id, 'created', { provider: conta.provider })
  return { data: nova, error: null, nova: true }
}

async function identificarContato(admin: any, conta: any, e164: string): Promise<string | null> {
  try {
    const { data: cache } = await admin.from('expert_patients_cache').select('result_class, expires_at, invalidated').eq('clinic_id', conta.clinic_id).eq('phone_e164', e164).eq('invalidated', false).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (cache?.result_class) return classeParaSelo(cache.result_class)
    const { data: conn } = await admin.from('integration_connections').select('id, secret_ref').eq('provider', 'clinica_experts').eq('connection_key', 'api_token').eq('clinic_id', conta.clinic_id).maybeSingle()
    let token: string | null = null
    if (conn?.secret_ref?.startsWith('vault:')) {
      const { data: sec } = await admin.rpc('_edge_read_secret', { p_secret_ref: conn.secret_ref })
      token = typeof sec === 'string' ? sec : (sec?.secret ?? null)
    }
    if (!token) return 'indisponivel'
    const baseUrl = Deno.env.get('EXPERT_API_BASE_URL') ?? EXPERT_BASE_URL_DEFAULT
    const busca = await buscarEmDuasEtapas(baseUrl, token, e164, {})
    const selo = classeParaSelo(busca.result_class)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
    await admin.from('expert_patients_cache').upsert({
      organization_id: conta.organization_id, clinic_id: conta.clinic_id, phone_e164: e164,
      payload: { candidates: busca.candidatos, linked_patient_uuid: null }, result_class: busca.result_class,
      expires_at: expiresAt, invalidated: false,
    }, { onConflict: 'clinic_id,phone_e164' })
    return selo
  } catch {
    return 'indisponivel'
  }
}

function classeParaSelo(classe: string): string {
  switch (classe) {
    case 'um': return 'paciente'
    case 'multiplos': return 'ambiguo'
    case 'provavel': return 'provavel'
    case 'zero': return 'novo_lead'
    default: return 'indisponivel'
  }
}

function extrairMidia(corpo: any, provider: string): { tipo: string; mimeEsperado: string; url: string; id: string } | null {
  if (!corpo) return null
  const MIME: Record<string, string> = { image: 'image/jpeg', audio: 'audio/ogg', video: 'video/mp4', document: 'application/pdf' }
  if (provider === 'z_api' && corpo.type === 'ReceivedCallback') {
    for (const tipo of ['image', 'audio', 'video', 'document'] as const) {
      const obj = corpo[tipo]
      if (obj && typeof obj === 'object') {
        const url = obj.imageUrl ?? obj.link ?? obj.url ?? null
        const id = obj.id ?? null
        if (url || id) return { tipo, mimeEsperado: MIME[tipo], url: url ?? '', id: id ?? '' }
      }
    }
    return null
  }
  try {
    const msgs = corpo?.entry?.[0]?.changes?.[0]?.value?.messages
    if (Array.isArray(msgs)) {
      for (const tipo of ['image', 'audio', 'video', 'document'] as const) {
        const id = msgs[0]?.[tipo]?.id
        if (typeof id === 'string') return { tipo, mimeEsperado: MIME[tipo], url: '', id }
      }
    }
  } catch {}
  return null
}

async function baixarMidia(admin: any, provider: string, midia: { tipo: string; mimeEsperado: string; url: string; id: string }): Promise<{ bytes: Uint8Array } | null> {
  try {
    let url = midia.url
    if (provider === 'meta_cloud') {
      const token = Deno.env.get('META_ACCESS_TOKEN') ?? ''
      if (!token || !midia.id) return null
      const r1 = await fetch(`https://graph.facebook.com/v21.0/${midia.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r1.ok) return null
      const j = await r1.json()
      url = j?.url ?? ''
      if (!url) return null
      const r2 = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!r2.ok) return null
      return { bytes: new Uint8Array(await r2.arrayBuffer()) }
    }
    if (!url) return null
    const r = await fetch(url)
    if (!r.ok) return null
    return { bytes: new Uint8Array(await r.arrayBuffer()) }
  } catch { return null }
}

function tipoRealPorMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  const hex = (n: number) => Array.from(bytes.slice(0, n)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const ascii = (n: number, off = 0) => String.fromCharCode(...bytes.slice(off, off + n))
  if (hex(3) === 'ffd8ff') return 'image/jpeg'
  if (hex(4) === '89504e47') return 'image/png'
  if (ascii(4) === 'RIFF' && ascii(4, 8) === 'WEBP') return 'image/webp'
  if (ascii(4) === '%PDF') return 'application/pdf'
  if (ascii(4) === 'OggS') return 'audio/ogg'
  if (ascii(3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  return null
}

async function registrarEvento(admin: any, conta: any, conversationId: string, tipo: string, payload: any) {
  await admin.from('conversation_events').insert({
    organization_id: conta.organization_id, clinic_id: conta.clinic_id, conversation_id: conversationId,
    event_type: tipo, actor_type: 'system', payload_sanitized: payload ?? {},
  })
}