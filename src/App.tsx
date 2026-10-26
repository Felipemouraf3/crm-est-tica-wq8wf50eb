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
            {/* P2-S02-T03: tela de busca — todos os papéis com vínculo ativo */}
>>>>>>>
            <Route path="/pacientes/identificar" element={<IdentificarPaciente />} />
            {/* P2-S04-T02: caixa de entrada e conversa em tempo real */}
            <Route path="/atendimento" element={<Atendimento />} />
            <Route path="/atendimento/:conversationId" element={<Conversa />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
