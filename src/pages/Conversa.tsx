// src/pages/Conversa.tsx — P2-S04-T02 + P2-S05-T03
// Conversa (/atendimento/:conversationId): histórico com situação
// (✓ enviado, ✓✓ entregue, lido), eventos do sistema em cinza e caixa
// de resposta via RPC send_human_message (janela 24h respeitada).
// P2-S05-T03: painel lateral do ticket (situação, oferta, ações, linha do tempo).
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { RequireAuth, ErrorState } from '@/components/guards'
import { PainelTicket } from '@/components/ticket-panel'
import { PainelCopiloto } from '@/components/copilot-panel'
import { BotaoOportunidade, PainelOportunidade } from '@/components/opportunity-panel'
import { PainelAgenda } from '@/components/scheduling-panel'
import type { Papel } from '@/lib/supabase/types'

type Mensagem = {
  id: string
  direction: 'inbound' | 'outbound'
  sender_type: string
  content_type: string
  body: string | null
  status: string
  occurred_at: string
}

type Anexo = {
  message_id: string
  storage_path: string
  mime_detected: string | null
  scan_status: string
}

type Evento = {
  id: string
  event_type: string
  occurred_at: string
}

type Conversa = {
  id: string
  status: string
  identification: string
  clinic_id: string | null
  contacts: { name: string; primary_phone_e164: string | null } | null
}

const SITUACAO: Record<string, string> = {
  queued: '⏳',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
  failed: '⚠',
  blocked: '🚫',
  received: '',
}

function mascara(e164: string | null): string {
  if (!e164) return '—'
  const d = e164.replace(/\D/g, '')
  if (d.length < 10) return e164
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} 9****-${d.slice(-4)}`
}

function Conversa() {
  const { conversationId } = useParams()
  const [papel, setPapel] = useState<Papel | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [anexos, setAnexos] = useState<Record<string, { url: string; scan: string }>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [resposta, setResposta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  // Anexos das mensagens: URL assinada (1h) + situação do antivírus (scan_status).
  async function carregarAnexos(ids: string[]) {
    if (!ids.length) {
      setAnexos({})
      return
    }
    const { data } = await supabase
      .from('message_attachments')
      .select('message_id, storage_path, mime_detected, scan_status')
      .in('message_id', ids)
    const mapa: Record<string, { url: string; scan: string }> = {}
    for (const a of (data ?? []) as Anexo[]) {
      const { data: s } = await supabase.storage
        .from('attachments')
        .createSignedUrl(a.storage_path, 3600)
      if (s) mapa[a.message_id] = { url: s.signedUrl, scan: a.scan_status }
    }
    setAnexos(mapa)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) return
      setMeuId(user.id)
      supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
        .then(({ data: mem }) => setPapel((mem?.[0]?.role ?? null) as Papel | null))
    })
  }, [])

  useEffect(() => {
    if (!conversationId) return
    let vivo = true
    ;(async () => {
      const { data: conv, error: errConv } = await supabase
        .from('conversations')
        .select('id, status, identification, clinic_id, contacts(name, primary_phone_e164)')
        .eq('id', conversationId)
        .maybeSingle()
      if (!vivo) return
      if (errConv || !conv) {
        setErro('Conversa não encontrada ou sem acesso')
        return
      }
      setConversa(conv as Conversa)
      const [msgs, evs] = await Promise.all([
        supabase
          .from('messages')
          .select('id, direction, sender_type, content_type, body, status, occurred_at')
          .eq('conversation_id', conversationId)
          .order('occurred_at'),
        supabase
          .from('conversation_events')
          .select('id, event_type, occurred_at')
          .eq('conversation_id', conversationId)
          .order('occurred_at'),
      ])
      if (!vivo) return
      setMensagens((msgs.data ?? []) as Mensagem[])
      setEventos((evs.data ?? []) as Evento[])
      void carregarAnexos((msgs.data ?? []).map((m: Mensagem) => m.id))
      // marca como lida (zera não lidas)
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId)
    })()
    // tempo real: novas mensagens aparecem sem recarregar
    const canal = supabase
      .channel(`conversa:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        ;(async () => {
          const { data } = await supabase
            .from('messages')
            .select('id, direction, sender_type, content_type, body, status, occurred_at')
            .eq('conversation_id', conversationId)
            .order('occurred_at')
          if (vivo) setMensagens((data ?? []) as Mensagem[])
          void carregarAnexos((data ?? []).map((m: Mensagem) => m.id))
        })()
      })
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(canal)
    }
  }, [conversationId])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function enviar() {
    if (!conversationId || !resposta.trim() || enviando) return
    setEnviando(true)
    setAviso(null)
    const { error } = await supabase.rpc('send_human_message', {
      p_conversation: conversationId,
      p_body: resposta.trim(),
    })
    setEnviando(false)
    if (error) {
      setAviso(error.message)
      return
    }
    setResposta('')
    const { data } = await supabase
      .from('messages')
      .select('id, direction, sender_type, content_type, body, status, occurred_at')
      .eq('conversation_id', conversationId)
      .order('occurred_at')
    setMensagens((data ?? []) as Mensagem[])
    void carregarAnexos((data ?? []).map((m: Mensagem) => m.id))
  }

  return (
    <AppShell papel={papel}>
      <Link to="/atendimento" className="text-xs text-[#B8960E] hover:underline">
        ← Voltar para o atendimento
      </Link>
      {erro ? (
        <div className="mt-4">
          <ErrorState mensagem={erro} />
        </div>
      ) : !conversa ? (
        <div className="mt-4" aria-busy="true">
          Carregando…
        </div>
      ) : (
        <div className="mt-2 grid items-start gap-3 lg:grid-cols-[1fr_320px]">
          <div className="flex h-[70vh] flex-col rounded-lg border border-[#F1E5C8] bg-white">
            <div className="border-b border-[#F1E5C8] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-sm text-[#2D2A26]">
                    {conversa.contacts?.name ?? 'Sem nome'}
                  </strong>
                  <span className="ml-2 text-xs text-[#6B6560]">
                    {mascara(conversa.contacts?.primary_phone_e164 ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <BotaoOportunidade
                    conversationId={conversationId ?? ''}
                    clinicId={conversa.clinic_id ?? null}
                  />
                  <span className="rounded bg-[#F1E5C8] px-2 py-0.5 text-[10px] font-semibold text-[#2D2A26]">
                    {conversa.identification} · {conversa.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {eventos.map((e) => (
                <div key={e.id} className="text-center text-[10px] text-[#9CA3AF]">
                  {e.event_type} · {new Date(e.occurred_at).toLocaleString('pt-BR')}
                </div>
              ))}
              {mensagens.map((m) => {
                const minha = m.direction === 'outbound'
                return (
                  <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                        minha ? 'bg-[#B8960E] text-white' : 'bg-[#F1E5C8] text-[#2D2A26]'
                      }`}
                    >
                      {anexos[m.id]?.url && m.content_type === 'image' && (
                        <img
                          src={anexos[m.id].url}
                          alt="Anexo da mensagem"
                          className="mb-1 max-h-64 w-auto rounded-lg"
                        />
                      )}
                      {anexos[m.id]?.url && m.content_type !== 'image' && (
                        <a
                          href={anexos[m.id].url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          Abrir anexo ({m.content_type})
                        </a>
                      )}
                      {anexos[m.id]?.scan === 'pending' && (
                        <div className="mb-1 text-[10px] opacity-70">
                          Antivírus: verificação pendente
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">
                        {m.body ?? (anexos[m.id]?.url ? '' : `[${m.content_type}]`)}
                      </div>
                      <div
                        className={`mt-1 text-right text-[10px] ${minha ? 'text-white/80' : 'text-[#6B6560]'}`}
                      >
                        {new Date(m.occurred_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {minha && <span className="ml-1">{SITUACAO[m.status] ?? ''}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={fim} />
            </div>
            <div className="border-t border-[#F1E5C8] p-3">
              {aviso && (
                <div
                  role="alert"
                  className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-[#D93025]"
                >
                  {aviso}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  aria-label="Resposta"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void enviar()
                    }
                  }}
                  rows={2}
                  placeholder="Escreva a resposta… (Enter envia)"
                  className="flex-1 resize-none rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-1 focus:ring-[#B8960E]"
                />
                <button
                  onClick={() => void enviar()}
                  disabled={enviando || !resposta.trim()}
                  className="rounded-lg bg-[#B8960E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
          {/* P3-S02-T02: painel sempre visível — antes era `hidden lg:block` e sumia
              em janelas estreitas (abaixo de 1024px), que é o caso de muitos notebooks
              com zoom ou tela dividida. Em tela pequena ele empilha abaixo da conversa. */}
          <aside
            className="mt-3 space-y-3 pr-1 lg:mt-0"
            style={{ maxHeight: '70vh', overflowY: 'auto' }}
          >
            <PainelOportunidade
              conversationId={conversationId ?? ''}
              clinicId={conversa.clinic_id ?? null}
            />
            <PainelTicket conversationId={conversationId ?? ''} meuId={meuId} />
            {/* P3-S04-T02: agenda assistida — horários livres + agendamentos do paciente.
                Ao clicar num horário, o texto pronto vai para a caixa de resposta. */}
            <PainelAgenda
              conversationId={conversationId ?? ''}
              aoCopiar={(texto) => setResposta((atual) => (atual ? `${atual} ${texto}` : texto))}
            />
            <div className="mt-3">
              <PainelCopiloto conversationId={conversationId ?? ''} />
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  )
}

export default function ConversaComGuarda() {
  return (
    <RequireAuth>
      <Conversa />
    </RequireAuth>
  )
}
