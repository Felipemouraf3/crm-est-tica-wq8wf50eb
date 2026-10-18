// src/pages/Inicio.tsx — P2-S01-T03
// Painel inicial (/inicio): clínicas do usuário e atalhos.
// RN-P2-S01-03: nenhum número fixo — sem dado, estado vazio.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { RequireAuth, EmptyState } from '@/components/guards'
import type { Database, Papel } from '@/lib/supabase/types'

type Clinica = Database['public']['Tables']['clinics']['Row']

function Inicio() {
  const [clinicas, setClinicas] = useState<Clinica[] | null>(null)
  const [papel, setPapel] = useState<Papel | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess.session?.user
      if (!user || !vivo) return
      const { data: mem } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
      if (!vivo) return
      setPapel((mem?.[0]?.role ?? null) as Papel | null)
      const { data } = await supabase
        .from('clinics')
        .select('*')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      setClinicas(data ?? [])
    })()
    return () => {
      vivo = false
    }
  }, [])

  return (
    <AppShell papel={papel}>
      <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Início</h1>
      {clinicas === null ? (
        <div className="mt-4" aria-busy="true">
          Carregando…
        </div>
      ) : clinicas.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            titulo="Ainda sem dados"
            mensagem="Nenhuma clínica vinculada ao seu usuário ainda."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-[#F1E5C8]">
          {clinicas.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              <strong className="text-[#2D2A26]">{c.name}</strong>{' '}
              <span className="text-[#6B6560]">· {c.timezone}</span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}

export default function InicioComGuarda() {
  return (
    <RequireAuth>
      <Inicio />
    </RequireAuth>
  )
}
