// src/pages/AdminAgentes.tsx — P2-S06-T03
// Console /admin/agentes (owner/clinic_admin + AAL2): interruptor "Resposta
// automática" por clínica, tabela de rotas por intenção (fila, prioridade,
// responde sozinho — só informacao_geral pode ser marcada nesta fase).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/guards'

type Rota = {
  id: string
  intent: string
  queue_id: string | null
  priority: number
  auto_reply_allowed: boolean
}

type Fila = { id: string; name: string }

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

export default function AdminAgentes() {
  const { toast } = useToast()
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [autoResposta, setAutoResposta] = useState(false)
  const [rotas, setRotas] = useState<Rota[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [carregando, setCarregando] = useState(true)

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

  useEffect(() => {
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }, [clinicaAtiva, carregar])

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
          Configuração da resposta automática e das rotas por intenção desta clínica.
        </p>
      </div>

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
  )
}
