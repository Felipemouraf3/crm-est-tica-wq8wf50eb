-- =====================================================================
-- P1-S04-T03 — Prova de não exposição, falhas e rollback
-- SPEC: P1-S04-admin-secrets-config · Critério: CA-P1-S04-03
-- "Rollback restaura configuração anterior sem apagar auditoria."
-- Data: 2026-10-08 · Autorizada por Felipe ("implementar a proxima task")
-- ---------------------------------------------------------------------
-- admin_test_connection v2:
--   - correlation_id (id da entrada de auditoria) no diagnóstico;
--   - cofre indisponível tratado com EXCEPTION → status 'falha' com
--     mensagem sanitizada (sem falso sucesso, sem vazar stack/erro interno);
--   - referência inválida/ausente → 'falha' com mensagem clara;
--   - toda execução audita resultado + latência + flag cofre_indisponivel.
-- Assinatura de retorno inalterada (CREATE OR REPLACE direto).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_test_connection(
  p_clinic_id uuid,
  p_provider text,
  p_connection_key text
) RETURNS TABLE (
  connection_id uuid,
  health_status text,
  last_tested_at timestamptz,
  diagnostico jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
  v_clinic uuid;
  v_role text;
  v_conn record;
  v_ok boolean;
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_status text;
  v_msg text;
  v_audit_id uuid;
  v_down boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'autenticação obrigatória' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR btrim(p_provider) = ''
     OR p_connection_key IS NULL OR btrim(p_connection_key) = '' THEN
    RAISE EXCEPTION 'entrada inválida' USING ERRCODE = '22023';
  END IF;

  IF p_clinic_id IS NOT NULL THEN
    SELECT c.organization_id, c.id INTO v_org, v_clinic
    FROM public.clinics c WHERE c.id = p_clinic_id;
    IF v_clinic IS NULL THEN
      RAISE EXCEPTION 'clínica inexistente' USING ERRCODE = '22023';
    END IF;
    SELECT m.role INTO v_role FROM public.memberships m
    WHERE m.user_id = v_user AND m.organization_id = v_org
      AND m.clinic_id = v_clinic AND m.active
      AND m.role IN ('owner','clinic_admin')
    LIMIT 1;
    IF v_role IS NULL THEN
      SELECT 'owner' INTO v_role FROM public.memberships m
      WHERE m.user_id = v_user AND m.organization_id = v_org
        AND m.clinic_id IS NULL AND m.active AND m.role = 'owner'
      LIMIT 1;
    END IF;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'somente owner/clinic_admin da clínica' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT m.organization_id INTO v_org FROM public.memberships m
    WHERE m.user_id = v_user AND m.clinic_id IS NULL AND m.active AND m.role = 'owner'
    LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'somente owner da organização' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_conn
  FROM public.integration_connections ic
  WHERE ic.organization_id = v_org
    AND ic.clinic_id IS NOT DISTINCT FROM v_clinic
    AND ic.provider = btrim(p_provider)
    AND ic.connection_key = btrim(p_connection_key);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conexão inexistente' USING ERRCODE = '22023';
  END IF;

  -- teste NÃO destrutivo: existência do segredo no cofre; falha do cofre
  -- é capturada e vira diagnóstico sanitizado (nunca erro bruto ao cliente)
  v_t0 := clock_timestamp();
  BEGIN
    v_ok := v_conn.secret_ref LIKE 'vault:%'
      AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.id = substring(v_conn.secret_ref from 7)::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    v_down := true;
  END;
  v_t1 := clock_timestamp();

  IF v_ok THEN
    v_status := 'ok';
    v_msg := 'Segredo localizado no cofre; teste de leitura concluído sem alterações.';
  ELSIF v_down THEN
    v_status := 'falha';
    v_msg := 'Cofre de segredos indisponível neste momento; nenhuma alteração foi feita; tente novamente.';
  ELSE
    v_status := 'falha';
    v_msg := 'Referência de segredo inválida ou ausente no cofre.';
  END IF;

  UPDATE public.integration_connections
  SET health_status = v_status,
      last_tested_at = v_t1,
      updated_at = now()
  WHERE id = v_conn.id;

  INSERT INTO public.config_audit_logs
    (organization_id, clinic_id, connection_id, action, actor_id, details)
  VALUES
    (v_org, v_clinic, v_conn.id, 'test_connection', v_user,
     jsonb_build_object('provider', v_conn.provider,
                        'connection_key', v_conn.connection_key,
                        'resultado', v_status,
                        'cofre_indisponivel', v_down,
                        'latencia_ms', (extract(epoch from (v_t1 - v_t0)) * 1000)::int))
  RETURNING id INTO v_audit_id;

  RETURN QUERY
  SELECT v_conn.id::uuid, v_status::text, v_t1,
         jsonb_build_object('status', v_status,
                            'mensagem', v_msg,
                            'provider', v_conn.provider,
                            'connection_key', v_conn.connection_key,
                            'latencia_ms', (extract(epoch from (v_t1 - v_t0)) * 1000)::int,
                            'correlation_id', v_audit_id)::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_test_connection(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_test_connection(uuid, text, text) TO authenticated;
