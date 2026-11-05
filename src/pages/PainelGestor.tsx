// src/pages/PainelGestor.tsx — P3-S07-T02
// Painel do gestor: um número por indicador, com o dicionário ao lado para explicar
// de onde ele vem. Cada cartão é um LINK para a lista dos casos que o compõem.
//
// POR QUE LINK E NÃO onClick (05/11/2026):
// o Felipe reportou duas vezes que clicar em "Agendamentos" e "Vendas" não abria nada.
// Testei com owner em Chrome real e funcionava — não reproduzi. Em vez de insistir na
// causa, troquei o mecanismo: um <Link to="/painel?m=agendamentos"> é navegação nativa
// do navegador. Não depende de handler de React, de modal nem de position:fixed.
// Bônus: dá para compartilhar o endereço e o botão "voltar" funciona.
//
// Regras que a TELA respeita (o servidor revalida sempre):
//  - valor financeiro só para owner/clinic_admin/manager (RN-03)
//  - "dados até" é mostrado, para não confundir mês fechado com parcial
//  - o dicionário vem do banco, com definição, origem, versão e responsável (RN-01)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

const FINANCEIROS = new Set(['vendas_valor_centavos', 'ticket_medio_centavos'])

function mesISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Último mês FECHADO: o painel abre nele, não no mês corrente. */
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
  const [params] = useSearchParams()
  const metricaAberta = params.get('m')
  const [periodo, setPeriodo] = useState(mesFechado())
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<BaseLine | null>(null)
  const [validando, setValidando] = useState(false)
  const [detalhe, setDetalhe] = useState<{ nome: string; quando: string }[]>([])
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

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

  // carrega a lista do indicador que está na URL
  useEffect(() => {
    if (!clinica || !metricaAberta) {
      setDetalhe([])
      return
    }
    let vivo = true
    ;(async () => {
      setCarregandoDetalhe(true)
      setDetalhe([])
      const de = primeiroDia(periodo)
      const ate = ultimoDia(periodo)
      try {
        if (metricaAberta === 'agendamentos' || metricaAberta === 'agendamentos_realizados') {
          let q = supabase
            .from('appointments_mirror')
            .select('patient_name, starts_at, status')
            .eq('clinic_id', clinica)
            .gte('starts_at', de)
            .lte('starts_at', `${ate}T23:59:59`)
            .order('starts_at', { ascending: false })
            .limit(80)
          if (metricaAberta === 'agendamentos_realizados') q = q.eq('status', 'done')
          const { data, error } = await q
          if (!vivo) return
          if (error) setErro(error.message)
          setDetalhe(
            (data ?? []).map((r: { patient_name: string | null; starts_at: string }) => ({
              nome: r.patient_name ?? 'sem nome',
              quando: new Date(r.starts_at).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })),
          )
        } else if (metricaAberta === 'vendas') {
          const { data, error } = await supabase
            .from('sales_mirror')
            .select('buyer_name, sale_date, final_amount_cents')
            .eq('clinic_id', clinica)
            .gte('sale_date', de)
            .lte('sale_date', `${ate}T23:59:59`)
            .order('sale_date', { ascending: false })
            .limit(80)
          if (!vivo) return
          if (error) setErro(error.message)
          setDetalhe(
            (data ?? []).map(
              (r: {
                buyer_name: string | null
                sale_date: string
                final_amount_cents: number
              }) => ({
                nome: `${r.buyer_name ?? 'sem nome'} · ${brl(r.final_amount_cents)}`,
                quando: new Date(r.sale_date).toLocaleDateString('pt-BR'),
              }),
            ),
          )
        } else {
          setDetalhe([])
        }
      } finally {
        if (vivo) setCarregandoDetalhe(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [clinica, metricaAberta, periodo])

  useEffect(() => {
    if (metricaAberta) {
      setTimeout(() => {
        document
          .getElementById('lista-detalhe')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [metricaAberta])

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

  // Cada número que o gestor usa para decidir tem o SEU cartão, com o valor grande.
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

  const COM_LISTA = new Set(['agendamentos', 'agendamentos_realizados', 'vendas'])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Painel do gestor</h1>
          <p className="text-xs text-[#6B6560]">
            Atendimento, agenda e vendas por período. Clique num número para ver a lista dos casos.
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
              const financeiro = FINANCEIROS.has(c.k) && !painel?.pode_ver_financeiro
              const comLista = COM_LISTA.has(c.k) && !financeiro
              const conteudo = (
                <>
                  <div className="text-xl font-bold text-[#2D2A26]">{c.v}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6560]">
                    {d?.label ?? c.k}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#9B938A]">{c.s}</div>
                  {comLista && (
                    <div className="mt-1 text-[10px] font-semibold text-[#B8960E] underline">
                      ver lista
                    </div>
                  )}
                </>
              )

              const base =
                'block rounded-xl border bg-white p-3 text-left transition hover:bg-[#FFF8ED]'
              const destaque =
                metricaAberta === c.k
                  ? 'border-[#B8960E] ring-2 ring-[#B8960E]/30'
                  : 'border-[#F1E5C8]'

              // LINK de verdade: navegação nativa, sem depender de handler de clique
              if (comLista) {
                return (
                  <Link key={c.k} to={`/painel?m=${c.k}`} className={`${base} ${destaque}`}>
                    {conteudo}
                  </Link>
                )
              }

              return (
                <div key={c.k} className={`${base} ${destaque} opacity-90`}>
                  {conteudo}
                </div>
              )
            })}
          </section>

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

          {/* lista dos casos — aberta por LINK, não por modal */}
          {metricaAberta && (
            <section
              id="lista-detalhe"
              aria-label={`Casos de ${metricaAberta}`}
              className="scroll-mt-4 rounded-xl border-2 border-[#B8960E] bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-serif text-lg font-bold text-[#2D2A26]">
                    {def.get(metricaAberta)?.label ?? metricaAberta}
                  </h2>
                  <p className="text-xs text-[#6B6560]">
                    {num(ind[metricaAberta])} casos em {periodo} · mostrando até 80
                  </p>
                </div>
                <Link
                  to="/painel"
                  className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#6B6560]"
                >
                  Fechar lista
                </Link>
              </div>
              {carregandoDetalhe ? (
                <p className="mt-3 text-xs text-[#6B6560]">Carregando…</p>
              ) : detalhe.length === 0 ? (
                <p className="mt-3 text-xs text-[#6B6560]">
                  Nenhum caso para listar neste indicador — o total está no cartão.
                </p>
              ) : (
                <ul className="mt-3 max-h-80 divide-y divide-[#F7F0E1] overflow-y-auto text-xs">
                  {detalhe.map((d, i) => (
                    <li key={`${d.nome}-${i}`} className="flex justify-between py-1.5">
                      <span className="text-[#2D2A26]">{d.nome}</span>
                      <span className="text-[#6B6560]">{d.quando}</span>
                    </li>
                  ))}
                </ul>
              )}
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
