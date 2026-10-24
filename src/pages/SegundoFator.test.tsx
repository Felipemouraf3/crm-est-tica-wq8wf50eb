// src/pages/SegundoFator.test.tsx — P2-S01 (tela de segundo fator, 2026-10-18)
// Testes de tela: enroll gera QR e verifica código; challenge pede código;
// erro amigável em código inválido; sucesso mostra continuar.
// 2026-10-20: componente em REST direto (GoTrue snake_case) — testes mockam o
// fetch global; listagem via GET /user com factor_type (formato real do GoTrue);
// verify sempre com challenge_id; qr_code chega como SVG cru e vira data-URL.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const W = { timeout: 3000, interval: 50 }

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1' } })),
    },
    from: vi.fn(),
  },
}))

// mock do AppShell para não puxar ClinicSelector
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { supabase } from '@/lib/supabase/client'
import SegundoFator from './SegundoFator'

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>
const from = supabase.from as ReturnType<typeof vi.fn>

// mock do fetch global: roteia /auth/v1/* para mfaFetch
const mfaFetch = vi.fn()
const realFetch = globalThis.fetch
function instalarFetch() {
  globalThis.fetch = vi.fn(async (input: unknown, init?: unknown) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    if (url.includes('/auth/v1/')) return mfaFetch(url, init)
    return realFetch(input as never, init as never)
  }) as unknown as typeof fetch
}
function respostaMfa(corpo: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }
}

function mockFrom(resposta: { data: unknown; error: unknown }) {
  from.mockImplementation(() => {
    const chain: any = {}
    const resolve = () => Promise.resolve(resposta)
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
  getSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' }, access_token: 'jwt-teste' } },
  })
  mockFrom({ data: [{ role: 'owner', active: true }], error: null })
  instalarFetch()
  mfaFetch.mockReset()
})

describe('SegundoFator', () => {
  it('sem fator → botão de gerar QR', async () => {
    mfaFetch.mockImplementation((url: string) =>
      url.endsWith('/auth/v1/user')
        ? Promise.resolve(respostaMfa({ factors: [] }))
        : Promise.resolve(respostaMfa({}, 404)),
    )
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Gerar código QR')).toBeTruthy(), W)
  })

  it('enroll → QR (data-URL SVG) + chave manual + campo de código', async () => {
    mfaFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.endsWith('/auth/v1/user')) return Promise.resolve(respostaMfa({ factors: [] }))
      if (url.endsWith('/auth/v1/factors') && init?.method === 'POST')
        return Promise.resolve(
          respostaMfa({
            id: 'f1',
            type: 'totp',
            totp: {
              qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
              secret: 'ABCD1234EFGH5678',
            },
          }),
        )
      return Promise.resolve(respostaMfa({}, 404))
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => user.click(screen.getByText('Gerar código QR')), W)
    await waitFor(() => expect(screen.getByAltText('QR do segundo fator')).toBeTruthy(), W)
    const img = screen.getByAltText('QR do segundo fator') as HTMLImageElement
    expect(img.src.startsWith('data:image/svg+xml')).toBeTruthy()
    expect(screen.getByText(/Chave manual: ABCD1234EFGH5678/)).toBeTruthy()
    expect(screen.getByLabelText('Código do autenticador')).toBeTruthy()
  })

  it('código correto no enroll → challenge + verify com challenge_id → sucesso', async () => {
    mfaFetch.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith('/auth/v1/user')) return Promise.resolve(respostaMfa({ factors: [] }))
      if (url.endsWith('/auth/v1/factors') && init?.method === 'POST')
        return Promise.resolve(
          respostaMfa({ id: 'f1', type: 'totp', totp: { qr_code: '<svg/>', secret: 'ABCD1234' } }),
        )
      if (url.endsWith('/factors/f1/challenge') && init?.method === 'POST')
        return Promise.resolve(respostaMfa({ id: 'c1' }))
      if (url.endsWith('/factors/f1/verify') && init?.method === 'POST') {
        const corpo = JSON.parse((init?.body as string) || '{}')
        return corpo.challenge_id === 'c1'
          ? Promise.resolve(respostaMfa({}))
          : Promise.resolve(respostaMfa({ msg: 'challenge obrigatório' }, 422))
      }
      return Promise.resolve(respostaMfa({}, 404))
    })
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
    mfaFetch.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith('/auth/v1/user')) return Promise.resolve(respostaMfa({ factors: [] }))
      if (url.endsWith('/auth/v1/factors') && init?.method === 'POST')
        return Promise.resolve(
          respostaMfa({ id: 'f1', type: 'totp', totp: { qr_code: '<svg/>', secret: 'ABCD1234' } }),
        )
      if (url.endsWith('/factors/f1/challenge') && init?.method === 'POST')
        return Promise.resolve(respostaMfa({ id: 'c1' }))
      if (url.endsWith('/factors/f1/verify') && init?.method === 'POST')
        return Promise.resolve(
          respostaMfa(
            { code: 400, error_code: 'totp_verified', msg: 'Invalid TOTP code detected' },
            400,
          ),
        )
      return Promise.resolve(respostaMfa({}, 404))
    })
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

  it('fator já verificado (factor_type, formato real do GoTrue) → challenge direto', async () => {
    mfaFetch.mockImplementation((url: string) => {
      if (url.endsWith('/auth/v1/user'))
        return Promise.resolve(
          respostaMfa({
            factors: [
              { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'CRM Estética' },
            ],
          }),
        )
      return Promise.resolve(respostaMfa({}, 404))
    })
    render(
      <MemoryRouter initialEntries={['/segundo-fator']}>
        <SegundoFator />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeTruthy(), W)
    expect(screen.getByText('Verificar')).toBeTruthy()
  })
})
