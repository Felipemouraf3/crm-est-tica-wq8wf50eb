// src/lib/auth-errors.ts — mensagens amigáveis de erro de auth (extraído de use-auth)
export const getFriendlyAuthErrorMessage = (error: unknown): string => {
  const message = (error as { message?: string })?.message || String(error)
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos. Tente novamente.'
  }
  if (lower.includes('over_email_send_rate_limit') || lower.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.'
  }
  if (lower.includes('totp') || lower.includes('invalid code') || lower.includes('code detected')) {
    return 'Código inválido ou expirado. Verifique o app autenticador e tente novamente.'
  }
  if (lower.includes('factor') && lower.includes('not found')) {
    return 'Fator não encontrado. Gere um novo QR e tente novamente.'
  }
  return 'Não foi possível completar a ação. Tente novamente.'
}
