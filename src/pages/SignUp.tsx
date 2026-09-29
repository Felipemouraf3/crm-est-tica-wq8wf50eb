import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react'
import { AuthLayout } from '@/components/AuthLayout'
import { useAuth, getFriendlyAuthErrorMessage } from '@/hooks/use-auth'

export default function SignUp() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  })

  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})

  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shakeField, setShakeField] = useState<string | null>(null)

  const validate = (field: keyof typeof touched, value: string, compareVal?: string) => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Campo obrigatório'
        if (value.trim().length < 3) return 'Informe seu nome completo.'
        return ''
      case 'email': {
        const trimmed = value.trim()
        if (!trimmed) return 'Campo obrigatório'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return 'E-mail inválido. Verifique o formato.'
        }
        return ''
      }
      case 'password':
        if (!value) return 'Campo obrigatório'
        if (value.length < 8) return 'Senha deve ter pelo menos 8 caracteres.'
        return ''
      case 'confirmPassword':
        if (!value) return 'Campo obrigatório'
        if (value !== (compareVal ?? password)) return 'As senhas não coincidem.'
        return ''
      default:
        return ''
    }
  }

  const handleChange = (field: keyof typeof touched, val: string) => {
    if (field === 'name') setName(val)
    if (field === 'email') setEmail(val)
    if (field === 'password') setPassword(val)
    if (field === 'confirmPassword') setConfirmPassword(val)

    if (touched[field]) {
      const err = validate(field, val, field === 'confirmPassword' ? password : undefined)
      setErrors((prev) => ({ ...prev, [field]: err }))
    }

    if (field === 'password' && touched.confirmPassword) {
      const confirmErr = validate('confirmPassword', confirmPassword, val)
      setErrors((prev) => ({ ...prev, confirmPassword: confirmErr }))
    }

    if (formError) setFormError(null)
  }

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    let val = ''
    if (field === 'name') val = name
    if (field === 'email') val = email
    if (field === 'password') val = password
    if (field === 'confirmPassword') val = confirmPassword
    const err = validate(field, val)
    setErrors((prev) => ({ ...prev, [field]: err }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    const nameErr = validate('name', name)
    const emailErr = validate('email', email)
    const passErr = validate('password', password)
    const confirmErr = validate('confirmPassword', confirmPassword, password)

    setTouched({ name: true, email: true, password: true, confirmPassword: true })
    setErrors({
      name: nameErr,
      email: emailErr,
      password: passErr,
      confirmPassword: confirmErr,
    })

    if (nameErr || emailErr || passErr || confirmErr) {
      const firstErrField = nameErr
        ? 'name'
        : emailErr
          ? 'email'
          : passErr
            ? 'password'
            : 'confirmPassword'
      setShakeField(firstErrField)
      setTimeout(() => setShakeField(null), 400)

      if (!name || !email || !password || !confirmPassword) {
        setFormError('Preencha todos os campos.')
      } else if (confirmErr) {
        setFormError(confirmErr)
      } else if (passErr) {
        setFormError(passErr)
      } else if (emailErr) {
        setFormError(emailErr)
      } else if (nameErr) {
        setFormError(nameErr)
      }
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await signUp(email, password, name)
      if (error) {
        const friendlyMsg = getFriendlyAuthErrorMessage(error)
        setFormError(friendlyMsg)
        setShakeField('email')
        setTimeout(() => setShakeField(null), 400)
      } else {
        setSuccessMessage(
          'Conta criada com sucesso! Verifique seu e-mail para confirmar e acesse o painel.',
        )
        setTimeout(() => {
          navigate('/')
        }, 3500)
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
        <div className="text-center sm:text-left mb-6">
          <div className="inline-flex items-center gap-3 mb-5">
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
                Novo Credenciamento
              </span>
            </div>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#2D2A26] tracking-tight leading-tight">
            Solicitar acesso
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#6B6560] leading-relaxed">
            Preencha os dados abaixo para criar sua conta.
          </p>
        </div>

        {/* Mensagem de Erro Geral */}
        {formError && (
          <div
            role="alert"
            className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-[#D93025] text-sm flex items-start gap-3 animate-fade-in shadow-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#D93025]" />
            <div className="flex-1 font-medium leading-snug">{formError}</div>
          </div>
        )}

        {/* Mensagem de Sucesso Verde */}
        {successMessage && (
          <div
            role="status"
            className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-[#1E8E3E] text-sm flex items-start gap-3 animate-fade-in shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#1E8E3E]" />
            <div className="flex-1 font-medium leading-snug">
              {successMessage}
              <span className="block text-xs text-[#1E8E3E]/80 mt-1">
                Redirecionando para a tela de login...
              </span>
            </div>
          </div>
        )}

        {/* Formulário de Cadastro */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Nome Completo */}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className="block text-sm font-medium text-[#2D2A26]">
              Nome Completo
            </label>
            <div
              className={`relative rounded-lg transition-all duration-200 ${
                shakeField === 'name' ? 'animate-shake' : ''
              }`}
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#B8960E]">
                <User className="w-4 h-4 text-[#B8960E]" aria-hidden="true" />
              </div>
              <input
                id="signup-name"
                name="name"
                type="text"
                autoComplete="name"
                aria-label="Nome Completo"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'signup-name-error' : undefined}
                value={name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                placeholder="Ex: Dra. Mariana Vasconcelos"
                className={`w-full h-11 pl-10 pr-4 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  errors.name
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
            </div>
            {errors.name && (
              <p
                id="signup-name-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.name}
              </p>
            )}
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <label htmlFor="signup-email" className="block text-sm font-medium text-[#2D2A26]">
              E-mail Profissional
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
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-label="E-mail Profissional"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'signup-email-error' : undefined}
                value={email}
                onChange={(e) => handleChange('email', e.target.value)}
                onBlur={() => handleBlur('email')}
                placeholder="dra.mariana@estetica.com.br"
                className={`w-full h-11 pl-10 pr-4 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  errors.email
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
            </div>
            {errors.email && (
              <p
                id="signup-email-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <label htmlFor="signup-password" className="block text-sm font-medium text-[#2D2A26]">
              Senha (mínimo 8 caracteres)
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
                id="signup-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-label="Senha"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'signup-password-error' : undefined}
                value={password}
                onChange={(e) => handleChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
                placeholder="Crie uma senha forte"
                className={`w-full h-11 pl-10 pr-11 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
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
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p
                id="signup-password-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirmar Senha */}
          <div className="space-y-1.5">
            <label
              htmlFor="signup-confirm-password"
              className="block text-sm font-medium text-[#2D2A26]"
            >
              Confirmar Senha
            </label>
            <div
              className={`relative rounded-lg transition-all duration-200 ${
                shakeField === 'confirmPassword' ? 'animate-shake' : ''
              }`}
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#B8960E]">
                <Lock className="w-4 h-4 text-[#B8960E]" aria-hidden="true" />
              </div>
              <input
                id="signup-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-label="Confirmar Senha"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={
                  errors.confirmPassword ? 'signup-confirm-password-error' : undefined
                }
                value={confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Repita sua senha"
                className={`w-full h-11 pl-10 pr-11 text-sm text-[#2D2A26] placeholder-[#6B6560]/50 bg-white rounded-lg border transition-all duration-200 outline-none ${
                  errors.confirmPassword
                    ? 'border-[#D93025] focus:border-[#D93025] focus:ring-2 focus:ring-red-100'
                    : 'border-[#F1E5C8] hover:border-[#D4AF37]/70 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={
                  showConfirmPassword
                    ? 'Ocultar confirmação de senha'
                    : 'Exibir confirmação de senha'
                }
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6B6560] hover:text-[#D4AF37] transition-colors focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p
                id="signup-confirm-password-error"
                className="text-xs text-[#D93025] mt-1 pl-1 font-medium animate-fade-in"
              >
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full h-12 mt-3 bg-[#D4AF37] hover:bg-[#B8960E] active:scale-[0.98] text-white font-semibold text-base rounded-lg shadow-gold-btn hover:shadow-gold-hover transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>Processando solicitação...</span>
              </>
            ) : (
              <>
                <span>Cadastrar</span>
                <Sparkles className="w-4 h-4 text-white/90" />
              </>
            )}
          </button>
        </form>

        {/* Link para o login */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[#6B6560]">
            Já possui acesso cadastrado?{' '}
            <Link
              to="/"
              className="font-semibold text-[#D4AF37] hover:text-[#B8960E] hover:underline transition-colors ml-1 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Entrar no sistema
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
