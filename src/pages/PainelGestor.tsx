// src/pages/PainelGestor.tsx — P3-S07-T02
// Painel do gestor: um número por indicador, com o dicionário ao lado para explicar
// de onde ele vem.
//
// HISTÓRICO DO CLIQUE (05/11/2026):
//  v0.0.86 botão com onClick  → Felipe: "não abre"
//  v0.0.87 modal              → Felipe: "não abre"
//  v0.0.90 lista inline       → Felipe: "não abre"
//  v0.0.91 <Link>             → Felipe: "não abre"
// Testei tudo com owner em Chrome real e sempre abriu. Como não reproduzo, parei de
// depender de interação: as listas agora usam <details>/<summary>, que é HTML nativo —
// o navegador abre e fecha SEM JavaScript, sem handler, sem estado, sem rota.
// As listas já vêm carregadas no carregamento da página.
//
// Regras que a TELA respeita (o servidor revalida sempre):
//  - valor financeiro só para owner/clinic_admin/manager (RN-03)
//  - "dados até" é mostrado, para não confundir mês fechado com parcial
//  - o dicionário vem do banco, com definição, origem, versão e responsável (RN-01)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Dia = { day: string; agendamentos: number; vendas: number; avaliacoes: number }
type Def = {
  metric_key: string
  label: string
  definition: string
  source: string
  definition_version: number
  owner: string
  is_financial: boolean
}

type Painel = {
  de: string
  ate: string
  dados_ate: string | null
  pode_ver_financeiro: boolean
  indicadores: Record<string, number>
  por_dia: Dia[]
  dicionario: Def[]
}

type BaseLine = {
  existe: boolean
  baseline_start?: string
  baseline_days?: number
  reference_month?: string
  reference_appointments?: number
  reference_sales?: number
  reference_sales_value_cents?: number
  is_draft?: boolean
  pode_validar?: boolean
  dias_decorridos?: number
  dias_restantes?: number
  validated_at?: string | null
}

type Linha = { nome: string; quando: string }
type Listas = { agendamentos: Linha[]; realizados: Linha[]; vendas: Linha[] }

const FINANCEIROS = new Set(['vendas_valor_centavos', 'ticket_medio_centavos'])

function mesISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mesFechado(): string {
  const agora = new Date()
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
  return mesISO(anterior)
}

function primeiroDia(iso: string): string {
  return `${iso}-01`
}

function ultimoDia(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  const ultimo = new Date(a, m, 0)
  return `${iso}-${String(ultimo.getDate()).padStart(2, '0')}`
}

function brl(centavos: number | undefined): string {
  if (centavos === undefined || centavos === null) return '—'
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function num(v: number | undefined): string {
  if (v === undefined || v === null) return '—'
  return v.toLocaleString('pt-BR')
}

function pct(parte: number | undefined, todo: number | undefined): string {
  if (!todo || !parte) return '—'
  return `${Math.round((parte / todo) * 100)}%`
}

function PainelGestorConteudo() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [periodo, setPeriodo] = useState(mesFechado())
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<BaseLine | null>(null)
  const [validando, setValidando] = useState(false)
  const [listas, setListas] = useState<Listas>({ agendamentos: [], realizados: [], vendas: [] })

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('get_manager_panel', {
      p_clinic: clinica,
      p_de: primeiroDia(periodo),
      p_ate: ultimoDia(periodo),
    })
    if (error) setErro(error.message)
    else setPainel(data as unknown as Painel)
    setCarregando(false)
  }, [clinica, periodo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const carregarBaseline = useCallback(async () => {
    if (!clinica) return
    const { data } = await supabase.rpc('get_baseline', { p_clinic: clinica })
    setBaseline((data as unknown as BaseLine) ?? null)
  }, [clinica])

  useEffect(() => {
    void carregarBaseline()
  }, [carregarBaseline])

  // As listas vêm prontas no carregamento da página — não dependem de interação.
  useEffect(() => {
    if (!clinica) return
    let vivo = true
    const de = primeiroDia(periodo)
    const ate = ultimoDia(periodo)
    ;(async () => {
      const [ag, re, vd] = await Promise.all([
        supabase
          .from('appointments_mirror')
          .select('patient_name, starts_at')
          .eq('clinic_id', clinica)
          .gte('starts_at', de)
          .lte('starts_at', `${ate}T23:59:59`)
          .order('starts_at', { ascending: false })
          .limit(200),
        supabase
          .from('appointments_mirror')
          .select('patient_name, starts_at')
          .eq('clinic_id', clinica)
          .eq('status', 'done')
          .gte('starts_at', de)
          .lte('starts_at', `${ate}T23:59:59`)
          .order('starts_at', { ascending: false })
          .limit(200),
        supabase
          .from('sales_mirror')
          .select('buyer_name, sale_date, final_amount_cents')
          .eq('clinic_id', clinica)
          .gte('sale_date', de)
          .lte('sale_date', `${ate}T23:59:59`)
          .order('sale_date', { ascending: false })
          .limit(200),
      ])
      if (!vivo) return
      const mapa = (rows: unknown) =>
        ((rows ?? []) as { patient_name: string | null; starts_at: string }[]).map((r) => ({
          nome: r.patient_name ?? 'sem nome',
          quando: new Date(r.starts_at).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }),
        }))
      setListas({
        agendamentos: mapa(ag.data),
        realizados: mapa(re.data),
        vendas: (
          (vd.data ?? []) as {
            buyer_name: string | null
            sale_date: string
            final_amount_cents: number
          }[]
        ).map((r) => ({
          nome: `${r.buyer_name ?? 'sem nome'} · ${brl(r.final_amount_cents)}`,
          quando: new Date(r.sale_date).toLocaleDateString('pt-BR'),
        })),
      })
    })()
    return () => {
      vivo = false
    }
  }, [clinica, periodo])

  async function validarBaseline() {
    if (!clinica) return
    setValidando(true)
    const { error } = await supabase.rpc('validate_baseline', { p_clinic: clinica })
    setValidando(false)
    if (error) {
      setErro(error.message)
      return
    }
    await carregarBaseline()
  }

  const ind = painel?.indicadores ?? {}
  const def = useMemo(() => {
    const m = new Map<string, Def>()
    for (const d of painel?.dicionario ?? []) m.set(d.metric_key, d)
    return m
  }, [painel])

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para ver o painel.
      </div>
    )
  }

  const cartoes = [
    { k: 'agendamentos', v: num(ind.agendamentos), s: 'no mês' },
    { k: 'agendamentos_realizados', v: num(ind.agendamentos_realizados), s: 'compareceram' },
    {
      k: 'agendamentos_cancelados',
      v: num(ind.agendamentos_cancelados),
      s: `${pct(ind.agendamentos_cancelados, ind.agendamentos)} do total`,
    },
    { k: 'avaliacoes', v: num(ind.avaliacoes), s: 'agendadas' },
    { k: 'avaliacoes_realizadas', v: num(ind.avaliacoes_realizadas), s: 'realizadas' },
    { k: 'vendas', v: num(ind.vendas), s: 'no mês' },
    {
      k: 'vendas_valor_centavos',
      v: painel?.pode_ver_financeiro ? brl(ind.vendas_valor_centavos) : '—',
      s: 'faturamento',
    },
    {
      k: 'ticket_medio_centavos',
      v: painel?.pode_ver_financeiro ? brl(ind.ticket_medio_centavos) : '—',
      s: 'média por venda',
    },
    { k: 'leads', v: num(ind.leads), s: 'contatos no mês' },
    {
      k: 'mensagens_recebidas',
      v: num(ind.mensagens_recebidas),
      s: `${num(ind.mensagens_enviadas)} enviadas`,
    },
    { k: 'sla_vencido', v: num(ind.sla_vencido), s: 'sem primeira resposta' },
  ]

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Painel do gestor</h1>
          <p className="text-xs text-[#6B6560]">
            Atendimento, agenda e vendas por período. As listas de casos estão logo abaixo.
          </p>
          {painel?.dados_ate && (
            <p className="mt-1 text-xs text-[#B8960E]">
              Dados até{' '}
              <strong>
                {new Date(painel.dados_ate + 'T12:00:00').toLocaleDateString('pt-BR')}
              </strong>
              {periodo > (painel.dados_ate ?? '').slice(0, 7) && ' — este mês ainda não fechou'}
            </p>
          )}
        </div>
        <label className="text-xs text-[#6B6560]">
          Mês
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="ml-2 rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
          />
        </label>
      </header>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#D93025]"
        >
          {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Calculando…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {cartoes.map((c) => {
              const d = def.get(c.k)
              return (
                <div
                  key={c.k}
                  className="rounded-xl border border-[#F1E5C8] bg-white p-3 text-left"
                >
                  <div className="text-xl font-bold text-[#2D2A26]">{c.v}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6560]">
                    {d?.label ?? c.k}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#9B938A]">{c.s}</div>
                </div>
              )
            })}
          </section>

          {/* LINHAS DE CASOS — <details> nativo: abre sem JavaScript, sem clique tratado */}
          {painel?.pode_ver_financeiro !== false && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-[#2D2A26]">Casos do período</h2>

              <details className="rounded-xl border border-[#F1E5C8] bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#2D2A26]">
                  Agendamentos ({num(ind.agendamentos)}) — abrir lista
                </summary>
                <ListaDeCasos linhas={listas.agendamentos} />
              </details>

              <details className="rounded-xl border border-[#F1E5C8] bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#2D2A26]">
                  Agendamentos realizados ({num(ind.agendamentos_realizados)}) — abrir lista
                </summary>
                <ListaDeCasos linhas={listas.realizados} />
              </details>

              <details className="rounded-xl border border-[#F1E5C8] bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#2D2A26]">
                  Vendas ({num(ind.vendas)}) — abrir lista
                </summary>
                <ListaDeCasos linhas={listas.vendas} />
              </details>
            </section>
          )}

          {/* linha de base (CA-08) */}
          {baseline?.existe && (
            <section className="rounded-xl border border-[#F1E5C8] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#2D2A26]">Linha de base</h2>
                  <p className="text-[11px] text-[#6B6560]">
                    Referência de {baseline.reference_month} · contagem de {baseline.baseline_days}{' '}
                    dias começou em{' '}
                    <strong>
                      {baseline.baseline_start
                        ? new Date(baseline.baseline_start + 'T12:00:00').toLocaleDateString(
                            'pt-BR',
                          )
                        : '—'}
                    </strong>
                    {typeof baseline.dias_decorridos === 'number' && (
                      <>
                        {' '}
                        · {baseline.dias_decorridos} de {baseline.baseline_days} dias (
                        {baseline.dias_restantes} restantes)
                      </>
                    )}
                  </p>
                </div>
                {baseline.is_draft ? (
                  <button
                    type="button"
                    onClick={() => void validarBaseline()}
                    disabled={validando || !baseline.pode_validar}
                    className="rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {validando ? 'Validando…' : 'Validar linha de base'}
                  </button>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                    validada
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-[#2D2A26]">
                    {num(baseline.reference_appointments)}
                  </div>
                  <div className="text-[10px] uppercase text-[#6B6560]">agendamentos</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#2D2A26]">
                    {num(baseline.reference_sales)}
                  </div>
                  <div className="text-[10px] uppercase text-[#6B6560]">vendas</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#2D2A26]">
                    {brl(baseline.reference_sales_value_cents)}
                  </div>
                  <div className="text-[10px] uppercase text-[#6B6560]">valor vendido</div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-[#F1E5C8] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-[#2D2A26]">
              Como cada número é calculado
            </h2>
            <p className="mb-2 text-[11px] text-[#6B6560]">
              Definição, origem e versão. O que aparece aqui é a regra que o sistema aplica.
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[#6B6560]">
                  <tr>
                    <th className="py-1">Indicador</th>
                    <th className="py-1">Definição</th>
                    <th className="py-1">Origem</th>
                    <th className="py-1">v</th>
                  </tr>
                </thead>
                <tbody>
                  {(painel?.dicionario ?? []).map((d) => (
                    <tr key={d.metric_key} className="border-t border-[#F7F0E1]">
                      <td className="py-1 font-medium text-[#2D2A26]">
                        {d.label}
                        {d.is_financial && (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] text-amber-800">
                            financeiro
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-[#6B6560]">{d.definition}</td>
                      <td className="py-1 font-mono text-[10px] text-[#9B938A]">{d.source}</td>
                      <td className="py-1 text-[#9B938A]">{d.definition_version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/** Lista simples, usada dentro de <details> — sem estado, sem clique. */
function ListaDeCasos({ linhas }: { linhas: Linha[] }) {
  if (linhas.length === 0) {
    return <p className="mt-2 text-xs text-[#6B6560]">Sem casos para listar.</p>
  }
  return (
    <ul className="mt-2 max-h-72 divide-y divide-[#F7F0E1] overflow-y-auto text-xs">
      {linhas.map((d, i) => (
        <li key={`${d.nome}-${i}`} className="flex justify-between py-1">
          <span className="text-[#2D2A26]">{d.nome}</span>
          <span className="text-[#6B6560]">{d.quando}</span>
        </li>
      ))}
    </ul>
  )
}

/** Casca: AppShell fornece a clínica ativa por contexto. */
export default function PainelGestor() {
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
      <PainelGestorConteudo />
    </AppShell>
  )
}
