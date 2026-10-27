// src/components/copilot-panel.tsx — P2-S07-T02
// Painel do copiloto (abaixo do PainelTicket na coluna direita da conversa):
// botão "Gerar sugestão" → Edge ticket-suggest-action; exibe resumo, motivo,
// resposta sugerida com Usar / Editar e enviar / Descartar, próxima ação
// (Criar tarefa desabilitado até a fase 3), dados faltantes, evidências e
// bloqueio do guardião. Gerar NUNCA envia (RN-P2-S07-01) — enviar é da RPC
// approve_agent_action (use/edit). Sugestão expira com mensagem nova: "Gerar de novo".
// Sem `as any`.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Evidencia = { tipo: 'mensagem' | 'conhecimento'; ref: string }

type Sugestao = {
  suggestion_id: string
  status: 'generated' | 'blocked'
  bloqueio: string | null
  resumo: string
  motivo: string
  resposta_sugerida: string | null
  proxima_acao: string
  dados_faltantes: string[]
  sinal_de_risco: 'nenhum' | 'baixo' | 'alto'
  evidencias: Evidencia[]
  confianca: number
}

const MOTIVO_BLOQUEIO: Record<string, string> = {
  conteudo_preco: 'Sugestão bloqueada: contém preço ou porcentagem',
  conteudo_proibido: 'Sugestão bloqueada: conteúdo proibido (desconto, promessa ou diagnóstico)',
  avaliacao_de_foto: 'Sugestão bloqueada: avaliação de foto não é permitida',
  sinal_de_risco_alto: 'Sugestão bloqueada: sinal de risco alto',
}

const LISTA_MANUAL = [
  'Confirmar o nome',
  'Confirmar a unidade',
  'Entender o interesse',
  'Oferecer agendamento com a recepção',
]

type TicketAtivo = { id: string; status: string }

export function PainelCopiloto({ conversationId }: { conversationId: string }) {
  const { toast } = useToast()
  const [ticket, setTicket] = useState<TicketAtivo | null>(null)
  const [sugestao, setSugestao] = useState<Sugestao | null>(null)
  const [gerando, setGerando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [indisponivel, setIndisponivel] = useState<string | null>(null)
  const [dialogoEditar, setDialogoEditar] = useState(false)
  const [textoEditado, setTextoEditado] = useState('')
  const [aberto, setAberto] = useState(false)

  const carregarTicket = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .in('status', [
        'new',
        'queued',
        'offered',
        'assigned',
        'in_service',
        'waiting_customer',
        'sla_breached',
        'escalated',
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setTicket((data ?? null) as TicketAtivo | null)
  }, [conversationId])

  useEffect(() => {
    void carregarTicket()
    const canal = supabase
      .channel(`copiloto:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => void carregarTicket(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversationId, carregarTicket])

  // sugestão expira quando chega mensagem nova do contato: limpar a exibida
  useEffect(() => {
    const canal = supabase
      .channel(`copiloto-msg:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const nova = payload.new as { direction?: string }
          if (nova?.direction === 'inbound') {
            setSugestao(null)
            setIndisponivel(null)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversationId])

  async function gerar() {
    if (!ticket || gerando) return
    setGerando(true)
    setIndisponivel(null)
    setSugestao(null)
    const { data: sessao } = await supabase.auth.getSession()
    const token = sessao.session?.access_token
    if (!token) {
      setGerando(false)
      setIndisponivel('Sessão expirada — entre novamente')
      return
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ticket-suggest-action`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticket_id: ticket.id }),
    })
    setGerando(false)
    if (!resp.ok) {
      setIndisponivel('Sugestões indisponíveis no momento')
      return
    }
    const corpo = (await resp.json()) as {
      data?: { disponivel?: boolean; motivo_indisponivel?: string } & Sugestao
    }
    const d = corpo?.data
    if (!d || d.disponivel === false) {
      setIndisponivel('Sugestões indisponíveis no momento')
      return
    }
    setSugestao({
      suggestion_id: d.suggestion_id,
      status: d.status,
      bloqueio: d.bloqueio,
      resumo: d.resumo,
      motivo: d.motivo,
      resposta_sugerida: d.resposta_sugerida,
      proxima_acao: d.proxima_acao,
      dados_faltantes: d.dados_faltantes ?? [],
      sinal_de_risco: d.sinal_de_risco,
      evidencias: d.evidencias ?? [],
      confianca: d.confianca,
    })
  }

  async function aplicar(acao: 'use' | 'edit' | 'discard', textoEditado?: string) {
    if (!sugestao || aplicando) return
    setAplicando(true)
    const { error } = await supabase.rpc('approve_agent_action', {
      p_suggestion: sugestao.suggestion_id,
      p_action: acao,
      p_edited: textoEditado ?? null,
    })
    setAplicando(false)
    setDialogoEditar(false)
    if (error) {
      toast({ title: 'Falha na ação', description: error.message, variant: 'destructive' })
      return
    }
    if (acao === 'discard') toast({ title: 'Sugestão descartada' })
    else toast({ title: acao === 'edit' ? 'Resposta editada e enviada' : 'Resposta enviada' })
    setSugestao(null)
  }

  if (!ticket) return null

  return (
    <div
      className="rounded-lg border border-[#F1E5C8] bg-white p-3 text-sm"
      data-testid="painel-copiloto"
    >
      <div className="flex items-center justify-between">
        <strong className="font-serif text-[#2D2A26]">Copiloto</strong>
        {!aberto && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAberto(true)}
            data-testid="abrir-copiloto"
          >
            Abrir
          </Button>
        )}
      </div>

      {aberto && (
        <>
          {!sugestao && !indisponivel && (
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={gerar}
              disabled={gerando}
              data-testid="gerar-sugestao"
            >
              {gerando ? 'Gerando…' : 'Gerar sugestão'}
            </Button>
          )}

          {gerando && <p className="mt-2 text-xs text-[#6B6560]">Analisando a conversa…</p>}

          {indisponivel && (
            <div className="mt-2" data-testid="copiloto-indisponivel">
              <p className="text-xs text-[#6B6560]">{indisponivel}</p>
              <p className="mt-1 text-xs font-semibold text-[#2D2A26]">Enquanto isso:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {LISTA_MANUAL.map((item) => (
                  <li key={item} className="text-xs text-[#6B6560]">
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={gerar}
                disabled={gerando}
              >
                Tentar de novo
              </Button>
            </div>
          )}

          {sugestao && (
            <div className="mt-2 space-y-2" data-testid="copiloto-sugestao">
              {sugestao.sinal_de_risco === 'alto' && (
                <div
                  className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-[#D93025]"
                  data-testid="risco-alto"
                >
                  ⚠ Sinal de risco alto — atenção antes de responder
                </div>
              )}
              {sugestao.status === 'blocked' && (
                <div
                  className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                  data-testid="copiloto-bloqueio"
                >
                  {MOTIVO_BLOQUEIO[sugestao.bloqueio ?? ''] ?? 'Sugestão bloqueada pelo guardião'}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-[#2D2A26]">Resumo</p>
                <p className="text-xs text-[#6B6560]" data-testid="copiloto-resumo">
                  {sugestao.resumo}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#2D2A26]">Motivo do contato</p>
                <p className="text-xs text-[#6B6560]">{sugestao.motivo}</p>
              </div>
              {sugestao.resposta_sugerida && (
                <div>
                  <p className="text-xs font-semibold text-[#2D2A26]">Resposta sugerida</p>
                  <p
                    className="mt-1 whitespace-pre-wrap rounded bg-[#FFF8ED] px-2 py-2 text-xs text-[#2D2A26]"
                    data-testid="copiloto-resposta"
                  >
                    {sugestao.resposta_sugerida}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-[#2D2A26]">Próxima ação</p>
                <p className="text-xs text-[#6B6560]">{sugestao.proxima_acao}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  disabled
                  title="Disponível na fase 3 (CRM)"
                >
                  Criar tarefa
                </Button>
              </div>
              {sugestao.dados_faltantes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#2D2A26]">Dados faltantes</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {sugestao.dados_faltantes.map((d) => (
                      <li key={d} className="text-xs text-[#6B6560]">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sugestao.evidencias.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#2D2A26]">Evidências</p>
                  <p className="text-[11px] text-[#6B6560]" data-testid="copiloto-evidencias">
                    {sugestao.evidencias
                      .map((e) =>
                        e.tipo === 'mensagem' ? 'mensagem da conversa' : 'item de conhecimento',
                      )
                      .join(', ')}
                  </p>
                </div>
              )}
              <p className="text-[10px] text-[#9CA3AF]">
                Confiança {Math.round(sugestao.confianca * 100)}% · gerar nunca envia
              </p>
              {sugestao.status === 'generated' && sugestao.resposta_sugerida && (
                <div className="flex flex-wrap gap-2" data-testid="copiloto-acoes">
                  <Button
                    size="sm"
                    onClick={() => void aplicar('use')}
                    disabled={aplicando}
                    data-testid="usar-sugestao"
                  >
                    Usar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTextoEditado(sugestao.resposta_sugerida ?? '')
                      setDialogoEditar(true)
                    }}
                    disabled={aplicando}
                    data-testid="editar-sugestao"
                  >
                    Editar e enviar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void aplicar('discard')}
                    disabled={aplicando}
                    data-testid="descartar-sugestao"
                  >
                    Descartar
                  </Button>
                </div>
              )}
              {sugestao.status === 'blocked' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={gerar}
                  disabled={gerando}
                >
                  Gerar de novo
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogoEditar} onOpenChange={setDialogoEditar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar e enviar</DialogTitle>
          </DialogHeader>
          <textarea
            aria-label="Texto editado"
            value={textoEditado}
            onChange={(e) => setTextoEditado(e.target.value)}
            rows={6}
            className="w-full resize-none rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-1 focus:ring-[#B8960E]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogoEditar(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void aplicar('edit', textoEditado)}
              disabled={aplicando || !textoEditado.trim()}
              data-testid="confirmar-edicao"
            >
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
