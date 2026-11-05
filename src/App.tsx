/* Main App Component - Handles routing (using react-router-dom), query client and other providers */
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import Layout from './components/Layout'
import Index from './pages/Index'
import ForgotPassword from './pages/ForgotPassword'
import Inicio from './pages/Inicio'
import AdminProtegido from './pages/AdminProtegido'
import AdminConexoes from './pages/AdminConexoes'
import AdminCanais from './pages/AdminCanais'
import AdminFilas from './pages/AdminFilas'
import AdminConhecimento from './pages/AdminConhecimento'
import AdminAgentes from './pages/AdminAgentes'
import AdminDadosExperts from './pages/AdminDadosExperts'
import AdminCadencias from './pages/AdminCadencias'
import Recuperacao from './pages/Recuperacao'
import RedefinirSenha from './pages/RedefinirSenha'
import AdminFunil from './pages/AdminFunil'
import Funil from './pages/Funil'
import Filas from './pages/Filas'
import MinhaFila from './pages/MinhaFila'
import IdentificarPaciente from './pages/IdentificarPaciente'
import Atendimento from './pages/Atendimento'
import Conversa from './pages/Conversa'
import SegundoFator from './pages/SegundoFator'
import { RequireRole } from './components/guards'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* item 1 (29/10): tela que recebe o link de recuperação — antes o link caía em 404 */}
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            {/* /signup removida em P2-S01-T03: acesso somente por convite */}
            <Route path="/inicio" element={<Inicio />} />
            <Route path="/dashboard" element={<Navigate to="/inicio" replace />} />
            <Route path="/segundo-fator" element={<SegundoFator />} />
            <Route path="/admin" element={<AdminProtegido />} />
            {/* P2-S02-T03: cartão de saúde da conexão (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/conexoes"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminConexoes />
                </RequireRole>
              }
            />
            {/* P2-S03-T01: canais WhatsApp (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/canais"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminCanais />
                </RequireRole>
              }
            />
            {/* P2-S05-T01: console de filas, horários e prazos (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/filas"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminFilas />
                </RequireRole>
              }
            />
            {/* P2-S06-T03: console de conhecimento (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/conhecimento"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminConhecimento />
                </RequireRole>
              }
            />
            {/* P2-S06-T03: console de agentes — interruptor e rotas (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/agentes"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminAgentes />
                </RequireRole>
              }
            />
            {/* P3-S02-T02: quadro do funil (todos os papéis; RPCs filtram por dono) */}
            <Route path="/funil" element={<Funil />} />
            {/* P3-S02-T01: console do funil (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/funil"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminFunil />
                </RequireRole>
              }
            />
            {/* P3-S06-T02: recuperação de avaliações (comercial e gestão) */}
            <Route
              path="/recuperacao"
              element={
                <RequireRole papeis={['owner', 'clinic_admin', 'manager', 'sales', 'post_sales']}>
                  <Recuperacao />
                </RequireRole>
              }
            />
            {/* P3-S05-T01: cadências de follow-up.
                `manager` entra: é quem opera a cadência comercial e a RPC
                admin_save_followup_policy já o autoriza no servidor. Rota mais
                restrita que o servidor bloqueava justamente o dono da rotina
                (achado ao provar a tela em 04/11). */}
            <Route
              path="/admin/cadencias"
              element={
                <RequireRole papeis={['owner', 'clinic_admin', 'manager']} exigeMfa>
                  <AdminCadencias />
                </RequireRole>
              }
            />
            {/* P3-S01-T01: dados do Clínica Experts (owner/clinic_admin + AAL2) */}
            <Route
              path="/admin/dados-experts"
              element={
                <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                  <AdminDadosExperts />
                </RequireRole>
              }
            />
            {/* P2-S02-T03: tela de busca — todos os papéis com vínculo ativo */}
            <Route path="/pacientes/identificar" element={<IdentificarPaciente />} />
            {/* P2-S04-T02: caixa de entrada e conversa em tempo real */}
            <Route path="/atendimento" element={<Atendimento />} />
            <Route path="/atendimento/:conversationId" element={<Conversa />} />
            {/* P2-S05-T03: visão do gestor da fila (todos os papéis; RPCs revalidam) */}
            <Route path="/filas" element={<Filas />} />
          </Route>
          {/* P3-S03-T02: minha fila do dia — tem AppShell próprio (fora do Layout) */}
          <Route path="/minha-fila" element={<MinhaFila />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
