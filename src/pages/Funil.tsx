// src/pages/Funil.tsx — P3-S02-T02
// Quadro do funil por etapa + ficha da oportunidade com histórico.
// A permissão é decidida no servidor: sales vê as suas, gestor vê as da clínica (RN-P3-S02-07).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useClinicaAtiva } from '@/components/clinic-selector'

type Opp = {
  id: string
  stage_id: string
  stage_key: string
  stage_label: string
  stage_position: number
  title: string
  contact_name: string | null
  contact_phone: string | null
  owner_user_id: string | null
  amount_cents: number
  status: string
  dias_na_etapa: number
}

type Etapa = { id: string; key: string; label: string; position: number; active: boolean }
type Hist = {
  id: string
  de: string
  para: string
  autor: string
  motivo: string | null
  quando: string
}

const moeda = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Funil() {
  const clinica = useClinicaAtiva()
  const [opps, setOpps] = useState<Opp[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [hist, setHist] = useState<Hist[]>([])
  const [sel, setSel] = useState<Opp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const [o, f] = await Promise.all([
      supabase.rpc('list_opportunities', { p_clinic: clinica, p_pipeline: null }),
      supabase.rpc('admin_get_funnel', { p_clinic: clinica }),
    ])
    if (o.error) setErro(o.error.message)
    else setOpps((o.data ?? []) as Opp[])
    if (!f.error) {
      const d = f.data as unknown as { stages?: Etapa[] } | null
      setEtapas((d?.stages ?? []).filter((s) => s.active))
    }
    setCarregando(false)
  }, [clinica])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function abrir(o: Opp) {
    setSel(o)
    setHist([])
    const { data, error } = await supabase.rpc('list_opportunity_history', { p_opportunity: o.id })
    if (!error) setHist((data ?? []) as Hist[])
  }

  async function mover(stageId: string) {
    if (!sel) return
    setErro(null)
    const { error } = await supabase.rpc('move_opportunity', {
      p_opportunity: sel.id,
      p_stage: stageId,
      p_reason: null,
    })
    if (error) {
      setErro(error.message)
      return
    }
    setSel(null)
    await carregar()
  }

  const porEtapa = useMemo(() => {
    const m = new Map<string, Opp[]>()
    for (const e of etapas) m.set(e.id, [])
    for (const o of opps) {
      if (!m.has(o.stage_id)) m.set(o.stage_id, [])
      m.get(o.stage_id)!.push(o)
    }
    return m
  }, [etapas, opps])

  const total = opps.reduce((s, o) => s + (o.status === 'open' ? o.amount_cents : 0), 0)

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para ver o funil.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Funil comercial</h1>
          <p className="text-xs text-[#6B6560]">
            {opps.length} oportunidade(s) · {moeda(total)} em aberto
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          disabled={carregando}
          className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#2D2A26] disabled:opacity-50"
        >
          {carregando ? 'Atualizando…' : 'Atualizar'}
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

      {opps.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#F1E5C8] bg-white p-8 text-center">
          <p className="text-sm font-medium text-[#2D2A26]">Nenhuma oportunidade ainda</p>
          <p className="mt-1 text-xs text-[#6B6560]">
            Abra uma conversa em Atendimento e clique em “Criar oportunidade” para começar.
          </p>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {etapas.map((e) => {
          const lista = porEtapa.get(e.id) ?? []
          const soma = lista.reduce((s, o) => s + o.amount_cents, 0)
          return (
            <section
              key={e.id}
              aria-label={`Etapa ${e.label}`}
              className="min-w-[220px] flex-shrink-0 rounded-xl border border-[#F1E5C8] bg-[#FFFDF9] p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold text-[#2D2A26]">{e.label}</h2>
                <span className="rounded-full bg-[#F1E5C8] px-1.5 text-[10px] font-bold text-[#2D2A26]">
                  {lista.length}
                </span>
              </div>
              <p className="mb-2 px-1 text-[10px] text-[#6B6560]">{moeda(soma)}</p>
              <div className="space-y-2">
                {lista.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => void abrir(o)}
                    className="w-full rounded-lg border border-[#F1E5C8] bg-white p-2 text-left hover:border-[#D4AF37] hover:shadow-sm"
                  >
                    <div className="truncate text-xs font-semibold text-[#2D2A26]">{o.title}</div>
                    <div className="truncate text-[10px] text-[#6B6560]">
                      {o.contact_name ?? o.contact_phone ?? 'sem contato'}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[#B8960E]">
                        {moeda(o.amount_cents)}
                      </span>
                      <span
                        className={`text-[10px] ${
                          o.dias_na_etapa > 7 ? 'font-semibold text-[#D93025]' : 'text-[#6B6560]'
                        }`}
                      >
                        {o.dias_na_etapa}d
                      </span>
                    </div>
                  </button>
                ))}
                {lista.length === 0 && (
                  <p className="px-1 py-2 text-[10px] italic text-[#B8B0A6]">vazio</p>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {sel && (
        <div
          role="dialog"
          aria-label="Ficha da oportunidade"
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setSel(null)}
        >
          <aside
            className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#2D2A26]">{sel.title}</h2>
                <p className="text-xs text-[#6B6560]">{sel.contact_name ?? sel.contact_phone}</p>
              </div>
              <button
                onClick={() => setSel(null)}
                aria-label="Fechar ficha"
                className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs"
              >
                Fechar
              </button>
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-[#6B6560]">Valor</dt>
                <dd className="font-semibold text-[#2D2A26]">{moeda(sel.amount_cents)}</dd>
              </div>
              <div>
                <dt className="text-[#6B6560]">Etapa atual</dt>
                <dd className="font-semibold text-[#2D2A26]">{sel.stage_label}</dd>
              </div>
              <div>
                <dt className="text-[#6B6560]">Dias na etapa</dt>
                <dd className={sel.dias_na_etapa > 7 ? 'font-semibold text-[#D93025]' : ''}>
                  {sel.dias_na_etapa}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B6560]">Situação</dt>
                <dd className="font-semibold text-[#2D2A26]">{sel.status}</dd>
              </div>
            </dl>

            <h3 className="mb-2 text-sm font-semibold text-[#2D2A26]">Mover para</h3>
            <div className="mb-4 flex flex-wrap gap-1">
              {etapas
                .filter((e) => e.id !== sel.stage_id)
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => void mover(e.id)}
                    className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px] text-[#2D2A26] hover:border-[#D4AF37] hover:bg-[#FFF8ED]"
                  >
                    {e.label}
                  </button>
                ))}
            </div>

            <h3 className="mb-2 text-sm font-semibold text-[#2D2A26]">Histórico</h3>
            <ol className="space-y-2">
              {hist.map((h) => (
                <li
                  key={h.id}
                  className="rounded-lg border border-[#F7F0E1] bg-[#FFFDF9] p-2 text-[11px]"
                >
                  <div className="font-medium text-[#2D2A26]">
                    {h.de} → {h.para}
                  </div>
                  <div className="text-[#6B6560]">
                    {new Date(h.quando).toLocaleString('pt-BR')} · {h.autor}
                  </div>
                  {h.motivo && <div className="mt-0.5 italic text-[#6B6560]">“{h.motivo}”</div>}
                </li>
              ))}
              {hist.length === 0 && (
                <li className="text-[11px] text-[#6B6560]">Sem movimentações.</li>
              )}
            </ol>
          </aside>
        </div>
      )}
    </div>
  )
}
