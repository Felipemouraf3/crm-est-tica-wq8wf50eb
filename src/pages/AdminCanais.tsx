// src/pages/AdminCanais.tsx — P2-S03-T01 (+ edição na T02c, 27/10)
// Tela /admin/canais: lista de números, cadastro Meta/Z-API, edição, teste de
// conexão, pausar/reativar/desativar. Segredos NUNCA reaparecem — o
// verify_token/URL do webhook é mostrado uma única vez (SPEC).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  MessageSquare,
  Plus,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  ShieldOff,
  Pencil,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'

type Canal = Database['public']['Tables']['channel_accounts']['Row']

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  draft: { texto: 'Rascunho', cor: 'bg-gray-100 text-gray-700' },
  active: { texto: 'Ativo', cor: 'bg-green-100 text-green-800' },
  paused: { texto: 'Pausado', cor: 'bg-amber-100 text-amber-800' },
  disconnected: { texto: 'Desconectado', cor: 'bg-red-100 text-red-800' },
  disabled: { texto: 'Desativado', cor: 'bg-gray-100 text-gray-500' },
}

function dataRelativa(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminCanais() {
  const { toast } = useToast()
  const [clinicaId, setClinicaId] = useState<string | null>(null)
  const [clinicaNome, setClinicaNome] = useState('')
  const [canais, setCanais] = useState<Canal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [dialogo, setDialogo] = useState(false)
  const [provider, setProvider] = useState<'meta_cloud' | 'z_api'>('meta_cloud')
  const [phone, setPhone] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [externalId, setExternalId] = useState('') // phone_number_id | instanceId
  const [businessId, setBusinessId] = useState('') // só Meta
  const [token, setToken] = useState('') // token de acesso (Meta) ou da instância (Z-API)
  const [segundoSegredo, setSegundoSegredo] = useState('') // app_secret (Meta) | Client-Token (Z-API)
  const [salvando, setSalvando] = useState(false)
  const [segredoUnico, setSegredoUnico] = useState<{ titulo: string; valor: string } | null>(null)
  const [testando, setTestando] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Edição (T02c): mesmo diálogo; segredos em branco = manter o atual.
  const [editando, setEditando] = useState<Canal | null>(null)

  async function carregar(clinic: string, vivo = true) {
    const { data } = await supabase
      .from('channel_accounts')
      .select('*')
      .eq('clinic_id', clinic)
      .order('created_at', { ascending: false })
    if (!vivo) return
    setCanais((data ?? []) as Canal[])
    setCarregando(false)
  }

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
      if (!escolhida) {
        setCarregando(false)
        return
      }
      setClinicaId(escolhida.id)
      setClinicaNome(escolhida.name)
      await carregar(escolhida.id, vivo)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function limparFormulario() {
    setPhone('')
    setDisplayName('')
    setExternalId('')
    setBusinessId('')
    setToken('')
    setSegundoSegredo('')
  }

  function abrirNovo() {
    setEditando(null)
    setProvider('meta_cloud')
    limparFormulario()
    setDialogo(true)
  }

  function abrirEdicao(c: Canal) {
    setEditando(c)
    setProvider(c.provider === 'z_api' ? 'z_api' : 'meta_cloud')
    setPhone(c.phone_e164 ?? '')
    setDisplayName(c.display_name ?? '')
    setExternalId(c.external_account_id ?? '')
    setBusinessId(c.external_business_id ?? '')
    // Segredos nunca voltam da API: em branco significa "manter o atual".
    setToken('')
    setSegundoSegredo('')
    setDialogo(true)
  }

  function fecharDialogo() {
    setDialogo(false)
    setEditando(null)
    limparFormulario()
  }

  async function salvarCanal() {
    if (!clinicaId || !phone.trim() || !externalId.trim()) {
      toast({ title: 'Preencha número e ID externo', variant: 'destructive' })
      return
    }
    if (!editando && !token.trim()) {
      toast({ title: 'Informe o token do canal', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const { data, error } = await supabase.rpc('admin_save_channel_account', {
        p_clinic_id: clinicaId,
        p_provider: provider,
        p_phone: phone.trim(),
        p_display_name: displayName.trim() || null,
        p_external_account_id: externalId.trim(),
        p_external_business_id: provider === 'meta_cloud' ? businessId.trim() || null : null,
        // Em branco na edição = manter o segredo atual (a API nunca devolve).
        p_token: token.trim() || null,
        p_second_secret: segundoSegredo.trim() || null,
      })
      if (error) throw error
      const r = data?.[0]
      // Mostra UMA ÚNICA VEZ o segredo do webhook (SPEC).
      setSegredoUnico({
        titulo:
          provider === 'meta_cloud'
            ? 'Verify token da Meta (cole no painel da Meta agora)'
            : 'Segredo do webhook Z-API (use na URL configurada na Z-API)',
        valor: String(r?.webhook_secret_once ?? ''),
      })
      fecharDialogo()
      toast({ title: r?.created ? 'Canal criado' : 'Canal atualizado' })
      await carregar(clinicaId)
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function testarCanal(c: Canal) {
    setTestando(c.id)
    try {
      const { data, error } = await supabase.rpc('admin_test_channel', {
        p_channel_account_id: c.id,
      })
      if (error) throw error
      const r = data?.[0]
      const saudavel = r?.health_status === 'healthy'
      toast({
        title: saudavel ? 'Conexão saudável' : 'Conexão com erro',
        description: String((r?.diagnostico as Record<string, unknown> | null)?.mensagem ?? ''),
        variant: saudavel ? 'default' : 'destructive',
      })
    } catch (e) {
      toast({ title: 'Falha no teste', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setTestando(null)
    }
  }

  async function mudarStatus(c: Canal, novo: 'paused' | 'active' | 'disabled') {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_set_channel_status', {
        p_channel_account_id: c.id,
        p_status: novo,
      })
      if (error) throw error
      await carregar(clinicaId!)
    } catch (e) {
      toast({ title: 'Falha na ação', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold text-[#2D2A26]">Canais WhatsApp</h1>
          <p className="text-xs text-[#6B6560]">
            Clínica: <strong>{clinicaNome || '…'}</strong>
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo} disabled={!clinicaId}>
          <Plus className="mr-1 h-4 w-4" /> Novo número
        </Button>
      </div>

      {carregando ? (
        <p className="text-sm text-[#6B6560]">Carregando…</p>
      ) : canais.length === 0 ? (
        <p className="text-sm text-[#6B6560]">
          Nenhum número cadastrado nesta clínica. Clique em “Novo número”.
        </p>
      ) : (
        <div className="space-y-3">
          {canais.map((c) => {
            const st = ROTULO_STATUS[c.status] ?? ROTULO_STATUS.draft
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-serif">
                    <MessageSquare className="h-4 w-4 text-[#B8960E]" />
                    {c.phone_e164}
                    {c.display_name && (
                      <span className="text-xs font-normal text-[#6B6560]">({c.display_name})</span>
                    )}
                  </CardTitle>
                  <Badge className={st.cor}>{st.texto}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-[#6B6560]">
                    {c.provider === 'meta_cloud' ? 'Meta Cloud API' : 'Z-API'} · ID externo:{' '}
                    <span className="font-mono">{c.external_account_id}</span>
                  </p>
                  <p className="mt-1 text-xs text-[#6B6560]">
                    Última entrada: {dataRelativa(c.last_inbound_at)} · Última saída:{' '}
                    {dataRelativa(c.last_outbound_at)}
                    {c.last_error_code && (
                      <>
                        {' '}
                        · <span className="text-[#D93025]">Erro: {c.last_error_code}</span>
                      </>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirEdicao(c)}
                      disabled={busy}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testarCanal(c)}
                      disabled={testando === c.id}
                    >
                      <RefreshCw
                        className={`mr-1 h-3.5 w-3.5 ${testando === c.id ? 'animate-spin' : ''}`}
                      />
                      {testando === c.id ? 'Testando…' : 'Testar conexão'}
                    </Button>
                    {c.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => mudarStatus(c, 'paused')}
                      >
                        <PauseCircle className="mr-1 h-3.5 w-3.5" /> Pausar
                      </Button>
                    )}
                    {c.status === 'paused' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => mudarStatus(c, 'active')}
                      >
                        <PlayCircle className="mr-1 h-3.5 w-3.5" /> Reativar
                      </Button>
                    )}
                    {c.status !== 'disabled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => mudarStatus(c, 'disabled')}
                      >
                        <ShieldOff className="mr-1 h-3.5 w-3.5" /> Desativar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* cadastro / edição */}
      <Dialog open={dialogo} onOpenChange={(v) => (v ? setDialogo(true) : fecharDialogo())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {/* autoComplete=off no form + nomes irregulares nos segredos: impede o
              navegador de injetar e-mail/senha salvos nos campos de segredo
              (aconteceu em 27/10: o gerenciador preencheu o campo do token). */}
          <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>
                {editando ? 'Editar número de WhatsApp' : 'Novo número de WhatsApp'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              {(['meta_cloud', 'z_api'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => !editando && setProvider(p)}
                  disabled={!!editando && provider !== p}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                    provider === p
                      ? 'border-[#D4AF37] bg-[#FFF8ED] text-[#B8960E]'
                      : 'border-[#F1E5C8] text-[#6B6560]'
                  }`}
                >
                  {p === 'meta_cloud' ? 'Meta Cloud API' : 'Z-API'}
                </button>
              ))}
            </div>
            {editando && (
              <p className="text-xs text-[#6B6560]">
                Editando{' '}
                <strong>{editando.provider === 'meta_cloud' ? 'Meta Cloud API' : 'Z-API'}</strong> ·
                ID externo <strong>{editando.external_account_id}</strong>. O ID externo não pode
                ser alterado — para trocar, crie um canal novo.
              </p>
            )}
            <label className="text-xs font-semibold">Número (qualquer formato)</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(81) 99999-0001"
            />
            <label className="text-xs font-semibold">Nome exibido (opcional)</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="PS Caruaru — WhatsApp"
            />
            <label className="text-xs font-semibold">
              {provider === 'meta_cloud' ? 'Phone Number ID (Meta)' : 'Instance ID (Z-API)'}
            </label>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              disabled={!!editando}
            />
            {provider === 'meta_cloud' && (
              <>
                <label className="text-xs font-semibold">
                  ID da conta comercial (WABA, opcional)
                </label>
                <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
              </>
            )}
            <label className="text-xs font-semibold">
              {provider === 'meta_cloud' ? 'Token de acesso permanente' : 'Token da instância'}
            </label>
            <Input
              type="password"
              name="ps-canal-token-x7"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              placeholder={editando ? 'deixe em branco para manter o atual' : ''}
            />
            <label className="text-xs font-semibold">
              {provider === 'meta_cloud' ? 'App Secret (Meta)' : 'Client-Token (Z-API)'}
            </label>
            <Input
              type="password"
              name="ps-canal-appsecret-x7"
              value={segundoSegredo}
              onChange={(e) => setSegundoSegredo(e.target.value)}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              placeholder={editando ? 'deixe em branco para manter o atual' : ''}
            />
            <p className="text-xs text-[#6B6560]">
              Os segredos vão direto para o cofre (Vault) e nunca voltam a ser exibidos.
              {editando &&
                ' Ao editar, deixe um campo de segredo em branco para manter o valor atual.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={fecharDialogo}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarCanal} disabled={salvando}>
                {salvando ? 'Gravando…' : 'Gravar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* segredo mostrado UMA vez */}
      <Dialog open={!!segredoUnico} onOpenChange={(v) => !v && setSegredoUnico(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{segredoUnico?.titulo}</DialogTitle>
          </DialogHeader>
          <p className="rounded bg-[#FFF8ED] p-3 font-mono text-xs break-all">
            {segredoUnico?.valor}
          </p>
          <p className="text-xs text-[#D93025]">
            Copie agora — este valor não será mostrado novamente.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => navigator.clipboard?.writeText(segredoUnico?.valor ?? '')}
            >
              Copiar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSegredoUnico(null)}>
              Fechei — guardei
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
