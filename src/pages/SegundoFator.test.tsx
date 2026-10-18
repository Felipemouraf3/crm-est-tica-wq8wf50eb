// src/pages/SegundoFator.test.tsx — P2-S01 (tela de segundo fator, 2026-10-18)
// Testes de tela: enroll gera QR e verifica código; challenge pede código;
// erro amigável em código inválido; sucesso mostra continuar.
// Lições: mockar pelo MESMO caminho que o componente importa (@/lib/...);
// chain do from() precisa ser thenable (await em qualquer ponto resolve);
// não usar vi.clearAllMocks() quando o mock é configurado no beforeEach.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const W = { timeout: 3000, interval: 50 }

vi.mock('@/lib/supabase/client', () => {
  const mfa = {
    listFactors: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1' } })),
  }
  return {
    supabase: {
      auth: { getSession: vi.fn(), mfa },
      from: vi.fn(),
    },
  }
})

// mock do AppShell para não puxar ClinicSelector
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { supabase } from '@/lib/supabase/client'
import SegundoFator from './SegundoFator'

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
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  mockFrom({ data: [{ role: 'owner', active: true }], error: null })
  mfa.listFactors.mockReset()
  mfa.enroll.mockReset()
  mfa.unenroll.mockReset()
  mfa.challenge.mockReset()
  mfa.verify.mockReset()
})

describe('SegundoFator', () => {
  it('sem fator → botão de gerar QR', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Gerar código QR')).toBeTruthy(), W)
  })

  it('enroll → QR + chave manual + campo de código', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
    mfa.enroll.mockResolvedValue({
      data: { id: 'f1', totp: { qr_code: 'https://qr.example/x', secret: 'ABCD1234EFGH5678' } },
      error: null,
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => user.click(screen.getByText('Gerar código QR')), W)
    await waitFor(() => expect(screen.getByAltText('QR do segundo fator')).toBeTruthy(), W)
    expect(screen.getByText(/Chave manual: ABCD1234EFGH5678/)).toBeTruthy()
    expect(screen.getByLabelText('Código do autenticador')).toBeTruthy()
  })

  it('código correto no enroll → sucesso + continuar', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
    mfa.enroll.mockResolvedValue({
      data: { id: 'f1', totp: { qr_code: 'https://qr.example/x', secret: 'ABCD1234' } },
      error: null,
    })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => user.click(screen.getByText('Gerar código QR')), W)
    const campo = await screen.findByLabelText('Código do autenticador', {}, W)
    await user.type(campo, '123456')
    await user.click(screen.getByText('Verificar e ativar'))
    await waitFor(
      () => expect(screen.getByText(/Segundo fator ativado e verificado/)).toBeTruthy(),
      W,
    )
    expect(screen.getByText(/Continuar para Administração/)).toBeTruthy()
  })

  it('código inválido → mensagem amigável', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
    mfa.enroll.mockResolvedValue({
      data: { id: 'f1', totp: { qr_code: 'https://qr.example/x', secret: 'ABCD1234' } },
      error: null,
    })
    mfa.verify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code detected' } })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => user.click(screen.getByText('Gerar código QR')), W)
    const campo = await screen.findByLabelText('Código do autenticador', {}, W)
    await user.type(campo, '000000')
    await user.click(screen.getByText('Verificar e ativar'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), W)
    expect(screen.getByText(/Código inválido ou expirado/)).toBeTruthy()
  })

  it('fator já verificado → challenge direto', async () => {
    mfa.listFactors.mockResolvedValue({
      data: {
        all: [{ id: 'f1', type: 'totp', status: 'verified', friendly_name: 'CRM Estética' }],
      },
      error: null,
    })
    mfa.challenge.mockResolvedValue({ data: { id: 'c1' }, error: null })
    mfa.verify.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeTruthy(), W)
    expect(screen.getByText('Verificar')).toBeTruthy()
  })
})
