// src/lib/experts-api.ts — P2-S02-T03
// Cliente da tela para a Edge Function search-expert-patient v2.
// Contrato da SPEC: { data: { result_class, phone_e164, candidates[...],
// linked_patient_uuid, cache_hit }, correlation_id } | erro { erro, mensagem, correlation_id }.
// Token NUNCA passa por aqui (fica no Vault, server-side).
import { supabase } from '@/lib/supabase/client'

export type ClasseBusca = 'um' | 'multiplos' | 'provavel' | 'zero'

export type Candidato = {
  expert_patient_uuid: string
  name: string
  birth_masked: string | null
  active: boolean
}

export type ResultadoBusca = {
  result_class: ClasseBusca
  phone_e164: string
  candidates: Candidato[]
  linked_patient_uuid: string | null
  cache_hit: boolean
  correlation_id: string
}

// Mensagem por code (SPEC: "mensagem por code, com correlation_id copiável
// e link 'Buscar direto no Clínica Experts'").
export function mensagemDeErro(code: string): string {
  switch (code) {
    case 'credencial':
    case 'credencial_invalida':
      return 'Token da API não configurado ou inválido. Salve o token em Administração → Conexões.'
    case 'bloqueio_de_borda':
      return 'A API externa recusou a chamada na borda (não é problema de token). Tente de novo em alguns minutos.'
    case 'modulo_desabilitado':
      return 'O módulo da API externa está desabilitado. Avise o administrador.'
    case 'limite_externo':
      return 'Limite de buscas da API atingido. Aguarde alguns instantes e tente de novo.'
    case 'tempo_esgotado':
      return 'A API demorou demais para responder. Tente novamente.'
    case 'falha_transitoria':
    case 'falha_externa':
      return 'A API externa falhou agora. Tente novamente em instantes.'
    case 'entrada':
      return 'Telefone inválido. Digite DDD + número.'
    case 'permissao':
      return 'Você não tem acesso a esta clínica.'
    case 'autenticacao':
      return 'Sua sessão expirou. Faça login novamente.'
    default:
      return 'Falha na busca. Tente novamente.'
  }
}

export async function buscarPaciente(
  clinicId: string,
  phone: string,
  forceRefresh = false,
): Promise<ResultadoBusca> {
  const { data: sess } = await supabase.auth.getSession()
  const jwt = sess.session?.access_token
  if (!jwt)
    throw Object.assign(new Error('Sua sessão expirou. Faça login novamente.'), {
      code: 'autenticacao',
    })

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-expert-patient`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clinic_id: clinicId, phone, force_refresh: forceRefresh }),
  })
  const corpo = (await resp.json().catch(() => ({}))) as Record<string, unknown>

  if (!resp.ok) {
    const code = String(corpo?.erro ?? 'falha_transitoria')
    throw Object.assign(new Error(mensagemDeErro(code)), {
      code,
      correlationId: String(corpo?.correlation_id ?? ''),
    })
  }
  const data = (corpo?.data ?? {}) as Record<string, unknown>
  return {
    result_class: String(data.result_class ?? 'zero') as ClasseBusca,
    phone_e164: String(data.phone_e164 ?? ''),
    candidates: Array.isArray(data.candidates) ? (data.candidates as Candidato[]) : [],
    linked_patient_uuid: (data.linked_patient_uuid as string | null) ?? null,
    cache_hit: data.cache_hit === true,
    correlation_id: String(corpo?.correlation_id ?? ''),
  }
}

// Vínculo humano confirmado (emenda P2-S02-T03: sales/reception/post_sales
// criam; desfazer é owner/clinic_admin). match_method: manual | manual_provavel.
export async function confirmarVinculo(
  clinicId: string,
  contactId: string,
  expertPatientUuid: string,
  matchMethod: 'manual' | 'manual_provavel',
): Promise<void> {
  const { error } = await supabase.rpc('link_expert_patient', {
    p_clinic_id: clinicId,
    p_contact_id: contactId,
    p_expert_patient_uuid: expertPatientUuid,
    p_match_method: matchMethod,
  })
  if (error) {
    throw Object.assign(new Error(error.message), {
      code: error.code ?? 'permissao',
      correlationId: '',
    })
  }
}

// Contato local pelo telefone (para "Confirmar vínculo" — o vínculo é
// contato ↔ paciente externo). RLS garante que só a organização do usuário.
export async function acharContatoPorTelefone(
  phoneE164: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('primary_phone_e164', phoneE164)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as { id: string; name: string } | null) ?? null
}
