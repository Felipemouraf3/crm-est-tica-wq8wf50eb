// src/components/ticket-panel.tsx — P2-S05-T03
// Painel lateral do ticket (embutido na tela Conversa): cabeçalho com situação,
// fila, prioridade, motivo e prazo com contagem regressiva; oferta com "Assumir"
// e "Recusar" (aceite via accept_ticket com concorrência — 409 vira mensagem);
// ações transferir/devolver/escalar/resolver/devolver à automação; linha do tempo
// dos ticket_events. Sem `as any`.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Ticket = {
  id: string
  status: string
  priority: number
  handoff_reason: string
  queue_id: string
  assigned_to: string | null
  offered_to: string | null
  offer_expires_at: string | null
  reoffer_count: number
  sla_due_at: string | null
  version: number
  ticket_queues: { name: string } | null
}

type Evento = {
  id: string
  event_type: string
  from_user_id: string | null
  to_user_id: string | null
  reason_code: string | null
  occurred_at: string
}

type Membro = { user_id: string; nome: string }

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  new: { texto: 'Novo', cor: 'bg-gray-100 text-gray-700' },
  queued: { texto: 'Na fila', cor: 'bg-amber-100 text-amber-800' },
  offered: { texto: 'Oferecido', cor: 'bg-blue-100 text-blue-800' },
  assigned: { texto: 'Assumido', cor: 'bg-green-100 text-green-800' },
  in_service: { texto: 'Em atendimento', cor: 'bg-green-100 text-green-800' },
  waiting_customer: { texto: 'Aguardando cliente', cor: 'bg-blue-100 text-blue-800' },
  resolved: { texto: 'Resolvido', cor: 'bg-gray-100 text-gray-500' },
  sla_breached: { texto: 'Prazo vencido', cor: 'bg-red-100 text-red-800' },
  escalated: { texto: 'Escalado', cor: 'bg-red-100 text-red-800' },
  blocked: { texto: 'Bloqueado', cor: 'bg-gray-100 text-gray-500' },
  provider_failure: { texto: 'Falha do canal', cor: 'bg-red-100 text-red-800' },
  cancelled: { texto: 'Cancelado', cor: 'bg-gray-100 text-gray-500' },
}

const MOTIVOS: Record<string, string> = {
  pedido_humano: 'Pedido de humano',
  risco: 'Risco',
  baixa_confianca: 'Baixa confiança',
  falha_automacao: 'Falha da automação',
  regra_negocio: 'Regra de negócio',
  manual: 'Manual',
}

const ROTULO_EVENTO: Record<string, string> = {
  created: 'Ticket criado',
  offered: 'Oferecido',
  offer_expired: 'Oferta vencida',
  accepted: 'Aceito',
  transferred: 'Transferido',
  returned: 'Devolvido à fila',
  escalated: 'Escalado',
  sla_breached: 'Prazo vencido',
  after_hours_notice: 'Aviso fora do expediente',
  resolved: 'Resolvido',
  reopened: 'Reaberto',
}

const CODIGOS = [
  { v: 'atendido', t: 'Atendido' },
  { v: 'agendamento_encaminhado', t: 'Agendamento encaminhado' },
  { v: 'sem_resposta_cliente', t: 'Sem resposta do cliente' },
  { v: 'spam', t: 'Spam' },
  { v: 'transferido_outra_clinica', t: 'Transferido para outra clínica' },
]

function contagem(iso: string | null): string {
  if (!iso) return '—'
  const restante = new Date(iso).getTime() - Date.now()
  if (restante <= 0) return 'vencido'
  const min = Math.floor(restante / 60000)
  const seg = Math.floor((restante % 60000) / 1000)
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`
}

export function PainelTicket({
  conversationId,
  meuId,
}: {
  conversationId: string
  meuId: string | null
}) {
  const { toast } = useToast()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tick, setTick] = useState(0) // re-render da contagem regressiva
  const [membros, setMembros] = useState<Membro[]>([])
  const [dialogoTransferir, setDialogoTransferir] = useState(false)
  const [dialogoResolver, setDialogoResolver] = useState(false)
  const [rCodigo, setRCodigo] = useState('atendido')
  const [rNota, setRNota] = useState('')
  const [rProxima, setRProxima] = useState('')
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select(
        'id, status, priority, handoff_reason, queue_id, assigned_to, offered_to, offer_expires_at, reoffer_count, sla_due_at, version, ticket_queues(name)',
      )
      .eq('conversation_id', conversationId)
      .in('status', [
        'new',
        'queued',
        'offered',
        'assigned',
        'in_service',
        'waiting_customer',
        'sla_breached',
        'escalated',
        'blocked',
        'provider_failure',
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setTicket((data ?? null) as Ticket | null)
    if (data) {
      const { data: evs } = await supabase
        .from('ticket_events')
        .select('id, event_type, from_user_id, to_user_id, reason_code, occurred_at')
        .eq('ticket_id', (data as Ticket).id)
        .order('occurred_at')
      setEventos((evs ?? []) as Evento[])
    } else {
      setEventos([])
    }
    setCarregando(false)
  }, [conversationId])

  useEffect(() => {
    void carregar()
    // tempo real: atualiza o painel quando o ticket muda (oferta, aceite, etc.)
    const canal = supabase
      .channel(`ticket:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => void carregar(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_events' },
        () => void carregar(),
      )
      .subscribe()
    const relogio = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      supabase.removeChannel(canal)
      clearInterval(relogio)
    }
  }, [conversationId, carregar])

  // membros da clínica (para transferir) — via memberships da clínica do ticket
  useEffect(() => {
    if (!dialogoTransferir || !ticket) return
    ;(async () => {
      const { data: conv } = await supabase
        .from('conversations')
        .select('clinic_id')
        .eq('id', conversationId)
        .maybeSingle()
      if (!conv) return
      const { data } = await supabase
        .from('memberships')
        .select('user_id, profiles(name), role')
        .eq('clinic_id', (conv as { clinic_id: string }).clinic_id)
        .eq('active', true)
      setMembros(
        (data ?? []).map(
          (m: { user_id: string; profiles: { name: string } | null; role: string }) => ({
            user_id: m.user_id,
            nome: m.profiles?.name ?? m.role,
          }),
        ),
      )
    })()
  }, [dialogoTransferir, ticket, conversationId])

  async function assumir() {
    if (!ticket) return
    setBusy(true)
    const { data } = await supabase.rpc('accept_ticket', {
      p_ticket: ticket.id,
      p_version: ticket.version,
    })
    setBusy(false)
    const r = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean
      code?: string
      message?: string
    } | null
    if (r && r.ok === false) {
      toast({ title: r.message ?? 'Já assumido por outra pessoa', variant: 'destructive' })
    } else if (r && r.ok) {
      toast({ title: 'Ticket assumido' })
    }
    await carregar()
  }

  async function recusar() {
    if (!ticket) return
    setBusy(true)
    await supabase.rpc('return_ticket', { p_ticket: ticket.id, p_reason: 'recusa_atendente' })
    setBusy(false)
    toast({ title: 'Ticket devolvido à fila' })
    await carregar()
  }

  async function transferir(destino: string) {
    if (!ticket) return
    setBusy(true)
    const { error } = await supabase.rpc('transfer_ticket', {
      p_ticket: ticket.id,
      p_to: destino,
      p_reason: 'transferencia_manual',
    })
    setBusy(false)
    setDialogoTransferir(false)
    if (error)
      toast({ title: 'Falha ao transferir', description: error.message, variant: 'destructive' })
    else toast({ title: 'Ticket transferido' })
    await carregar()
  }

  async function devolver() {
    if (!ticket) return
    setBusy(true)
    await supabase.rpc('return_ticket', { p_ticket: ticket.id, p_reason: 'devolucao_manual' })
    setBusy(false)
    toast({ title: 'Ticket devolvido à fila' })
    await carregar()
  }

  async function escalar() {
    if (!ticket) return
    setBusy(true)
    await supabase.rpc('escalate_ticket', { p_ticket: ticket.id, p_reason: 'escalado_manual' })
    setBusy(false)
    toast({ title: 'Ticket escalado ao gestor' })
    await carregar()
  }

  async function resolver() {
    if (!ticket) return
    setBusy(true)
    const { error } = await supabase.rpc('resolve_ticket', {
      p_ticket: ticket.id,
      p_code: rCodigo,
      p_note: rNota.trim() || null,
      p_next_action: rProxima ? new Date(rProxima).toISOString() : null,
    })
    setBusy(false)
    setDialogoResolver(false)
    if (error)
      toast({ title: 'Falha ao resolver', description: error.message, variant: 'destructive' })
    else toast({ title: 'Ticket resolvido' })
    await carregar()
  }

  async function voltarAutomacao() {
    setBusy(true)
    await supabase.rpc('return_to_automation', { p_conversation: conversationId })
    setBusy(false)
    toast({ title: 'Conversa devolvida à automação' })
    await carregar()
  }

  if (carregando) return null
  if (!ticket) return null

  const st = ROTULO_STATUS[ticket.status] ?? ROTULO_STATUS.new
  const ofertadoParaMim = ticket.status === 'offered' && ticket.offered_to === meuId
  const meuTicket = ticket.assigned_to === meuId
  const souGestor = true // ações de gestor são revalidadas pelo servidor (RLS/RPC)

  return (
    <div
      className="rounded-lg border border-[#F1E5C8] bg-white p-3 text-sm"
      data-testid="painel-ticket"
    >
      <div className="flex items-center justify-between">
        <strong className="font-serif text-[#2D2A26]">Ticket</strong>
        <Badge className={st.cor}>{st.texto}</Badge>
      </div>
      <p className="mt-1 text-xs text-[#6B6560]">
        Fila: {ticket.ticket_queues?.name ?? '—'} · Prioridade:{' '}
        {ticket.priority === 1 ? 'alta' : ticket.priority === 2 ? 'normal' : 'baixa'} · Motivo:{' '}
        {MOTIVOS[ticket.handoff_reason] ?? ticket.handoff_reason}
      </p>
      {(ticket.status === 'offered' || ticket.status === 'queued') && (
        <p className="mt-1 text-xs text-[#6B6560]">
          Prazo de aceite:{' '}
          <strong data-testid="prazo-aceite">{contagem(ticket.offer_expires_at)}</strong>
          {ticket.reoffer_count > 0 && <> · Reoferta {ticket.reoffer_count}</>}
        </p>
      )}
      {ticket.sla_due_at &&
        ['assigned', 'in_service', 'waiting_customer'].includes(ticket.status) && (
          <p className="mt-1 text-xs text-[#6B6560]">
            Prazo de primeira resposta: <strong>{contagem(ticket.sla_due_at)}</strong>
          </p>
        )}

      {ofertadoParaMim && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={assumir} disabled={busy} data-testid="assumir">
            Assumir
          </Button>
          <Button size="sm" variant="outline" onClick={recusar} disabled={busy}>
            Recusar
          </Button>
        </div>
      )}

      {(meuTicket ||
        (souGestor &&
          ['assigned', 'in_service', 'waiting_customer', 'escalated', 'sla_breached'].includes(
            ticket.status,
          ))) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogoTransferir(true)}
            disabled={busy}
          >
            Transferir
          </Button>
          <Button size="sm" variant="outline" onClick={devolver} disabled={busy}>
            Devolver à fila
          </Button>
          <Button size="sm" variant="outline" onClick={escalar} disabled={busy}>
            Escalar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogoResolver(true)}
            disabled={busy}
          >
            Resolver
          </Button>
          <Button size="sm" variant="outline" onClick={voltarAutomacao} disabled={busy}>
            Devolver à automação
          </Button>
        </div>
      )}

      {eventos.length > 0 && (
        <div className="mt-3 border-t border-[#F1E5C8] pt-2">
          <p className="text-xs font-semibold text-[#2D2A26]">Linha do tempo</p>
          <ul className="mt-1 space-y-0.5">
            {eventos.map((e) => (
              <li key={e.id} className="text-[11px] text-[#6B6560]">
                {new Date(e.occurred_at).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}{' '}
                · {ROTULO_EVENTO[e.event_type] ?? e.event_type}
                {e.reason_code ? ` (${e.reason_code})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* transferir */}
      <Dialog open={dialogoTransferir} onOpenChange={setDialogoTransferir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir ticket para</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {membros.map((m) => (
              <button
                key={m.user_id}
                onClick={() => void transferir(m.user_id)}
                disabled={busy}
                className="block w-full rounded-lg border border-[#F1E5C8] px-3 py-2 text-left text-sm hover:bg-[#FFF8ED]"
              >
                {m.nome}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* resolver */}
      <Dialog open={dialogoResolver} onOpenChange={setDialogoResolver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver ticket</DialogTitle>
          </DialogHeader>
          <label className="text-xs font-semibold">Código de resultado</label>
          <select
            value={rCodigo}
            onChange={(e) => setRCodigo(e.target.value)}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            {CODIGOS.map((c) => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </select>
          <label className="text-xs font-semibold">Observação</label>
          <Input value={rNota} onChange={(e) => setRNota(e.target.value)} />
          <label className="text-xs font-semibold">Próxima ação (obrigatória, salvo spam)</label>
          <Input
            type="datetime-local"
            value={rProxima}
            onChange={(e) => setRProxima(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogoResolver(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={resolver} disabled={busy}>
              Resolver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
