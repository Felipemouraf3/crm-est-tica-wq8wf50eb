// src/components/clinic-selector.tsx — P2-S01-T03
// Seletor de clínica: mostra só clínicas com vínculo ativo do usuário (RLS).
// A escolha fica em localStorage por conveniência; o SERVIDOR sempre valida.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Clinica = Database['public']['Tables']['clinics']['Row']

const LS_KEY = 'clinica_ativa'

export function clinicaSalva(): string | null {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

export function salvarClinica(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_KEY, id)
    else localStorage.removeItem(LS_KEY)
  } catch {
    // no-op
  }
}

export function ClinicSelector({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string) => void
}) {
  const [clinicas, setClinicas] = useState<Clinica[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session?.user || !vivo) return
      // RLS filtra: só clínicas com membership ativa do usuário
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      if (error) {
        setErro(error.message)
        return
      }
      const lista = data ?? []
      setClinicas(lista)
      const salva = clinicaSalva()
      if (salva && lista.some((c) => c.id === salva)) onChange(salva)
      else if (lista[0]) onChange(lista[0].id)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (erro) {
    return (
      <span role="alert" className="text-xs text-[#D93025]">
        Erro ao carregar clínicas
      </span>
    )
  }
  if (clinicas.length === 0) {
    return <span className="text-xs text-[#6B6560]">Nenhuma clínica disponível</span>
  }

  return (
    <select
      aria-label="Clínica ativa"
      value={value ?? ''}
      onChange={(e) => {
        salvarClinica(e.target.value)
        onChange(e.target.value)
      }}
      className="rounded-lg border border-[#F1E5C8] bg-white px-3 py-1.5 text-sm text-[#2D2A26]"
    >
      {clinicas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
