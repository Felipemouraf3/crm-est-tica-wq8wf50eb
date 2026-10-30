// src/pages/RedefinirSenha.tsx — item 1 da pendência de e-mail (29/10)
// Tela que recebe o link de recuperação (#access_token=...&type=recovery no fragmento).
// Sem ela o link caía em 404 — era por isso que "gerar nova senha pelo e-mail" não funcionava.
// Fluxo: lê o fragmento, troca o token por sessão e mostra o formulário de nova senha.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { AuthLayout } from '@/components/AuthLayout'
import { supabase } from '@/lib/supabase/client'
import { getFriendlyAuthErrorMessage } from '@/hooks/use-auth'

type Estado = 'lendo' | 'pronto' | 'invalido' | 'salvo'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>('lendo')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const tipo = params.get('type')
      const erroUrl = params.get('error_description')

      if (erroUrl) {
        if (vivo) {
          setErro(decodeURIComponent(erroUrl.replace(/\+/g, ' ')))
          setEstado('invalido')
        }
        return
      }

      // Fluxo PKCE: chega ?code= na query em vez do fragmento
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!vivo) return
        if (error) {
          setErro(getFriendlyAuthErrorMessage(error))
          setEstado('invalido')
        } else {
          setEstado('pronto')
        }
        return
      }

      if (accessToken && refreshToken && (tipo === 'recovery' || tipo === null)) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!vivo) return
        if (error) {
          setErro(getFriendlyAuthErrorMessage(error))
          setEstado('invalido')
        } else {
          setEstado('pronto')
        }
        return
      }

      // Sem token no link: pode ser porque o usuário já tem sessão de recovery
      const { data } = await supabase.auth.getSession()
      if (!vivo) return
      setEstado(data.session ? 'pronto' : 'invalido')
      if (!data.session) setErro('Este link de recuperação não é válido ou já expirou.')
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas digitadas não são iguais.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      setErro(getFriendlyAuthErrorMessage(error))
      return
    }
    setEstado('salvo')
    setTimeout(() => navigate('/inicio', { replace: true }), 2500)
  }

  return (
    <AuthLayout>
      <div className="w-full">
        <div className="mb-8 text-center sm:text-left">
          <span className="font-serif text-xl font-bold tracking-wide text-[#2D2A26] sm:text-2xl block">
            CRM Estética
          </span>
          <span className="text-[11px] font-medium uppercase tracking-widest text-[#B8960E] block">
            Nova senha
          </span>
          <h1 className="mt-4 font-serif text-3xl font-bold leading-tight tracking-tight text-[#2D2A26] sm:text-4xl">
            Definir nova senha
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6560] sm:text-base">
            Escolha a senha que você vai usar para entrar no sistema.
          </p>
        </div>

        {erro && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#D93025]"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 font-medium leading-snug">{erro}</div>
          </div>
        )}

        {estado === 'salvo' && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#1E8E3E]"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 font-medium leading-snug">
              Senha alterada. Entrando no sistema…
            </div>
          </div>
        )}

        {estado === 'lendo' && (
          <div className="flex items-center gap-2 py-6 text-sm text-[#6B6560]" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Conferindo o link…
          </div>
        )}

        {estado === 'invalido' && (
          <Link
            to="/forgot-password"
            className="inline-block text-sm font-medium text-[#D4AF37] hover:text-[#B8960E] hover:underline"
          >
            Pedir um novo link de recuperação
          </Link>
        )}

        {estado === 'pronto' && (
          <form onSubmit={salvar} noValidate className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="nova-senha" className="block text-sm font-medium text-[#2D2A26]">
                Nova senha
              </label>
              <div className="relative rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#B8960E]">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </div>
                <input
                  id="nova-senha"
                  name="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(ev) => setSenha(ev.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  className="h-12 w-full rounded-lg border border-[#F1E5C8] bg-white pl-10 pr-4 text-sm text-[#2D2A26] outline-none transition-all hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmar-senha" className="block text-sm font-medium text-[#2D2A26]">
                Repita a nova senha
              </label>
              <div className="relative rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#B8960E]">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </div>
                <input
                  id="confirmar-senha"
                  name="confirmar-senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(ev) => setConfirmacao(ev.target.value)}
                  placeholder="Digite novamente"
                  className="h-12 w-full rounded-lg border border-[#F1E5C8] bg-white pl-10 pr-4 text-sm text-[#2D2A26] outline-none transition-all hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando}
              aria-busy={salvando}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-base font-semibold text-white transition-all hover:bg-[#B8960E] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Salvando…</span>
                </>
              ) : (
                <span>Salvar nova senha</span>
              )}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
