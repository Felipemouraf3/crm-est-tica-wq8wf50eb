// src/components/opportunity-panel.tsx — P3-S02-T02 (revisão 03/11)
// A oportunidade é do CONTATO da conversa (RPC opportunity_for_conversation).
// v0.0.71: além do painel lateral, botão no CABEÇALHO da conversa que abre um diálogo —
// porque o painel lateral ficava abaixo da dobra e o usuário não o encontrava.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

type Origem = { key: string; label: string }
type Opp = { id: string; stage_label: string; amount_cents: number; status: string }

function useOportunidade(conversationId: string, clinicId: string | null) {
  const [origens, setOrigens] = useState<Origem[]>([])
  const [existente, setExistente] = useState<Opp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!clinicId || !conversationId) return
    const { data } = await supabase.rpc('admin_get_funnel', { p_clinic: clinicId })
    const d = data as unknown as { sources?: (Origem & { active: boolean })[] } | null
    setOrigens((d?.sources ?? []).filter((s) => s.active))
    const { data: o, error } = await supabase.rpc('opportunity_for_conversation', {
      p_conversation: conversationId,
    })
    if (error) setErro(error.message)
    else setExistente((o as unknown as Opp | null) ?? null)
  }, [clinicId, conversationId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criar(origem: string, valor: string) {
    if (!conversationId || !origem) return false
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
          ? 'Este contato já tem uma oportunidade aberta.'
          : error.message.includes('origem')
            ? 'Escolha a origem do lead antes de criar.'
            : error.message,
      )
      return false
    }
    setAviso('Oportunidade criada.')
    await carregar()
    return true
  }

  return { origens, existente, erro, aviso, salvando, criar, recarregar: carregar }
}

/** Botão do cabeçalho + diálogo — sempre visível, independente da altura da página. */
export function BotaoOportunidade({
  conversationId,
  clinicId,
}: {
  conversationId: string
  clinicId: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [origem, setOrigem] = useState('')
  const [valor, setValor] = useState('')
  const { origens, existente, erro, aviso, salvando, criar } = useOportunidade(
    conversationId,
    clinicId,
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-[#B8960E] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#8f7409]"
      >
        {existente ? 'Oportunidade aberta' : '＋ Criar oportunidade'}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Criar oportunidade"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="font-serif text-lg font-bold text-[#2D2A26]">Oportunidade</h2>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="rounded border border-[#F1E5C8] px-2 text-xs text-[#6B6560]"
              >
                ✕
              </button>
            </div>

            {erro && (
              <div role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-[#D93025]">
                {erro}
              </div>
            )}
            {aviso && (
              <div
                role="status"
                className="mb-3 rounded bg-emerald-50 px-3 py-2 text-xs text-[#1E8E3E]"
              >
                {aviso}
              </div>
            )}

            {existente ? (
              <div className="space-y-2 text-sm">
                <p className="text-[#2D2A26]">
                  Já existe uma oportunidade aberta na etapa{' '}
                  <strong>{existente.stage_label}</strong>.
                </p>
                <Link to="/funil" className="font-semibold text-[#B8960E] hover:underline">
                  Abrir o funil →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-[#6B6560]">
                  Origem do lead (obrigatória)
                  <select
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-2 text-sm text-[#2D2A26]"
                  >
                    <option value="">Selecione…</option>
                    {origens.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#6B6560]">
                  Valor estimado (R$)
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="mt-1 block w-full rounded-lg border border-[#F1E5C8] px-2 py-2 text-sm text-[#2D2A26]"
                  />
                </label>
                <button
                  onClick={async () => {
                    const ok = await criar(origem, valor)
                    if (ok) {
                      setValor('')
                      setAberto(false)
                    }
                  }}
                  disabled={salvando || !origem}
                  className="w-full rounded-lg bg-[#B8960E] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {salvando ? 'Criando…' : 'Criar oportunidade'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Painel lateral (mantido, agora abaixo do ticket e empilhado em tela estreita). */
export function PainelOportunidade({
  conversationId,
  clinicId,
}: {
  conversationId: string
  clinicId: string | null
}) {
  const [origem, setOrigem] = useState('')
  const [valor, setValor] = useState('')
  const { origens, existente, erro, aviso, salvando, criar } = useOportunidade(
    conversationId,
    clinicId,
  )

  return (
    <section
      className="rounded-lg border border-[#F1E5C8] bg-white p-3"
      aria-label="Oportunidade lateral"
    >
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
            Oportunidade aberta na etapa <strong>{existente.stage_label}</strong>.
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
            onClick={() => void criar(origem, valor)}
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
