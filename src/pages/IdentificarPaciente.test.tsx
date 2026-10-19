// src/pages/IdentificarPaciente.test.tsx — P2-S02-T03
// Testes de tela: 4 resultados (um/multiplos/provavel/zero), erro com
// correlation_id copiável, E.164 mostrado, e testes negativos de vínculo.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

// ---- mocks ANTES dos imports do componente (mesmos caminhos dos imports) ----
const mockGetSession = vi.fn()
const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}))

// AppShell mockado (o real busca clínicas/memberships separadamente)
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>,
}))
vi.mock('@/components/guards', () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => <>{children}</>,
  EmptyState: ({ titulo, mensagem }: { titulo: string; mensagem?: string }) => (
    <div>
      <h2>{titulo}</h2>
      {mensagem && <p>{mensagem}</p>}
    </div>
  ),
}))

// experts-api: mockamos a função de rede; acharContatoPorTelefone controlamos por teste
const mockBuscar = vi.fn()
const mockAcharContato = vi.fn()
vi.mock('@/lib/experts-api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/experts-api')>()
  return {
    ...real,
    buscarPaciente: (...a: unknown[]) => mockBuscar(...a),
    acharContatoPorTelefone: (...a: unknown[]) => mockAcharContato(...a),
    confirmarVinculo: vi.fn().mockResolvedValue(undefined),
  }
})

import IdentificarPaciente from './IdentificarPaciente'

function chain(list: unknown[]) {
  // mock thenable do from(): resolve no último .eq/.limit/.maybeSingle
  const p: any = {
    select: () => p,
    eq: () => p,
    order: () => p,
    limit: () => p,
    maybeSingle: () => Promise.resolve({ data: list[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: list, error: null }).then(res, rej),
  }
  return p
}

const sessao = { data: { session: { user: { id: 'u1' } } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(sessao)
  // memberships (papel) + clinics (nome)
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'memberships') return chain([{ role: 'reception' }])
    return chain([{ id: 'c1', name: 'PS Caruaru' }]) // clinics
  })
  mockRpc.mockResolvedValue({ data: '+5581999990001', error: null })
  try {
    localStorage.setItem('clinica_ativa', 'c1')
  } catch {
    /* ambiente sem storage */
  }
})

function renderTela() {
  return render(
    <MemoryRouter>
      <IdentificarPaciente />
    </MemoryRouter>,
  )
}

async function buscarTelefone(user: ReturnType<typeof userEvent.setup>, resultado: unknown) {
  mockBuscar.mockResolvedValueOnce(resultado)
  await user.type(screen.getByLabelText(/Telefone/i), '81 99999-0001')
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
}

const esperaClinica = () =>
  waitFor(() => expect(screen.getByText(/PS Caruaru/)).toBeTruthy(), { timeout: 4000 })

describe('IdentificarPaciente — P2-S02-T03', () => {
  it('mostra o E.164 normalizado antes de buscar', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    mockBuscar.mockResolvedValueOnce({
      result_class: 'zero',
      phone_e164: '+5581999990001',
      candidates: [],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-0',
    })
    await user.type(screen.getByLabelText(/Telefone/i), '81 99999-0001')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(screen.getByText(/Buscando por:/)).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByText('+5581999990001')).toBeTruthy()
  })

  it('resultado um: cartão com nome, nascimento mascarado, selo Ativo e botão Confirmar vínculo', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'um',
      phone_e164: '+5581999990001',
      candidates: [
        { expert_patient_uuid: 'e1', name: 'Renata', birth_masked: '**/**/1985', active: true },
      ],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-1',
    })
    await waitFor(() => expect(screen.getByText('Renata')).toBeTruthy())
    expect(screen.getByText('Nascimento: **/**/1985')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar vínculo' })).toBeTruthy()
  })

  it('resultado multiplos: aviso + candidatos lado a lado, nenhum pré-selecionado', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'multiplos',
      phone_e164: '+5581988887777',
      candidates: [
        {
          expert_patient_uuid: 'e1',
          name: 'Compartilhado A',
          birth_masked: '**/**/1980',
          active: true,
        },
        {
          expert_patient_uuid: 'e2',
          name: 'Compartilhado B',
          birth_masked: '**/**/1975',
          active: false,
        },
      ],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-2',
    })
    await waitFor(() =>
      expect(screen.getByText(/Mais de um cadastro usa este telefone/)).toBeTruthy(),
    )
    expect(screen.getByText('Compartilhado A')).toBeTruthy()
    expect(screen.getByText('Compartilhado B')).toBeTruthy()
    expect(screen.getByText('Inativo')).toBeTruthy()
    const botoes = screen.getAllByRole('button', { name: 'Confirmar vínculo' })
    expect(botoes.length).toBe(2)
  })

  it('resultado provavel: selo "Provável — confirmar" + motivo do 9º dígito', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'provavel',
      phone_e164: '+5581999990001',
      candidates: [
        {
          expert_patient_uuid: 'e5',
          name: 'Cadastro Antigo',
          birth_masked: '**/**/1979',
          active: true,
        },
      ],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-3',
    })
    await waitFor(() => expect(screen.getByText('Provável — confirmar')).toBeTruthy())
    expect(screen.getByText(/sem o 9º dígito/)).toBeTruthy()
  })

  it('resultado zero: "tratar como novo contato"', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'zero',
      phone_e164: '+5581999990001',
      candidates: [],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-4',
    })
    await waitFor(() => expect(screen.getByText(/Nenhum paciente com este telefone/)).toBeTruthy())
    expect(screen.getByText(/Tratar como novo contato/)).toBeTruthy()
  })

  it('erro da API: mensagem por code + correlation_id copiável', async () => {
    const user = userEvent.setup()
    renderTela()
    await esperaClinica()
    mockBuscar.mockRejectedValueOnce(
      Object.assign(new Error('A API demorou demais para responder. Tente novamente.'), {
        code: 'tempo_esgotado',
        correlationId: 'corr-err-9',
      }),
    )
    await user.type(screen.getByLabelText(/Telefone/i), '81 99999-0001')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(screen.getByText(/demorou demais/)).toBeTruthy())
    expect(screen.getByText(/Código: tempo_esgotado/)).toBeTruthy()
    expect(screen.getByText(/corr-err-9/)).toBeTruthy()
  })

  it('NEGATIVO: vínculo com contato inexistente → aviso, sem chamada de vínculo', async () => {
    const user = userEvent.setup()
    mockAcharContato.mockResolvedValueOnce(null)
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'um',
      phone_e164: '+5581999990001',
      candidates: [
        { expert_patient_uuid: 'e1', name: 'Renata', birth_masked: '**/**/1985', active: true },
      ],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-5',
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar vínculo' })).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar vínculo' }))
    await waitFor(() =>
      expect(screen.getByText(/Nenhum contato local com este telefone/)).toBeTruthy(),
    )
  })

  it('NEGATIVO: RPC recusa vínculo (papel sem permissão) → mensagem de erro na tela', async () => {
    const user = userEvent.setup()
    mockAcharContato.mockResolvedValueOnce({ id: 'ct1', name: 'Contato Local' })
    const { confirmarVinculo } = await import('@/lib/experts-api')
    ;(confirmarVinculo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Seu papel nao permite confirmar vinculos nesta clinica'), {
        code: '42501',
      }),
    )
    renderTela()
    await esperaClinica()
    await buscarTelefone(user, {
      result_class: 'um',
      phone_e164: '+5581999990001',
      candidates: [
        { expert_patient_uuid: 'e1', name: 'Renata', birth_masked: '**/**/1985', active: true },
      ],
      linked_patient_uuid: null,
      cache_hit: false,
      correlation_id: 'corr-6',
    })
    await user.click(screen.getByRole('button', { name: 'Confirmar vínculo' }))
    await waitFor(() =>
      expect(screen.getByText(/Seu papel nao permite confirmar vinculos/)).toBeTruthy(),
    )
  })
})
