import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Check, Sparkles } from 'lucide-react'
import { AuthLayout } from '@/components/AuthLayout'
import { useAuth, getFriendlyAuthErrorMessage } from '@/hooks/use-auth'

export default function Index() {
  const navigate = useNavigate()
  const { signIn, session, loading: authLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Estados de validação e submissão
  const [touched, setTouched] = useState({ email: false, password: false })
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shakeField, setShakeField] = useState<'email' | 'password' | null>(null)

  // Se já houver sessão ativa, redireciona diretamente para o painel
  useEffect(() => {
    if (!authLoading && session) {
      navigate('/dashboard', { replace: true })
    }
  }, [session, authLoading, navigate])

  // Recupera email salvo se houver
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('crm_remembered_email')
      if (savedEmail) {
        setEmail(savedEmail)
        setRememberMe(true)
      }
    } catch {
      // Ignora erro de storage
    }
  }, [])

  const validateField = (field: 'email' | 'password', val: string) => {
    let errorMsg = ''
    if (field === 'email') {
      const trimmed = val.trim()
      if (!trimmed) {
        errorMsg = 'Campo obrigatório'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        errorMsg = 'E-mail inválido. Verifique o formato.'
      }
    } else if (field === 'password') {
      if (!val) {
        errorMsg = 'Campo obrigatório'
      } else if (val.length < 8) {
        errorMsg = 'Senha deve ter pelo menos 8 caracteres.'
      }
    }
    return errorMsg
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEmail(val)
    if (touched.email) {
      const err = validateField('email', val)
      setErrors((prev) => ({ ...prev, email: err }))
    }
    if (formError) setFormError(null)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setPassword(val)
    if (touched.password) {
      const err = validateField('password', val)
      setErrors((prev) => ({ ...prev, password: err }))
    }
    if (formError) setFormError(null)
  }

  const handleBlur = (field: 'email' | 'password') => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const val = field === 'email' ? email : password
    const err = validateField(field, val)
    setErrors((prev) => ({ ...prev, [field]: err }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const emailErr = validateField('email', email)
    const passErr = validateField('password', password)

    setTouched({ email: true, password: true })
    setErrors({ email: emailErr, password: passErr })

    if (emailErr || passErr) {
      if (emailErr) setShakeField('email')
      else if (passErr) setShakeField('password')
      setTimeout(() => setShakeField(null), 400)

      if (!email.trim() || !password) {
        setFormError('Preencha todos os campos.')
      } else if (emailErr) {
        setFormError(emailErr)
      } else if (passErr) {
        setFormError(passErr)
      }
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await signIn(email, password, rememberMe)

      if (error) {
        const friendlyMsg = getFriendlyAuthErrorMessage(error)
        setFormError(friendlyMsg)
        setShakeField('password')
        setTimeout(() => setShakeField(null), 400)
      } else {
        if (rememberMe) {
          try {
            localStorage.setItem('crm_remembered_email', email.trim())
          } catch {
            // no-op
          }
        } else {
          try {
            localStorage.removeItem('crm_remembered_email')
          } catch {
            // no-op
          }
        }
        navigate('/dashboard')
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
        {/* Cabeçalho do Formulário com Logo Monograma */}
        <div className="text-center sm:text-left mb-8">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-gradient-to-br from-[#FFF8ED] to-white shadow-gold group">
              <svg
                className="w-6 h-6 text-[#D4AF37] transition-transform duration-300 group-hover:scale-110"
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
                Gestão Clínica & Spa
              </span>
            </div>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#2D2A26] tracking-tight leading-tight">
            Bem-vindo(a) de volta
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#6B6560] leading-relaxed">
            Acesse o painel para gerenciar sua clínica com excelência.
          </p>
        </div>

        {/* Mensagem de Erro Geral com Fade-in */}
        {formError && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200/80 text-[#D93025] text-sm flex items-start gap-3 animate-fade-in shadow-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#D93025]" />
            <div className="flex-1 font-medium leading-snug">{formError}</div>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} noValidate className="space-x-0 space-y-5">
          {/* Campo E-mail */}
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-sm font-medium text-[#2D2A26]">
              E-mail
            </label>
            <div
              className={`relative rounded-lg transition-all duration-200 ${
                shakeField === 'email' ? 'animate-shake' : ''
              }`}
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#B8960E]">
                <Mail className="w-4 h-4 text-[#B8960E]" aria-hidden="true" />
              </div>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-label="E-mail"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                value={email}
                onChange={handleEmailChange}
                onBlur={() => handleBlur('email')}
                placeholder="seuemail@exemplo.com"
                className={`w-full h-12 pl-10 pr-4 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  errors.email
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
            </div>
            {errors.email && (
              <p
                id="login-email-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Campo Senha */}
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium text-[#2D2A26]">
              Senha
            </label>
            <div
              className={`relative rounded-lg transition-all duration-200 ${
                shakeField === 'password' ? 'animate-shake' : ''
              }`}
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#B8960E]">
                <Lock className="w-4 h-4 text-[#B8960E]" aria-hidden="true" />
              </div>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-label="Senha"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                value={password}
                onChange={handlePasswordChange}
                onBlur={() => handleBlur('password')}
                placeholder="Digite sua senha"
                className={`w-full h-12 pl-10 pr-11 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  errors.password
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6B6560] hover:text-[#D4AF37] transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p
                id="login-password-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.password}
              </p>
            )}
          </div>

          {/* Lembrar de mim + Esqueceu sua senha? */}
          <div className="flex items-center justify-between pt-1">
            <label
              htmlFor="remember-me"
              className="flex items-center gap-2 cursor-pointer select-none group"
            >
              <div className="relative flex items-center">
                <input
                  id="remember-me"
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-[#D4AF37] peer-checked:bg-[#D4AF37] peer-checked:border-[#D4AF37] peer-focus-visible:ring-2 peer-focus-visible:ring-[#D4AF37]/30 transition-colors flex items-center justify-center bg-white group-hover:border-[#B8960E]">
                  {rememberMe && <Check className="w-3 h-3 text-white stroke-[3]" />}
                </div>
              </div>
              <span className="text-xs sm:text-sm text-[#6B6560] group-hover:text-[#2D2A26] transition-colors">
                Lembrar de mim
              </span>
            </label>

            <Link
              to="/forgot-password"
              className="text-xs sm:text-sm font-medium text-[#D4AF37] hover:text-[#B8960E] hover:underline transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50 rounded"
            >
              Esqueceu sua senha?
            </Link>
          </div>

          {/* Botão Principal Entrar */}
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full h-12 mt-2 bg-[#D4AF37] hover:bg-[#B8960E] active:scale-[0.98] text-white font-semibold text-base rounded-lg shadow-gold-btn hover:shadow-gold-hover transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>Entrar</span>
                <Sparkles className="w-4 h-4 text-white/90" />
              </>
            )}
          </button>
        </form>

        {/* Divisor "ou" */}
        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#F1E5C8]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-[#6B6560] font-medium tracking-wider">ou</span>
          </div>
        </div>

        {/* Link para Cadastro / Solicitar Acesso */}
        <div className="text-center">
          <p className="text-sm text-[#6B6560]">
            Ainda não possui uma conta?{' '}
            <Link
              to="/signup"
              className="font-semibold text-[#D4AF37] hover:text-[#B8960E] hover:underline transition-colors ml-1 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50 rounded"
            >
              Solicitar acesso
            </Link>
          </p>
        </div>

        {/* Dica de credenciais de teste para facilidade de avaliação */}
        <div className="mt-8 pt-4 border-t border-[#F1E5C8]/80 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF8ED] text-xs text-[#92750B] border border-[#F1E5C8]">
            <span className="font-semibold">Acesso de Demonstração:</span>
            <span className="font-mono text-[11px]">felipef3energydrink@gmail.com</span> /{' '}
            <span className="font-mono text-[11px]">Skip@Pass</span>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
