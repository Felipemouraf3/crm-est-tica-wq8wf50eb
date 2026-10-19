// src/components/app-shell.tsx — P2-S01-T03 + P2-S02-T03
// Casca do app: menu lateral por papel + topo com seletor de clínica.
// O menu é renderizado conforme o papel; o servidor revalida sempre (RLS).
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { ClinicSelector } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Item = { rota: string; rotulo: string; papeis: Papel[] | 'todos' }

const ITENS: Item[] = [
  { rota: '/inicio', rotulo: 'Início', papeis: 'todos' },
  { rota: '/pacientes/identificar', rotulo: 'Identificar paciente', papeis: 'todos' },
  { rota: '/admin', rotulo: 'Administração', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/conexoes', rotulo: 'Conexões', papeis: ['owner', 'clinic_admin'] },
]

export function AppShell({ papel, children }: { papel: Papel | null; children: ReactNode }) {
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''))
  }, [])

  const visiveis = ITENS.filter((i) => i.papeis === 'todos' || (papel && i.papeis.includes(papel)))

  return (
    <div className="flex min-h-screen bg-[#FDFBF7]">
      <nav aria-label="Menu principal" className="w-56 border-r border-[#F1E5C8] bg-white p-4">
        <div className="mb-4 font-serif text-lg font-bold text-[#2D2A26]">CRM Estética</div>
        {visiveis.map((i) => (
          <Link
            key={i.rota}
            to={i.rota}
            className="block rounded-lg py-1.5 text-sm text-[#2D2A26] hover:bg-[#FFF8ED] hover:text-[#B8960E]"
          >
            {i.rotulo}
          </Link>
        ))}
        <button
          className="mt-6 rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#D93025] hover:bg-red-50"
          onClick={() => supabase.auth.signOut().then(() => window.location.assign('/'))}
        >
          Sair
        </button>
      </nav>
      <main className="flex-1 p-4">
        <header className="mb-4 flex items-center justify-between">
          <ClinicSelector value={clinicaAtiva} onChange={setClinicaAtiva} />
          <span className="text-xs text-[#6B6560]">{email}</span>
        </header>
        {children}
      </main>
    </div>
  )
}
