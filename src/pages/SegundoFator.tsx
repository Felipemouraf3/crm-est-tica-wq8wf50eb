// src/pages/SegundoFator.tsx — P2-S01 (tela de segundo fator, 2026-10-18)
// Fluxo completo de TOTP no app:
// 1. sem fator  → enroll (POST /auth/v1/factors, snake_case) → QR →
//    usuário escaneia no autenticador → challenge → verify → fator verificado.
// 2. com fator  → challenge → verify.
// 2026-10-20: migrado para REST direto no GoTrue (snake_case). Particularidades
// deste GoTrue, todas provadas ao vivo no navegador:
// a) supabase-js manda factorType camelCase → GoTrue recusa com validation_failed;
// b) GET /factors devolve 405 — listar fatores via GET /user (campo factors);
// c) verify exige challenge_id SEMPRE (mesmo no enroll: enroll → challenge → verify);
// d) qr_code vem como SVG cru → converter em data-URL para o <img>;
// e) GET /user retorna os fatores com factor_type (não type) — filtro aceita ambos;
// f) verify devolve NOVA SESSÃO (AAL2) — persistir com setSession, senão a guarda
//    de rota continua lendo o JWT antigo (aal1) e devolve para /segundo-fator.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { getFriendlyAuthErrorMessage } from '@/lib/auth-errors'
import { AppShell } from '@/components/app-shell'
import { RequireAuth } from '@/components/guards'
import type { Papel } from '@/lib/supabase/types'

type Fator = {
  id: string
  friendly_name?: string | null
  type?: string
  factor_type?: string // GET /user deste GoTrue usa factor_type (não type)
  status: string
}

type Etapa =
  | 'carregando'
  | 'enroll'
  | 'aguardando_codigo'
  | 'challenge'
  | 'verificando'
  | 'sucesso'
  | 'erro'

// REST direto no GoTrue (snake_case).
async function mfaRest(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  corpo?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; erro?: string }> {
  const { data: sess } = await supabase.auth.getSession()
  const jwt = sess.session?.access_token
  if (!jwt) return { ok: false, erro: 'Sua sessão expirou. Faça login novamente.' }
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  })
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  if (!resp.ok) {
    return { ok: false, erro: String((data as { msg?: string }).msg ?? 'Erro de autenticação') }
  }
  return { ok: true, data }
}

function SegundoFator() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destino = useMemo(() => {
    const next = params.get('next')
    return next && next.startsWith('/') ? next : '/admin'
  }, [params])

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [fatores, setFatores] = useState<Fator[]>([])
  const [fatorId, setFatorId] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [segredo, setSegredo] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [papel, setPapel] = useState<Papel | null>(null)
  const [ocupado, setOcupado] = useState(false)

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

      // neste GoTrue, GET /factors devolve 405 — a listagem vem no GET /user
      const lista = await mfaRest('GET', 'user')
      if (!vivo) return
      if (!lista.ok) {
        setErro(getFriendlyAuthErrorMessage({ message: lista.erro ?? 'Falha ao listar fatores' }))
        setEtapa('erro')
        return
      }
      const totp = ((lista.data?.factors ?? []) as Fator[]).filter(
        (f) => f.type === 'totp' || (f as { factor_type?: string }).factor_type === 'totp',
      )
      setFatores(totp)
      const verificado = totp.find((f) => f.status === 'verified')
      if (verificado) {
        setFatorId(verificado.id)
        setEtapa('challenge')
      } else if (totp.length > 0) {
        // fator pendente (não verificado): recomeça o enroll com ele
        setFatorId(totp[0].id)
        setEtapa('enroll')
      } else {
        setEtapa('enroll')
      }
    })().catch((e) => {
      if (vivo) {
        setErro(getFriendlyAuthErrorMessage(e))
        setEtapa('erro')
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  const iniciarEnroll = async () => {
    setOcupado(true)
    setErro(null)
    try {
      // fator pendente de outro attempt: desinscreve para não acumular
      const pendente = fatores.find((f) => f.status !== 'verified')
      if (pendente) {
        await mfaRest('DELETE', `factors/${pendente.id}`)
      }
      const r = await mfaRest('POST', 'factors', {
        factor_type: 'totp',
        friendly_name: 'CRM Estética',
      })
      if (!r.ok) throw { message: r.erro ?? 'Falha ao gerar QR' }
      const totp = r.data?.totp as { qr_code?: string; secret?: string } | undefined
      // qr_code chega como SVG cru — virar data-URL para o <img> renderizar
      setQrUrl(totp?.qr_code ? `data:image/svg+xml;utf8,${encodeURIComponent(totp.qr_code)}` : null)
      setSegredo(totp?.secret ?? null)
      setFatorId(String(r.data?.id ?? ''))
      setEtapa('aguardando_codigo')
    } catch (e) {
      setErro(getFriendlyAuthErrorMessage(e))
    } finally {
      setOcupado(false)
    }
  }

  const verificar = async () => {
    if (!fatorId || codigo.trim().length !== 6) {
      setErro('Digite os 6 dígitos do aplicativo autenticador.')
      return
    }
    setOcupado(true)
    setErro(null)
    try {
      // neste GoTrue, verify SEMPRE exige challenge_id (inclusive no enroll)
      const ch = await mfaRest('POST', `factors/${fatorId}/challenge`, {})
      if (!ch.ok) throw { message: ch.erro ?? 'Falha no challenge' }
      const v = await mfaRest('POST', `factors/${fatorId}/verify`, {
        challenge_id: ch.data?.id,
        code: codigo.trim(),
      })
      if (!v.ok) throw { message: v.erro ?? 'Código inválido' }
      // persiste a nova sessão (AAL2) no cliente — sem isso a guarda de rota
      // continua lendo o JWT antigo (aal1) e devolve para /segundo-fator
      const nova = v.data as { access_token?: string; refresh_token?: string } | undefined
      if (nova?.access_token && nova?.refresh_token) {
        await supabase.auth.setSession({
          access_token: nova.access_token,
          refresh_token: nova.refresh_token,
        })
      }
      setEtapa('sucesso')
    } catch (e) {
      setErro(getFriendlyAuthErrorMessage(e))
    } finally {
      setOcupado(false)
    }
  }

  const continuar = () => navigate(destino, { replace: true })

  return (
    <AppShell papel={papel}>
      <div className="mx-auto max-w-md rounded-xl border border-[#F1E5C8] bg-white p-6 shadow-sm">
        <h1 className="font-serif text-lg font-bold text-[#2D2A26]">Segundo fator de segurança</h1>
        <p className="mt-1 text-sm text-[#6B6560]">
          Protege a área de administração com um código de 6 dígitos que muda a cada 30 segundos.
        </p>

        {erro && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#D93025]"
          >
            {erro}
          </div>
        )}

        {etapa === 'carregando' && <div className="mt-6 text-sm text-[#6B6560]">Carregando…</div>}

        {etapa === 'erro' && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-lg border border-[#F1E5C8] px-4 py-2.5 text-sm font-semibold text-[#2D2A26] hover:bg-[#FFF8ED]"
          >
            Tentar novamente
          </button>
        )}

        {etapa === 'enroll' && (
          <div className="mt-5">
            <p className="text-sm text-[#2D2A26]">
              1. Tenha em mãos o aplicativo autenticador (Google Authenticator, 1Password…).
            </p>
            <button
              onClick={iniciarEnroll}
              disabled={ocupado}
              className="mt-4 w-full rounded-lg bg-[#D4AF37] px-4 py-2.5 font-semibold text-white hover:bg-[#B8960E] disabled:opacity-60"
            >
              {ocupado ? 'Gerando…' : 'Gerar código QR'}
            </button>
          </div>
        )}

        {etapa === 'aguardando_codigo' && (
          <div className="mt-5">
            <p className="text-sm text-[#2D2A26]">
              2. Escaneie o QR com o aplicativo autenticador:
            </p>
            {qrUrl ? (
              <div className="mt-3 flex justify-center">
                <img
                  src={qrUrl}
                  alt="QR do segundo fator"
                  className="rounded-lg border border-[#F1E5C8]"
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#6B6560]">
                QR indisponível — use a chave manual abaixo.
              </p>
            )}
            {segredo && (
              <p className="mt-3 break-all rounded-lg bg-[#FFF8ED] p-3 font-mono text-xs text-[#92750B]">
                Chave manual: {segredo}
              </p>
            )}
            <p className="mt-4 text-sm text-[#2D2A26]">3. Digite o código de 6 dígitos do app:</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="mt-2 w-full rounded-lg border border-[#F1E5C8] px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-[#D4AF37]"
              placeholder="000000"
              aria-label="Código do autenticador"
            />
            <button
              onClick={verificar}
              disabled={ocupado}
              className="mt-4 w-full rounded-lg bg-[#D4AF37] px-4 py-2.5 font-semibold text-white hover:bg-[#B8960E] disabled:opacity-60"
            >
              {ocupado ? 'Verificando…' : 'Verificar e ativar'}
            </button>
          </div>
        )}

        {etapa === 'challenge' && (
          <div className="mt-5">
            <p className="text-sm text-[#2D2A26]">
              Digite o código de 6 dígitos do aplicativo autenticador:
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="mt-2 w-full rounded-lg border border-[#F1E5C8] px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-[#D4AF37]"
              placeholder="000000"
              aria-label="Código do autenticador"
            />
            <button
              onClick={verificar}
              disabled={ocupado}
              className="mt-4 w-full rounded-lg bg-[#D4AF37] px-4 py-2.5 font-semibold text-white hover:bg-[#B8960E] disabled:opacity-60"
            >
              {ocupado ? 'Verificando…' : 'Verificar'}
            </button>
          </div>
        )}

        {etapa === 'sucesso' && (
          <div className="mt-5">
            <div
              role="status"
              className="rounded-lg border border-[#CFE3CD] bg-[#F3F8F2] p-4 text-sm text-[#3E7C3A]"
            >
              Segundo fator ativado e verificado.
            </div>
            <button
              onClick={continuar}
              className="mt-4 w-full rounded-lg bg-[#D4AF37] px-4 py-2.5 font-semibold text-white hover:bg-[#B8960E]"
            >
              Continuar para {destino === '/admin' ? 'Administração' : 'a página anterior'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default function SegundoFatorComGuarda() {
  return (
    <RequireAuth>
      <SegundoFator />
    </RequireAuth>
  )
}
