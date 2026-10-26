// src/pages/AdminFilas.tsx — P2-S05-T01
// Console /admin/filas (owner/clinic_admin): filas por clínica, expediente semanal
// e política de distribuição versionada (rascunho → publicar → voltar).
// Usa os RPCs admin_save_queue / admin_save_hours / admin_save_policy /
// admin_publish_policy / admin_rollback_policy / admin_list_policy_versions.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useClinicaAtiva } from '@/components/clinic-selector'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/guards'
import { Plus, History, Save, RotateCcw, Send } from 'lucide-react'

type Fila = {
  id: string
  name: string
  purpose: string
  priority_default: number
  active: boolean
  team_id: string
}

type Equipe = { id: string; name: string }

type Expediente = {
  id: string
  weekday: number
  opens_at: string
  closes_at: string
  team_id: string | null
}

type Versao = {
  id: string
  version: number
  status: string
  strategy: string
  created_at: string
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ESTRATEGIAS = [
  { v: 'least_load', t: 'Menor carga' },
  { v: 'round_robin', t: 'Rodízio' },
  { v: 'skills_based', t: 'Por habilidade' },
  { v: 'manual', t: 'Manual (só fila)' },
]
const PROPOSITOS = [
  { v: 'recepcao', t: 'Recepção' },
  { v: 'comercial', t: 'Comercial' },
  { v: 'pos_venda', t: 'Pós-venda' },
  { v: 'geral', t: 'Geral' },
]

export default function AdminFilas() {
  const { clinicaAtiva } = useClinicaAtiva()
  const { toast } = useToast()
  const [filas, setFilas] = useState<Fila[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [expediente, setExpediente] = useState<Expediente[]>([])
  const [carregando, setCarregando] = useState(false)
  const [dialogoFila, setDialogoFila] = useState(false)
  const [dialogoPolicy, setDialogoPolicy] = useState<Fila | null>(null)
  const [dialogoExpediente, setDialogoExpediente] = useState(false)
  const [versoes, setVersoes] = useState<Versao[] | null>(null)

  // form fila
  const [fNome, setFNome] = useState('')
  const [fProposito, setFProposito] = useState('recepcao')
  const [fPrioridade, setFPrioridade] = useState(2)
  const [fEquipe, setFEquipe] = useState('')

  // form policy
  const [pStrategy, setPStrategy] = useState('least_load')
  const [pTimeout, setPTimeout] = useState(120)
  const [pReoffers, setPReoffers] = useState(2)
  const [pSla, setPSla] = useState(10)
  const [pAviso, setPAviso] = useState('')
  const [pSalvando, setPSalvando] = useState(false)

  // form expediente
  const [eDia, setEDia] = useState(1)
  const [eAbre, setEAbre] = useState('08:00')
  const [eFecha, setEFecha] = useState('18:00')

  const carregar = useCallback(async (clinic: string) => {
    setCarregando(true)
    const [q, t, h] = await Promise.all([
      supabase
        .from('ticket_queues')
        .select('id, name, purpose, priority_default, active, team_id')
        .eq('clinic_id', clinic)
        .order('name'),
      supabase.from('teams').select('id, name').eq('clinic_id', clinic).order('name'),
      supabase
        .from('business_hours')
        .select('id, weekday, opens_at, closes_at, team_id')
        .eq('clinic_id', clinic)
        .order('weekday'),
    ])
    setFilas((q.data ?? []) as Fila[])
    setEquipes((t.data ?? []) as Equipe[])
    setExpediente((h.data ?? []) as Expediente[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    if (clinicaAtiva) void carregar(clinicaAtiva)
  }, [clinicaAtiva, carregar])

  async function salvarFila() {
    if (!clinicaAtiva || !fNome.trim() || !fEquipe) {
      toast({ title: 'Preencha nome e equipe', variant: 'destructive' })
      return
    }
    try {
      await supabase.rpc('admin_save_queue', {
        p_clinic: clinicaAtiva,
        p_team: fEquipe,
        p_name: fNome.trim(),
        p_purpose: fProposito,
        p_priority: fPrioridade,
      })
      toast({ title: 'Fila criada' })
      setDialogoFila(false)
      setFNome('')
      await carregar(clinicaAtiva)
    } catch (e) {
      toast({
        title: 'Falha ao salvar fila',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function salvarPolicy() {
    if (!clinicaAtiva || !dialogoPolicy) return
    setPSalvando(true)
    try {
      const { data: polId } = await supabase.rpc('admin_save_policy', {
        p_clinic: clinicaAtiva,
        p_queue: dialogoPolicy.id,
        p_strategy: pStrategy,
        p_accept_timeout: pTimeout,
        p_max_reoffers: pReoffers,
        p_sla_minutes: pSla,
        p_after_hours_text: pAviso.trim() || undefined,
      })
      const { data: ver } = await supabase.rpc('admin_publish_policy', {
        p_clinic: clinicaAtiva,
        p_policy: String(polId),
      })
      toast({ title: `Política publicada (versão ${ver})` })
      setDialogoPolicy(null)
      setVersoes(null)
    } catch (e) {
      toast({
        title: 'Falha ao publicar política',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setPSalvando(false)
    }
  }

  async function voltarVersao(filaId: string) {
    if (!clinicaAtiva) return
    try {
      const { data: ver } = await supabase.rpc('admin_rollback_policy', {
        p_clinic: clinicaAtiva,
        p_queue: filaId,
      })
      toast({ title: `Versão anterior restaurada (v${ver})` })
      setVersoes(null)
    } catch (e) {
      toast({
        title: 'Sem versão anterior',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  async function verVersoes(filaId: string) {
    if (!clinicaAtiva) return
    const { data } = await supabase.rpc('admin_list_policy_versions', {
      p_clinic: clinicaAtiva,
      p_queue: filaId,
    })
    setVersoes((data ?? []) as Versao[])
  }

  async function salvarExpediente() {
    if (!clinicaAtiva) return
    try {
      await supabase.rpc('admin_save_hours', {
        p_clinic: clinicaAtiva,
        p_weekday: eDia,
        p_opens: eAbre,
        p_closes: eFecha,
      })
      toast({ title: 'Expediente salvo' })
      setDialogoExpediente(false)
      await carregar(clinicaAtiva)
    } catch (e) {
      toast({
        title: 'Falha ao salvar expediente',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  if (!clinicaAtiva) {
    return (
      <>
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Filas e prazos</h1>
        <EmptyState titulo="Selecione uma clínica" mensagem="Escolha a clínica no seletor acima." />
      </>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Filas e prazos</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogoExpediente(true)}>
            Expediente
          </Button>
          <Button size="sm" onClick={() => setDialogoFila(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova fila
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando…</p>
      ) : filas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma fila"
          mensagem="Crie a primeira fila desta clínica para receber tickets."
        />
      ) : (
        <div className="space-y-3">
          {filas.map((f) => (
            <Card key={f.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-serif">{f.name}</CardTitle>
                <Badge className="bg-[#F1E5C8] text-[#2D2A26]">
                  {PROPOSITOS.find((p) => p.v === f.purpose)?.t ?? f.purpose}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[#6B6560]">
                  Prioridade padrão:{' '}
                  {f.priority_default === 1
                    ? 'alta'
                    : f.priority_default === 2
                      ? 'normal'
                      : 'baixa'}{' '}
                  ·{' '}
                  {expediente.length > 0
                    ? `Expediente: ${DIAS[expediente[0].weekday]} ${expediente[0].opens_at.slice(0, 5)}–${expediente[0].closes_at.slice(0, 5)}`
                    : 'Sem expediente configurado'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDialogoPolicy(f)
                      setPStrategy('least_load')
                      setPTimeout(120)
                      setPReoffers(2)
                      setPSla(10)
                      setPAviso('')
                    }}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" /> Política de distribuição
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => verVersoes(f.id)}>
                    <History className="mr-1 h-3.5 w-3.5" /> Versões
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => voltarVersao(f.id)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Voltar versão
                  </Button>
                </div>
                {versoes && (
                  <div className="mt-3 rounded border border-[#F1E5C8] bg-white p-2 text-xs">
                    {versoes.length === 0 ? (
                      <p className="text-[#6B6560]">Nenhuma versão ainda.</p>
                    ) : (
                      versoes.map((v) => (
                        <div key={v.id} className="flex items-center justify-between py-0.5">
                          <span>
                            v{v.version} ·{' '}
                            {ESTRATEGIAS.find((e) => e.v === v.strategy)?.t ?? v.strategy}
                          </span>
                          <Badge
                            className={
                              v.status === 'published'
                                ? 'bg-green-100 text-green-800'
                                : v.status === 'archived'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-amber-100 text-amber-800'
                            }
                          >
                            {v.status === 'published'
                              ? 'Publicada'
                              : v.status === 'archived'
                                ? 'Arquivada'
                                : 'Rascunho'}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* diálogo nova fila */}
      <Dialog open={dialogoFila} onOpenChange={setDialogoFila}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova fila de atendimento</DialogTitle>
          </DialogHeader>
          <label className="text-xs font-semibold">Nome</label>
          <Input
            value={fNome}
            onChange={(e) => setFNome(e.target.value)}
            placeholder="Atendimento"
          />
          <label className="text-xs font-semibold">Propósito</label>
          <select
            value={fProposito}
            onChange={(e) => setFProposito(e.target.value)}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            {PROPOSITOS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.t}
              </option>
            ))}
          </select>
          <label className="text-xs font-semibold">Prioridade padrão</label>
          <select
            value={fPrioridade}
            onChange={(e) => setFPrioridade(Number(e.target.value))}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            <option value={1}>Alta</option>
            <option value={2}>Normal</option>
            <option value={3}>Baixa</option>
          </select>
          <label className="text-xs font-semibold">Equipe</label>
          <select
            value={fEquipe}
            onChange={(e) => setFEquipe(e.target.value)}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {equipes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogoFila(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarFila}>
              <Save className="mr-1 h-4 w-4" /> Gravar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* diálogo política */}
      <Dialog open={!!dialogoPolicy} onOpenChange={(v) => !v && setDialogoPolicy(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Política de distribuição — {dialogoPolicy?.name}</DialogTitle>
          </DialogHeader>
          <label className="text-xs font-semibold">Estratégia</label>
          <select
            value={pStrategy}
            onChange={(e) => setPStrategy(e.target.value)}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            {ESTRATEGIAS.map((e) => (
              <option key={e.v} value={e.v}>
                {e.t}
              </option>
            ))}
          </select>
          <label className="text-xs font-semibold">Tempo de aceite (segundos)</label>
          <Input
            type="number"
            value={pTimeout}
            onChange={(e) => setPTimeout(Number(e.target.value))}
          />
          <label className="text-xs font-semibold">Máximo de reofertas</label>
          <Input
            type="number"
            value={pReoffers}
            onChange={(e) => setPReoffers(Number(e.target.value))}
          />
          <label className="text-xs font-semibold">SLA de primeira resposta (minutos)</label>
          <Input type="number" value={pSla} onChange={(e) => setPSla(Number(e.target.value))} />
          <label className="text-xs font-semibold">Aviso fora do expediente</label>
          <Input
            value={pAviso}
            onChange={(e) => setPAviso(e.target.value)}
            placeholder="A clínica está fechada — responderemos no próximo expediente."
          />
          <p className="text-xs text-[#6B6560]">
            Publicar arquiva a versão anterior e registra na auditoria. Use "Voltar versão" para
            restaurar.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogoPolicy(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarPolicy} disabled={pSalvando}>
              {pSalvando ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* diálogo expediente */}
      <Dialog open={dialogoExpediente} onOpenChange={setDialogoExpediente}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expediente da clínica</DialogTitle>
          </DialogHeader>
          <label className="text-xs font-semibold">Dia da semana</label>
          <select
            value={eDia}
            onChange={(e) => setEDia(Number(e.target.value))}
            className="rounded-lg border border-[#F1E5C8] px-3 py-2 text-sm"
          >
            {DIAS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
          <label className="text-xs font-semibold">Abre</label>
          <Input type="time" value={eAbre} onChange={(e) => setEAbre(e.target.value)} />
          <label className="text-xs font-semibold">Fecha</label>
          <Input type="time" value={eFecha} onChange={(e) => setEFecha(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogoExpediente(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarExpediente}>
              <Save className="mr-1 h-4 w-4" /> Gravar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
