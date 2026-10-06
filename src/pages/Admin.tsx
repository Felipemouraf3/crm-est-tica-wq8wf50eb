import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  Building2,
  Users,
  IdCard,
  UsersRound,
  Plus,
  Pencil,
  UserPlus,
  Search,
  Loader2,
  ShieldCheck,
} from 'lucide-react'

type Clinic = {
  id: string
  organization_id: string
  name: string
  code: string
  timezone: string
  status: string
}

type Membership = {
  id: string
  user_id: string
  clinic_id: string
  role: string
  active: boolean
  updated_at: string
  profiles?: { name: string } | null
  clinics?: { name: string; code: string } | null
}

type Team = {
  id: string
  clinic_id: string
  name: string
  queue_type: string
  clinics?: { name: string; code: string } | null
}

type TeamMember = {
  id: string
  team_id: string
  user_id: string
  active: boolean
  teams?: { name: string } | null
  profiles?: { name: string } | null
}

const ROLES = [
  { value: 'clinic_admin', label: 'Administrador da clínica' },
  { value: 'manager', label: 'Gerente' },
  { value: 'sales', label: 'Vendas' },
  { value: 'reception', label: 'Recepção' },
  { value: 'post_sales', label: 'Pós-venda' },
  { value: 'viewer', label: 'Somente leitura' },
] as const

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  clinic_admin: 'Administrador da clínica',
  manager: 'Gerente',
  sales: 'Vendas',
  reception: 'Recepção',
  post_sales: 'Pós-venda',
  viewer: 'Somente leitura',
}

const TABS = [
  { id: 'clinics', label: 'Clínicas', icon: Building2 },
  { id: 'users', label: 'Usuários e convites', icon: Users },
  { id: 'memberships', label: 'Memberships', icon: IdCard },
  { id: 'teams', label: 'Equipes', icon: UsersRound },
] as const

export default function Admin() {
  const navigate = useNavigate()
  const { user, session, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [tab, setTab] = useState<string>('clinics')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([])

  // formulário clínica
  const [showClinicForm, setShowClinicForm] = useState(false)
  const [editingClinicId, setEditingClinicId] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState('')
  const [clinicCode, setClinicCode] = useState('')
  const [clinicTz, setClinicTz] = useState('America/Recife')

  // formulário convite
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteClinicRoles, setInviteClinicRoles] = useState<{ clinic_id: string; role: string }[]>(
    [],
  )
  const [inviteNewRole, setInviteNewRole] = useState('')

  // formulário equipe
  const [showTeamForm, setShowTeamForm] = useState(false)
  const [teamClinicId, setTeamClinicId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamQueueType, setTeamQueueType] = useState('recepcao')

  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/', { replace: true })
    }
  }, [session, authLoading, navigate])

  const loadAll = async () => {
    if (!session) return
    setLoading(true)
    try {
      const [c, m, t, tm] = await Promise.all([
        supabase.from('clinics').select('*').order('name'),
        supabase
          .from('memberships')
          .select(
            'id, user_id, clinic_id, role, active, updated_at, profiles(name), clinics(name, code)',
          )
          .order('updated_at', { ascending: false }),
        supabase
          .from('teams')
          .select('id, clinic_id, name, queue_type, clinics(name, code)')
          .order('name'),
        supabase
          .from('team_members')
          .select('id, team_id, user_id, active, teams(name), profiles(name)')
          .order('active', { ascending: false }),
      ])
      if (c.data) setClinics(c.data as Clinic[])
      if (m.data) setMemberships(m.data as Membership[])
      if (t.data) setTeams(t.data as Team[])
      if (tm.data) setTeamMembers(tm.data as TeamMember[])
      if (m.data) {
        const seen = new Set<string>()
        const list: { id: string; name: string }[] = []
        for (const ms of m.data as Membership[]) {
          if (ms.profiles?.name && !seen.has(ms.user_id)) {
            seen.add(ms.user_id)
            list.push({ id: ms.user_id, name: ms.profiles.name })
          }
        }
        setProfiles(list)
      }
    } catch (e) {
      toast({ title: 'Erro ao carregar dados', description: String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

  const isAdmin = useMemo(() => {
    return memberships.some(
      (m) =>
        m.user_id === user?.id && m.active && (m.role === 'owner' || m.role === 'clinic_admin'),
    )
  }, [memberships, user?.id])

  const isOwner = useMemo(() => {
    return memberships.some((m) => m.user_id === user?.id && m.active && m.role === 'owner')
  }, [memberships, user?.id])

  // ---------- Clínicas ----------
  const openClinicForm = (clinic?: Clinic) => {
    if (clinic) {
      setEditingClinicId(clinic.id)
      setClinicName(clinic.name)
      setClinicCode(clinic.code)
      setClinicTz(clinic.timezone || 'America/Recife')
    } else {
      setEditingClinicId(null)
      setClinicName('')
      setClinicCode('')
      setClinicTz('America/Recife')
    }
    setShowClinicForm(true)
  }

  const saveClinic = async () => {
    if (!clinicName.trim() || !clinicCode.trim()) {
      toast({ title: 'Preencha nome e código da clínica', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      if (editingClinicId) {
        const { error } = await supabase
          .from('clinics')
          .update({
            name: clinicName.trim(),
            code: clinicCode.trim().toUpperCase(),
            timezone: clinicTz,
          })
          .eq('id', editingClinicId)
        if (error) throw error
        toast({ title: 'Clínica atualizada' })
      } else {
        const orgId = clinics[0]?.organization_id
        if (!orgId) {
          toast({ title: 'Organização não encontrada', variant: 'destructive' })
          return
        }
        const { error } = await supabase.from('clinics').insert({
          organization_id: orgId,
          name: clinicName.trim(),
          code: clinicCode.trim().toUpperCase(),
          timezone: clinicTz,
        })
        if (error) throw error
        toast({ title: 'Clínica criada' })
      }
      setShowClinicForm(false)
      await loadAll()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e)
      toast({ title: 'Erro ao salvar clínica', description: msg, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- Convite ----------
  const toggleInviteClinic = (clinicId: string) => {
    setInviteClinicRoles((prev) =>
      prev.some((r) => r.clinic_id === clinicId)
        ? prev.filter((r) => r.clinic_id !== clinicId)
        : [...prev, { clinic_id: clinicId, role: inviteNewRole || 'viewer' }],
    )
  }

  const setRoleFor = (clinicId: string, role: string) => {
    setInviteClinicRoles((prev) => prev.map((r) => (r.clinic_id === clinicId ? { ...r, role } : r)))
  }

  const sendInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast({ title: 'Preencha nome e e-mail', variant: 'destructive' })
      return
    }
    if (inviteClinicRoles.length === 0) {
      toast({ title: 'Selecione pelo menos uma clínica', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_invite_user', {
        p_email: inviteEmail.trim(),
        p_name: inviteName.trim(),
        p_clinic_roles: inviteClinicRoles,
      })
      if (error) throw error
      toast({
        title: 'Convite enviado',
        description: `${inviteEmail} receberá acesso às clínicas selecionadas.`,
      })
      setInviteName('')
      setInviteEmail('')
      setInviteClinicRoles([])
      setInviteNewRole('')
      await loadAll()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e)
      toast({ title: 'Erro ao convidar', description: msg, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- Membership ----------
  const toggleMembership = async (m: Membership) => {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('memberships')
        .update({ active: !m.active })
        .eq('id', m.id)
      if (error) throw error
      toast({
        title: m.active ? 'Acesso revogado' : 'Acesso reativado',
        description: `${m.profiles?.name ?? 'Usuário'} — ${m.clinics?.code ?? ''}`,
      })
      await loadAll()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e)
      toast({ title: 'Erro ao alterar acesso', description: msg, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- Equipes ----------
  const saveTeam = async () => {
    if (!teamClinicId || !teamName.trim()) {
      toast({ title: 'Selecione a clínica e informe o nome da equipe', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('teams').insert({
        clinic_id: teamClinicId,
        name: teamName.trim(),
        queue_type: teamQueueType,
      })
      if (error) throw error
      toast({ title: 'Equipe criada' })
      setShowTeamForm(false)
      setTeamName('')
      await loadAll()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e)
      toast({ title: 'Erro ao criar equipe', description: msg, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const toggleTeamMember = async (tm: TeamMember) => {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ active: !tm.active })
        .eq('id', tm.id)
      if (error) throw error
      toast({ title: tm.active ? 'Membro desativado' : 'Membro reativado' })
      await loadAll()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || String(e)
      toast({ title: 'Erro ao alterar membro', description: msg, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const filteredMemberships = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return memberships
    return memberships.filter(
      (m) =>
        (m.profiles?.name ?? '').toLowerCase().includes(q) ||
        (m.clinics?.name ?? '').toLowerCase().includes(q) ||
        (m.clinics?.code ?? '').toLowerCase().includes(q) ||
        ROLE_LABELS[m.role]?.toLowerCase().includes(q),
    )
  }, [memberships, search])

  if (authLoading || (loading && session)) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
          <p className="text-sm text-[#6B6560]">Carregando administração...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <ShieldCheck className="w-12 h-12 text-[#D4AF37] mx-auto mb-4" />
          <h1 className="font-serif text-xl font-bold text-[#2D2A26] mb-2">Acesso restrito</h1>
          <p className="text-sm text-[#6B6560]">
            Somente proprietários e administradores de clínica acessam esta área.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-6 px-4 py-2 rounded-lg bg-[#D4AF37] text-white text-sm font-semibold hover:bg-[#B8960E]"
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2A26] font-sans">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#F1E5C8] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-lg font-bold tracking-wide">Administração</h1>
            <p className="text-xs text-[#6B6560]">Clínicas, usuários, acessos e equipes</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8] text-xs text-[#6B6560]">
              <Search className="w-3.5 h-3.5 text-[#B8960E]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário, clínica, papel..."
                className="bg-transparent outline-none w-44"
              />
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-[#6B6560] hover:bg-[#FFF8ED] border border-[#F1E5C8]"
            >
              Painel
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-[#FDFBF7] text-[#B8960E] border-x border-t border-[#F1E5C8]'
                  : 'text-[#6B6560] hover:text-[#D4AF37]'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ================= CLÍNICAS ================= */}
        {tab === 'clinics' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-base font-bold">Clínicas</h2>
              <button
                onClick={() => openClinicForm()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] text-white text-xs font-semibold hover:bg-[#B8960E]"
              >
                <Plus className="w-3.5 h-3.5" /> Nova clínica
              </button>
            </div>

            {showClinicForm && (
              <div className="bg-white rounded-xl border border-[#F1E5C8] p-4 sm:p-5 mb-4 shadow-sm">
                <h3 className="text-sm font-semibold mb-3">
                  {editingClinicId ? 'Editar clínica' : 'Nova clínica'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Nome</span>
                    <input
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                      placeholder="PS Estética Unidade..."
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Código</span>
                    <input
                      value={clinicCode}
                      onChange={(e) => setClinicCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                      placeholder="PSX"
                      maxLength={10}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Fuso horário</span>
                    <input
                      value={clinicTz}
                      onChange={(e) => setClinicTz(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                    />
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={saveClinic}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-[#D4AF37] text-white text-xs font-semibold hover:bg-[#B8960E] disabled:opacity-50"
                  >
                    {busy ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setShowClinicForm(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-[#6B6560] hover:bg-[#FFF8ED] border border-[#F1E5C8]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clinics.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-xl border border-[#F1E5C8] p-4 shadow-sm hover:shadow-gold transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8] flex items-center justify-center text-[#B8960E] font-bold text-sm">
                      {c.code}
                    </div>
                    <button
                      onClick={() => openClinicForm(c)}
                      className="p-1.5 rounded-lg text-[#6B6560] hover:text-[#D4AF37] hover:bg-[#FFF8ED]"
                      aria-label={`Editar ${c.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-semibold text-sm mt-3">{c.name}</h3>
                  <p className="text-xs text-[#6B6560] mt-1">{c.timezone}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        c.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-[#FFF8ED] text-[#B8960E] border border-[#F1E5C8]'
                      }`}
                    >
                      {c.status === 'active' ? 'Ativa' : c.status}
                    </span>
                    <span className="text-[10px] text-[#6B6560]">
                      {memberships.filter((m) => m.clinic_id === c.id && m.active).length} pessoas
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= USUÁRIOS / CONVITE ================= */}
        {tab === 'users' && (
          <section>
            <h2 className="font-serif text-base font-bold mb-1">Convidar usuário</h2>
            <p className="text-xs text-[#6B6560] mb-4">
              O convite concede acesso somente às clínicas selecionadas, com o papel escolhido.
              {!isOwner && ' Convites são enviados apenas pelo proprietário.'}
            </p>
            <div className="bg-white rounded-xl border border-[#F1E5C8] p-4 sm:p-5 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="text-[#6B6560] block mb-1">Nome</span>
                  <input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                    placeholder="Nome do colaborador"
                  />
                </label>
                <label className="text-xs">
                  <span className="text-[#6B6560] block mb-1">E-mail</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                    placeholder="colaborador@ps.com.br"
                  />
                </label>
              </div>

              <p className="text-xs text-[#6B6560] mt-4 mb-2 font-semibold">Clínicas e papéis</p>
              <div className="space-y-2">
                {clinics.map((c) => {
                  const sel = inviteClinicRoles.find((r) => r.clinic_id === c.id)
                  return (
                    <div
                      key={c.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED]"
                    >
                      <label className="flex items-center gap-2 text-xs font-medium flex-1">
                        <input
                          type="checkbox"
                          checked={!!sel}
                          onChange={() => toggleInviteClinic(c.id)}
                          className="accent-[#D4AF37]"
                        />
                        <span className="font-semibold">{c.code}</span>
                        <span className="text-[#6B6560]">{c.name}</span>
                      </label>
                      {sel && (
                        <select
                          value={sel.role}
                          onChange={(e) => setRoleFor(c.id, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#F1E5C8] bg-white text-xs outline-none focus:border-[#D4AF37]"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={sendInvite}
                disabled={busy || !isOwner}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D4AF37] text-white text-xs font-semibold hover:bg-[#B8960E] disabled:opacity-50"
                title={!isOwner ? 'Somente o proprietário envia convites' : undefined}
              >
                <UserPlus className="w-3.5 h-3.5" />
                {busy ? 'Enviando...' : 'Convidar'}
              </button>
            </div>

            <h3 className="font-serif text-sm font-bold mt-6 mb-3">Pessoas da organização</h3>
            <div className="bg-white rounded-xl border border-[#F1E5C8] shadow-sm overflow-hidden">
              {profiles.map((p) => {
                const ms = memberships.filter((m) => m.user_id === p.id)
                const ativo = ms.some((m) => m.active)
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-0 border-[#F1E5C8]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-[11px] text-[#6B6560] truncate">
                        {ms
                          .filter((m) => m.active)
                          .map((m) => `${m.clinics?.code} · ${ROLE_LABELS[m.role] ?? m.role}`)
                          .join(' | ') || 'sem acesso ativo'}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        ativo
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      }`}
                    >
                      {ativo ? 'Ativo' : 'Revogado'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ================= MEMBERSHIPS ================= */}
        {tab === 'memberships' && (
          <section>
            <h2 className="font-serif text-base font-bold mb-4">Memberships (acessos)</h2>
            <div className="bg-white rounded-xl border border-[#F1E5C8] shadow-sm overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="bg-[#FFF8ED] text-[#6B6560] text-left">
                    <th className="px-4 py-3 font-semibold">Pessoa</th>
                    <th className="px-4 py-3 font-semibold">Clínica</th>
                    <th className="px-4 py-3 font-semibold">Papel</th>
                    <th className="px-4 py-3 font-semibold">Atualizado</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMemberships.map((m) => (
                    <tr key={m.id} className="border-t border-[#F1E5C8]">
                      <td className="px-4 py-3 font-medium">{m.profiles?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{m.clinics?.code}</span>{' '}
                        <span className="text-[#6B6560]">{m.clinics?.name}</span>
                      </td>
                      <td className="px-4 py-3">{ROLE_LABELS[m.role] ?? m.role}</td>
                      <td className="px-4 py-3 text-[#6B6560]">
                        {new Date(m.updated_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            m.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-600 border border-red-200'
                          }`}
                        >
                          {m.active ? 'Ativo' : 'Revogado'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleMembership(m)}
                          disabled={busy}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border disabled:opacity-50 ${
                            m.active
                              ? 'text-red-600 border-red-200 hover:bg-red-50'
                              : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {m.active ? 'Revogar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================= EQUIPES ================= */}
        {tab === 'teams' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-base font-bold">Equipes</h2>
              <button
                onClick={() => setShowTeamForm(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] text-white text-xs font-semibold hover:bg-[#B8960E]"
              >
                <Plus className="w-3.5 h-3.5" /> Nova equipe
              </button>
            </div>

            {showTeamForm && (
              <div className="bg-white rounded-xl border border-[#F1E5C8] p-4 sm:p-5 mb-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Clínica</span>
                    <select
                      value={teamClinicId}
                      onChange={(e) => setTeamClinicId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                    >
                      <option value="">Selecione...</option>
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Nome da equipe</span>
                    <input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                      placeholder="Recepção, Vendas..."
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-[#6B6560] block mb-1">Tipo de fila</span>
                    <input
                      value={teamQueueType}
                      onChange={(e) => setTeamQueueType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#F1E5C8] bg-[#FFF8ED] text-sm outline-none focus:border-[#D4AF37]"
                    />
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={saveTeam}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-[#D4AF37] text-white text-xs font-semibold hover:bg-[#B8960E] disabled:opacity-50"
                  >
                    {busy ? 'Criando...' : 'Criar equipe'}
                  </button>
                  <button
                    onClick={() => setShowTeamForm(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-[#6B6560] hover:bg-[#FFF8ED] border border-[#F1E5C8]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {teams.map((t) => {
                const members = teamMembers.filter((tm) => tm.team_id === t.id)
                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-xl border border-[#F1E5C8] p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">
                          {t.name}{' '}
                          <span className="text-[#6B6560] font-normal">
                            · {t.clinics?.code} {t.clinics?.name}
                          </span>
                        </h3>
                        <p className="text-[11px] text-[#6B6560] mt-0.5">
                          Fila: {t.queue_type} · {members.filter((m) => m.active).length} membros
                          ativos
                        </p>
                      </div>
                    </div>
                    {members.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {members.map((tm) => (
                          <span
                            key={tm.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                              tm.active
                                ? 'bg-[#FFF8ED] border-[#F1E5C8] text-[#2D2A26]'
                                : 'bg-red-50 border-red-200 text-red-500 line-through'
                            }`}
                          >
                            {tm.profiles?.name ?? 'Membro'}
                            <button
                              onClick={() => toggleTeamMember(tm)}
                              disabled={busy}
                              className="text-[10px] font-semibold text-[#B8960E] hover:underline disabled:opacity-50"
                            >
                              {tm.active ? 'desativar' : 'reativar'}
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
