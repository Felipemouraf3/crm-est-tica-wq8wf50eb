// src/pages/Recuperacao.tsx — P3-S06-T02
// Casos de recuperação: avaliação realizada que não fechou dentro do prazo, e
// avaliação cancelada que precisa ser reagendada.
//
// A atendente registra o resultado em até 3 cliques (CA-P3-S06-05):
//   1. abre o caso
//   2. escolhe o resultado (compareceu / não compareceu / fechou / não fechou)
//   3. se "não fechou", escolhe o motivo — e confirma
//
// O servidor decide e valida (register_evaluation_result): motivo é obrigatório
// em "não fechou" e tem de estar na lista de perdas da clínica.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Caso = {
  id: string
  patient_name: string | null
  evaluated_at: string | null
  professional_name: string | null
  procedure_name: string | null
  // um agendamento pode ter VÁRIOS procedimentos (avaliação + botox + drenagem)
  procedures_all: string[] | null
  had_paid_procedure: boolean
  paid_procedures: string[] | null
  status: string
  result: string | null
  loss_reason_key: string | null
  result_note: string | null
  registered_at: string | null
  contact_id: string | null
  conversation_id: string | null
}

type Motivo = { key: string; label: string }

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  open: { texto: 'Aguardando contato', cor: 'bg-amber-100 text-amber-800' },
  result_registered: { texto: 'Resultado registrado', cor: 'bg-blue-100 text-blue-800' },
  recovered: { texto: 'Recuperada', cor: 'bg-green-100 text-green-800' },
  lost: { texto: 'Perdida', cor: 'bg-gray-100 text-gray-600' },
  cancelled: { texto: 'Encerrada', cor: 'bg-gray-100 text-gray-500' },
}

const ROTULO_RESULTADO: Record<string, string> = {
  compareceu: 'Compareceu',
  nao_compareceu: 'Não compareceu',
  fechou: 'Fechou',
  nao_fechou: 'Não fechou',
}

const RESULTADOS = [
  { v: 'nao_compareceu', t: 'Não compareceu', cor: 'border-amber-300 hover:bg-amber-50' },
  { v: 'compareceu', t: 'Compareceu e vai pensar', cor: 'border-blue-300 hover:bg-blue-50' },
  { v: 'fechou', t: 'Fechou', cor: 'border-green-400 hover:bg-green-50' },
  { v: 'nao_fechou', t: 'Não fechou', cor: 'border-red-300 hover:bg-red-50' },
]

function quando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function RecuperacaoConteudo() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [casos, setCasos] = useState<Caso[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [filtro, setFiltro] = useState<'open' | 'todos'>('open')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Caso | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('list_recovery_cases', {
      p_clinic: clinica,
      p_status: filtro === 'open' ? 'open' : null,
    })
    if (error) setErro(error.message)
    else setCasos((data as unknown as Caso[]) ?? [])
    setCarregando(false)
  }, [clinica, filtro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    if (!clinica) return
    ;(async () => {
      const { data } = await supabase
        .from('loss_reasons')
        .select('key, label')
        .eq('clinic_id', clinica)
        .eq('active', true)
        .order('label')
      setMotivos((data ?? []) as Motivo[])
    })()
  }, [clinica])

  function abrirCaso(c: Caso) {
    setAberto(c)
    setResultado(null)
    setMotivo('')
    setNota('')
    setErro(null)
    setAviso(null)
  }

  async function salvar() {
    if (!aberto || !resultado) return
    if (resultado === 'nao_fechou' && !motivo) {
      setErro('Escolha o motivo: "não fechou" exige um motivo da lista.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('register_evaluation_result', {
      p_case: aberto.id,
      p_result: resultado,
      p_loss_reason: resultado === 'nao_fechou' ? motivo : null,
      p_note: nota.trim() || null,
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setAviso('Resultado registrado.')
    setAberto(null)
    await carregar()
  }

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para ver os casos de recuperação.
      </div>
    )
  }

  const abertos = casos.filter((c) => c.status === 'open').length

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">
            Recuperação de avaliações
          </h1>
          <p className="text-xs text-[#6B6560]">
            Avaliação realizada que não fechou no prazo, e avaliação cancelada para reagendar. O
            Comercial 2 tem <strong>2 dias</strong> para entrar em contato.
          </p>
          <p className="mt-1 text-xs text-[#B8960E]">
            {abertos} caso{abertos === 1 ? '' : 's'} aguardando contato
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setFiltro('open')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filtro === 'open'
                ? 'bg-[#B8960E] text-white'
                : 'border border-[#F1E5C8] text-[#2D2A26]'
            }`}
          >
            Aguardando contato
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filtro === 'todos'
                ? 'bg-[#B8960E] text-white'
                : 'border border-[#F1E5C8] text-[#2D2A26]'
            }`}
          >
            Todos
          </button>
        </div>
      </header>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#D93025]"
        >
          {erro}
        </div>
      )}
      {aviso && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-[#1E8E3E]"
        >
          {aviso}
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando casos…</p>
      ) : casos.length === 0 ? (
        <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-center text-sm text-[#6B6560]">
          Nenhum caso {filtro === 'open' ? 'aguardando contato' : 'registrado'} agora.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#F1E5C8] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FFF8ED] text-[#6B6560]">
              <tr>
                <th className="px-3 py-2">Paciente</th>
                <th className="px-3 py-2">Avaliação</th>
                <th className="px-3 py-2">Procedimento</th>
                <th className="px-3 py-2">Profissional</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c) => {
                const st = ROTULO_STATUS[c.status] ?? ROTULO_STATUS.open
                return (
                  <tr key={c.id} className="border-t border-[#F7F0E1]">
                    <td className="px-3 py-2 font-medium text-[#2D2A26]">
                      {c.patient_name ?? 'sem nome'}
                    </td>
                    <td className="px-3 py-2 text-[#6B6560]">{quando(c.evaluated_at)}</td>
                    <td className="px-3 py-2 text-[#6B6560]">
                      {c.procedure_name ?? '—'}
                      {c.procedures_all && c.procedures_all.length > 1 && (
                        <span className="ml-1 text-[10px] text-[#9B938A]">
                          +{c.procedures_all.length - 1} (
                          {c.procedures_all.filter((x) => x !== c.procedure_name).join(', ')})
                        </span>
                      )}
                      {c.had_paid_procedure && (
                        <span className="ml-1 rounded bg-green-100 px-1 text-[9px] font-semibold text-green-800">
                          fechou junto
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#6B6560]">{c.professional_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cor}`}
                      >
                        {st.texto}
                      </span>
                      {c.result && (
                        <span className="ml-1 text-[10px] text-[#6B6560]">
                          · {ROTULO_RESULTADO[c.result] ?? c.result}
                          {c.loss_reason_key ? ` (${c.loss_reason_key})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.status === 'open' && (
                        <button
                          onClick={() => abrirCaso(c)}
                          className="rounded-lg bg-[#B8960E] px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          Registrar
                        </button>
                      )}
                      {c.conversation_id && (
                        <a
                          href={`/atendimento/${c.conversation_id}`}
                          className="ml-2 text-[11px] text-[#B8960E] underline"
                        >
                          conversa
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <div
          role="dialog"
          aria-label="Registrar resultado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#2D2A26]">
                  {aberto.patient_name ?? 'Paciente'}
                </h2>
                <p className="text-xs text-[#6B6560]">
                  {aberto.procedure_name ?? 'avaliação'} · {quando(aberto.evaluated_at)} ·{' '}
                  {aberto.professional_name ?? '—'}
                </p>
                {aberto.procedures_all && aberto.procedures_all.length > 1 && (
                  <p className="mt-1 rounded bg-[#FFF8ED] px-2 py-1 text-[10px] text-[#B8960E]">
                    Neste atendimento também: {aberto.procedures_all.join(' · ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setAberto(null)}
                className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px] text-[#6B6560]"
              >
                Fechar
              </button>
            </div>

            <p className="mt-3 text-xs font-semibold text-[#6B6560]">O que aconteceu?</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {RESULTADOS.map((r) => (
                <button
                  key={r.v}
                  onClick={() => {
                    setResultado(r.v)
                    setErro(null)
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-[#2D2A26] ${r.cor} ${
                    resultado === r.v ? 'ring-2 ring-[#B8960E]' : ''
                  }`}
                >
                  {r.t}
                </button>
              ))}
            </div>

            {resultado === 'nao_fechou' && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-[#6B6560]">Motivo (obrigatório)</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {motivos.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMotivo(m.key)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                        motivo === m.key
                          ? 'border-[#B8960E] bg-[#B8960E] text-white'
                          : 'border-[#F1E5C8] text-[#2D2A26]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="mt-3 block text-xs font-semibold text-[#6B6560]">
              Observação (opcional)
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="ex.: pediu para ligar semana que vem"
                className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
              />
            </label>

            {erro && (
              <div
                role="alert"
                className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-[#D93025]"
              >
                {erro}
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setAberto(null)}
                className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs text-[#6B6560]"
              >
                Cancelar
              </button>
              <button
                onClick={() => void salvar()}
                disabled={!resultado || salvando}
                className="rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Casca: AppShell fornece a clínica ativa por contexto (lição de 04/11). */
export default function Recuperacao() {
  const [papel, setPapel] = useState<Papel | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) return
      supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
        .then(({ data: mem }) => setPapel((mem?.[0]?.role ?? null) as Papel | null))
    })
  }, [])

  return (
    <AppShell papel={papel}>
      <RecuperacaoConteudo />
    </AppShell>
  )
}
