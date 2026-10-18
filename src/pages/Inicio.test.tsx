// src/pages/Inicio.test.tsx — P2-S01-T03/T04 (atualizado 2026-10-18: rotas reais via Routes)
// Testes de tela: (1) usuário sem vínculo vê "sem acesso";
// (2) papel insuficiente vê "Acesso restrito"; (3) owner sem AAL2 vai para
// /segundo-fator; (4) Dashboard sem dado mostra estado vazio (nunca número fixo).
// Lições: mockar pelo MESMO caminho que o componente importa (@/lib/...);
// chain do from() precisa ser thenable; MemoryRouter + Routes para testar redirect.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const W = { timeout: 3000, interval: 50 }

vi.mock('@/lib/supabase/client', () => {
  const mfa = {
    listFactors: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal2' } })),
  }
  return {
    supabase: {
      auth: { getSession: vi.fn(), mfa, signOut: vi.fn(async () => ({})) },
      from: vi.fn(),
    },
  }
})

import { supabase } from '@/lib/supabase/client'
import { RequireAuth, RequireRole, EmptyState } from '../components/guards'

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>
const mfa = (supabase.auth as unknown as { mfa: Record<string, ReturnType<typeof vi.fn>> }).mfa
const from = supabase.from as ReturnType<typeof vi.fn>

function mockFrom(resposta: { data: unknown; error: unknown }) {
  from.mockImplementation(() => {
    const chain: any = {}
    const resolve = () => Promise.resolve(resposta)
    // terminal inteligente: await em qualquer ponto da chain resolve a resposta
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(() => Promise.resolve(resposta))
    chain.then = (onOk: (r: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(resposta).then(onOk, onErr)
    return chain
  })
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: null } })
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' } })
  from.mockReset()
})

describe('RequireAuth', () => {
  it('sem sessão → redireciona ao login', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/privado']}>
        <Routes>
          <Route
            path="/privado"
            element={
              <RequireAuth>
                <div>conteúdo</div>
              </RequireAuth>
            }
          />
          <Route path="/" element={<div data-testid="login">login</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('login')).toBeTruthy(), W)
  })

  it('com sessão e sem vínculo → tela "sem acesso"', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockFrom({ data: [], error: null })
    render(
      <MemoryRouter>
        <RequireAuth>
          <div>conteúdo</div>
        </RequireAuth>
      </MemoryRouter>,
    )
    await waitFor(
      () => expect(screen.getByText(/não tem acesso a nenhuma clínica/i)).toBeTruthy(),
      W,
    )
  })

  it('com vínculo → mostra conteúdo', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockFrom({ data: [{ role: 'sales', active: true }], error: null })
    render(
      <MemoryRouter>
        <RequireAuth>
          <div>conteúdo protegido</div>
        </RequireAuth>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeTruthy(), W)
  })
})

describe('RequireRole', () => {
  it('papel insuficiente → "Acesso restrito"', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockFrom({ data: [{ role: 'sales', active: true }], error: null })
    render(
      <MemoryRouter>
        <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
          <div>área admin</div>
        </RequireRole>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Acesso restrito')).toBeTruthy(), W)
  })

  it('owner sem AAL2 → vai para /segundo-fator', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    mockFrom({ data: [{ role: 'owner', active: true }], error: null })
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
                <div>área admin</div>
              </RequireRole>
            }
          />
          <Route path="/segundo-fator" element={<div data-testid="tela-mfa">tela-mfa</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('tela-mfa')).toBeTruthy(), W)
  })

  it('owner com AAL2 → libera', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' } })
    mockFrom({ data: [{ role: 'owner', active: true }], error: null })
    render(
      <MemoryRouter>
        <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
          <div>área admin</div>
        </RequireRole>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('área admin')).toBeTruthy(), W)
  })
})

describe('Estados (RN-P2-S01-03)', () => {
  it('EmptyState não exibe número fixo', () => {
    render(<EmptyState titulo="Ainda sem dados" mensagem="Nenhuma clínica vinculada." />)
    expect(screen.getByText('Ainda sem dados')).toBeTruthy()
    expect(screen.queryByText(/R\$\s*\d/)).toBeNull()
    expect(screen.queryByText(/\b\d{2,}\b/)).toBeNull()
  })
})
