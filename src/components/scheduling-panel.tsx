// src/components/scheduling-panel.tsx — P3-S04-T02
// Painel de agenda assistida dentro da conversa.
//
// O que a atendente faz aqui:
//   1. escolhe o procedimento e o dia;
//   2. vê os horários livres por profissional (vindos da Edge `scheduling-context`,
//      que só LÊ do Clínica Experts — RN-P3-S04-01);
//   3. clica num horário e o texto pronto vai para a caixa de resposta, para ela
//      colar na conversa e agendar no Clínica Experts (decisão do cliente: quem
//      agenda é a atendente, no sistema de origem — RN-P3-S04-06);
//   4. vê os agendamentos do paciente: futuros e passados (CA-P3-S04-06).
//
// CA-P3-S04-03: com a API fora do ar ou a busca falhando, o painel avisa e mostra
// o roteiro manual; a conversa continua operável (o erro fica dentro do painel).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useClinicaAtiva } from '@/components/clinic-selector'

type Profissional = { expert_uuid: string; name: string; active: boolean }

type SlotDia = {
  dia: string
  profissionais: {
    professional: Profissional
    horas: string[]
    de_memoria?: boolean
    erro?: string
    mensagem?: string
  }[]
}

type RespostaHorarios = {
  ok: boolean
  tem_vinculo: boolean
  aviso?: string
  procedimento?: {
    expert_id: number
    name: string
    duration_min: number
    duration_efetiva_min: number
    usa_intervalo_padrao: boolean
  }
  default_interval_min?: number
  default_is_draft?: boolean
  alternatives?: Profissional[]
  dias?: SlotDia[]
  chamadas?: number
  limite_chamadas?: number
  bloqueado_por_limite?: boolean
  erro?: string
}

type Agendamento = {
  expert_uuid: string
  starts_at: string
  ends_at: string
  status: string
  professional_name: string | null
  room_expert_id: number | null
}

type RespostaAgenda = {
  como: string
  patient_expert_uuid: string | null
  futuros: Agendamento[]
  passados: Agendamento[]
  aviso: string | null
}

type Procedimento = { expert_id: number; name: string; duration_min: number }

const FUNCOES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

function diaISO(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function rotuloDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  const hoje = new Date()
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
  const base = dt.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  if (diaISO(dt) === diaISO(hoje)) return `hoje · ${base}`
  if (diaISO(dt) === diaISO(amanha)) return `amanhã · ${base}`
  return base
}

function quandoDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const COR_STATUS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  confirmed: 'bg-green-100 text-green-800',
  progress: 'bg-amber-100 text-amber-800',
  done: 'bg-gray-100 text-gray-600',
  canceled: 'bg-red-100 text-red-700',
  noshow: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
}

const ROTULO_STATUS_AG: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  progress: 'Em atendimento',
  done: 'Realizado',
  canceled: 'Cancelado',
  noshow: 'Não compareceu',
  no_show: 'Não compareceu',
}

export function PainelAgenda({
  conversationId,
  aoCopiar,
}: {
  conversationId: string
  aoCopiar?: (texto: string) => void
}) {
  const { clinicaAtiva } = useClinicaAtiva()
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [procedimento, setProcedimento] = useState<number | ''>('')
  const [dia, setDia] = useState<string>(diaISO(new Date()))
  const [horarios, setHorarios] = useState<RespostaHorarios | null>(null)
  const [agenda, setAgenda] = useState<RespostaAgenda | null>(null)
  const [carregandoH, setCarregandoH] = useState(false)
  const [carregandoA, setCarregandoA] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  // agendamentos do paciente (futuros + passados) — não depende da busca de horários
  const carregarAgenda = useCallback(async () => {
    setCarregandoA(true)
    const { data, error } = await supabase.rpc('patient_appointments_for_contact', {
      p_conversation: conversationId,
      p_limit: 20,
    })
    if (error) setErro(error.message)
    else setAgenda((data as unknown as RespostaAgenda) ?? null)
    setCarregandoA(false)
  }, [conversationId])

  useEffect(() => {
    void carregarAgenda()
  }, [carregarAgenda])

  // catálogo de procedimentos ativos (só quando o painel abre)
  useEffect(() => {
    if (!aberto) return
    ;(async () => {
      const { data } = await supabase
        .from('expert_procedures_cache')
        .select('expert_id, name, duration_min')
        .eq('active', true)
        .order('name')
      setProcedimentos((data ?? []) as Procedimento[])
    })()
  }, [aberto])

  const buscarHorarios = useCallback(
    async (proc: number) => {
      if (!clinicaAtiva) return
      setCarregandoH(true)
      setErro(null)
      setHorarios(null)
      try {
        const { data: sess } = await supabase.auth.getSession()
        const token = sess.session?.access_token ?? ''
        const url =
          `${FUNCOES_URL}/scheduling-context?acao=horarios` +
          `&clinic=${encodeURIComponent(clinicaAtiva)}` +
          `&procedure=${proc}` +
          `&dias=5`
        const r = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: PUBLISHABLE_KEY,
          },
        })
        const corpo = (await r.json()) as RespostaHorarios
        if (!r.ok || corpo.erro) {
          setErro(corpo.erro ?? `Falha ao consultar a agenda (HTTP ${r.status})`)
        } else {
          setHorarios(corpo)
        }
      } catch (e) {
        setErro(
          `Não foi possível consultar o Clínica Experts agora (${(e as Error).message}). ` +
            'Veja a agenda direto no Clínica Experts e siga o atendimento normalmente.',
        )
      } finally {
        setCarregandoH(false)
      }
    },
    [clinicaAtiva],
  )

  const opcoes = useMemo(() => {
    if (!horarios?.dias) return []
    const lista: { dia: string; prof: string; hora: string }[] = []
    for (const d of horarios.dias) {
      for (const p of d.profissionais) {
        for (const h of p.horas) {
          lista.push({ dia: d.dia, prof: p.professional.name, hora: h })
        }
      }
    }
    return lista
  }, [horarios])

  function copiarOpcao(d: string, prof: string, hora: string) {
    const proc = horarios?.procedimento?.name ?? 'procedimento'
    const texto = `${proc} — ${rotuloDia(d).replace(' · ', ' ')} às ${hora} com ${prof}. Posso confirmar?`
    setCopiado(`${d}|${prof}|${hora}`)
    if (aoCopiar) aoCopiar(texto)
    void navigator.clipboard?.writeText(texto).catch(() => undefined)
  }

  const futuros = agenda?.futuros ?? []
  const passados = agenda?.passados ?? []

  return (
    <div
      className="rounded-lg border border-[#F1E5C8] bg-white p-3 text-sm"
      data-testid="painel-agenda"
    >
      <div className="flex items-center justify-between">
        <strong className="font-serif text-[#2D2A26]">Agenda</strong>
        <button
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-[#F1E5C8] px-2 py-0.5 text-[11px] font-semibold text-[#2D2A26]"
        >
          {aberto ? 'Fechar busca' : 'Buscar horário'}
        </button>
      </div>

      {/* ---- agendamentos do paciente (CA-P3-S04-06) ---- */}
      {carregandoA ? (
        <p className="mt-2 text-xs text-[#6B6560]">Carregando agendamentos…</p>
      ) : agenda && agenda.como === 'nao_identificado' ? (
        <p className="mt-2 text-xs text-[#6B6560]">{agenda.aviso}</p>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6560]">
            Agendamentos ({futuros.length} futuro{futuros.length === 1 ? '' : 's'} ·{' '}
            {passados.length} passado{passados.length === 1 ? '' : 's'})
          </p>
          {agenda?.aviso && (
            <p className="rounded bg-[#FFF8ED] px-2 py-1 text-[10px] text-[#B8960E]">
              {agenda.aviso}
            </p>
          )}
          {futuros.length === 0 && passados.length === 0 && (
            <p className="text-xs text-[#6B6560]">Nenhum agendamento para este paciente.</p>
          )}
          {futuros.map((a) => (
            <div
              key={a.expert_uuid}
              className="flex items-center justify-between rounded border border-[#F1E5C8] px-2 py-1"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#2D2A26]">
                  {quandoDataHora(a.starts_at)}
                </p>
                <p className="truncate text-[10px] text-[#6B6560]">
                  {a.professional_name ?? 'profissional não identificado'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  COR_STATUS[a.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {ROTULO_STATUS_AG[a.status] ?? a.status}
              </span>
            </div>
          ))}
          {passados.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-[#B8960E]">
                Ver {passados.length} agendamento{passados.length === 1 ? '' : 's'} anterior
                {passados.length === 1 ? '' : 'es'}
              </summary>
              <div className="mt-1 space-y-1">
                {passados.map((a) => (
                  <div
                    key={a.expert_uuid}
                    className="flex items-center justify-between rounded border border-[#F7F0E1] px-2 py-1 opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-[#2D2A26]">
                        {quandoDataHora(a.starts_at)}
                      </p>
                      <p className="truncate text-[10px] text-[#6B6560]">
                        {a.professional_name ?? '—'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      {ROTULO_STATUS_AG[a.status] ?? a.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ---- busca de horários ---- */}
      {aberto && (
        <div className="mt-3 border-t border-[#F1E5C8] pt-2">
          <label className="block text-[11px] font-semibold text-[#6B6560]">Procedimento</label>
          <select
            value={procedimento}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : ''
              setProcedimento(v)
              setHorarios(null)
              setErro(null)
              if (v) void buscarHorarios(v as number)
            }}
            className="mt-1 w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
          >
            <option value="">escolha o procedimento…</option>
            {procedimentos.map((p) => (
              <option key={p.expert_id} value={p.expert_id}>
                {p.name}
                {p.duration_min ? ` (${p.duration_min} min)` : ''}
              </option>
            ))}
          </select>

          <label className="mt-2 block text-[11px] font-semibold text-[#6B6560]">Dia</label>
          <input
            type="date"
            value={dia}
            onChange={(e) => {
              setDia(e.target.value)
              if (procedimento) void buscarHorarios(procedimento as number)
            }}
            className="mt-1 w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
          />

          {carregandoH && <p className="mt-2 text-xs text-[#6B6560]">Consultando a agenda…</p>}

          {erro && (
            <div
              role="alert"
              className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-[#D93025]"
            >
              <p className="font-semibold">Não consegui consultar a agenda.</p>
              <p className="mt-1">{erro}</p>
              <p className="mt-1 text-[#6B6560]">
                <strong>Roteiro manual:</strong> abra o Clínica Experts → Agenda → escolha o
                profissional e o dia; confirme o horário com a paciente e volte aqui para registrar.
              </p>
            </div>
          )}

          {/* sem vínculo: aviso + alternativas (CA-P3-S04-02) */}
          {horarios && !horarios.tem_vinculo && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <p className="font-semibold">{horarios.aviso}</p>
              {horarios.alternatives && horarios.alternatives.length > 0 && (
                <p className="mt-1">
                  Profissionais da clínica:{' '}
                  {horarios.alternatives
                    .filter((a) => a.active)
                    .map((a) => a.name)
                    .join(', ')}
                </p>
              )}
            </div>
          )}

          {horarios?.tem_vinculo && (
            <div className="mt-2">
              {horarios.procedimento?.usa_intervalo_padrao && (
                <p className="mb-1 rounded bg-[#FFF8ED] px-2 py-1 text-[10px] text-[#B8960E]">
                  Este procedimento não tem duração cadastrada — usando{' '}
                  {horarios.default_interval_min} min como padrão
                  {horarios.default_is_draft ? ' (a confirmar)' : ''}.
                </p>
              )}
              {opcoes.length === 0 ? (
                <p className="text-xs text-[#6B6560]">
                  Nenhum horário livre nos próximos 5 dias para este procedimento.
                </p>
              ) : (
                <>
                  <p className="mb-1 text-[11px] text-[#6B6560]">
                    {opcoes.length} horário{opcoes.length === 1 ? '' : 's'} livre
                    {opcoes.length === 1 ? '' : 's'} — clique para levar à resposta
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {horarios.dias?.map((d) =>
                      d.profissionais.every((p) => p.horas.length === 0) ? null : (
                        <div key={d.dia}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B6560]">
                            {rotuloDia(d.dia)}
                          </p>
                          {d.profissionais.map(
                            (p) =>
                              p.horas.length > 0 && (
                                <div key={p.professional.expert_uuid} className="mt-1">
                                  <p className="text-[10px] text-[#6B6560]">
                                    {p.professional.name}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {p.horas.map((h) => {
                                      const chave = `${d.dia}|${p.professional.name}|${h}`
                                      return (
                                        <button
                                          key={chave}
                                          onClick={() => copiarOpcao(d.dia, p.professional.name, h)}
                                          className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                                            copiado === chave
                                              ? 'border-[#B8960E] bg-[#B8960E] text-white'
                                              : 'border-[#F1E5C8] text-[#2D2A26] hover:bg-[#FFF8ED]'
                                          }`}
                                        >
                                          {copiado === chave ? `✓ ${h}` : h}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ),
                          )}
                        </div>
                      ),
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-[#6B6560]">
                    {horarios.chamadas}/{horarios.limite_chamadas} consultas à API neste pedido
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
