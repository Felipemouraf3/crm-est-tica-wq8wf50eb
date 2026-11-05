// src/components/app-shell.tsx — P2-S01-T03 + P2-S02-T03 + P2-S03-T01 + P2-S04-T02 + P2-S05-T01 + P2-S05-T03 + P2-S06-T03
// Casca do app: menu lateral por papel + topo com seletor de clínica e chave de presença.
// O menu é renderizado conforme o papel; o servidor revalida sempre (RLS).
// P2-S04-T02: a clínica ativa vai por contexto para as telas (useClinicaAtiva).
// P2-S05-T01: item "Filas e prazos" (owner/clinic_admin).
// P2-S05-T03: item "Fila de atendimento" (/filas, todos) + chave "Disponível / Pausa"
// com batimento a cada 30s enquanto a aba está aberta.
// P2-S06-T03: itens "Conhecimento" e "Agentes" (owner/clinic_admin).
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { ClinicSelector, ClinicaProvider } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Item = { rota: string; rotulo: string; papeis: Papel[] | 'todos' }

const ITENS: Item[] = [
  { rota: '/inicio', rotulo: 'Início', papeis: 'todos' },
  { rota: '/atendimento', rotulo: 'Atendimento', papeis: 'todos' },
  { rota: '/pacientes/identificar', rotulo: 'Identificar paciente', papeis: 'todos' },
  { rota: '/filas', rotulo: 'Fila de atendimento', papeis: 'todos' },
  { rota: '/minha-fila', rotulo: 'Minha fila do dia', papeis: 'todos' },
  {
    rota: '/recuperacao',
    rotulo: 'Recuperação de avaliações',
    papeis: ['owner', 'clinic_admin', 'manager', 'sales', 'post_sales'],
  },
  { rota: '/funil', rotulo: 'Funil de vendas', papeis: 'todos' },
  { rota: '/admin', rotulo: 'Administração', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/conexoes', rotulo: 'Conexões', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/canais', rotulo: 'Canais WhatsApp', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/filas', rotulo: 'Filas e prazos', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/conhecimento', rotulo: 'Conhecimento', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/agentes', rotulo: 'Agentes', papeis: ['owner', 'clinic_admin'] },
  { rota: '/admin/funil', rotulo: 'Funil comercial', papeis: ['owner', 'clinic_admin'] },
  {
    rota: '/admin/cadencias',
    rotulo: 'Cadências de follow-up',
    papeis: ['owner', 'clinic_admin', 'manager'],
  },
  {
    rota: '/admin/dados-experts',
    rotulo: 'Dados do Clínica Experts',
    papeis: ['owner', 'clinic_admin'],
  },
]

// P2-S05-T03: chave "Disponível / Pausa" — batimento a cada 30s enquanto a aba está aberta.
function ChavePresenca({ clinicaAtiva }: { clinicaAtiva: string | null }) {
  const [estado, setEstado] = useState<'online' | 'away' | null>(null)

  useEffect(() => {
    if (!clinicaAtiva) return
    let vivo = true
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user || !vivo) return
      supabase
        .from('attendant_presence')
        .select('state')
        .eq('user_id', user.id)
        .eq('clinic_id', clinicaAtiva)
        .maybeSingle()
        .then(({ data: p }) => {
          if (vivo && p) setEstado(p.state === 'away' ? 'away' : 'online')
        })
    })
    const batimento = setInterval(() => {
      if (!vivo || !clinicaAtiva) return
      void supabase.rpc('update_presence', { p_clinic: clinicaAtiva, p_state: 'online' })
    }, 30000)
    return () => {
      vivo = false
      clearInterval(batimento)
    }
  }, [clinicaAtiva])

  if (!clinicaAtiva) return null
  return (
    <button
      aria-label="Chave de presença"
      onClick={() => {
        const novo = estado === 'online' ? 'away' : 'online'
        setEstado(novo)
        void supabase.rpc('update_presence', { p_clinic: clinicaAtiva, p_state: novo })
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        estado === 'online' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {estado === 'online' ? 'Disponível' : 'Pausa'}
    </button>
  )
}

export function AppShell({ papel, children }: { papel: Papel | null; children: ReactNode }) {
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''))
  }, [])

  const visiveis = ITENS.filter((i) => i.papeis === 'todos' || (papel && i.papeis.includes(papel)))

  return (
    <ClinicaProvider value={clinicaAtiva}>
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
          {/* marcador de versão: serve para saber qual build o navegador está usando.
              Se aqui aparecer uma versão antiga, é cache — Ctrl+F5 resolve. */}
          <div className="mt-4 border-t border-[#F1E5C8] pt-3 text-[10px] leading-tight text-[#B8B0A6]">
            <div data-testid="build-version">versão 0.0.84</div>
            <button
              onClick={() => {
                void caches?.keys?.().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
                window.location.reload()
              }}
              className="mt-1 underline hover:text-[#B8960E]"
            >
              Recarregar limpando cache
            </button>
          </div>
        </nav>
        <main className="flex-1 p-4">
          <header className="mb-4 flex items-center justify-between">
            <ClinicSelector value={clinicaAtiva} onChange={setClinicaAtiva} />
            <div className="flex items-center gap-3">
              <ChavePresenca clinicaAtiva={clinicaAtiva} />
              <span className="text-xs text-[#6B6560]">{email}</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </ClinicaProvider>
  )
}
