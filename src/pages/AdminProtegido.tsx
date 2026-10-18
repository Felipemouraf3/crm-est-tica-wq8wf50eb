// src/pages/AdminProtegido.tsx — P2-S01-T03
// Casca de proteção da rota /admin: owner/clinic_admin + segundo fator (AAL2).
// O conteúdo (abas Clínicas/Usuários/Memberships/Equipes, P1-S03-T01) permanece.
import { RequireRole } from '@/components/guards'
import Admin from './Admin'

export default function AdminProtegido() {
  return (
    <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
      <Admin />
    </RequireRole>
  )
}
