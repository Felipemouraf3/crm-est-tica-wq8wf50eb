import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut,
  Sparkles,
  User,
  ShieldCheck,
  Calendar,
  Users,
  Award,
  ChevronRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Bell,
  Search,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, profile, session, loading, signOut } = useAuth()

  // Rota estritamente protegida: redireciona para "/" se não autenticado
  useEffect(() => {
    if (!loading && !session) {
      navigate('/', { replace: true })
    }
  }, [session, loading, navigate])

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8ED]/40 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
          <p className="text-sm text-[#6B6560] font-medium font-sans">
            Carregando painel do CRM...
          </p>
        </div>
      </div>
    )
  }

  const userName =
    profile?.name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Dra. Especialista'

  const userEmail = user?.email || 'contato@clinica.com.br'
  const clinicName = profile?.clinic_name || 'Clínica Estética & Bem-Estar'

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2A26] flex flex-col font-sans">
      {/* Top Navbar Dourada & Branca */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#F1E5C8] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo e Nome da Clínica */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-[#FFF8ED] shadow-gold">
              <svg
                className="w-5 h-5 text-[#D4AF37]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2C8 6 4 10 4 14a8 8 0 0 0 16 0c0-4-4-8-8-12z" />
                <path d="M12 8c2.5 2 3.5 4 3.5 6a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-6z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-lg text-[#2D2A26] tracking-wide">
                  CRM Estética
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFF8ED] text-[#B8960E] border border-[#F1E5C8]">
                  <Sparkles className="w-2.5 h-2.5" />
                  VIP Pro
                </span>
              </div>
              <span className="text-xs text-[#6B6560] block font-sans">{clinicName}</span>
            </div>
          </div>

          {/* Ações da Direita & Logout */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8] text-xs text-[#6B6560]">
              <Search className="w-3.5 h-3.5 text-[#B8960E]" />
              <span>Buscar paciente, procedimento ou horário...</span>
            </div>

            <button
              type="button"
              className="p-2 rounded-lg text-[#6B6560] hover:text-[#D4AF37] hover:bg-[#FFF8ED] transition-colors relative"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D4AF37]" />
            </button>

            {/* Atalho Administração */}
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#B8960E] hover:bg-[#FFF8ED] border border-[#F1E5C8] transition-colors cursor-pointer"
              aria-label="Ir para administração"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Administração</span>
            </button>

            {/* Perfil & Botão Sair */}
            <div className="flex items-center gap-3 pl-3 border-l border-[#F1E5C8]">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-[#2D2A26] leading-tight">{userName}</p>
                <p className="text-[11px] text-[#6B6560] truncate max-w-[150px]">{userEmail}</p>
              </div>

              <div className="w-9 h-9 rounded-full bg-[#FFF8ED] border border-[#D4AF37] flex items-center justify-center text-[#B8960E] font-medium text-xs shadow-gold">
                {userName.charAt(0).toUpperCase()}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sair da conta"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#D93025] hover:bg-red-50 border border-transparent hover:border-red-200 transition-all duration-150 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        {/* Banner de Boas-Vindas */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2D2A26] via-[#38332D] to-[#4A4237] p-6 sm:p-8 text-white shadow-xl mb-8">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#D4AF37] via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-xs font-medium text-[#F1E5C8] mb-4">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Sessão autenticada com sucesso
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
              Olá, {userName}!
            </h1>
            <p className="text-sm sm:text-base text-[#F1E5C8]/80 leading-relaxed font-sans mb-6">
              Bem-vindo(a) ao CRM Estética. Sua plataforma completa para controle de atendimentos,
              protocolos faciais e relacionamento com clientes com o mais alto padrão.
            </p>

            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white/10 backdrop-blur border border-white/10 text-xs text-white">
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{userEmail}</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white/10 backdrop-blur border border-white/10 text-xs text-white">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Acesso Seguro (Supabase Auth)</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white/10 backdrop-blur border border-white/10 text-xs text-white">
                <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Plano Especialista Gold</span>
              </div>
            </div>
          </div>
        </div>

        {/* Métricas Rápidas de Estética */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="p-5 bg-white rounded-xl border border-[#F1E5C8] shadow-sm hover:shadow-gold transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">
                Consultas Hoje
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#FFF8ED] text-[#B8960E] flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-serif text-[#2D2A26]">8 agendamentos</div>
            <div className="flex items-center gap-1.5 text-xs text-[#1E8E3E] font-medium mt-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>2 procedimentos de harmonização</span>
            </div>
          </div>

          <div className="p-5 bg-white rounded-xl border border-[#F1E5C8] shadow-sm hover:shadow-gold transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">
                Pacientes Ativos
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#FFF8ED] text-[#B8960E] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-serif text-[#2D2A26]">142 clientes</div>
            <div className="flex items-center gap-1.5 text-xs text-[#1E8E3E] font-medium mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>98% taxa de fidelização</span>
            </div>
          </div>

          <div className="p-5 bg-white rounded-xl border border-[#F1E5C8] shadow-sm hover:shadow-gold transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">
                Próximo Atendimento
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#FFF8ED] text-[#B8960E] flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-serif text-[#2D2A26]">14:30</div>
            <div className="text-xs text-[#6B6560] mt-1 truncate">
              Renata Vasconcelos — Peeling de Diamante
            </div>
          </div>

          <div className="p-5 bg-white rounded-xl border border-[#F1E5C8] shadow-sm hover:shadow-gold transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">
                Status da Conta
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#1E8E3E] flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-serif text-[#1E8E3E]">Ativa e Segura</div>
            <div className="text-xs text-[#6B6560] mt-1">Supabase Auth integrado</div>
          </div>
        </div>

        {/* Card Explicativo de Fluxo Concluído */}
        <div className="bg-white rounded-xl border border-[#F1E5C8] p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#F1E5C8] pb-4 mb-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2D2A26]">
                Autenticação Operacional & Integrada
              </h2>
              <p className="text-xs text-[#6B6560]">
                O fluxo de autenticação foi concluído com sucesso e está conectado ao banco de dados
                Supabase da clínica.
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs font-semibold text-[#D4AF37] hover:text-[#B8960E] flex items-center gap-1 hover:underline"
            >
              <span>Testar encerramento de sessão</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#6B6560]">
            <div className="p-3.5 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8]">
              <p className="font-semibold text-[#2D2A26] mb-1">1. Login & Redirecionamento</p>
              <p>
                Autenticação via <code className="text-[#B8960E]">signInWithPassword</code> com
                persistência local e proteção de rotas.
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8]">
              <p className="font-semibold text-[#2D2A26] mb-1">2. Recuperação de Senha</p>
              <p>
                Rota <code className="text-[#B8960E]">/forgot-password</code> integrada com{' '}
                <code className="text-[#B8960E]">resetPasswordForEmail</code>.
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF8ED] border border-[#F1E5C8]">
              <p className="font-semibold text-[#2D2A26] mb-1">3. Solicitação de Acesso</p>
              <p>
                Rota <code className="text-[#B8960E]">/signup</code> conectada com{' '}
                <code className="text-[#B8960E]">signUp</code> e criação automática de perfil.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Mínimo */}
      <footer className="border-t border-[#F1E5C8] py-4 bg-white text-center text-xs text-[#6B6560]">
        CRM Estética &bull; Sistema de Gestão para Clínicas e Spas de Excelência &bull; Todos os
        direitos reservados.
      </footer>
    </div>
  )
}
