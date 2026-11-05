// src/pages/Recuperacao.tsx — P3-S06-T02 (revisada 05/11)
// Casos de recuperação: avaliação realizada que não fechou no prazo, e avaliação
// cancelada que precisa ser reagendada.
//
// DUAS LIÇÕES DE 05/11 APLICADAS AQUI:
// 1) TELEFONE: 41 de 47 casos não tinham contato vinculado no CRM. O telefone existe no
//    agendamento espelhado — passa a vir de lá. Sem ele o Comercial 2 não tem como ligar.
// 2) SEM CLIQUE: no painel, botões com onClick não abriam na máquina do Felipe em 3 versões.
//    Aqui o registro usa <details>/<summary> — HTML nativo, abre sem JavaScript.
//    Se o texto chegou na tela, o formulário abre.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Caso = {
  id: string
  patient_name: string | null
  patient_phone: string | null
  evaluated_at: string | null
  professional_name: string | null
  procedure_name: string | null
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

type Indicador = {
  agendadas: number
  realizadas: number
  canceladas: number
  pct_cancelamento: number
  avaliados: number
  compraram: number
  taxa_conversao: number
  em_recuperacao: number
}

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
  { v: 'nao_compareceu', t: 'Não compareceu', cor: 'border-amber-300' },
  { v: 'compareceu', t: 'Compareceu e vai pensar', cor: 'border-blue-300' },
  { v: 'fechou', t: 'Fechou', cor: 'border-green-400' },
  { v: 'nao_fechou', t: 'Não fechou', cor: 'border-red-300' },
]

function quando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Telefone legível para DISCAGEM — o Comercial 2 precisa ligar, não esconder. */
function telefone(e164: string | null): string {
  if (!e164) return 'sem telefone'
  const d = e164.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return e164
}

/** Formulário de resultado — usado dentro de <details>, sem modal. */
function FormularioResultado({
  caso,
  motivos,
  aoSalvar,
}: {
  caso: Caso
  motivos: Motivo[]
  aoSalvar: () => Promise<void>
}) {
  const [resultado, setResultado] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!resultado) {
      setErro('Escolha o que aconteceu.')
      return
    }
    if (resultado === 'nao_fechou' && !motivo) {
      setErro('Escolha o motivo: "não fechou" exige um motivo da lista.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('register_evaluation_result', {
      p_case: caso.id,
      p_result: resultado,
      p_loss_reason: resultado === 'nao_fechou' ? motivo : null,
      p_note: nota.trim() || null,
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    await aoSalvar()
  }

  return (
    <div className="mt-2 border-t border-[#F1E5C8] pt-2">
      <p className="text-[11px] font-semibold text-[#6B6560]">O que aconteceu?</p>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {RESULTADOS.map((r) => (
          <button
            key={r.v}
            type="button"
            onClick={() => {
              setResultado(r.v)
              setErro(null)
            }}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold text-[#2D2A26] ${r.cor} ${
              resultado === r.v ? 'ring-2 ring-[#B8960E]' : ''
            }`}
          >
            {r.t}
          </button>
        ))}
      </div>

      {resultado === 'nao_fechou' && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-[#6B6560]">Motivo (obrigatório)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {motivos.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMotivo(m.key)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
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

      <label className="mt-2 block text-[11px] font-semibold text-[#6B6560]">
        Observação (opcional)
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="ex.: pediu para ligar semana que vem"
          className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
        />
      </label>

      {erro && (
        <div role="alert" className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] text-[#D93025]">
          {erro}
        </div>
      )}

      <button
        type="button"
        onClick={() => void salvar()}
        disabled={salvando}
        className="mt-2 w-full rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {salvando ? 'Salvando…' : 'Confirmar resultado'}
      </button>
    </div>
  )
}

function RecuperacaoConteudo() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [casos, setCasos] = useState<Caso[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [ind, setInd] = useState<Indicador | null>(null)
  const [filtro, setFiltro] = useState<'open' | 'todos'>('open')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

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
      const { data } = await supabase.rpc('evaluation_indicator', {
        p_clinic: clinica,
        p_de: null,
        p_ate: null,
      })
      setInd((data as unknown as Indicador) ?? null)
    })()
  }, [clinica])

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

  async function aposSalvar() {
    setAviso('Resultado registrado.')
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
  const semTelefone = casos.filter((c) => !c.patient_phone).length

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
            {semTelefone > 0 && ` · ${semTelefone} sem telefone`}
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

      {ind && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { r: 'Avaliações agendadas', v: ind.agendadas },
            { r: 'Realizadas', v: ind.realizadas },
            { r: 'Canceladas', v: `${ind.canceladas} (${ind.pct_cancelamento}%)` },
            { r: 'Compraram', v: `${ind.compraram} de ${ind.avaliados}` },
            { r: 'Conversão', v: `${ind.taxa_conversao}%` },
            { r: 'Em recuperação', v: ind.em_recuperacao },
          ].map((k) => (
            <div key={k.r} className="rounded-xl border border-[#F1E5C8] bg-white p-3">
              <div className="text-lg font-bold text-[#2D2A26]">{k.v}</div>
              <div className="text-[10px] uppercase tracking-wide text-[#6B6560]">{k.r}</div>
            </div>
          ))}
        </section>
      )}

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando casos…</p>
      ) : casos.length === 0 ? (
        <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-center text-sm text-[#6B6560]">
          Nenhum caso {filtro === 'open' ? 'aguardando contato' : 'registrado'} agora.
        </div>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[#2D2A26]">
            Casos ({casos.length}) — clique na setinha para abrir e registrar
          </h2>
          {casos.map((c) => {
            const st = ROTULO_STATUS[c.status] ?? ROTULO_STATUS.open
            return (
              <details key={c.id} className="rounded-xl border border-[#F1E5C8] bg-white p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <div>
                      <span className="text-sm font-semibold text-[#2D2A26]">
                        {c.patient_name ?? 'sem nome'}
                      </span>
                      <span className="ml-2 text-xs text-[#B8960E]">
                        {telefone(c.patient_phone)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cor}`}
                    >
                      {st.texto}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#6B6560]">
                    {c.procedure_name ?? 'avaliação'} · {quando(c.evaluated_at)} ·{' '}
                    {c.professional_name ?? '—'}
                    {c.had_paid_procedure && (
                      <span className="ml-1 rounded bg-green-100 px-1 text-[9px] font-semibold text-green-800">
                        fechou junto
                      </span>
                    )}
                    {c.result && (
                      <span className="ml-1">
                        · {ROTULO_RESULTADO[c.result] ?? c.result}
                        {c.loss_reason_key ? ` (${c.loss_reason_key})` : ''}
                      </span>
                    )}
                  </div>
                </summary>

                {c.procedures_all && c.procedures_all.length > 1 && (
                  <p className="mt-2 rounded bg-[#FFF8ED] px-2 py-1 text-[10px] text-[#B8960E]">
                    Neste atendimento também: {c.procedures_all.join(' · ')}
                  </p>
                )}

                {c.status === 'open' ? (
                  <FormularioResultado caso={c} motivos={motivos} aoSalvar={aposSalvar} />
                ) : (
                  <p className="mt-2 text-[11px] text-[#6B6560]">
                    Este caso já foi registrado
                    {c.registered_at ? ` em ${quando(c.registered_at)}` : ''}.
                    {c.result_note ? ` Observação: ${c.result_note}` : ''}
                  </p>
                )}

                {c.conversation_id && (
                  <a
                    href={`/atendimento/${c.conversation_id}`}
                    className="mt-1 inline-block text-[11px] text-[#B8960E] underline"
                  >
                    abrir conversa
                  </a>
                )}
              </details>
            )
          })}
        </section>
      )}
    </div>
  )
}

/** Casca: AppShell fornece a clínica ativa por contexto. */
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
