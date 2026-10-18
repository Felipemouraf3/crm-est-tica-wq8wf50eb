// src/pages/Inicio.test.tsx — P2-S01-T03/T04
// Testes de tela: (1) usuário sem vínculo vê "sem acesso";
// (2) papel insuficiente vê "Acesso restrito"; (3) Dashboard sem dado
// mostra estado vazio (nunca número fixo). Vitest + Testing Library.
// Prova da suíte (P2-S01-T04): npm test → exit 0 verde; teste falho → exit 1.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const W = { timeout: 3000, interval: 50 }
import { RequireAuth, RequireRole, EmptyState } from '../components/guards'

// mock do cliente supabase (sem rede)
vi.mock('../lib/supabase/client', () => {
  const mock = {
    auth: {
      getSession: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal2' } })),
      },
      signOut: vi.fn(async () => ({})),
    },
    from: vi.fn(),
  }
  return { supabase: mock }
})

import { supabase } from '../lib/supabase/client'

function mockFrom(resposta: { data: unknown; error: unknown }) {
  ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const chain: any = {}
    const resolve = () => Promise.resolve(resposta)
    chain.select = vi.fn(() => chain)
    // o ÚLTIMO eq() da consulta resolve (padrão do teste: 2 eqs)
    let eqs = 0
    chain.eq = vi.fn(() => {
      eqs++
      return eqs >= 2 ? resolve() : chain
    })
    chain.limit = vi.fn(resolve)
    chain.maybeSingle = vi.fn(resolve)
    return chain
  })
}

beforeEach(() => {
  ;(supabase.from as ReturnType<typeof vi.fn>).mockReset()
})

describe('RequireAuth', () => {
  it('sem sessão → redireciona ao login', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    })
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { assign }, writable: true })
    render(
      <RequireAuth>
        <div>conteúdo</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'), W)
  })

  it('com sessão e sem vínculo → tela "sem acesso"', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    mockFrom({ data: [], error: null })
    render(
      <RequireAuth>
        <div>conteúdo</div>
      </RequireAuth>,
    )
    await waitFor(
      () => expect(screen.getByText(/não tem acesso a nenhuma clínica/i)).toBeTruthy(),
      W,
    )
  })

  it('com vínculo → mostra conteúdo', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    mockFrom({ data: [{ role: 'sales', active: true }], error: null })
    render(
      <RequireAuth>
        <div>conteúdo protegido</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeTruthy(), W)
  })
})

describe('RequireRole', () => {
  it('papel insuficiente → "Acesso restrito"', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    mockFrom({ data: [{ role: 'sales', active: true }], error: null })
    render(
      <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
        <div>área admin</div>
      </RequireRole>,
    )
    await waitFor(() => expect(screen.getByText('Acesso restrito')).toBeTruthy(), W)
  })

  it('owner sem AAL2 → pede segundo fator', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    ;(
      supabase.auth.mfa.getAuthenticatorAssuranceLevel as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { currentLevel: 'aal1' },
    })
    mockFrom({ data: [{ role: 'owner', active: true }], error: null })
    render(
      <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
        <div>área admin</div>
      </RequireRole>,
    )
    await waitFor(() => expect(screen.getByText(/segundo fator necessário/i)).toBeTruthy(), W)
  })

  it('owner com AAL2 → libera', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    ;(
      supabase.auth.mfa.getAuthenticatorAssuranceLevel as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { currentLevel: 'aal2' },
    })
    mockFrom({ data: [{ role: 'owner', active: true }], error: null })
    render(
      <RequireRole papeis={['owner', 'clinic_admin']} exigeMfa>
        <div>área admin</div>
      </RequireRole>,
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
