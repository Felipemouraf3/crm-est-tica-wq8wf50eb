// src/pages/AdminConhecimento.tsx — P2-S06-T03
// Console /admin/conhecimento (owner/clinic_admin + AAL2): itens de conhecimento
// por categoria com perguntas exemplo e resposta, aviso em tempo real de termos
// comerciais no editor, fluxo rascunho → aprovar → arquivar. Clínica ativa lida
// de localStorage (padrão admin).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/guards'
import { Plus, Check, Archive, Pencil } from 'lucide-react'

type Item = {
  id: string
  category: string
  question_examples: string[]
  answer: string
  auto_reply_allowed: boolean
  status: string
  version: number
}

const CATEGORIAS = [
  { v: 'endereco', t: 'Endereço' },
  { v: 'horario', t: 'Horário' },
  { v: 'como_chegar', t: 'Como chegar' },
  { v: 'contato', t: 'Contato' },
  { v: 'procedimento_info', t: 'Info de procedimento' },
  { v: 'outro', t: 'Outro' },
]

const TERMOS = ['r$', '%', 'desconto', 'promoção', 'promocao', 'garant', 'resultado', 'indicad']

function avisoComercial(texto: string): string | null {
  const t = texto.toLowerCase()
  if (t.includes('r$')) return 'Contém preço (R$) — aprovação será recusada'
  if (/\d\s*%/.test(t)) return 'Contém percentual (%) — aprovação será recusada'
  const achou = TERMOS.slice(2).find((x) => t.includes(x))
  if (achou) return `Contém termo comercial proibido: "${achou}"`
  return null
}

export default function AdminConhecimento() {
  const { toast } = useToast()
  const [clinicaAtiva, setClinicaAtiva] = useState<string | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState<Item | null>(null)
  const [categoria, setCategoria] = useState('endereco')
  const [perguntas, setPerguntas] = useState('')
  const [resposta, setResposta] = useState('')
  const [autoReply, setAutoReply] = useState(true)
  const [salvando, setSalvando] = useState(false)

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
    const { data } = await supabase
      .from('knowledge_items')
      .select('id, category, question_examples, answer, auto_reply_allowed, status, version')
      .eq('clinic_id', clinic)
      .neq('status', 'archived')
      .order('category')
    setItens((data ?? []) as Item[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }, [clinicaAtiva, carregar])

  function abrirNovo() {
    setEditando(null)
    setCategoria('endereco')
    setPerguntas('')
    setResposta('')
    setAutoReply(true)
    setDialogo(true)
  }

  function abrirEdicao(i: Item) {
    setEditando(i)
    setCategoria(i.category)
    setPerguntas((i.question_examples ?? []).join('\n'))
    setResposta(i.answer)
    setAutoReply(i.auto_reply_allowed)
    setDialogo(true)
  }

  async function salvar() {
    if (!clinicaAtiva || !resposta.trim()) {
      toast({ title: 'Escreva a resposta', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const perguntasArr = perguntas
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
      const { data, error } = await supabase.rpc('admin_save_knowledge_item', {
        p_clinic: clinicaAtiva,
        p_item: editando?.id ?? null,
        p_category: categoria,
        p_questions: perguntasArr,
        p_answer: resposta.trim(),
        p_auto_reply: autoReply,
      })
      if (error) throw error
      const r = data?.[0]
      if (r?.recusado) {
        toast({ title: 'Aprovação recusada', description: r.motivo, variant: 'destructive' })
        return
      }
      toast({ title: editando ? 'Item atualizado' : 'Item criado (rascunho)' })
      setDialogo(false)
      await carregar(clinicaAtiva)
    } catch (e) {
      toast({ title: 'Falha ao salvar', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  async function aprovar(i: Item) {
    try {
      const { data, error } = await supabase.rpc('admin_approve_knowledge_item', {
        p_clinic: clinicaAtiva,
        p_item: i.id,
      })
      if (error) throw error
      const r = data?.[0]
      if (r?.recusado) {
        toast({ title: 'Aprovação recusada', description: r.motivo, variant: 'destructive' })
        return
      }
      toast({ title: 'Item aprovado' })
      await carregar(clinicaAtiva)
    } catch (e) {
      toast({
        title: 'Falha ao aprovar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function arquivar(i: Item) {
    try {
      await supabase.rpc('admin_archive_knowledge_item', { p_clinic: clinicaAtiva, p_item: i.id })
      toast({ title: 'Item arquivado' })
      await carregar(clinicaAtiva)
    } catch (e) {
      toast({
        title: 'Falha ao arquivar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  if (!clinicaAtiva) {
    return (
      <>
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Conhecimento</h1>
        <EmptyState titulo="Selecione uma clínica" mensagem="Escolha a clínica no seletor acima." />
      </>
    )
  }

  const aviso = avisoComercial(resposta)

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Conhecimento</h1>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" /> Novo item
        </Button>
      </div>

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando…</p>
      ) : itens.length === 0 ? (
        <EmptyState
          titulo="Nenhum item de conhecimento"
          mensagem="Cadastre endereço, horários, como chegar e contatos — a resposta automática usa só estes textos."
        />
      ) : (
        <div className="space-y-3">
          {itens.map((i) => (
            <Card key={i.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-serif">
                  {CATEGORIAS.find((c) => c.v === i.category)?.t ?? i.category}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {i.auto_reply_allowed && (
                    <Badge className="bg-green-100 text-green-800">Responde sozinho</Badge>
                  )}
                  <Badge
                    className={
                      i.status === 'approved'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }
                  >
                    {i.status === 'approved' ? 'Aprovado' : 'Rascunho'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[#6B6560]">
                  Perguntas: {(i.question_examples ?? []).join(' · ') || '—'}
                </p>
                <p className="mt-1 text-sm text-[#2D2A26]">{i.answer}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => abrirEdicao(i)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  {i.status !== 'approved' && (
                    <Button size="sm" variant="outline" onClick={() => aprovar(i)}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => arquivar(i)}>
                    <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar item' : 'Novo item de conhecimento'}</DialogTitle>
          </DialogHeader>
          <label className="text-xs font-semibold">Categoria</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </select>
          <label className="text-xs font-semibold">Perguntas exemplo (uma por linha)</label>
          <textarea
            value={perguntas}
            onChange={(e) => setPerguntas(e.target.value)}
            rows={3}
            placeholder={'Onde vocês ficam?\nQual o endereço?'}
            className="resize-none rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          />
          <label className="text-xs font-semibold">Resposta aprovada</label>
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            placeholder="Estamos na Rua Exemplo, 123 — Recife/PE."
            className="resize-none rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          />
          {aviso && (
            <div role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-[#D93025]">
              ⚠ {aviso}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoReply}
              onChange={(e) => setAutoReply(e.target.checked)}
            />
            Pode responder sozinho (auto-resposta)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando || !resposta.trim()}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
