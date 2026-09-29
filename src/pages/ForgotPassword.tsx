import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { AuthLayout } from '@/components/AuthLayout'
import { useAuth, getFriendlyAuthErrorMessage } from '@/hooks/use-auth'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shake, setShake] = useState(false)

  const validateEmail = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed) {
      return 'Campo obrigatório'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return 'E-mail inválido. Verifique o formato.'
    }
    return ''
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEmail(val)
    if (touched) {
      setError(validateEmail(val))
    }
    if (formError) setFormError(null)
    if (successMessage) setSuccessMessage(null)
  }

  const handleBlur = () => {
    setTouched(true)
    setError(validateEmail(email))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    const emailErr = validateEmail(email)
    setTouched(true)
    setError(emailErr)

    if (emailErr) {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      setFormError(emailErr)
      return
    }

    setIsSubmitting(true)
    try {
      const { error: resetErr } = await resetPassword(email)
      if (resetErr) {
        const friendlyMsg = getFriendlyAuthErrorMessage(resetErr)
        setFormError(friendlyMsg)
        setShake(true)
        setTimeout(() => setShake(false), 400)
      } else {
        setSuccessMessage('Link de recuperação enviado! Verifique seu e-mail.')
      }
    } catch {
      setFormError('Não foi possível completar a ação. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full">
        {/* Monograma & Identidade */}
        <div className="text-center sm:text-left mb-8">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-gradient-to-br from-[#FFF8ED] to-white shadow-gold">
              <svg
                className="w-6 h-6 text-[#D4AF37]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2C8 6 4 10 4 14a8 8 0 0 0 16 0c0-4-4-8-8-12z" />
                <path d="M12 8c2.5 2 3.5 4 3.5 6a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-6z" />
              </svg>
            </div>
            <div>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#2D2A26] tracking-wide block">
                CRM Estética
              </span>
              <span className="text-[11px] uppercase tracking-widest text-[#B8960E] font-medium block">
                Recuperação de Acesso
              </span>
            </div>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#2D2A26] tracking-tight leading-tight">
            Recuperar senha
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#6B6560] leading-relaxed">
            Informe seu e-mail cadastrado e enviaremos um link para redefinição.
          </p>
        </div>

        {/* Mensagem de Erro Geral */}
        {formError && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-[#D93025] text-sm flex items-start gap-3 animate-fade-in shadow-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#D93025]" />
            <div className="flex-1 font-medium leading-snug">{formError}</div>
          </div>
        )}

        {/* Mensagem de Sucesso Verde */}
        {successMessage && (
          <div
            role="status"
            className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-[#1E8E3E] text-sm flex items-start gap-3 animate-fade-in shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#1E8E3E]" />
            <div className="flex-1 font-medium leading-snug">{successMessage}</div>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="forgot-email" className="block text-sm font-medium text-[#2D2A26]">
              E-mail cadastrado
            </label>
            <div
              className={`relative rounded-lg transition-all duration-200 ${
                shake ? 'animate-shake' : ''
              }`}
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#B8960E]">
                <Mail className="w-4 h-4 text-[#B8960E]" aria-hidden="true" />
              </div>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-label="E-mail"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'forgot-email-error' : undefined}
                value={email}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="seuemail@exemplo.com"
                className={`w-full h-12 pl-10 pr-4 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  error
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
            </div>
            {error && (
              <p
                id="forgot-email-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full h-12 mt-2 bg-[#D4AF37] hover:bg-[#B8960E] active:scale-[0.98] text-white font-semibold text-base rounded-lg shadow-gold-btn hover:shadow-gold-hover transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>Enviando link...</span>
              </>
            ) : (
              <>
                <span>Enviar link de recuperação</span>
                <Sparkles className="w-4 h-4 text-white/90" />
              </>
            )}
          </button>
        </form>

        {/* Link Voltar para o Login */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#2D2A26] hover:text-[#D4AF37] transition-colors py-2 px-3 rounded-lg hover:bg-[#FFF8ED] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
          >
            <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
            <span>Voltar para o login</span>
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}
