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
            <Route path="/admin" element={<AdminProtegido />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
