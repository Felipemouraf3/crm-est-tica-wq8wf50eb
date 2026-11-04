// src/pages/AdminCadencias.tsx — P3-S05-T01
// Console de cadências: política por clínica (gatilho, atrasos, horário, máximo de
// tentativas, modo de aprovação), versionamento com rascunho → publicar, e a lista
// de casos inscritos com a próxima execução.
//
// A decisão NUNCA é da tela: admin_save_followup_policy / admin_publish_followup_policy
// revalidam papel e clínica no servidor (RLS + RPC).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Politica = {
  id: string
  name: string
  version: number
  status: string
  is_draft: boolean
  trigger_kind: string
  trigger_after_hours: number
  delays_days: number[]
  allowed_from: string
  allowed_to: string
  allowed_weekdays: number[]
  max_attempts: number
  approval_mode: string
}

type Inscricao = {
  id: string
  status: string
  pause_reason: string | null
  attempts_done: number
  next_run_at: string | null
  enrolled_source: string
  politica: string
  contato: string
}

type Resposta = { policies: Politica[]; enrollments: Inscricao[] }

const DIAS = [
  { v: 1, r: 'seg' },
  { v: 2, r: 'ter' },
  { v: 3, r: 'qua' },
  { v: 4, r: 'qui' },
  { v: 5, r: 'sex' },
  { v: 6, r: 'sáb' },
  { v: 0, r: 'dom' },
]

const ROTULO_STATUS_INSC: Record<string, { texto: string; cor: string }> = {
  active: { texto: 'Correndo', cor: 'bg-green-100 text-green-800' },
  paused: { texto: 'Pausada', cor: 'bg-amber-100 text-amber-800' },
  completed: { texto: 'Concluída', cor: 'bg-gray-100 text-gray-600' },
  cancelled: { texto: 'Encerrada', cor: 'bg-gray-100 text-gray-600' },
}

function quando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function AdminCadenciasConteudo() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [dados, setDados] = useState<Resposta>({ policies: [], enrollments: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // formulário (inicia com o padrão do manual comercial: 5/15/30/60)
  const [nome, setNome] = useState('Cadência comercial padrão')
  const [gatilho, setGatilho] = useState('lead_sem_resposta')
  const [aposHoras, setAposHoras] = useState(24)
  const [atrasos, setAtrasos] = useState('5,15,30,60')
  const [das, setDas] = useState('09:00')
  const [ate, setAte] = useState('18:00')
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [maxTentativas, setMaxTentativas] = useState(4)
  const [modo, setModo] = useState('tarefa_com_rascunho')

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('admin_get_followup_policies', { p_clinic: clinica })
    if (error) setErro(error.message)
    else setDados((data as unknown as Resposta) ?? { policies: [], enrollments: [] })
    setCarregando(false)
  }, [clinica])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const ativa = dados.policies.find((p) => p.status === 'active')
  const rascunho = dados.policies.find((p) => p.is_draft && p.status === 'draft')

  async function salvar() {
    if (!clinica) return
    setErro(null)
    setAviso(null)
    const lista = atrasos
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (lista.length === 0) {
      setErro('Informe pelo menos um atraso em dias.')
      return
    }
    const { data, error } = await supabase.rpc('admin_save_followup_policy', {
      p_clinic: clinica,
      p_name: nome.trim(),
      p_trigger_kind: gatilho,
      p_trigger_after_hours: aposHoras,
      p_delays_days: lista,
      p_allowed_from: `${das}:00`,
      p_allowed_to: `${ate}:00`,
      p_allowed_weekdays: dias,
      p_max_attempts: maxTentativas,
      p_approval_mode: modo,
    })
    if (error) {
      setErro(error.message)
      return
    }
    const r = data as unknown as { version?: number; id?: string }
    setAviso(`Salvo como versão ${r?.version} (rascunho). Publique para começar a valer.`)
    await carregar()
  }

  async function publicar(id: string) {
    setErro(null)
    setAviso(null)
    const { error } = await supabase.rpc('admin_publish_followup_policy', { p_policy: id })
    if (error) {
      setErro(error.message)
      return
    }
    setAviso('Política publicada. A versão anterior fica pausada e o histórico é preservado.')
    await carregar()
  }

  function carregarNaTela(p: Politica) {
    setNome(p.name)
    setGatilho(p.trigger_kind)
    setAposHoras(p.trigger_after_hours)
    setAtrasos(p.delays_days.join(','))
    setDas(String(p.allowed_from).slice(0, 5))
    setAte(String(p.allowed_to).slice(0, 5))
    setDias(p.allowed_weekdays)
    setMaxTentativas(p.max_attempts)
    setModo(p.approval_mode)
  }

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para configurar as cadências.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Cadências de follow-up</h1>
        <p className="text-xs text-[#6B6560]">
          Quando o cliente não responde, o caso volta no dia certo com a mensagem pronta. A resposta
          do cliente pausa tudo automaticamente.
        </p>
        {ativa && (
          <p className="mt-1 text-xs text-[#B8960E]">
            Em uso: {ativa.name} · versão {ativa.version} · {ativa.delays_days.join('/')} dias ·{' '}
            {ativa.approval_mode === 'envio_automatico'
              ? 'envio automático'
              : 'tarefa com rascunho'}
          </p>
        )}
        {!ativa && (
          <p className="mt-1 text-xs text-[#D93025]">
            Nenhuma cadência publicada — nada é enviado nem agendado até publicar.
          </p>
        )}
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

      <section className="rounded-xl border border-[#F1E5C8] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">
          {rascunho ? 'Rascunho em edição' : 'Configurar cadência'}
        </h2>

        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <label className="text-[#6B6560]">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            Quando entra
            <select
              value={gatilho}
              onChange={(e) => setGatilho(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            >
              <option value="lead_sem_resposta">Lead sem resposta</option>
              <option value="avaliacao_sem_retorno">Avaliação sem retorno</option>
              <option value="manual">Só manual</option>
            </select>
          </label>

          <label className="text-[#6B6560]">
            Sem resposta por (horas)
            <input
              type="number"
              value={aposHoras}
              onChange={(e) => setAposHoras(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            Retomadas em dias (separados por vírgula)
            <input
              value={atrasos}
              onChange={(e) => setAtrasos(e.target.value)}
              placeholder="5,15,30,60"
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            Horário permitido — de
            <input
              type="time"
              value={das}
              onChange={(e) => setDas(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            até
            <input
              type="time"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            Máximo de tentativas
            <input
              type="number"
              value={maxTentativas}
              onChange={(e) => setMaxTentativas(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            />
          </label>

          <label className="text-[#6B6560]">
            Como executa
            <select
              value={modo}
              onChange={(e) => setModo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
            >
              <option value="tarefa_com_rascunho">Tarefa com mensagem pronta (recomendado)</option>
              <option value="envio_automatico">Envio automático do modelo aprovado</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold text-[#6B6560]">Dias permitidos</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {DIAS.map((d) => (
              <button
                key={d.v}
                onClick={() =>
                  setDias((atual) =>
                    atual.includes(d.v) ? atual.filter((x) => x !== d.v) : [...atual, d.v],
                  )
                }
                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
                  dias.includes(d.v)
                    ? 'border-[#B8960E] bg-[#B8960E] text-white'
                    : 'border-[#F1E5C8] text-[#2D2A26]'
                }`}
              >
                {d.r}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void salvar()}
            className="rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Salvar rascunho
          </button>
          {rascunho && (
            <button
              onClick={() => void publicar(rascunho.id)}
              className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#2D2A26]"
            >
              Publicar versão {rascunho.version}
            </button>
          )}
        </div>

        <p className="mt-2 text-[10px] text-[#6B6560]">
          Enquanto estiver em rascunho, nada é enviado sozinho: a cadência gera tarefa com a
          mensagem pronta. Mudar uma política já publicada cria uma versão nova e preserva a
          anterior.
        </p>
      </section>

      <section className="rounded-xl border border-[#F1E5C8] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">Versões desta cadência</h2>
        <table className="w-full text-left text-xs">
          <thead className="text-[#6B6560]">
            <tr>
              <th className="py-1">Versão</th>
              <th className="py-1">Atrasos</th>
              <th className="py-1">Tentativas</th>
              <th className="py-1">Modo</th>
              <th className="py-1">Situação</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {dados.policies.map((p) => (
              <tr key={p.id} className="border-t border-[#F7F0E1]">
                <td className="py-1.5 font-medium text-[#2D2A26]">v{p.version}</td>
                <td className="py-1.5 text-[#6B6560]">{p.delays_days.join('/')} dias</td>
                <td className="py-1.5 text-[#6B6560]">{p.max_attempts}</td>
                <td className="py-1.5 text-[#6B6560]">
                  {p.approval_mode === 'envio_automatico' ? 'automático' : 'tarefa'}
                </td>
                <td className="py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      p.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : p.status === 'draft'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.status === 'active'
                      ? 'Em uso'
                      : p.status === 'draft'
                        ? 'Rascunho'
                        : 'Pausada'}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => carregarNaTela(p)}
                    className="text-[11px] text-[#B8960E] underline"
                  >
                    carregar
                  </button>
                </td>
              </tr>
            ))}
            {dados.policies.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-[#6B6560]">
                  Nenhuma cadência configurada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-[#F1E5C8] bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2D2A26]">
            Casos em cadência ({dados.enrollments.length})
          </h2>
          <button
            onClick={() => void carregar()}
            disabled={carregando}
            className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px] font-semibold text-[#2D2A26] disabled:opacity-50"
          >
            {carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-[#6B6560]">
            <tr>
              <th className="py-1">Contato</th>
              <th className="py-1">Cadência</th>
              <th className="py-1">Tentativas</th>
              <th className="py-1">Próxima</th>
              <th className="py-1">Situação</th>
            </tr>
          </thead>
          <tbody>
            {dados.enrollments.map((e) => {
              const st = ROTULO_STATUS_INSC[e.status] ?? ROTULO_STATUS_INSC.active
              return (
                <tr key={e.id} className="border-t border-[#F7F0E1]">
                  <td className="py-1.5 font-medium text-[#2D2A26]">{e.contato}</td>
                  <td className="py-1.5 text-[#6B6560]">{e.politica}</td>
                  <td className="py-1.5 text-[#6B6560]">{e.attempts_done}</td>
                  <td className="py-1.5 text-[#6B6560]">{quando(e.next_run_at)}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cor}`}
                    >
                      {st.texto}
                    </span>
                    {e.pause_reason && (
                      <span className="ml-1 text-[10px] text-[#6B6560]">({e.pause_reason})</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {dados.enrollments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-[#6B6560]">
                  Nenhum caso em cadência ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/** Casca: o AppShell é quem fornece a clínica ativa por contexto (lição de 04/11). */
export default function AdminCadencias() {
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
      <AdminCadenciasConteudo />
    </AppShell>
  )
}
