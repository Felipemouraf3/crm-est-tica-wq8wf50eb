// src/pages/Atendimento.tsx — P2-S04-T02
// Caixa de entrada (/atendimento): conversas da clínica selecionada,
// ordenadas pela última mensagem, com selo de identificação, prévia,
// não lidas e situação. Tempo real via canal privado clinic:<id>.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { RequireAuth, EmptyState } from '@/components/guards'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Conversa = {
  id: string
  status: string
  identification: string
  unread_count: number
  last_message_at: string | null
  contacts: { name: string; primary_phone_e164: string | null } | null
}

function mascaraTelefone(e164: string | null): string {
  if (!e164) return '—'
  const d = e164.replace(/\D/g, '')
  if (d.length < 10) return e164
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} 9****-${d.slice(-4)}`
}

const SEL: Record<string, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  paciente: 'bg-green-100 text-green-800',
  novo_lead: 'bg-blue-100 text-blue-800',
  ambiguo: 'bg-yellow-100 text-yellow-800',
  provavel: 'bg-blue-50 text-blue-700',
  indisponivel: 'bg-red-50 text-red-700',
}

function Atendimento() {
  const { clinicaAtiva } = useClinicaAtiva()
  const [papel, setPapel] = useState<Papel | null>(null)
  const [conversas, setConversas] = useState<Conversa[] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) return
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
    if (!clinicaAtiva) return
    let vivo = true
    ;(async () => {
      const { data } = await supabase
        .from('conversations')
        .select(
          'id, status, identification, unread_count, last_message_at, contacts(name, primary_phone_e164)',
        )
        .eq('clinic_id', clinicaAtiva)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (vivo) setConversas((data ?? []) as Conversa[])
    })()
    // tempo real: nova mensagem/mudança recarrega a lista (conteúdo vem da API com RLS)
    const canal = supabase
      .channel(`clinic:${clinicaAtiva}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        ;(async () => {
          const { data } = await supabase
            .from('conversations')
            .select(
              'id, status, identification, unread_count, last_message_at, contacts(name, primary_phone_e164)',
            )
            .eq('clinic_id', clinicaAtiva)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(100)
          if (vivo) setConversas((data ?? []) as Conversa[])
        })()
      })
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(canal)
    }
  }, [clinicaAtiva])

  return (
    <AppShell papel={papel}>
      <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Atendimento</h1>
      {!clinicaAtiva ? (
        <div className="mt-4">
          <EmptyState
            titulo="Selecione uma clínica"
            mensagem="Escolha a clínica no seletor acima para ver as conversas."
          />
        </div>
      ) : conversas === null ? (
        <div className="mt-4" aria-busy="true">
          Carregando…
        </div>
      ) : conversas.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            titulo="Nenhuma conversa"
            mensagem="As conversas desta clínica aparecem aqui quando chega a primeira mensagem."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-[#F1E5C8] rounded-lg border border-[#F1E5C8] bg-white">
          {conversas.map((c) => (
            <li key={c.id}>
              <Link
                to={`/atendimento/${c.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#FFF8ED]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-[#2D2A26]">
                      {c.contacts?.name ?? 'Sem nome'}
                    </strong>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEL[c.identification] ?? SEL.pendente}`}
                    >
                      {c.identification}
                    </span>
                  </div>
                  <div className="text-xs text-[#6B6560]">
                    {mascaraTelefone(c.contacts?.primary_phone_e164 ?? null)}
                  </div>
                </div>
                <div className="text-right">
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-[#B8960E] px-2 py-0.5 text-[10px] font-bold text-white">
                      {c.unread_count}
                    </span>
                  )}
                  <div className="text-[10px] text-[#6B6560]">
                    {c.last_message_at
                      ? new Date(c.last_message_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[#6B6560]">{c.status}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}

export default function AtendimentoComGuarda() {
  return (
    <RequireAuth>
      <Atendimento />
    </RequireAuth>
  )
}
