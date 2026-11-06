// _shared/copiloto.ts — P2-S07-T01 (v5: max_tokens 2000 — JSON truncado com 800)
// Copiloto da atendente: valida schema da saída + guardião da sugestão + chamada IA direta.
// @ts-nocheck

export const MODELO_COPILOTO = 'claude-sonnet-5-5'
export const TIMEOUT_COPILOTO_MS = 25_000

export interface SaidaCopiloto {
  resumo: string
  motivo: string
  resposta_sugerida: string
  proxima_acao: string
  dados_faltantes: string[]
  sinal_de_risco: 'nenhum' | 'baixo' | 'alto'
  evidencias: { tipo: 'mensagem' | 'conhecimento'; ref: string }[]
  confianca: number
}

export function validarSaidaCopiloto(texto: string): SaidaCopiloto | null {
  const tentar = (bruto: string): any => {
    try { return JSON.parse(bruto) } catch { return null }
  }
  try {
    const inicio = texto.indexOf('{')
    const fim = texto.lastIndexOf('}')
    if (inicio < 0 || fim <= inicio) return null
    const recorte = texto.slice(inicio, fim + 1)
    const b = tentar(recorte) ?? tentar(recorte.replace(/\r?\n/g, ' '))
    if (!b) return null
    if (typeof b.resumo !== 'string' || !b.resumo.trim()) return null
    if (typeof b.motivo !== 'string' || !b.motivo.trim()) return null
    if (typeof b.resposta_sugerida !== 'string') return null
    if (typeof b.proxima_acao !== 'string') return null
    if (!Array.isArray(b.dados_faltantes)) return null
    if (!['nenhum', 'baixo', 'alto'].includes(b.sinal_de_risco)) return null
    if (!Array.isArray(b.evidencias)) return null
    for (const e of b.evidencias) {
      if (!e || !['mensagem', 'conhecimento'].includes(e.tipo) || typeof e.ref !== 'string') return null
    }
    const conf = Number(b.confianca)
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) return null
    return {
      resumo: b.resumo, motivo: b.motivo, resposta_sugerida: b.resposta_sugerida,
      proxima_acao: b.proxima_acao, dados_faltantes: b.dados_faltantes.map(String),
      sinal_de_risco: b.sinal_de_risco,
      evidencias: b.evidencias.map((e: any) => ({ tipo: e.tipo, ref: String(e.ref) })),
      confianca: conf,
    }
  } catch { return null }
}

export function guardiaoSugestao(s: SaidaCopiloto): { effect: 'allow' | 'blocked'; reason: string | null } {
  const t = `${s.resposta_sugerida} ${s.resumo} ${s.proxima_acao}`.toLowerCase()
  if (/r\$\s*\d/.test(t) || /\d+\s*%/.test(t)) return { effect: 'blocked', reason: 'conteudo_preco' }
  for (const termo of ['desconto', 'promoção', 'promocao', 'garant', 'resultado certo', 'cura', 'diagnóstico', 'diagnostico', 'doença', 'doenca']) {
    if (t.includes(termo)) return { effect: 'blocked', reason: 'conteudo_proibido' }
  }
  if (/(avali|analisa)[a-zç]*\s+(de\s+)?(foto|imagem)/.test(t) || /(foto|imagem)[^.]*(avali|analisa)/.test(t)) return { effect: 'blocked', reason: 'avaliacao_de_foto' }
  if (s.sinal_de_risco === 'alto') return { effect: 'blocked', reason: 'sinal_de_risco_alto' }
  return { effect: 'allow', reason: null }
}

export async function gerarSugestao(p: {
  baseUrl: string
  apiKey: string
  prompt: string
  modelo?: string
  mensagens: { direction: string; body: string }[]
  nomeContato: string
  identificacao: string | null
  intent: string | null
  handoffReason: string | null
  itensAprovados: { id: string; question_examples: string[] }[]
  clinica: string
  timeoutMs?: number
}): Promise<{ ok: true; saida: SaidaCopiloto; usage: { input: number; output: number } } | { ok: false; error_code: string }> {
  const timeoutMs = p.timeoutMs ?? TIMEOUT_COPILOTO_MS
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), timeoutMs)
  const historico = p.mensagens.slice(-30)
    .map((m) => `${m.direction === 'inbound' ? 'Contato' : 'Clínica'}: ${m.body}`).join('\n')
  const itens = p.itensAprovados.map((i) => `- ${i.id}: ${i.question_examples.join(' | ')}`).join('\n') || '(nenhum)'
  const user = [
    `Clínica: ${p.clinica}`,
    `Contato: ${p.nomeContato} (${p.identificacao ?? 'sem identificação'})`,
    `Intenção da triagem: ${p.intent ?? 'não classificada'}; motivo do transbordo: ${p.handoffReason ?? 'n/d'}`,
    `Itens de conhecimento aprovados (id: perguntas exemplo):\n${itens}`,
    `Conversa:\n${historico}`,
  ].join('\n\n')
  try {
    const resp = await fetch(`${p.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal: controle.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': p.apiKey,
        'anthropic-version': '2023-06-01',
        'user-agent': 'PSEstetica-CRM/1.0 (+supabase-edge)',
      },
      body: JSON.stringify({
        model: p.modelo ?? MODELO_COPILOTO,
        max_tokens: 2000,
        system: p.prompt,
        messages: [{ role: 'user', content: user }],
      }),
    })
    clearTimeout(timer)
    if (resp.status === 401 || resp.status === 403) return { ok: false, error_code: 'credencial_invalida' }
    if (resp.status === 429) return { ok: false, error_code: 'limite_externo' }
    if (!resp.ok) return { ok: false, error_code: 'ia_erro' }
    const corpo = await resp.json()
    const bloco = Array.isArray(corpo?.content) ? corpo.content.find((b: any) => b?.type === 'text' && typeof b.text === 'string') : null
    const texto = bloco ? bloco.text : null
    if (!texto) return { ok: false, error_code: 'ia_resposta_malformada' }
    const saida = validarSaidaCopiloto(texto)
    if (!saida) return { ok: false, error_code: 'ia_resposta_malformada' }
    return {
      ok: true,
      saida,
      usage: { input: Number(corpo?.usage?.input_tokens ?? 0), output: Number(corpo?.usage?.output_tokens ?? 0) },
    }
  } catch (e) {
    clearTimeout(timer)
    const msg = String(e?.message ?? e)
    if (msg.includes('abort') || msg.includes('Abort')) return { ok: false, error_code: 'ia_timeout' }
    return { ok: false, error_code: 'ia_indisponivel' }
  }
}
