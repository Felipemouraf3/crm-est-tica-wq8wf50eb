import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export interface UserProfile {
  id: string
  name: string
  email: string
  clinic_name?: string | null
  role?: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signIn: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string, name?: string) => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Translates Supabase authentication errors into friendly Portuguese messages
export const getFriendlyAuthErrorMessage = (error: AuthError | Error | null | unknown): string => {
  if (!error) return ''
  const message = (error as { message?: string })?.message || String(error)

  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos. Tente novamente.'
  }
  if (lower.includes('user not found')) {
    return 'Usuário não encontrado. Verifique o e-mail ou crie uma conta.'
  }
  if (
    lower.includes('email already registered') ||
    lower.includes('user already registered') ||
    lower.includes('already exists')
  ) {
    return 'Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.'
  }
  if (lower.includes('password should be at least') || lower.includes('password is too short')) {
    return 'A senha deve ter pelo menos 8 caracteres.'
  }
  if (lower.includes('invalid email') || lower.includes('email address is invalid')) {
    return 'E-mail inválido. Verifique o formato digitado.'
  }
  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.'
  }
  if (lower.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'
  }
  return 'Não foi possível completar a ação. Tente novamente.'
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        setProfile(data as unknown as UserProfile)
      }
    } catch {
      // Ignora falhas silenciosas de perfil
    }
  }

  useEffect(() => {
    // Escuta mudanças no estado de autenticação (síncrono dentro da callback)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setLoading(false)

      if (currentSession?.user) {
        fetchProfile(currentSession.user.id)
      } else {
        setProfile(null)
      }
    })

    // Carregamento inicial de sessão
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      setLoading(false)

      if (initialSession?.user) {
        fetchProfile(initialSession.user.id)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  const signIn = async (email: string, password: string, rememberMe = true) => {
    if (!rememberMe) {
      // Se não quiser lembrar, salva a preferência ou usa session storage
      try {
        sessionStorage.setItem('crm_session_temp', 'true')
      } catch {
        // no-op
      }
    } else {
      try {
        sessionStorage.removeItem('crm_session_temp')
      } catch {
        // no-op
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    return { error }
  }

  const signUp = async (email: string, password: string, name?: string) => {
    const trimmedEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          name: name?.trim() || '',
          full_name: name?.trim() || '',
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    return { error }
  }

  const resetPassword = async (email: string) => {
    const trimmedEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/`,
    })

    return { error }
  }

  const signOut = async () => {
    try {
      sessionStorage.removeItem('crm_session_temp')
    } catch {
      // no-op
    }
    const { error } = await supabase.auth.signOut()
    setProfile(null)
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        resetPassword,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
