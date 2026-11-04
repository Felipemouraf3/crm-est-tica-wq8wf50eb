// src/pages/MinhaFila.tsx — P3-S03-T02
// "Minha fila do dia": tarefas vencidas e de hoje do usuário, com conclusão que
// exige a próxima ação; ao lado, a linha do tempo do contato do caso escolhido.
// As regras vivem no servidor (complete_task / create_task / reassign_task):
// esta tela só apresenta e nunca decide sozinha o que é permitido.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { clinicaSalva } from '@/components/clinic-selector'
import { EmptyState } from '@/components/guards'

type Tarefa = {
  id: string
  title: string
  kind: string
  status: string
  priority: string
  due_at: string
  entity_type: string
  entity_id: string
  contato: string | null
  atrasada: boolean
  is_automatic: boolean
}

type Evento = {
  quando: string
  origem: string
  titulo: string
  detalhe: string | null
  autor: string
}

const ROTULO_TIPO: Record<string, string> = {
  follow_up: 'Acompanhar',
  call: 'Ligar',
  message: 'Mensagem',
  visit: 'Visita',
  other: 'Outro',
}

const ROTULO_ORIGEM: Record<string, { texto: string; cor: string }> = {
  mensagem: { texto: 'Mensagem', cor: 'bg-blue-50 text-blue-700' },
  task_created: { texto: 'Tarefa criada', cor: 'bg-amber-50 text-amber-800' },
  task_completed: { texto: 'Tarefa concluída', cor: 'bg-green-50 text-green-800' },
  task_reassigned: { texto: 'Reatribuída', cor: 'bg-purple-50 text-purple-800' },
  task_cancelled: { texto: 'Tarefa cancelada', cor: 'bg-gray-100 text-gray-600' },
  stage_change: { texto: 'Mudança de etapa', cor: 'bg-[#FFF8ED] text-[#B8960E]' },
  agendamento: { texto: 'Agendamento', cor: 'bg-teal-50 text-teal-800' },
  decision: { texto: 'Decisão', cor: 'bg-indigo-50 text-indigo-800' },
  note: { texto: 'Nota', cor: 'bg-gray-50 text-gray-700' },
  call: { texto: 'Ligação', cor: 'bg-emerald-50 text-emerald-800' },
  appointment: { texto: 'Agendamento', cor: 'bg-teal-50 text-teal-800' },
  evaluation: { texto: 'Avaliação', cor: 'bg-[#FFF8ED] text-[#B8960E]' },
}

function quandoLegivel(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  const amanha = new Date(hoje)
  amanha.setDate(hoje.getDate() + 1)
  const ehAmanha = d.toDateString() === amanha.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia) return `hoje ${hora}`
  if (ehAmanha) return `amanhã ${hora}`
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function distancia(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60000)
  const horas = Math.floor(min / 60)
  const dias = Math.floor(horas / 24)
  let texto = ''
  if (min < 60) texto = `${min} min`
  else if (horas < 24) texto = `${horas}h`
  else texto = `${dias} dia${dias > 1 ? 's' : ''}`
  return diff < 0 ? `atrasada ${texto}` : `em ${texto}`
}

export default function MinhaFila() {
  const [clinica, setClinica] = useState<string | null>(null)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // conclusão
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null)
  const [resultado, setResultado] = useState('')
  const [proximaTitulo, setProximaTitulo] = useState('')
  const [proximaQuando, setProximaQuando] = useState('')
  const [salvando, setSalvando] = useState(false)

  // linha do tempo
  const [eventos, setEventos] = useState<Evento[]>([])
  const [contatoSel, setContatoSel] = useState<string | null>(null)

  // nova tarefa manual
  const [criando, setCriando] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoPrazo, setNovoPrazo] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const salva = clinicaSalva()
      const { data } = await supabase
        .from('clinics')
        .select('id')
        .eq('status', 'active')
        .order('name')
      if (!vivo) return
      const lista = (data ?? []) as { id: string }[]
      const escolhida = lista.find((c) => c.id === salva) ?? lista[0]
      if (escolhida) setClinica(escolhida.id)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const carregar = useCallback(async () => {
    if (!clinica) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('list_my_day', { p_clinic: clinica })
    if (error) setErro(error.message)
    else setTarefas((data ?? []) as Tarefa[])
    setCarregando(false)
  }, [clinica])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const atrasadas = useMemo(() => tarefas.filter((t) => t.atrasada), [tarefas])
  const deHoje = useMemo(() => tarefas.filter((t) => !t.atrasada), [tarefas])

  async function abrirTimeline(t: Tarefa) {
    setContatoSel(t.contato)
    setEventos([])
    // o contato vem da tarefa; para a linha do tempo precisamos do id, não do nome
    const { data: tarefaRow } = await supabase
      .from('tasks')
      .select('contact_id')
      .eq('id', t.id)
      .maybeSingle()
    const contatoId = (tarefaRow as { contact_id: string | null } | null)?.contact_id
    if (!contatoId) {
      setEventos([])
      return
    }
    const { data, error } = await supabase.rpc('list_contact_timeline', {
      p_contact: contatoId,
      p_limit: 60,
    })
    if (error) setErro(error.message)
    else setEventos((data ?? []) as Evento[])
  }

  function abrirConclusao(t: Tarefa) {
    setConcluindo(t)
    setResultado('')
    setProximaTitulo('')
    setProximaQuando('')
    setErro(null)
  }

  async function confirmarConclusao(criarProxima: boolean) {
    if (!concluindo) return
    setSalvando(true)
    setErro(null)
    const args: Record<string, unknown> = {
      p_task: concluindo.id,
      p_result_note: resultado || null,
      p_close_case: false,
    }
    if (criarProxima) {
      if (!proximaQuando) {
        setErro('Escolha a data da próxima ação.')
        setSalvando(false)
        return
      }
      args.p_next_title = proximaTitulo || null
      args.p_next_due_at = new Date(proximaQuando).toISOString()
    }
    const { error } = await supabase.rpc('complete_task', args)
    setSalvando(false)
    if (error) {
      setErro(
        error.message.includes('proxima_acao_obrigatoria')
          ? 'Esta é a última tarefa do caso: informe a próxima ação e a data.'
          : error.message.includes('caso_ainda_aberto')
            ? 'O caso ainda está aberto — feche a oportunidade no funil antes de encerrar.'
            : error.message,
      )
      return
    }
    setAviso(criarProxima ? 'Tarefa concluída e próxima ação criada.' : 'Tarefa concluída.')
    setConcluindo(null)
    await carregar()
  }

  async function criarTarefaManual(t: Tarefa) {
    setSalvando(true)
    setErro(null)
    if (!novoTitulo || !novoPrazo) {
      setErro('Informe o título e a data.')
      setSalvando(false)
      return
    }
    const { error } = await supabase.rpc('create_task', {
      p_entity_type: t.entity_type,
      p_entity_id: t.entity_id,
      p_title: novoTitulo,
      p_due_at: new Date(novoPrazo).toISOString(),
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setAviso('Tarefa criada.')
    setCriando(false)
    setNovoTitulo('')
    setNovoPrazo('')
    await carregar()
  }

  if (!clinica) {
    return <p className="text-sm text-[#6B6560]">Nenhuma clínica disponível para este usuário.</p>
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Minha fila do dia</h1>
          <p className="text-xs text-[#6B6560]">
            {atrasadas.length} atrasada(s) · {deHoje.length} para hoje
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          disabled={carregando}
          className="rounded-lg border border-[#F1E5C8] px-3 py-1.5 text-xs font-semibold text-[#2D2A26] disabled:opacity-50"
        >
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#D93025]"
        >
          {erro}
        </div>
      )}
      {aviso && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-[#1E8E3E]"
        >
          {aviso}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* COLUNA 1: tarefas */}
        <div className="space-y-3">
          {!carregando && tarefas.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#F1E5C8] bg-white p-8 text-center">
              <p className="text-sm font-medium text-[#2D2A26]">Nada para hoje</p>
              <p className="mt-1 text-xs text-[#6B6560]">
                As tarefas aparecem aqui quando uma oportunidade é criada ou alguém agenda uma ação.
              </p>
            </div>
          )}

          {atrasadas.length > 0 && (
            <section aria-label="Tarefas atrasadas">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#D93025]">
                Atrasadas ({atrasadas.length})
              </h2>
              <ul className="space-y-2">
                {atrasadas.map((t) => (
                  <CartaoTarefa
                    key={t.id}
                    t={t}
                    onConcluir={() => abrirConclusao(t)}
                    onTimeline={() => void abrirTimeline(t)}
                    onNova={() => {
                      setCriando(true)
                      setNovoTitulo('')
                      setNovoPrazo('')
                      setConcluindo(null)
                      setContatoSel(t.contato)
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {deHoje.length > 0 && (
            <section aria-label="Tarefas de hoje">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6B6560]">
                Para hoje ({deHoje.length})
              </h2>
              <ul className="space-y-2">
                {deHoje.map((t) => (
                  <CartaoTarefa
                    key={t.id}
                    t={t}
                    onConcluir={() => abrirConclusao(t)}
                    onTimeline={() => void abrirTimeline(t)}
                    onNova={() => {
                      setCriando(true)
                      setNovoTitulo('')
                      setNovoPrazo('')
                      setConcluindo(null)
                      setContatoSel(t.contato)
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* formulário de nova tarefa */}
          {criando && tarefas[0] && (
            <div className="rounded-lg border border-[#D4AF37] bg-[#FFF8ED] p-3">
              <h3 className="mb-2 text-xs font-bold text-[#2D2A26]">Nova tarefa</h3>
              <input
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                placeholder="O que precisa ser feito"
                className="mb-2 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-xs"
              />
              <input
                type="datetime-local"
                value={novoPrazo}
                onChange={(e) => setNovoPrazo(e.target.value)}
                className="mb-2 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-xs"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => void criarTarefaManual(tarefas[0])}
                  disabled={salvando}
                  className="rounded-lg bg-[#B8960E] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  onClick={() => setCriando(false)}
                  className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[11px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COLUNA 2: linha do tempo */}
        <div className="rounded-xl border border-[#F1E5C8] bg-white p-3">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6B6560]">
            Linha do tempo {contatoSel ? `· ${contatoSel}` : ''}
          </h2>
          {!contatoSel && (
            <p className="text-xs text-[#6B6560]">
              Clique em “Linha do tempo” numa tarefa para ver o histórico do contato.
            </p>
          )}
          {contatoSel && eventos.length === 0 && (
            <p className="text-xs text-[#6B6560]">Sem eventos registrados para este contato.</p>
          )}
          <ol className="max-h-[70vh] space-y-2 overflow-y-auto">
            {eventos.map((e, i) => {
              const rot = ROTULO_ORIGEM[e.origem] ?? {
                texto: e.origem,
                cor: 'bg-gray-100 text-gray-700',
              }
              return (
                <li
                  key={`${e.quando}-${i}`}
                  className="rounded-lg border border-[#F7F0E1] bg-[#FFFDF9] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${rot.cor}`}>
                      {rot.texto}
                    </span>
                    <span className="text-[10px] text-[#6B6560]">{quandoLegivel(e.quando)}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#2D2A26]">{e.titulo}</p>
                  {e.detalhe && <p className="text-[10px] text-[#6B6560]">{e.detalhe}</p>}
                  {e.autor && <p className="text-[10px] text-[#B8B0A6]">{e.autor}</p>}
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* diálogo de conclusão */}
      {concluindo && (
        <div
          role="dialog"
          aria-label="Concluir tarefa"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConcluindo(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-serif text-lg font-bold text-[#2D2A26]">Concluir tarefa</h2>
            <p className="mb-3 text-xs text-[#6B6560]">{concluindo.title}</p>

            <label className="block text-[11px] font-medium text-[#6B6560]">
              O que aconteceu
              <input
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                placeholder="ex.: liguei, confirmou horário"
                className="mt-1 mb-3 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-xs text-[#2D2A26]"
              />
            </label>

            <div className="rounded-lg border border-[#D4AF37] bg-[#FFF8ED] p-2">
              <p className="mb-2 text-[11px] font-semibold text-[#2D2A26]">
                Se esta for a última tarefa do caso, a próxima ação é obrigatória
              </p>
              <input
                value={proximaTitulo}
                onChange={(e) => setProximaTitulo(e.target.value)}
                placeholder="Próxima ação (ex.: enviar proposta)"
                className="mb-2 block w-full rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-xs"
              />
              <input
                type="datetime-local"
                value={proximaQuando}
                onChange={(e) => setProximaQuando(e.target.value)}
                className="block w-full rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-xs"
              />
            </div>

            <div className="mt-3 flex gap-1">
              <button
                onClick={() => void confirmarConclusao(true)}
                disabled={salvando}
                className="rounded-lg bg-[#B8960E] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : 'Concluir e agendar próxima'}
              </button>
              <button
                onClick={() => void confirmarConclusao(false)}
                disabled={salvando}
                className="rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-[11px] text-[#6B6560] disabled:opacity-50"
              >
                Só concluir
              </button>
              <button
                onClick={() => setConcluindo(null)}
                className="rounded-lg border border-[#F1E5C8] px-2 py-1.5 text-[11px] text-[#6B6560]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CartaoTarefa({
  t,
  onConcluir,
  onTimeline,
  onNova,
}: {
  t: Tarefa
  onConcluir: () => void
  onTimeline: () => void
  onNova: () => void
}) {
  return (
    <li
      className={`rounded-lg border bg-white p-3 ${
        t.atrasada ? 'border-[#D93025]' : 'border-[#F1E5C8]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[#2D2A26]">{t.title}</p>
          <p className="truncate text-[10px] text-[#6B6560]">{t.contato ?? 'sem contato'}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            t.atrasada ? 'bg-red-100 text-[#D93025]' : 'bg-[#FFF8ED] text-[#B8960E]'
          }`}
        >
          {distancia(t.due_at)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[#6B6560]">
        <span className="rounded bg-[#F1E5C8] px-1 py-0.5">{ROTULO_TIPO[t.kind] ?? t.kind}</span>
        {t.is_automatic && (
          <span className="rounded bg-[#FFF8ED] px-1 py-0.5 text-[#B8960E]">automática</span>
        )}
        <span>· vence {quandoLegivel(t.due_at)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          onClick={onConcluir}
          className="rounded-lg bg-[#B8960E] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#8f7409]"
        >
          Concluir
        </button>
        <button
          onClick={onTimeline}
          className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[10px] text-[#2D2A26]"
        >
          Linha do tempo
        </button>
        <button
          onClick={onNova}
          className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[10px] text-[#6B6560]"
        >
          Nova tarefa
        </button>
        {t.entity_type === 'opportunity' && (
          <Link
            to="/funil"
            className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[10px] text-[#B8960E]"
          >
            Ver no funil
          </Link>
        )}
        {t.entity_type === 'conversation' && (
          <Link
            to={`/atendimento/${t.entity_id}`}
            className="rounded-lg border border-[#F1E5C8] px-2 py-1 text-[10px] text-[#B8960E]"
          >
            Abrir conversa
          </Link>
        )}
      </div>
    </li>
  )
}
