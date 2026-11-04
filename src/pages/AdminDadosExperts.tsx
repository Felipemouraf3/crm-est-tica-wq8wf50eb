// src/pages/AdminDadosExperts.tsx — P3-S01-T01
// Tela "Dados do Clínica Experts": contadores de cada espelho, hora da última atualização,
// pendentes de unidade e os dois mapeamentos (profissional → clínica, vendedor → usuário).
// A leitura passa por RPC SECURITY DEFINER; a RLS revalida sempre.
// CA-P3-S01-07: os valores de venda só chegam a gestor/proprietário (a RPC devolve null).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useClinicaAtiva } from '@/components/clinic-selector'

type StatusLinha = {
  resource: string
  last_success_at: string | null
  last_attempt_at: string | null
  last_error: string | null
  status: string
  profissionais: number
  procedimentos: number
  salas: number
  agendamentos: number
  agendamentos_pendentes: number
  vendas: number
  vendas_pendentes: number
}

type Mapeamento = {
  id: string
  kind: string
  expert_ref: string
  user_id: string | null
  is_draft: boolean
}

const ROTULO_RECURSO: Record<string, string> = {
  professionals: 'Profissionais',
  procedures: 'Procedimentos',
  rooms: 'Salas',
  bookings: 'Agenda',
  sales: 'Vendas',
}

const ROTULO_STATUS: Record<string, string> = {
  nunca: 'Nunca atualizado',
  ok: 'Em dia',
  atrasado: 'Desatualizado',
  falha: 'Falhou',
  pausado: 'Pausado',
}

function quando(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminDadosExperts() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [status, setStatus] = useState<StatusLinha[]>([])
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([])
  const [org, setOrg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba] = useState<'profissional_clinica' | 'vendedor_usuario'>(
    'profissional_clinica',
  )
  const [novoRef, setNovoRef] = useState('')
  const [novoUsuario, setNovoUsuario] = useState('')

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data: clinicaRow } = await supabase
      .from('clinics')
      .select('organization_id')
      .eq('id', clinica)
      .maybeSingle()
    const orgId = clinicaRow?.organization_id ?? null
    setOrg(orgId)
    if (!orgId) {
      setErro('Não consegui identificar a organização desta clínica.')
      setCarregando(false)
      return
    }
    const [s, m] = await Promise.all([
      supabase.rpc('admin_sync_status', { p_org: orgId }),
      supabase.rpc('admin_list_mappings', { p_clinic: clinica }),
    ])
    if (s.error) setErro(s.error.message)
    else setStatus((s.data ?? []) as StatusLinha[])
    if (m.error) setErro((ant) => ant ?? m.error!.message)
    else setMapeamentos((m.data ?? []) as Mapeamento[])
    setCarregando(false)
  }, [clinica])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const totais = useMemo(() => {
    const t = status[0]
    return {
      profissionais: t?.profissionais ?? 0,
      procedimentos: t?.procedimentos ?? 0,
      salas: t?.salas ?? 0,
      agendamentos: t?.agendamentos ?? 0,
      pendentesAgenda: t?.agendamentos_pendentes ?? 0,
      vendas: t?.vendas ?? 0,
      pendentesVendas: t?.vendas_pendentes ?? 0,
    }
  }, [status])

  const daAba = mapeamentos.filter((m) => m.kind === aba)

  async function salvar() {
    if (!clinica || !novoRef.trim()) return
    setErro(null)
    const { error } = await supabase.rpc('admin_save_mapping', {
      p_clinic: clinica,
      p_kind: aba,
      p_expert_ref: novoRef.trim(),
      p_user: aba === 'vendedor_usuario' ? novoUsuario.trim() || null : null,
      p_is_draft: false,
    })
    if (error) {
      setErro(error.message)
      return
    }
    setNovoRef('')
    setNovoUsuario('')
    await carregar()
  }

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para ver os dados do Clínica Experts.
      </div>
    )
  }

  const cartoes = [
    { rotulo: 'Profissionais', valor: totais.profissionais },
    { rotulo: 'Procedimentos', valor: totais.procedimentos },
    { rotulo: 'Salas', valor: totais.salas },
    { rotulo: 'Agendamentos', valor: totais.agendamentos },
    { rotulo: 'Vendas', valor: totais.vendas },
  ]

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Dados do Clínica Experts</h1>
          <p className="text-xs text-[#6B6560]">
            Cópia de leitura. O dado do Clínica Experts sempre prevalece; nada aqui é editável.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          disabled={carregando}
          className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#2D2A26] hover:bg-[#FFF8ED] disabled:opacity-50"
        >
          {carregando ? 'Atualizando…' : 'Atualizar tela'}
        </button>
      </header>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#D93025]"
        >
          {erro}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Totais espelhados">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-xl border border-[#F1E5C8] bg-white p-4">
            <div className="text-2xl font-bold text-[#2D2A26]">{c.valor}</div>
            <div className="text-[11px] uppercase tracking-wide text-[#6B6560]">{c.rotulo}</div>
          </div>
        ))}
      </section>

      <section
        className="rounded-xl border border-[#F1E5C8] bg-white p-4"
        aria-label="Situação da atualização"
      >
        <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">Situação da atualização</h2>
        <table className="w-full text-left text-xs">
          <thead className="text-[#6B6560]">
            <tr>
              <th className="py-1">Recurso</th>
              <th className="py-1">Última atualização</th>
              <th className="py-1">Situação</th>
              <th className="py-1">Observação</th>
            </tr>
          </thead>
          <tbody>
            {status.map((s) => (
              <tr key={s.resource} className="border-t border-[#F7F0E1]">
                <td className="py-1.5 font-medium text-[#2D2A26]">
                  {ROTULO_RECURSO[s.resource] ?? s.resource}
                </td>
                <td className="py-1.5 text-[#6B6560]">{quando(s.last_success_at)}</td>
                <td className="py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.status === 'ok'
                        ? 'bg-green-100 text-green-800'
                        : s.status === 'falha'
                          ? 'bg-red-100 text-[#D93025]'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {ROTULO_STATUS[s.status] ?? s.status}
                  </span>
                </td>
                <td className="py-1.5 text-[#6B6560]">{s.last_error ?? '—'}</td>
              </tr>
            ))}
            {status.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-[#6B6560]">
                  Nenhuma atualização registrada ainda. A carga inicial entra na próxima etapa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section
        className="rounded-xl border border-[#F1E5C8] bg-white p-4"
        aria-label="Pendentes de unidade"
      >
        <h2 className="mb-1 text-sm font-semibold text-[#2D2A26]">Pendentes de unidade</h2>
        <p className="mb-2 text-xs text-[#6B6560]">
          Registros que ainda não têm clínica. Em vez de adivinhar, ficam aqui para a regra de
          atribuição ou para você completar o mapeamento.
        </p>
        <div className="flex gap-6 text-xs">
          <span className="text-[#2D2A26]">
            Agenda: <strong>{totais.pendentesAgenda}</strong>
          </span>
          <span className="text-[#2D2A26]">
            Vendas: <strong>{totais.pendentesVendas}</strong>
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-[#F1E5C8] bg-white p-4" aria-label="Mapeamentos">
        <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">Mapeamentos</h2>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setAba('profissional_clinica')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              aba === 'profissional_clinica'
                ? 'bg-[#B8960E] text-white'
                : 'border border-[#F1E5C8] text-[#2D2A26]'
            }`}
          >
            Profissional → clínica
          </button>
          <button
            onClick={() => setAba('vendedor_usuario')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              aba === 'vendedor_usuario'
                ? 'bg-[#B8960E] text-white'
                : 'border border-[#F1E5C8] text-[#2D2A26]'
            }`}
          >
            Vendedor → usuário
          </button>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="text-[#6B6560]">
            <tr>
              <th className="py-1">Identificador no Clínica Experts</th>
              <th className="py-1">{aba === 'vendedor_usuario' ? 'Usuário do CRM' : 'Clínica'}</th>
              <th className="py-1">Origem</th>
            </tr>
          </thead>
          <tbody>
            {daAba.map((m) => (
              <tr key={m.id} className="border-t border-[#F7F0E1]">
                <td className="py-1.5 font-mono text-[11px] text-[#2D2A26]">{m.expert_ref}</td>
                <td className="py-1.5 text-[#6B6560]">{m.user_id ?? 'clínica atual'}</td>
                <td className="py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      m.is_draft ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {m.is_draft ? 'Rascunho' : 'Confirmado'}
                  </span>
                </td>
              </tr>
            ))}
            {daAba.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-center text-[#6B6560]">
                  Nenhum mapeamento nesta aba. Sem mapeamento, o registro cai na fila de pendentes.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#6B6560]">
            Identificador
            <input
              value={novoRef}
              onChange={(e) => setNovoRef(e.target.value)}
              placeholder={aba === 'vendedor_usuario' ? 'uuid do vendedor' : 'uuid do profissional'}
              className="mt-1 block w-56 rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
            />
          </label>
          {aba === 'vendedor_usuario' && (
            <label className="text-xs text-[#6B6560]">
              Usuário do CRM (uuid)
              <input
                value={novoUsuario}
                onChange={(e) => setNovoUsuario(e.target.value)}
                className="mt-1 block w-56 rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
              />
            </label>
          )}
          <button
            onClick={() => void salvar()}
            disabled={!novoRef.trim()}
            className="rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Salvar mapeamento
          </button>
        </div>
      </section>
    </div>
  )
}
