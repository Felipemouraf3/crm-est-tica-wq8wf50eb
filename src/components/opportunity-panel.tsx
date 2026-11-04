// src/components/opportunity-panel.tsx — P3-S02-T02
// Cria a oportunidade a partir da conversa (CA-P3-S02-01). Origem é obrigatória:
// se a conversa não tiver origem definida, o usuário escolhe antes de criar.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

type Origem = { key: string; label: string }
type Opp = { id: string; stage_label: string; amount_cents: number; status: string }

export function PainelOportunidade({
  conversationId,
  clinicId,
}: {
  conversationId: string
  clinicId: string | null
}) {
  const [origens, setOrigens] = useState<Origem[]>([])
  const [origem, setOrigem] = useState('')
  const [valor, setValor] = useState('')
  const [existente, setExistente] = useState<Opp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!clinicId || !conversationId) return
    const { data } = await supabase.rpc('admin_get_funnel', { p_clinic: clinicId })
    const d = data as unknown as { sources?: (Origem & { active: boolean })[] } | null
    const ativas = (d?.sources ?? []).filter((s) => s.active)
    setOrigens(ativas)
    if (!origem && ativas.length === 1) setOrigem(ativas[0].key)

    // A oportunidade tem de ser a DESTE contato. Antes eu olhava a lista inteira da
    // clínica e achava a primeira aberta — então toda conversa dizia "já existe".
    const { data: o } = await supabase.rpc('opportunity_for_conversation', {
      p_conversation: conversationId,
    })
    setExistente((o as unknown as Opp | null) ?? null)
  }, [clinicId, conversationId, origem])

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, conversationId])

  async function criar() {
    if (!conversationId || !origem) return
    setErro(null)
    setAviso(null)
    setSalvando(true)
    const cents = valor ? Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) : 0
    const { error } = await supabase.rpc('create_opportunity_from_conversation', {
      p_conversation: conversationId,
      p_source: origem,
      p_amount_cents: Number.isFinite(cents) ? cents : 0,
    })
    setSalvando(false)
    if (error) {
      setErro(
        error.message.includes('oportunidade_ja_aberta')
          ? 'Este contato já tem uma oportunidade aberta. Abra o funil para continuar dela.'
          : error.message.includes('origem_obrigatoria') ||
              error.message.includes('origem_invalida')
            ? 'Escolha a origem do lead antes de criar.'
            : error.message,
      )
      return
    }
    setAviso('Oportunidade criada.')
    setValor('')
    await carregar()
  }

  return (
    <section className="rounded-lg border border-[#F1E5C8] bg-white p-3" aria-label="Oportunidade">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
        Oportunidade
      </h2>

      {erro && (
        <div className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-[#D93025]">{erro}</div>
      )}
      {aviso && (
        <div className="mb-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-[#1E8E3E]">
          {aviso}
        </div>
      )}

      {existente ? (
        <div className="space-y-1 text-xs">
          <p className="text-[#2D2A26]">
            Já existe uma oportunidade aberta nesta clínica
            {existente.stage_label ? ` na etapa “${existente.stage_label}”` : ''}.
          </p>
          <Link to="/funil" className="font-semibold text-[#B8960E] hover:underline">
            Abrir o funil →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px] text-[#6B6560]">
            Origem do lead (obrigatória)
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
            >
              <option value="">Selecione…</option>
              {origens.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-[#6B6560]">
            Valor estimado (R$)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1 text-xs text-[#2D2A26]"
            />
          </label>
          <button
            onClick={() => void criar()}
            disabled={salvando || !origem}
            className="w-full rounded-lg bg-[#B8960E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar oportunidade'}
          </button>
        </div>
      )}
    </section>
  )
}
