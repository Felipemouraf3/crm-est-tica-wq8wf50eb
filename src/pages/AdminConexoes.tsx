// src/pages/AdminConexoes.tsx — P2-S02-T03
// Cartão "Clínica Experts" em /admin/conexoes: situação (saudável / com erro /
// não configurada), último teste, limite restante, "Testar conexão" (leitura
// GET /rooms?per_page=1 via RPC admin_test_connection) e "Trocar token"
// (RPC admin_save_integration_secret — o valor nunca volta para a tela).
// 2026-10-24: a RPC admin_test_connection grava/devolve health_status 'ok'
// (não 'healthy') — tela aceita ambos, senão o teste saudável aparece como erro.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plug, RefreshCw, KeyRound } from 'lucide-react'

type Conexao = {
  id: string
  health_status: string
  last_tested_at: string | null
  secret_hint: string | null
}

const PROVIDER = 'clinica_experts'
const CONNECTION_KEY = 'api_token'

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

  const saudavelCartao = conexao?.health_status === 'healthy' || conexao?.health_status === 'ok'
  const situacao =
    !conexao || conexao.health_status === 'not_configured'
      ? { rotulo: 'Não configurada', cor: 'bg-gray-100 text-gray-700' }
      : saudavelCartao
        ? { rotulo: 'Saudável', cor: 'bg-green-100 text-green-800' }
        : { rotulo: 'Com erro', cor: 'bg-red-100 text-red-800' }

  return (
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
  )
}
