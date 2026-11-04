// src/pages/AdminFunil.tsx — P3-S02-T01
// Console do funil: etapas (ordem, prazo, etapa final), origens de lead e motivos de perda.
// CA-P3-S02-02: configuração por clínica com versão (salvar etapa em funil já usado cria versão).
// CA-P3-S02-07: só owner/clinic_admin escrevem; a RPC revalida no servidor.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AppShell } from '@/components/app-shell'
import { useClinicaAtiva } from '@/components/clinic-selector'
import type { Papel } from '@/lib/supabase/types'

type Etapa = {
  id: string
  key: string
  label: string
  position: number
  sla_hours: number | null
  is_final_won: boolean
  is_final_lost: boolean
  active: boolean
}
type Origem = { id: string; key: string; label: string; active: boolean; is_draft: boolean }
type Funil = {
  pipeline: { id: string; name: string; version: number; status: string } | null
  stages: Etapa[]
  sources: Origem[]
  reasons: Origem[]
}

const VAZIO: Funil = { pipeline: null, stages: [], sources: [], reasons: [] }

function AdminFunilConteudo() {
  const { clinicaAtiva: clinica } = useClinicaAtiva()
  const [funil, setFunil] = useState<Funil>(VAZIO)
  const [aba, setAba] = useState<'etapas' | 'origens' | 'motivos'>('etapas')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const [etapa, setEtapa] = useState({
    key: '',
    label: '',
    position: 0,
    sla_hours: '',
    is_final_won: false,
    is_final_lost: false,
  })
  const [novoRotulo, setNovoRotulo] = useState('')
  const [novaChave, setNovaChave] = useState('')

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('admin_get_funnel', { p_clinic: clinica })
    if (error) setErro(error.message)
    else setFunil((data as unknown as Funil) ?? VAZIO)
    setCarregando(false)
  }, [clinica])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvarEtapa() {
    if (!clinica || !etapa.key.trim() || !etapa.label.trim()) return
    setErro(null)
    setAviso(null)
    const { error } = await supabase.rpc('admin_save_stage', {
      p_clinic: clinica,
      p_key: etapa.key.trim(),
      p_label: etapa.label.trim(),
      p_position: Number(etapa.position) || 0,
      p_sla_hours: etapa.sla_hours === '' ? null : Number(etapa.sla_hours),
      p_is_final_won: etapa.is_final_won,
      p_is_final_lost: etapa.is_final_lost,
      p_active: true,
    })
    if (error) {
      setErro(error.message)
      return
    }
    setAviso('Etapa salva.')
    setEtapa({
      key: '',
      label: '',
      position: 0,
      sla_hours: '',
      is_final_won: false,
      is_final_lost: false,
    })
    await carregar()
  }

  async function salvarLista(tipo: 'origem' | 'motivo') {
    if (!clinica || !novaChave.trim() || !novoRotulo.trim()) return
    setErro(null)
    setAviso(null)
    const rpc = tipo === 'origem' ? 'admin_save_lead_source' : 'admin_save_loss_reason'
    const { error } = await supabase.rpc(rpc, {
      p_clinic: clinica,
      p_key: novaChave.trim(),
      p_label: novoRotulo.trim(),
      p_active: true,
      p_is_draft: false,
    })
    if (error) {
      setErro(error.message)
      return
    }
    setAviso(tipo === 'origem' ? 'Origem salva.' : 'Motivo salvo.')
    setNovaChave('')
    setNovoRotulo('')
    await carregar()
  }

  if (!clinica) {
    return (
      <div className="rounded-xl border border-[#F1E5C8] bg-white p-6 text-sm text-[#6B6560]">
        Escolha uma clínica no topo para configurar o funil.
      </div>
    )
  }

  const abas = [
    { id: 'etapas' as const, rotulo: 'Etapas do funil' },
    { id: 'origens' as const, rotulo: 'Origens do lead' },
    { id: 'motivos' as const, rotulo: 'Motivos de perda' },
  ]

  const lista = aba === 'origens' ? funil.sources : funil.reasons

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Funil comercial</h1>
        <p className="text-xs text-[#6B6560]">
          Configuração desta clínica. Alterar etapa de um funil já em uso cria uma nova versão e
          preserva o histórico das oportunidades.
        </p>
        {funil.pipeline && (
          <p className="mt-1 text-xs text-[#B8960E]">
            {funil.pipeline.name} · versão {funil.pipeline.version} · {funil.pipeline.status}
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

      <div className="flex gap-2">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              aba === a.id ? 'bg-[#B8960E] text-white' : 'border border-[#F1E5C8] text-[#2D2A26]'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
        <button
          onClick={() => void carregar()}
          disabled={carregando}
          className="ml-auto rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#2D2A26] disabled:opacity-50"
        >
          {carregando ? 'Carregando…' : 'Recarregar'}
        </button>
      </div>

      {aba === 'etapas' && (
        <section className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-[#F1E5C8] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FFF8ED] text-[#6B6560]">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Prazo (h)</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {funil.stages.map((s) => (
                  <tr key={s.id} className="border-t border-[#F7F0E1]">
                    <td className="px-3 py-2 text-[#6B6560]">{s.position}</td>
                    <td className="px-3 py-2 font-medium text-[#2D2A26]">{s.label}</td>
                    <td className="px-3 py-2 text-[#6B6560]">{s.sla_hours ?? '—'}</td>
                    <td className="px-3 py-2">
                      {s.is_final_won ? 'Ganho' : s.is_final_lost ? 'Perdido' : 'Em andamento'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          s.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
                {funil.stages.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-[#6B6560]">
                      Nenhuma etapa configurada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-[#F1E5C8] bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">
              Adicionar ou alterar etapa
            </h2>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="text-[#6B6560]">
                Chave
                <input
                  value={etapa.key}
                  onChange={(e) => setEtapa({ ...etapa, key: e.target.value })}
                  placeholder="ex.: qualificado"
                  className="mt-1 block w-40 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <label className="text-[#6B6560]">
                Nome exibido
                <input
                  value={etapa.label}
                  onChange={(e) => setEtapa({ ...etapa, label: e.target.value })}
                  placeholder="ex.: Qualificado"
                  className="mt-1 block w-44 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <label className="text-[#6B6560]">
                Ordem
                <input
                  type="number"
                  value={etapa.position}
                  onChange={(e) => setEtapa({ ...etapa, position: Number(e.target.value) })}
                  className="mt-1 block w-20 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <label className="text-[#6B6560]">
                Prazo (h)
                <input
                  type="number"
                  value={etapa.sla_hours}
                  onChange={(e) => setEtapa({ ...etapa, sla_hours: e.target.value })}
                  className="mt-1 block w-24 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <label className="flex items-center gap-1 text-[#2D2A26]">
                <input
                  type="checkbox"
                  checked={etapa.is_final_won}
                  onChange={(e) => setEtapa({ ...etapa, is_final_won: e.target.checked })}
                />
                Ganho
              </label>
              <label className="flex items-center gap-1 text-[#2D2A26]">
                <input
                  type="checkbox"
                  checked={etapa.is_final_lost}
                  onChange={(e) => setEtapa({ ...etapa, is_final_lost: e.target.checked })}
                />
                Perdido
              </label>
              <button
                onClick={() => void salvarEtapa()}
                disabled={!etapa.key.trim() || !etapa.label.trim()}
                className="rounded-lg bg-[#B8960E] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                Salvar etapa
              </button>
            </div>
          </div>
        </section>
      )}

      {aba !== 'etapas' && (
        <section className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-[#F1E5C8] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FFF8ED] text-[#6B6560]">
                <tr>
                  <th className="px-3 py-2">{aba === 'origens' ? 'Origem' : 'Motivo'}</th>
                  <th className="px-3 py-2">Chave</th>
                  <th className="px-3 py-2">Origem do valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((x) => (
                  <tr key={x.id} className="border-t border-[#F7F0E1]">
                    <td className="px-3 py-2 font-medium text-[#2D2A26]">{x.label}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#6B6560]">{x.key}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          x.is_draft ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {x.is_draft ? 'Rascunho' : 'Confirmado'}
                      </span>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-[#6B6560]">
                      Nada configurado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-[#F1E5C8] bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#2D2A26]">
              {aba === 'origens' ? 'Adicionar origem' : 'Adicionar motivo'}
            </h2>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="text-[#6B6560]">
                Chave
                <input
                  value={novaChave}
                  onChange={(e) => setNovaChave(e.target.value)}
                  className="mt-1 block w-40 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <label className="text-[#6B6560]">
                Nome exibido
                <input
                  value={novoRotulo}
                  onChange={(e) => setNovoRotulo(e.target.value)}
                  className="mt-1 block w-48 rounded-lg border border-[#F1E5C8] px-2 py-1 text-[#2D2A26]"
                />
              </label>
              <button
                onClick={() => void salvarLista(aba === 'origens' ? 'origem' : 'motivo')}
                disabled={!novaChave.trim() || !novoRotulo.trim()}
                className="rounded-lg bg-[#B8960E] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

/** Casca da tela. O AppShell é quem fornece a clínica ativa por contexto —
 *  `useClinicaAtiva()` fora dele devolve null e a tela fica eternamente em
 *  "Escolha uma clínica no topo", mesmo com clínica escolhida. (04/11)
 *  A guarda de papel e o segundo fator continuam na rota (App.tsx). */
export default function AdminFunil() {
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
      <AdminFunilConteudo />
    </AppShell>
  )
}
