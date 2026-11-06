// src/pages/IdentificarPaciente.tsx — P2-S02-T03
// Tela "Identificar paciente" (/pacientes/identificar) — SPEC P2-S02:
// campo de telefone (qualquer formato, mostra o E.164 normalizado),
// 4 resultados (um/multiplos/provavel/zero), erros por code com
// correlation_id copiável, "Buscar de novo" com force_refresh.
// Vínculo é SEMPRE decisão humana ("Confirmar vínculo" chama a RPC).
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { RequireAuth, EmptyState } from '@/components/guards'
import {
  buscarPaciente,
  confirmarVinculo,
  acharContatoPorTelefone,
  mensagemDeErro,
  type Candidato,
  type ResultadoBusca,
} from '@/lib/experts-api'
import { supabase } from '@/lib/supabase/client'
import type { Papel } from '@/lib/supabase/types'

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'buscando' }
  | { tipo: 'resultado'; r: ResultadoBusca }
  | { tipo: 'erro'; mensagem: string; code: string; correlationId: string }

const SEM_VINCULO = '—'

function SeloAtivo({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        active ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function CartaoCandidato({
  c,
  provavel,
  podeVincular,
  onVincular,
}: {
  c: Candidato
  provavel: boolean
  podeVincular: boolean
  onVincular: () => void
}) {
  return (
    <div className="rounded-xl border border-[#F1E5C8] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm text-[#2D2A26]">{c.name}</strong>
        <div className="flex items-center gap-1.5">
          {provavel && (
            <span className="rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[11px] font-semibold text-[#8A6D1C]">
              Provável — confirmar
            </span>
          )}
          <SeloAtivo active={c.active} />
        </div>
      </div>
      <p className="mt-1 text-xs text-[#6B6560]">
        Nascimento: {c.birth_masked ?? SEM_VINCULO}
        {provavel && ' · número cadastrado sem o 9º dígito'}
      </p>
      <div className="mt-3">
        <button
          disabled={!podeVincular}
          onClick={onVincular}
          className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B8960E] disabled:opacity-50"
        >
          Confirmar vínculo
        </button>
      </div>
    </div>
  )
}

function IdentificarPaciente() {
  const [clinicaId, setClinicaId] = useState<string | null>(null)
  const [clinicaNome, setClinicaNome] = useState('')
  const [papel, setPapel] = useState<Papel | null>(null)
  const [phone, setPhone] = useState('')
  const [e164, setE164] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' })
  const [aviso, setAviso] = useState<string | null>(null)

  // Papéis que podem confirmar vínculo (emenda da SPEC).
  const podeVincular = useMemo(
    () =>
      papel !== null &&
      ['owner', 'clinic_admin', 'manager', 'sales', 'reception', 'post_sales'].includes(papel),
    [papel],
  )

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess.session?.user
      if (!user || !vivo) return
      const { data: mem } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
      if (!vivo) return
      setPapel((mem?.[0]?.role ?? null) as Papel | null)
      const { data: clinicas } = await supabase
        .from('clinics')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      const ativa =
        typeof localStorage !== 'undefined' ? localStorage.getItem('clinica_ativa') : null
      const escolhida = (clinicas ?? []).find((c) => c.id === ativa) ?? (clinicas ?? [])[0]
      if (escolhida) {
        setClinicaId(escolhida.id)
        setClinicaNome(escolhida.name)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const buscar = async (forceRefresh = false) => {
    if (!clinicaId || !phone.trim()) return
    setEstado({ tipo: 'buscando' })
    setAviso(null)
    setE164(null)
    try {
      // E.164 normalizado server-side: mostramos o que a função entendeu.
      const { data: norm } = await supabase.rpc('normalize_e164', { p_raw: phone.trim() })
      if (norm) setE164(String(norm))
      const r = await buscarPaciente(clinicaId, phone.trim(), forceRefresh)
      setEstado({ tipo: 'resultado', r })
    } catch (e) {
      const err = e as { code?: string; message?: string; correlationId?: string }
      setEstado({
        tipo: 'erro',
        mensagem: err.message ?? mensagemDeErro(String(err.code ?? '')),
        code: String(err.code ?? 'desconhecido'),
        correlationId: err.correlationId ?? '',
      })
    }
  }

  const vincular = async (c: Candidato) => {
    if (!clinicaId || estado.tipo !== 'resultado') return
    const r = estado.r
    setAviso(null)
    try {
      const contato = await acharContatoPorTelefone(r.phone_e164)
      if (!contato) {
        setAviso(
          'Nenhum contato local com este telefone. Cadastre o contato primeiro (em breve: criação direta aqui).',
        )
        return
      }
      await confirmarVinculo(
        clinicaId,
        contato.id,
        c.expert_patient_uuid,
        r.result_class === 'provavel' ? 'manual_provavel' : 'manual',
      )
      setAviso(`Vínculo confirmado: ${c.name} ↔ ${contato.name}.`)
    } catch (e) {
      const err = e as { message?: string }
      setAviso(err.message ?? 'Não foi possível confirmar o vínculo.')
    }
  }

  return (
    <AppShell papel={papel}>
      <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Identificar paciente</h1>
      <p className="mt-1 text-xs text-[#6B6560]">
        Clínica: <strong>{clinicaNome || '…'}</strong>
      </p>

      <div className="mt-4 max-w-xl">
        <label htmlFor="telefone" className="text-xs font-semibold text-[#2D2A26]">
          Telefone (aceita (81) 9xxxx-xxxx, 81 9xxxx-xxxx, +55…)
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="telefone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(81) 99999-0001"
            className="flex-1 rounded-lg border border-[#F1E5C8] bg-white px-3 py-2 text-sm text-[#2D2A26]"
          />
          <button
            onClick={() => buscar(false)}
            disabled={estado.tipo === 'buscando' || !phone.trim()}
            className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B8960E] disabled:opacity-50"
          >
            {estado.tipo === 'buscando' ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {e164 && (
          <p className="mt-1 text-xs text-[#6B6560]">
            Buscando por: <span className="font-mono">{e164}</span>
          </p>
        )}
      </div>

      <div className="mt-5 max-w-xl" aria-live="polite">
        {estado.tipo === 'buscando' && (
          <div className="rounded-xl border border-[#F1E5C8] bg-white p-4 text-sm text-[#6B6560]">
            Buscando no Clínica Experts…
          </div>
        )}

        {estado.tipo === 'erro' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-[#D93025]">{estado.mensagem}</p>
            <p className="mt-1 text-xs text-[#6B6560]">Código: {estado.code}</p>
            {estado.correlationId && (
              <button
                onClick={() => navigator.clipboard?.writeText(estado.correlationId)}
                className="mt-2 rounded border border-[#F1E5C8] bg-white px-2 py-1 font-mono text-xs text-[#6B6560] hover:bg-[#FFF8ED]"
                title="Copiar correlation_id"
              >
                correlation_id: {estado.correlationId} ⧉
              </button>
            )}
          </div>
        )}

        {estado.tipo === 'resultado' && (
          <div>
            {estado.r.result_class === 'um' && (
              <CartaoCandidato
                c={estado.r.candidates[0]}
                provavel={false}
                podeVincular={podeVincular}
                onVincular={() => vincular(estado.r.candidates[0])}
              />
            )}
            {estado.r.result_class === 'provavel' && (
              <CartaoCandidato
                c={estado.r.candidates[0]}
                provavel
                podeVincular={podeVincular}
                onVincular={() => vincular(estado.r.candidates[0])}
              />
            )}
            {estado.r.result_class === 'multiplos' && (
              <div>
                <p className="mb-2 rounded-lg bg-[#FFF3D6] px-3 py-2 text-xs font-semibold text-[#8A6D1C]">
                  Mais de um cadastro usa este telefone. Confirme com o cliente.
                </p>
                <div className="grid gap-3">
                  {estado.r.candidates.map((c) => (
                    <CartaoCandidato
                      key={c.expert_patient_uuid}
                      c={c}
                      provavel={false}
                      podeVincular={podeVincular}
                      onVincular={() => vincular(c)}
                    />
                  ))}
                </div>
              </div>
            )}
            {estado.r.result_class === 'zero' && (
              <EmptyState
                titulo="Nenhum paciente com este telefone"
                mensagem="Tratar como novo contato."
              />
            )}
            {estado.r.cache_hit && (
              <p className="mt-2 text-xs text-[#6B6560]">Resultado do cache (até 1 h).</p>
            )}
            <button
              onClick={() => buscar(true)}
              disabled={(estado as { tipo: string }).tipo === 'buscando'}
              className="mt-3 rounded-lg border border-[#F1E5C8] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6560] hover:bg-[#FFF8ED]"
            >
              Buscar de novo (ignorar cache)
            </button>
          </div>
        )}

        {aviso && (
          <p
            className="mt-3 rounded-lg bg-[#FFF8ED] px-3 py-2 text-xs text-[#2D2A26]"
            role="status"
          >
            {aviso}
          </p>
        )}
      </div>
    </AppShell>
  )
}

export default function IdentificarPacienteComGuarda() {
  return (
    <RequireAuth>
      <IdentificarPaciente />
    </RequireAuth>
  )
}
