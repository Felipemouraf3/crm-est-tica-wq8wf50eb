// src/pages/Filas.tsx — P2-S05-T03
// Visão do gestor (/filas): tickets por situação e fila, vencidos em vermelho,
// tempo até aceite (mediana do dia), atendentes online e carga, ações
// "atribuir a" (transfer_ticket) e "escalar" (escalate_ticket).
// Clínica ativa lida de localStorage + clinics (padrão das telas de admin).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/guards'
import { Users, Zap } from 'lucide-react'

type Ticket = {
  id: string
  status: string
  priority: number
  handoff_reason: string
  sla_due_at: string | null
  offer_expires_at: string | null
  created_at: string
  assigned_to: string | null
  version: number
  ticket_queues: { name: string } | null
  conversations: { contacts: { name: string } | null } | null
}

type Atendente = {
  user_id: string
  state: string
  active_load: number
  profiles: { name: string } | null
}

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

const ABERTOS = [
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
]

export default function Filas() {
  const { toast } = useToast()
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [atendentes, setAtendentes] = useState<Atendente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [dialogoAtribuir, setDialogoAtribuir] = useState<Ticket | null>(null)
  const [membros, setMembros] = useState<{ user_id: string; nome: string }[]>([])
  const [busy, setBusy] = useState(false)
  // P2-S07-T03: indicador de uso do copiloto (taxas de aceitação/edição/rejeição)
  const [stats, setStats] = useState<{
    geradas: number
    usadas: number
    editadas: number
    descartadas: number
    bloqueadas: number
    taxa_uso: number
    taxa_edicao: number
    taxa_rejeicao: number
  } | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const ativa =
        typeof localStorage !== 'undefined' ? localStorage.getItem('clinica_ativa') : null
      const { data: clinicas } = await supabase
        .from('clinics')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      const escolhida = (clinicas ?? []).find((c) => c.id === ativa) ?? (clinicas ?? [])[0]
      if (escolhida) setClinicaAtiva(escolhida.id)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const carregar = useCallback(async (clinic: string) => {
    const [t, a, st] = await Promise.all([
      supabase
        .from('tickets')
        .select(
          'id, status, priority, handoff_reason, sla_due_at, offer_expires_at, created_at, assigned_to, version, ticket_queues(name), conversations(contacts(name))',
        )
        .eq('clinic_id', clinic)
        .in('status', ABERTOS)
        .order('created_at', { ascending: true }),
      supabase
        .from('attendant_presence')
        .select('user_id, state, active_load')
        .eq('clinic_id', clinic),
      supabase.rpc('admin_sugestao_stats', { p_clinic: clinic, p_dias: 30 }),
    ])
    setTickets((t.data ?? []) as Ticket[])
    // attendant_presence.user_id aponta para auth.users (sem FK para profiles),
    // então o nome do atendente vem de uma segunda consulta a profiles.
    const presencas = (a.data ?? []) as { user_id: string; state: string; active_load: number }[]
    const ids = [...new Set(presencas.map((p) => p.user_id))]
    let nomes: { id: string; name: string }[] = []
    if (ids.length > 0) {
      const { data: perfis } = await supabase.from('profiles').select('id, name').in('id', ids)
      nomes = (perfis ?? []) as { id: string; name: string }[]
    }
    const nomePorId = new Map(nomes.map((p) => [p.id, p.name]))
    setAtendentes(
      presencas.map((p) => ({ ...p, profiles: { name: nomePorId.get(p.user_id) ?? '' } })),
    )
    const linha = Array.isArray(st.data) ? st.data[0] : st.data
    setStats((linha ?? null) as typeof stats)
    setCarregando(false)
  }, [])

  useEffect(() => {
    if (!clinicaAtiva) return
    void carregar(clinicaAtiva)
    const canal = supabase
      .channel(`filas:${clinicaAtiva}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => void carregar(clinicaAtiva),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [clinicaAtiva, carregar])

  async function abrirAtribuir(t: Ticket) {
    setDialogoAtribuir(t)
    if (!clinicaAtiva) return
    const { data } = await supabase
      .from('memberships')
      .select('user_id, profiles(name), role')
      .eq('clinic_id', clinicaAtiva)
      .eq('active', true)
    setMembros(
      (data ?? []).map(
        (m: { user_id: string; profiles: { name: string } | null; role: string }) => ({
          user_id: m.user_id,
          nome: m.profiles?.name ?? m.role,
        }),
      ),
    )
  }

  async function atribuir(destino: string) {
    if (!dialogoAtribuir) return
    setBusy(true)
    const { error } = await supabase.rpc('transfer_ticket', {
      p_ticket: dialogoAtribuir.id,
      p_to: destino,
      p_reason: 'atribuicao_gestor',
    })
    setBusy(false)
    setDialogoAtribuir(null)
    if (error)
      toast({ title: 'Falha ao atribuir', description: error.message, variant: 'destructive' })
    else toast({ title: 'Ticket atribuído' })
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }

  async function escalar(t: Ticket) {
    setBusy(true)
    await supabase.rpc('escalate_ticket', { p_ticket: t.id, p_reason: 'escalado_gestor' })
    setBusy(false)
    toast({ title: 'Ticket escalado' })
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }

  // mediana do tempo até aceite (dos tickets aceitos hoje)
  const mediana = (() => {
    const tempos = tickets
      .filter((t) => t.status === 'assigned' || t.status === 'in_service')
      .map((t) => (new Date(t.created_at).getTime() - Date.now()) / 60000)
    if (tempos.length === 0) return null
    tempos.sort((a, b) => a - b)
    const meio = Math.floor(tempos.length / 2)
    return tempos.length % 2 ? tempos[meio] : (tempos[meio - 1] + tempos[meio]) / 2
  })()

  if (!clinicaAtiva) {
    return (
      <>
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Filas</h1>
        <EmptyState titulo="Selecione uma clínica" mensagem="Escolha a clínica no seletor acima." />
      </>
    )
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Filas</h1>
        <p className="text-xs text-[#6B6560]">
          {tickets.length} ticket(s) aberto(s) · Tempo até aceite (mediana):{' '}
          {mediana !== null ? `${Math.abs(Math.round(mediana))} min` : '—'} · Atendentes online:{' '}
          {atendentes.filter((a) => a.state === 'online').length}
        </p>
        {stats && (
          <p className="mt-1 text-xs text-[#6B6560]" data-testid="copiloto-stats">
            Copiloto (30 dias): {stats.geradas} geradas · {stats.usadas} usadas (
            {stats.taxa_uso ?? 0}%) · {stats.editadas} editadas ({stats.taxa_edicao ?? 0}%) ·{' '}
            {stats.descartadas} descartadas ({stats.taxa_rejeicao ?? 0}%) · {stats.bloqueadas}{' '}
            bloqueadas
          </p>
        )}
      </div>

      {/* atendentes online e carga */}
      <div className="mb-4 flex flex-wrap gap-2">
        {atendentes.map((a) => (
          <Badge
            key={a.user_id}
            className={
              a.state === 'online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }
          >
            {a.profiles?.name ?? a.user_id.slice(0, 8)} · carga {a.active_load}
          </Badge>
        ))}
      </div>

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando…</p>
      ) : tickets.length === 0 ? (
        <EmptyState
          titulo="Nenhum ticket aberto"
          mensagem="Os tickets aparecem aqui quando um cliente pede atendimento humano."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const st = ROTULO_STATUS[t.status] ?? ROTULO_STATUS.new
            const vencido =
              (t.sla_due_at && new Date(t.sla_due_at) < new Date()) ||
              t.status === 'sla_breached' ||
              t.status === 'escalated'
            return (
              <Card key={t.id} className={vencido ? 'border-[#D93025]' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-serif">
                    <span className={vencido ? 'text-[#D93025]' : ''}>
                      {t.conversations?.contacts?.name ?? 'Sem nome'}
                    </span>
                  </CardTitle>
                  <Badge className={st.cor}>{st.texto}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-[#6B6560]">
                    Fila: {t.ticket_queues?.name ?? '—'} · Prioridade:{' '}
                    {t.priority === 1 ? 'alta' : t.priority === 2 ? 'normal' : 'baixa'} · Aberto em{' '}
                    {new Date(t.created_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {t.sla_due_at && (
                      <>
                        {' '}
                        · Prazo:{' '}
                        {new Date(t.sla_due_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirAtribuir(t)}
                      disabled={busy}
                    >
                      <Users className="mr-1 h-3.5 w-3.5" /> Atribuir a
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => escalar(t)} disabled={busy}>
                      <Zap className="mr-1 h-3.5 w-3.5" /> Escalar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* atribuir a */}
      <Dialog open={!!dialogoAtribuir} onOpenChange={(v) => !v && setDialogoAtribuir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir ticket para</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {membros.map((m) => (
              <button
                key={m.user_id}
                onClick={() => void atribuir(m.user_id)}
                disabled={busy}
                className="block w-full rounded-lg border border-[#F1E5C8] px-3 py-2 text-left text-sm hover:bg-[#FFF8ED]"
              >
                {m.nome}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
