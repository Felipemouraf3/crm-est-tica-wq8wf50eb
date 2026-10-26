// src/pages/AdminConexoes.tsx — P2-S02-T03 + P2-S06-T01
// Cartões de conexão em /admin/conexoes: Clínica Experts (P2-S02-T03) e
// Provedor de IA Anthropic/Claude (P2-S06-T01). Situação (saudável / com erro /
// não configurada), último teste, "Testar conexão" (RPC admin_test_connection)
// e "Gravar/Trocar token" (RPC admin_save_integration_secret — o valor nunca
// volta para a tela). A RPC grava/devolve health_status 'ok' (não 'healthy') —
// a tela aceita ambos.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plug, RefreshCw, KeyRound, Sparkles } from 'lucide-react'

type Conexao = {
  id: string
  health_status: string
  last_tested_at: string | null
  secret_hint: string | null
}

const PROVIDER = 'clinica_experts'
const CONNECTION_KEY = 'api_token'

// P2-S06-T01: provedor de IA — a triagem usa a chave só de Edge Function.
const IA_PROVIDER = 'anthropic'
const IA_CONNECTION_KEY = 'api_key'

function dataRelativa(iso: string | null): string {
  if (!iso) return 'nunca testado'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminConexoes() {
  const { toast } = useToast()
  const [clinicaId, setClinicaId] = useState<string | null>(null)
  const [clinicaNome, setClinicaNome] = useState('')
  const [conexao, setConexao] = useState<Conexao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [testando, setTestando] = useState(false)
  const [dialogo, setDialogo] = useState(false)
  const [token, setToken] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [diagnostico, setDiagnostico] = useState<string | null>(null)
  // P2-S06-T01: estado do cartão de IA
  const [iaConexao, setIaConexao] = useState<Conexao | null>(null)
  const [iaDialogo, setIaDialogo] = useState(false)
  const [iaToken, setIaToken] = useState('')
  const [iaSalvando, setIaSalvando] = useState(false)
  const [iaTestando, setIaTestando] = useState(false)

  async function carregarConexao(clinic: string, vivo = true) {
    const { data } = await supabase
      .from('integration_connections')
      .select('id, health_status, last_tested_at, config_sanitized')
      .eq('provider', PROVIDER)
      .eq('connection_key', CONNECTION_KEY)
      .eq('clinic_id', clinic)
      .maybeSingle()
    if (!vivo) return
    const hint = (data?.config_sanitized as Record<string, unknown> | null)?.secret_hint ?? null
    setConexao(
      data
        ? {
            id: data.id,
            health_status: data.health_status,
            last_tested_at: data.last_tested_at,
            secret_hint: typeof hint === 'string' ? hint : null,
          }
        : null,
    )
    setCarregando(false)
  }

  async function carregarIa(clinic: string, vivo = true) {
    const { data: ia } = await supabase
      .from('integration_connections')
      .select('id, health_status, last_tested_at, config_sanitized')
      .eq('provider', IA_PROVIDER)
      .eq('connection_key', IA_CONNECTION_KEY)
      .eq('clinic_id', clinic)
      .maybeSingle()
    if (!vivo) return
    const iaHint = (ia?.config_sanitized as Record<string, unknown> | null)?.secret_hint ?? null
    setIaConexao(
      ia
        ? {
            id: ia.id,
            health_status: ia.health_status,
            last_tested_at: ia.last_tested_at,
            secret_hint: typeof iaHint === 'string' ? iaHint : null,
          }
        : null,
    )
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // clínica ativa (mesma fonte do seletor)
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
      await carregarConexao(escolhida.id, vivo)
      await carregarIa(escolhida.id, vivo)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function testarConexao() {
    if (!clinicaId) return
    setTestando(true)
    setDiagnostico(null)
    try {
      const { data, error } = await supabase.rpc('admin_test_connection', {
        p_clinic_id: clinicaId,
        p_provider: PROVIDER,
        p_connection_key: CONNECTION_KEY,
      })
      if (error) throw error
      const r = data?.[0]
      const diag = (r?.diagnostico ?? {}) as Record<string, unknown>
      // a RPC grava/devolve 'ok' (e versões antigas 'healthy') — aceitar ambos
      const saudavel = r?.health_status === 'healthy' || r?.health_status === 'ok'
      const limite = diag?.rate_limit_remaining
      setDiagnostico(
        typeof limite === 'number' ? `Limite restante no último teste: ${limite}` : null,
      )
      toast({
        title: saudavel ? 'Conexão saudável' : 'Conexão com erro',
        description: saudavel
          ? `Testado às ${dataRelativa(r?.last_tested_at ?? null)}`
          : String(diag?.mensagem ?? 'Sem detalhes'),
        variant: saudavel ? 'default' : 'destructive',
      })
      await carregarConexao(clinicaId)
    } catch (e) {
      toast({
        title: 'Falha no teste',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setTestando(false)
    }
  }

  async function salvarToken() {
    if (!clinicaId || !token.trim()) return
    setSalvando(true)
    try {
      const { data, error } = await supabase.rpc('admin_save_integration_secret', {
        p_clinic_id: clinicaId,
        p_provider: PROVIDER,
        p_connection_key: CONNECTION_KEY,
        p_secret: token.trim(),
      })
      if (error) throw error
      const r = data?.[0]
      toast({
        title: r?.created ? 'Token gravado' : 'Token atualizado',
        description: `Versão ${r?.version ?? '?'} · dica: ${r?.secret_hint ?? ''}`,
      })
      setToken('')
      setDialogo(false)
      await carregarConexao(clinicaId)
    } catch (e) {
      toast({
        title: 'Não foi possível gravar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // P2-S06-T01: testar e gravar a chave de IA
  async function testarIa() {
    if (!clinicaId) return
    setIaTestando(true)
    try {
      const { data, error } = await supabase.rpc('admin_test_connection', {
        p_clinic_id: clinicaId,
        p_provider: IA_PROVIDER,
        p_connection_key: IA_CONNECTION_KEY,
      })
      if (error) throw error
      const r = data?.[0]
      const saudavel = r?.health_status === 'healthy' || r?.health_status === 'ok'
      toast({
        title: saudavel ? 'Chave de IA saudável' : 'Chave de IA com erro',
        description: saudavel
          ? `Testado às ${dataRelativa(r?.last_tested_at ?? null)}`
          : String((r?.diagnostico as Record<string, unknown> | null)?.mensagem ?? 'Sem detalhes'),
        variant: saudavel ? 'default' : 'destructive',
      })
      await carregarIa(clinicaId)
    } catch (e) {
      toast({ title: 'Falha no teste', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setIaTestando(false)
    }
  }

  async function salvarIa() {
    if (!clinicaId || !iaToken.trim()) return
    setIaSalvando(true)
    try {
      const { data, error } = await supabase.rpc('admin_save_integration_secret', {
        p_clinic_id: clinicaId,
        p_provider: IA_PROVIDER,
        p_connection_key: IA_CONNECTION_KEY,
        p_secret: iaToken.trim(),
      })
      if (error) throw error
      const r = data?.[0]
      toast({
        title: r?.created ? 'Chave de IA gravada' : 'Chave de IA atualizada',
        description: `Versão ${r?.version ?? '?'} · dica: ${r?.secret_hint ?? ''}`,
      })
      setIaToken('')
      setIaDialogo(false)
      await carregarIa(clinicaId)
    } catch (e) {
      toast({
        title: 'Não foi possível gravar',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setIaSalvando(false)
    }
  }

  const saudavelCartao = conexao?.health_status === 'healthy' || conexao?.health_status === 'ok'
  const situacao =
    !conexao || conexao.health_status === 'not_configured'
      ? { rotulo: 'Não configurada', cor: 'bg-gray-100 text-gray-700' }
      : saudavelCartao
        ? { rotulo: 'Saudável', cor: 'bg-green-100 text-green-800' }
        : { rotulo: 'Com erro', cor: 'bg-red-100 text-red-800' }

  const saudavelIa = iaConexao?.health_status === 'healthy' || iaConexao?.health_status === 'ok'
  const situacaoIa =
    !iaConexao || iaConexao.health_status === 'not_configured'
      ? { rotulo: 'Não configurada', cor: 'bg-gray-100 text-gray-700' }
      : saudavelIa
        ? { rotulo: 'Saudável', cor: 'bg-green-100 text-green-800' }
        : { rotulo: 'Com erro', cor: 'bg-red-100 text-red-800' }

  return (
    <div className="flex flex-wrap gap-4">
      <Card className="max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-serif">
            <Plug className="h-4 w-4 text-[#B8960E]" />
            Clínica Experts
          </CardTitle>
          <Badge className={situacao.cor}>{situacao.rotulo}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#6B6560]">
            Clínica: <strong>{clinicaNome || '…'}</strong>
          </p>
          <p className="mt-1 text-xs text-[#6B6560]">
            Último teste: {dataRelativa(conexao?.last_tested_at ?? null)}
          </p>
          {conexao?.secret_hint && (
            <p className="mt-1 text-xs text-[#6B6560]">
              Token gravado ({conexao.secret_hint}) — valor nunca é exibido.
            </p>
          )}
          {diagnostico && <p className="mt-1 text-xs text-[#6B6560]">{diagnostico}</p>}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={testarConexao}
              disabled={testando || !clinicaId}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${testando ? 'animate-spin' : ''}`} />
              {testando ? 'Testando…' : 'Testar conexão'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialogo(true)}
              disabled={!clinicaId}
            >
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              {conexao ? 'Trocar token' : 'Gravar token'}
            </Button>
          </div>
          {!conexao && !carregando && (
            <p className="mt-2 text-xs text-[#6B6560]">
              Sem token gravado — as buscas vão responder “token não configurado”.
            </p>
          )}
        </CardContent>

        <Dialog open={dialogo} onOpenChange={setDialogo}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gravar token da API Clínica Experts</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[#6B6560]">
              O valor vai direto para o cofre (Vault) e nunca volta a ser exibido. Peça o token ao
              suporte da Clínica Experts.
            </p>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="cole o token aqui"
              autoComplete="off"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogo(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarToken} disabled={salvando || !token.trim()}>
                {salvando ? 'Gravando…' : 'Gravar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      {/* P2-S06-T01: provedor de IA */}
      <Card className="max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-serif">
            <Sparkles className="h-4 w-4 text-[#B8960E]" />
            Provedor de IA (Claude)
          </CardTitle>
          <Badge className={situacaoIa.cor}>{situacaoIa.rotulo}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#6B6560]">
            Clínica: <strong>{clinicaNome || '…'}</strong>
          </p>
          <p className="mt-1 text-xs text-[#6B6560]">
            Último teste: {dataRelativa(iaConexao?.last_tested_at ?? null)}
          </p>
          {iaConexao?.secret_hint && (
            <p className="mt-1 text-xs text-[#6B6560]">
              Chave gravada ({iaConexao.secret_hint}) — valor nunca é exibido.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={testarIa}
              disabled={iaTestando || !clinicaId}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${iaTestando ? 'animate-spin' : ''}`} />
              {iaTestando ? 'Testando…' : 'Testar conexão'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIaDialogo(true)}
              disabled={!clinicaId}
            >
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              {iaConexao ? 'Trocar chave' : 'Gravar chave'}
            </Button>
          </div>
          {!iaConexao && (
            <p className="mt-2 text-xs text-[#6B6560]">
              Sem chave gravada — a triagem automática responde “IA não configurada” e tudo vai para
              humano.
            </p>
          )}
        </CardContent>

        <Dialog open={iaDialogo} onOpenChange={setIaDialogo}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gravar chave da API Anthropic (Claude)</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[#6B6560]">
              O valor vai direto para o cofre (Vault) e nunca volta a ser exibido. A chave é usada
              apenas dentro das funções de servidor.
            </p>
            <Input
              type="password"
              value={iaToken}
              onChange={(e) => setIaToken(e.target.value)}
              placeholder="cole a chave aqui (sk-ant-…)"
              autoComplete="off"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIaDialogo(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarIa} disabled={iaSalvando || !iaToken.trim()}>
                {iaSalvando ? 'Gravando…' : 'Gravar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  )
}
