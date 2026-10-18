// src/components/guards.tsx — P2-S01-T03
// RequireAuth (sessão), RequireRole (vínculo+papel, com AAL2 p/ owner/clinic_admin),
// EmptyState e ErrorState (correlation_id copiável). Sem `as any`.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import type { Papel } from '@/lib/supabase/types'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'sem_sessao' }
  | { tipo: 'sem_vinculo' }
  | { tipo: 'papel_insuficiente' }
  | { tipo: 'precisa_mfa' }
  | { tipo: 'ok'; papel: Papel | null }

// Papel efetivo vem SEMPRE de memberships ativas (profiles.role está deprecada).
async function papelDoUsuario(userId: string): Promise<Papel | null> {
  const { data } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('active', true)
  if (!data || data.length === 0) return null
  const ordem: Papel[] = [
    'owner',
    'clinic_admin',
    'manager',
    'sales',
    'reception',
    'post_sales',
    'viewer',
  ]
  for (const p of ordem) if (data.some((m) => m.role === p)) return p
  return null
}

// Nível de garantia da sessão: aal2 = segundo fator verificado agora.
async function nivelAal(): Promise<'aal1' | 'aal2'> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return (data?.currentLevel as 'aal1' | 'aal2') ?? 'aal1'
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        if (vivo) navigate('/', { replace: true })
        return
      }
      const papel = await papelDoUsuario(user.id)
      if (!vivo) return
      if (!papel) {
        setEstado({ tipo: 'sem_vinculo' })
        return
      }
      setEstado({ tipo: 'ok', papel })
    })()
    return () => {
      vivo = false
    }
  }, [navigate])

  if (estado.tipo === 'carregando') {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />
      </div>
    )
  }
  if (estado.tipo === 'sem_vinculo') {
    return (
      <EmptyState
        titulo="Você ainda não tem acesso a nenhuma clínica"
        mensagem="Peça ao gestor para convidar seu e-mail pelo painel de administração."
      />
    )
  }
  return <>{children}</>
}

export function RequireRole({
  children,
  papeis,
  exigeMfa = false,
}: {
  children: ReactNode
  papeis: Papel[]
  exigeMfa?: boolean
}) {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const papeisKey = papeis.join('|')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        if (vivo) navigate('/', { replace: true })
        return
      }
      const papel = await papelDoUsuario(user.id)
      if (!vivo) return
      if (!papel) {
        setEstado({ tipo: 'sem_vinculo' })
        return
      }
      const permitidos = papeisKey.split('|') as Papel[]
      if (!permitidos.includes(papel)) {
        setEstado({ tipo: 'papel_insuficiente' })
        return
      }
      // owner/clinic_admin exigem segundo fator verificado (AAL2)
      if (exigeMfa && (papel === 'owner' || papel === 'clinic_admin')) {
        const nivel = await nivelAal()
        if (!vivo) return
        if (nivel !== 'aal2') {
          setEstado({ tipo: 'precisa_mfa' })
          return
        }
      }
      setEstado({ tipo: 'ok', papel })
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, exigeMfa, papeisKey])

  if (estado.tipo === 'carregando') {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />
      </div>
    )
  }
  if (estado.tipo === 'sem_vinculo') {
    return (
      <EmptyState
        titulo="Você ainda não tem acesso a nenhuma clínica"
        mensagem="Peça ao gestor para convidar seu e-mail pelo painel de administração."
      />
    )
  }
  if (estado.tipo === 'papel_insuficiente') {
    return <EmptyState titulo="Acesso restrito" mensagem="Seu papel não permite esta área." />
  }
  if (estado.tipo === 'precisa_mfa') {
    return (
      <EmptyState
        titulo="Segundo fator necessário"
        mensagem="Esta área exige verificação em duas etapas. Ative o aplicativo autenticador e tente novamente."
      />
    )
  }
  return <>{children}</>
}

export function EmptyState({ titulo, mensagem }: { titulo: string; mensagem?: string }) {
  return (
    <div role="status" className="p-6 text-center">
      <h2 className="text-base font-semibold text-[#2D2A26]">{titulo}</h2>
      {mensagem && <p className="mt-1 text-sm text-[#6B6560]">{mensagem}</p>}
    </div>
  )
}

export function ErrorState({
  mensagem,
  correlationId,
}: {
  mensagem: string
  correlationId?: string
}) {
  return (
    <div role="alert" className="p-6 text-center">
      <h2 className="text-base font-semibold text-[#D93025]">Erro</h2>
      <p className="mt-1 text-sm text-[#2D2A26]">{mensagem}</p>
      {correlationId && (
        <p className="mt-2 font-mono text-xs text-[#6B6560]">correlation_id: {correlationId}</p>
      )}
    </div>
  )
}
