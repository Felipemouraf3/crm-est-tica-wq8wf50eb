// src/pages/AdminAgentes.tsx — P2-S06-T03 + P2-S07-T03
// Console /admin/agentes (owner/clinic_admin + AAL2): interruptor "Resposta
// automática" por clínica, rotas por intenção e aba "Instruções" do copiloto
// (AG-14): editor de prompt com variáveis permitidas, sandbox (10 conversas
// sintéticas), publicação (exige sandbox ok), volta de versão, herança com
// origem do valor efetivo e histórico de versões.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/guards'

type Rota = {
  id: string
  intent: string
  queue_id: string | null
  priority: number
  auto_reply_allowed: boolean
}

type Fila = { id: string; name: string }

type Versao = {
  id: string
  version: number
  status: string
  sandbox_ok: boolean
  published_at: string | null
  created_at: string
  origem: 'propria' | 'organizacao'
}

type Efetivo = {
  origem: string
  version: number
  content: string
  allowed_variables: string[]
}

const INTENCOES = [
  { v: 'informacao_geral', t: 'Informação geral' },
  { v: 'interesse_procedimento', t: 'Interesse em procedimento' },
  { v: 'preco_condicao', t: 'Preço ou condição' },
  { v: 'pedido_agendamento', t: 'Pedido de agendamento' },
  { v: 'reagendamento_cancelamento', t: 'Reagendamento/cancelamento' },
  { v: 'pos_procedimento', t: 'Pós-procedimento' },
  { v: 'reclamacao', t: 'Reclamação' },
  { v: 'financeiro', t: 'Financeiro' },
  { v: 'atendimento_humano', t: 'Atendimento humano' },
  { v: 'desconhecido', t: 'Desconhecido' },
]

const ROTULO_INTENCAO = Object.fromEntries(INTENCOES.map((i) => [i.v, i.t]))

const VARIAVEIS = ['clinica', 'nome_contato', 'horario_clinica']
// chave do agente do copiloto no banco (prompt_sets.agent_key = AG-01)
const AGENTE_COPILOTO = 'AG-01'

export default function AdminAgentes() {
  const { toast } = useToast()
  const [aba, setAba] = useState<'rotas' | 'instrucoes'>('rotas')
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [autoResposta, setAutoResposta] = useState(false)
  const [rotas, setRotas] = useState<Rota[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [carregando, setCarregando] = useState(true)
  // ===== Instruções (P2-S07-T03) =====
  const [efetivo, setEfetivo] = useState<Efetivo | null>(null)
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [rascunhoId, setRascunhoId] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [sandbox, setSandbox] = useState<{
    ok: boolean
    casos: number
    validos: number
    bloqueados: number
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const ativa =
        typeof localStorage !== 'undefined' ? localStorage.getItem('clinica_ativa') : null
      const { data: clinicas } = await supabase
        .from('clinics')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      const escolhida = (clinicas ?? []).find((c) => c.id === ativa) ?? (clinicas ?? [])[0]
      if (escolhida) setClinicaAtiva(escolhida.id)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const carregar = useCallback(async (clinic: string) => {
    const [ff, ir, q] = await Promise.all([
      supabase
        .from('feature_flags')
        .select('enabled')
        .eq('clinic_id', clinic)
        .eq('flag_key', 'auto_resposta')
        .maybeSingle(),
      supabase
        .from('intent_routes')
        .select('id, intent, queue_id, priority, auto_reply_allowed')
        .eq('clinic_id', clinic)
        .order('intent'),
      supabase.from('ticket_queues').select('id, name').eq('clinic_id', clinic).order('name'),
    ])
    setAutoResposta(ff.data?.enabled ?? false)
    setRotas((ir.data ?? []) as Rota[])
    setFilas((q.data ?? []) as Fila[])
    setCarregando(false)
  }, [])

  const carregarInstrucoes = useCallback(async (clinic: string) => {
    const { data: ef } = await supabase.rpc('admin_get_prompt_efetivo', {
      p_clinic: clinic,
      p_agent_key: AGENTE_COPILOTO,
    })
    const linha = Array.isArray(ef) ? ef[0] : ef
    setEfetivo((linha ?? null) as Efetivo | null)
    const { data: vs } = await supabase.rpc('admin_list_prompt_versions', {
      p_clinic: clinic,
      p_agent_key: AGENTE_COPILOTO,
    })
    setVersoes((vs ?? []) as Versao[])
    // rascunho aberto (se existir) vira o texto do editor; senão, o texto em uso
    const rascunho = (vs ?? []).find((v: Versao) => v.status === 'draft')
    if (rascunho) {
      setRascunhoId(rascunho.id)
      const { data: c } = await supabase
        .from('prompt_versions')
        .select('content')
        .eq('id', rascunho.id)
        .maybeSingle()
      setTexto(c?.content ?? '')
    } else {
      setRascunhoId(null)
      setTexto(linha?.content ?? '')
    }
    setSandbox(null)
  }, [])

  useEffect(() => {
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }, [clinicaAtiva, carregar])

  useEffect(() => {
    if (clinicaAtiva && aba === 'instrucoes') void carregarInstrucoes(clinicaAtiva)
  }, [clinicaAtiva, aba, carregarInstrucoes])

  async function alternarAutoResposta() {
    if (!clinicaAtiva) return
    const novo = !autoResposta
    try {
      await supabase.rpc('admin_set_auto_reply', { p_clinic: clinicaAtiva, p_enabled: novo })
      setAutoResposta(novo)
      toast({
        title: novo ? 'Resposta automática LIGADA' : 'Resposta automática desligada',
        description: novo
          ? 'Só "informação geral" com conteúdo aprovado responde sozinho.'
          : 'Tudo vai para humano.',
      })
    } catch (e) {
      toast({
        title: 'Falha ao alternar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function mudarRota(r: Rota, campo: 'queue_id' | 'priority' | 'auto', valor: string) {
    if (!clinicaAtiva) return
    try {
      const novoQueue = campo === 'queue_id' ? valor || null : r.queue_id
      const novoPriority = campo === 'priority' ? Number(valor) : r.priority
      const novoAuto = campo === 'auto' ? valor === 'true' : r.auto_reply_allowed
      await supabase.rpc('admin_save_intent_route', {
        p_clinic: clinicaAtiva,
        p_intent: r.intent,
        p_queue: novoQueue,
        p_priority: novoPriority,
        p_auto_reply: novoAuto,
      })
      await carregar(clinicaAtiva)
      toast({ title: 'Rota atualizada' })
    } catch (e) {
      toast({ title: 'Falha na rota', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // ===== Ações da aba Instruções =====
  async function salvarRascunho() {
    if (!clinicaAtiva || !texto.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_save_prompt_draft', {
      p_clinic: clinicaAtiva,
      p_agent_key: AGENTE_COPILOTO,
      p_content: texto.trim(),
    })
    setBusy(false)
    if (error) {
      toast({
        title: 'Rascunho recusado',
        description:
          error.message.includes('variavel') || error.message.includes('variável')
            ? 'Há uma variável {{}} fora da lista permitida.'
            : error.message,
        variant: 'destructive',
      })
      return
    }
    setRascunhoId((data ?? null) as string | null)
    toast({ title: 'Rascunho salvo' })
    void carregarInstrucoes(clinicaAtiva)
  }

  async function testarSandbox() {
    if (!clinicaAtiva || !rascunhoId) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_sandbox_test_prompt', {
      p_clinic: clinicaAtiva,
      p_prompt_version: rascunhoId,
    })
    setBusy(false)
    if (error) {
      toast({ title: 'Falha no sandbox', description: error.message, variant: 'destructive' })
      return
    }
    const r = Array.isArray(data) ? data[0] : data
    setSandbox(r)
    toast({
      title: r?.ok ? 'Sandbox 10/10 — pode publicar' : 'Sandbox reprovado',
      description: `${r?.validos ?? 0}/${r?.casos ?? 0} casos corretos · ${r?.bloqueados ?? 0} bloqueios do guardião`,
      variant: r?.ok ? 'default' : 'destructive',
    })
  }

  async function publicar() {
    if (!clinicaAtiva || !rascunhoId) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_publish_prompt_version', {
      p_clinic: clinicaAtiva,
      p_prompt_version: rascunhoId,
    })
    setBusy(false)
    if (error) {
      toast({
        title: 'Publicação recusada',
        description: error.message.includes('sandbox')
          ? 'Rode o sandbox antes de publicar.'
          : error.message,
        variant: 'destructive',
      })
      return
    }
    toast({ title: `Versão ${data} publicada` })
    void carregarInstrucoes(clinicaAtiva)
  }

  async function voltarVersao() {
    if (!clinicaAtiva) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_rollback_prompt_version', {
      p_clinic: clinicaAtiva,
      p_agent_key: AGENTE_COPILOTO,
    })
    setBusy(false)
    if (error) {
      toast({
        title: 'Volta recusada',
        description:
          error.message.includes('versao') || error.message.includes('versão')
            ? 'Não há versão anterior arquivada.'
            : error.message,
        variant: 'destructive',
      })
      return
    }
    toast({ title: `Versão ${data} reativada` })
    void carregarInstrucoes(clinicaAtiva)
  }

  if (!clinicaAtiva) {
    return (
      <>
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Agentes</h1>
        <EmptyState titulo="Selecione uma clínica" mensagem="Escolha a clínica no seletor acima." />
      </>
    )
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Agentes</h1>
        <p className="text-xs text-[#6B6560]">
          Configuração da resposta automática, rotas por intenção e instruções do copiloto desta
          clínica.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setAba('rotas')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              aba === 'rotas' ? 'bg-[#B8960E] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Rotas
          </button>
          <button
            onClick={() => setAba('instrucoes')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              aba === 'instrucoes' ? 'bg-[#B8960E] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Instruções do copiloto
          </button>
        </div>
      </div>

      {aba === 'rotas' && (
        <>
          <Card className="mb-4 max-w-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-serif">Resposta automática</CardTitle>
              <button
                onClick={alternarAutoResposta}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  autoResposta ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {autoResposta ? 'Ligada' : 'Desligada'}
              </button>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[#6B6560]">
                {autoResposta
                  ? 'Perguntas de informação geral com conteúdo aprovado são respondidas sozinhas (dentro do expediente).'
                  : 'Desligado: 100% das mensagens vão para humano. A outra clínica não é afetada.'}
              </p>
            </CardContent>
          </Card>

          {carregando ? (
            <p className="text-sm text-[#6B6560]">Carregando…</p>
          ) : rotas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma rota configurada"
              mensagem="As rotas definem para qual fila cada intenção vai e se pode responder sozinho."
            />
          ) : (
            <Card className="max-w-3xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-serif">Rotas por intenção</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#6B6560]">
                      <th className="pb-2">Intenção</th>
                      <th className="pb-2">Fila</th>
                      <th className="pb-2">Prioridade</th>
                      <th className="pb-2">Responde sozinho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotas.map((r) => (
                      <tr key={r.id} className="border-t border-[#F1E5C8]">
                        <td className="py-2">{ROTULO_INTENCAO[r.intent] ?? r.intent}</td>
                        <td className="py-2">
                          <select
                            value={r.queue_id ?? ''}
                            onChange={(e) => mudarRota(r, 'queue_id', e.target.value)}
                            className="rounded border border-[#F1E5C8] px-2 py-1"
                          >
                            <option value="">—</option>
                            {filas.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          <select
                            value={String(r.priority)}
                            onChange={(e) => mudarRota(r, 'priority', e.target.value)}
                            className="rounded border border-[#F1E5C8] px-2 py-1"
                          >
                            <option value="1">Alta</option>
                            <option value="2">Normal</option>
                            <option value="3">Baixa</option>
                          </select>
                        </td>
                        <td className="py-2">
                          {r.intent === 'informacao_geral' ? (
                            <select
                              value={String(r.auto_reply_allowed)}
                              onChange={(e) => mudarRota(r, 'auto', e.target.value)}
                              className="rounded border border-[#F1E5C8] px-2 py-1"
                            >
                              <option value="true">Sim</option>
                              <option value="false">Não</option>
                            </select>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">Não</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {aba === 'instrucoes' && (
        <div className="max-w-3xl space-y-4">
          {/* origem do valor efetivo (CA-P2-S07-06) */}
          {efetivo && (
            <div className="flex items-center gap-2 text-xs">
              <Badge
                className={
                  efetivo.origem === 'propria'
                    ? 'bg-[#F1E5C8] text-[#2D2A26]'
                    : 'bg-gray-100 text-gray-600'
                }
              >
                {efetivo.origem === 'propria' ? 'Próprio da clínica' : 'Herdado da organização'}
              </Badge>
              <span className="text-[#6B6560]">versão {efetivo.version} em uso pelo copiloto</span>
            </div>
          )}
          {!efetivo && (
            <p className="text-xs text-[#D93025]" data-testid="origem-prompt">
              Nenhum prompt publicado encontrado para este agente ({AGENTE_COPILOTO}).
            </p>
          )}

          {/* editor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-serif">
                Instruções do copiloto ({AGENTE_COPILOTO})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-[#6B6560]">
                Variáveis permitidas: {VARIAVEIS.map((v) => `{{${v}}}`).join(' ')}
              </p>
              <textarea
                aria-label="Instruções do copiloto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={10}
                data-testid="editor-prompt"
                className="w-full resize-y rounded-lg border border-[#F1E5C8] px-3 py-2 font-mono text-xs text-[#2D2A26] focus:outline-none focus:ring-1 focus:ring-[#B8960E]"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={salvarRascunho} disabled={busy || !texto.trim()}>
                  Salvar rascunho
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={testarSandbox}
                  disabled={busy || !rascunhoId}
                >
                  Testar no sandbox
                </Button>
                <Button size="sm" onClick={publicar} disabled={busy || !rascunhoId}>
                  Publicar
                </Button>
                <Button size="sm" variant="outline" onClick={voltarVersao} disabled={busy}>
                  Voltar para a versão anterior
                </Button>
              </div>
              {sandbox && (
                <p
                  className={`mt-2 text-xs ${sandbox.ok ? 'text-green-700' : 'text-[#D93025]'}`}
                  data-testid="sandbox-resultado"
                >
                  Sandbox: {sandbox.validos}/{sandbox.casos} casos corretos · {sandbox.bloqueados}{' '}
                  bloqueios do guardião {sandbox.ok ? '— pode publicar' : '— corrija o prompt'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* histórico de versões */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-serif">Histórico de versões</CardTitle>
            </CardHeader>
            <CardContent>
              {versoes.length === 0 ? (
                <p className="text-xs text-[#6B6560]">Nenhuma versão ainda.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#6B6560]">
                      <th className="pb-2">Origem</th>
                      <th className="pb-2">Versão</th>
                      <th className="pb-2">Situação</th>
                      <th className="pb-2">Sandbox</th>
                      <th className="pb-2">Publicada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versoes.map((v) => (
                      <tr key={v.id} className="border-t border-[#F1E5C8]">
                        <td className="py-2">
                          {v.origem === 'propria' ? 'Clínica' : 'Organização'}
                        </td>
                        <td className="py-2">v{v.version}</td>
                        <td className="py-2">
                          <Badge
                            className={
                              v.status === 'published'
                                ? 'bg-green-100 text-green-800'
                                : v.status === 'draft'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {v.status === 'published'
                              ? 'Publicada'
                              : v.status === 'draft'
                                ? 'Rascunho'
                                : 'Arquivada'}
                          </Badge>
                        </td>
                        <td className="py-2">{v.sandbox_ok ? '10/10' : '—'}</td>
                        <td className="py-2">
                          {v.published_at
                            ? new Date(v.published_at).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
