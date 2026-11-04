// src/pages/Funil.tsx — P3-S02-T02
// Quadro do funil por etapa + ficha da oportunidade com histórico.
// A permissão é decidida no servidor: sales vê as suas, gestor vê as da clínica (RN-P3-S02-07).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { clinicaSalva } from '@/components/clinic-selector'

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

type Etapa = {
  id: string
  key: string
  label: string
  position: number
  active: boolean
  is_final_won?: boolean
  is_final_lost?: boolean
}
type Motivo = { key: string; label: string }
type Sugestao = {
  id: string
  opportunity_id: string
  contact_name: string | null
  stage_label: string
  amount_cents: number
  sale_expert_uuid: string
  sale_amount_cents: number
  sale_date: string | null
  status: string
  created_at: string
}
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
  // A rota /funil vive fora do AppShell (Layout simples), então a clínica ativa
  // vem do localStorage + tabela clinics, como fazem /filas e as telas de admin.
  const [clinica, setClinica] = useState<string | null>(null)
  const [opps, setOpps] = useState<Opp[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [hist, setHist] = useState<Hist[]>([])
  const [sel, setSel] = useState<Opp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  // diálogo de fechamento: 'perdido' pede motivo; 'ganho' pede venda ou aprovação
  const [fecho, setFecho] = useState<{ tipo: 'ganho' | 'perdido'; stageId: string } | null>(null)
  const [motivoSel, setMotivoSel] = useState('')
  const [vendaSel, setVendaSel] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [fechando, setFechando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const salva = clinicaSalva()
      const { data } = await supabase
        .from('clinics')
        .select('id')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      const lista = (data ?? []) as { id: string }[]
      const escolhida = lista.find((c) => c.id === salva) ?? lista[0]
      if (escolhida) setClinica(escolhida.id)
    })()
    return () => {
      vivo = false
    }
  }, [])

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
      const d = f.data as unknown as {
        stages?: Etapa[]
        loss_reasons?: Motivo[]
      } | null
      setEtapas((d?.stages ?? []).filter((s) => s.active))
      setMotivos(d?.loss_reasons ?? [])
    }
    // sugestões de ganho pela venda espelhada (P3-S02-T03)
    const { data: sg } = await supabase.rpc('list_gain_suggestions', { p_clinic: clinica })
    setSugestoes(((sg ?? []) as Sugestao[]).filter((s) => s.status === 'pending'))
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

  /** Move para etapas intermediárias direto; finais abrem o diálogo de regra. */
  async function mover(stageId: string) {
    if (!sel) return
    const destino = etapas.find((e) => e.id === stageId)
    if (destino?.is_final_lost) {
      setMotivoSel('')
      setFecho({ tipo: 'perdido', stageId })
      return
    }
    if (destino?.is_final_won) {
      setVendaSel('')
      setJustificativa('')
      setFecho({ tipo: 'ganho', stageId })
      return
    }
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

  /** Confirma o fechamento respeitando as regras do servidor. */
  async function confirmarFecho() {
    if (!sel || !fecho) return
    setErro(null)
    setFechando(true)
    if (fecho.tipo === 'perdido') {
      if (!motivoSel) {
        setErro('Escolha o motivo da perda.')
        setFechando(false)
        return
      }
      const { error } = await supabase.rpc('move_opportunity', {
        p_opportunity: sel.id,
        p_stage: fecho.stageId,
        p_reason: motivoSel,
      })
      if (error) {
        setErro(error.message)
        setFechando(false)
        return
      }
    } else {
      // ganho: com venda vinculada, ou aprovação do gestor com justificativa
      if (vendaSel) {
        const { error } = await supabase.rpc('move_opportunity', {
          p_opportunity: sel.id,
          p_stage: fecho.stageId,
          p_reason: null,
          p_sale_uuid: vendaSel,
        })
        if (error) {
          setErro(error.message)
          setFechando(false)
          return
        }
      } else {
        const { error } = await supabase.rpc('approve_gain_without_sale', {
          p_opportunity: sel.id,
          p_reason: justificativa,
        })
        if (error) {
          setErro(
            error.message.includes('aprovacao_apenas_gestor')
              ? 'Só o gestor pode fechar sem venda vinculada.'
              : error.message,
          )
          setFechando(false)
          return
        }
      }
    }
    setFechando(false)
    setFecho(null)
    setSel(null)
    await carregar()
  }

  async function confirmarSugestao(id: string) {
    setErro(null)
    const { error } = await supabase.rpc('confirm_gain_suggestion', { p_suggestion: id })
    if (error) {
      setErro(error.message)
      return
    }
    await carregar()
  }

  async function dispensarSugestao(id: string) {
    setErro(null)
    const { error } = await supabase.rpc('dismiss_gain_suggestion', { p_suggestion: id })
    if (error) {
      setErro(error.message)
      return
    }
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
        Nenhuma clínica disponível para este usuário.
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

      {sugestoes.length > 0 && (
        <section
          aria-label="Sugestões de ganho pela venda"
          className="rounded-xl border border-[#D4AF37] bg-[#FFF8ED] p-3"
        >
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#B8960E]">
            Venda identificada · confirme o ganho
          </h2>
          <ul className="space-y-2">
            {sugestoes.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F1E5C8] bg-white p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#2D2A26]">
                    {s.contact_name ?? 'Contato'}
                  </p>
                  <p className="text-[10px] text-[#6B6560]">
                    Venda de {moeda(s.sale_amount_cents)} em{' '}
                    {s.sale_date ? new Date(s.sale_date).toLocaleDateString('pt-BR') : '—'} · hoje
                    em {s.stage_label}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => void confirmarSugestao(s.id)}
                    className="rounded-lg bg-[#B8960E] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#8f7409]"
                  >
                    Confirmar ganho
                  </button>
                  <button
                    onClick={() => void dispensarSugestao(s.id)}
                    className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px] text-[#6B6560]"
                  >
                    Ignorar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
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

            {fecho && (
              <div
                role="dialog"
                aria-label={fecho.tipo === 'perdido' ? 'Motivo da perda' : 'Evidência do ganho'}
                className="mb-4 rounded-lg border border-[#D4AF37] bg-[#FFF8ED] p-3"
              >
                <h3 className="mb-2 text-xs font-bold text-[#2D2A26]">
                  {fecho.tipo === 'perdido' ? 'Por que foi perdido?' : 'Evidência do ganho'}
                </h3>

                {fecho.tipo === 'perdido' ? (
                  <label className="block text-[11px] text-[#6B6560]">
                    Motivo (obrigatório)
                    <select
                      value={motivoSel}
                      onChange={(ev) => setMotivoSel(ev.target.value)}
                      className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
                    >
                      <option value="">Selecione…</option>
                      {motivos.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[11px] text-[#6B6560]">
                      Nº da venda no Clínica Experts (opcional)
                      <input
                        value={vendaSel}
                        onChange={(ev) => setVendaSel(ev.target.value)}
                        placeholder="ex.: 183142c8-…"
                        className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
                      />
                    </label>
                    <p className="text-[10px] text-[#6B6560]">
                      Sem venda vinculada, só o gestor fecha — e fica marcado “a conferir”.
                    </p>
                    {!vendaSel && (
                      <label className="block text-[11px] text-[#6B6560]">
                        Justificativa do gestor
                        <input
                          value={justificativa}
                          onChange={(ev) => setJustificativa(ev.target.value)}
                          placeholder="ex.: cliente fechou no balcão"
                          className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => void confirmarFecho()}
                    disabled={fechando}
                    className="rounded-lg bg-[#B8960E] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {fechando ? 'Salvando…' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setFecho(null)}
                    className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px] text-[#6B6560]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

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
