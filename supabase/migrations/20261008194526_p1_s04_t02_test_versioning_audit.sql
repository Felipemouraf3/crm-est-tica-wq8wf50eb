-- =====================================================================
-- P1-S04-T02 — Formulário de conexão, teste sanitizado, versionamento
--              e audit log
-- SPEC: P1-S04-admin-secrets-config · Critério: CA-P1-S04-02
-- "Teste retorna diagnóstico sanitizado e registra status/horário."
-- Data: 2026-10-08 · Autorizada por Felipe ("sim" após aceite de T01)
-- ---------------------------------------------------------------------
-- Estratégia (mínima, aditiva e idempotente):
--   1. config_versions: versões IMUTÁVEIS da configuração (sem update/delete);
--      cada gravação de segredo/config publica a versão seguinte.
--   2. config_audit_logs: trilha de auditoria (ação, ator, detalhes sanitizados).
--   3. RPC admin_test_connection: teste NÃO destrutivo (leitura do Vault),
--      diagnóstico sanitizado, atualiza health_status/last_tested_at e audita.
--   4. RPC admin_rollback_config: restaura versão anterior sem apagar auditoria.
--   5. RPC admin_list_config_versions: lista versões para a UI.
--   6. admin_save_integration_secret v2: publica versão + audita a gravação.
--   7. RLS: leitura por membro da organização; escrita só via RPC (definer).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabelas novas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  clinic_id uuid,
  version integer NOT NULL,
  config_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, version)
);

CREATE TABLE IF NOT EXISTS public.config_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid,
  connection_id uuid,
  action text NOT NULL,
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_config_versions_select ON public.config_versions;
CREATE POLICY rls_config_versions_select ON public.config_versions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rls_config_audit_logs_select ON public.config_audit_logs;
CREATE POLICY rls_config_audit_logs_select ON public.config_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- 2) admin_save_integration_secret v2 — publica versão + audita
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_integration_secret(
  p_clinic_id uuid,
  p_provider text,
  p_connection_key text,
  p_secret text,
  p_config_sanitized jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  connection_id uuid,
  secret_ref text,
  secret_hint text,
  health_status text,
  created boolean,
  version integer,
  updated_at timestamptz
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
  v_secret_uuid uuid;
  v_secret_ref text;
  v_is_new boolean;
  v_conn_id uuid;
  v_updated timestamptz;
  v_health_status_dummy text;
  v_version integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'autenticação obrigatória' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR btrim(p_provider) = '' OR length(p_provider) > 64
     OR p_connection_key IS NULL OR btrim(p_connection_key) = '' OR length(p_connection_key) > 64
     OR p_secret IS NULL OR length(p_secret) = 0 OR length(p_secret) > 8192 THEN
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

  v_secret_uuid := vault.create_secret(p_secret);
  v_secret_ref := 'vault:' || v_secret_uuid::text;

  -- UPSERT manual (índices parciais do T04 não satisfazem ON CONFLICT)
  SELECT id INTO v_conn_id
  FROM public.integration_connections
  WHERE organization_id = v_org
    AND clinic_id IS NOT DISTINCT FROM v_clinic
    AND provider = btrim(p_provider)
    AND connection_key = btrim(p_connection_key);

  IF v_conn_id IS NOT NULL THEN
    UPDATE public.integration_connections
    SET secret_ref = v_secret_ref,
        config_sanitized = coalesce(p_config_sanitized, '{}'::jsonb),
        health_status = 'unknown',
        last_tested_at = NULL,
        updated_at = now()
    WHERE id = v_conn_id
    RETURNING integration_connections.updated_at INTO v_updated;
    v_is_new := false;
  ELSE
    INSERT INTO public.integration_connections
      (organization_id, clinic_id, provider, connection_key, secret_ref,
       config_sanitized, health_status)
    VALUES
      (v_org, v_clinic, btrim(p_provider), btrim(p_connection_key), v_secret_ref,
       coalesce(p_config_sanitized, '{}'::jsonb), 'unknown')
    RETURNING id, integration_connections.health_status, integration_connections.updated_at
    INTO v_conn_id, v_health_status_dummy, v_updated;
    v_is_new := true;
  END IF;

  -- publicação gera versão IMUTÁVEL (RN-P1-S04-01)
  SELECT coalesce(max(cv.version), 0) + 1 INTO v_version
  FROM public.config_versions cv
  WHERE cv.connection_id = v_conn_id;

  INSERT INTO public.config_versions
    (connection_id, organization_id, clinic_id, version, config_sanitized,
     secret_ref, published_by)
  VALUES
    (v_conn_id, v_org, v_clinic, v_version,
     coalesce(p_config_sanitized, '{}'::jsonb), v_secret_ref, v_user);

  -- auditoria da gravação (sem valor do segredo)
  INSERT INTO public.config_audit_logs
    (organization_id, clinic_id, connection_id, action, actor_id, details)
  VALUES
    (v_org, v_clinic, v_conn_id,
     CASE WHEN v_is_new THEN 'save_secret' ELSE 'rotate_secret' END,
     v_user,
     jsonb_build_object('provider', btrim(p_provider),
                        'connection_key', btrim(p_connection_key),
                        'version', v_version));

  RETURN QUERY
  SELECT v_conn_id, v_secret_ref, '●●●●' || right(p_secret, 4),
         v_health_status_dummy, v_is_new, v_version, v_updated;
END;
$$;

-- ---------------------------------------------------------------------
-- 3) RPC: teste sanitizado (não destrutivo) — CA-P1-S04-02
-- ---------------------------------------------------------------------
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

  -- teste NÃO destrutivo: verifica se o segredo referenciado existe no Vault
  v_t0 := clock_timestamp();
  v_ok := v_conn.secret_ref LIKE 'vault:%'
    AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.id = substring(v_conn.secret_ref from 7)::uuid);
  v_t1 := clock_timestamp();

  IF v_ok THEN
    v_status := 'ok';
    v_msg := 'Segredo localizado no cofre; teste de leitura concluído sem alterações.';
  ELSE
    v_status := 'falha';
    v_msg := 'Referência de segredo inválida ou ausente no cofre.';
  END IF;

  UPDATE public.integration_connections
  SET health_status = v_status,
      last_tested_at = v_t1,
      updated_at = now()
  WHERE id = v_conn.id;

  -- auditoria do teste (sanitizada: sem valor do segredo)
  INSERT INTO public.config_audit_logs
    (organization_id, clinic_id, connection_id, action, actor_id, details)
  VALUES
    (v_org, v_clinic, v_conn.id, 'test_connection', v_user,
     jsonb_build_object('provider', v_conn.provider,
                        'connection_key', v_conn.connection_key,
                        'resultado', v_status,
                        'latencia_ms', (extract(epoch from (v_t1 - v_t0)) * 1000)::int));

  RETURN QUERY
  SELECT v_conn.id::uuid, v_status::text, v_t1,
         jsonb_build_object('status', v_status,
                            'mensagem', v_msg,
                            'provider', v_conn.provider,
                            'connection_key', v_conn.connection_key,
                            'latencia_ms', (extract(epoch from (v_t1 - v_t0)) * 1000)::int)::jsonb;
END;
$$;

-- ---------------------------------------------------------------------
-- 4) RPC: rollback para versão anterior (sem apagar auditoria)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rollback_config(
  p_connection_id uuid,
  p_version integer
) RETURNS TABLE (
  connection_id uuid,
  restored_version integer,
  health_status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conn record;
  v_ver record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'autenticação obrigatória' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'entrada inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conn FROM public.integration_connections ic
  WHERE ic.id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conexão inexistente' USING ERRCODE = '22023';
  END IF;

  -- papel: owner org-level OU owner/clinic_admin da clínica da conexão
  -- (OR direto: COALESCE(EXISTS,EXISTS) avaliou errado no PGlite)
  IF NOT (
    EXISTS (SELECT 1 FROM public.memberships m
            WHERE m.user_id = v_user AND m.organization_id = v_conn.organization_id
              AND m.clinic_id IS NULL AND m.active AND m.role = 'owner')
    OR
    EXISTS (SELECT 1 FROM public.memberships m
            WHERE m.user_id = v_user AND m.organization_id = v_conn.organization_id
              AND m.clinic_id = v_conn.clinic_id AND m.active
              AND m.role IN ('owner','clinic_admin'))
  ) THEN
    RAISE EXCEPTION 'somente owner/clinic_admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ver FROM public.config_versions cv
  WHERE cv.connection_id = p_connection_id AND cv.version = p_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'versão inexistente' USING ERRCODE = '22023';
  END IF;

  UPDATE public.integration_connections
  SET secret_ref = v_ver.secret_ref,
      config_sanitized = v_ver.config_sanitized,
      health_status = 'unknown',
      last_tested_at = NULL,
      updated_at = now()
  WHERE id = p_connection_id
  RETURNING integration_connections.updated_at INTO v_conn.updated_at;

  -- auditoria do rollback (a trilha NUNCA é apagada)
  INSERT INTO public.config_audit_logs
    (organization_id, clinic_id, connection_id, action, actor_id, details)
  VALUES
    (v_conn.organization_id, v_conn.clinic_id, p_connection_id, 'rollback_config',
     v_user, jsonb_build_object('restaurada_para', p_version));

  RETURN QUERY
  SELECT p_connection_id, p_version, 'unknown'::text, v_conn.updated_at;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC: listar versões (UI)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_config_versions(
  p_clinic_id uuid,
  p_provider text,
  p_connection_key text
) RETURNS TABLE (
  version integer,
  config_sanitized jsonb,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'autenticação obrigatória' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_org FROM public.clinics c WHERE c.id = p_clinic_id;
    SELECT m.role INTO v_role FROM public.memberships m
    WHERE m.user_id = v_user AND m.organization_id = v_org
      AND m.clinic_id = p_clinic_id AND m.active
      AND m.role IN ('owner','clinic_admin')
    LIMIT 1;
    IF v_role IS NULL THEN
      SELECT 'owner' INTO v_role FROM public.memberships m
      WHERE m.user_id = v_user AND m.organization_id = v_org
        AND m.clinic_id IS NULL AND m.active AND m.role = 'owner'
      LIMIT 1;
    END IF;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'sem acesso à clínica' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT m.organization_id INTO v_org FROM public.memberships m
    WHERE m.user_id = v_user AND m.clinic_id IS NULL AND m.active AND m.role = 'owner'
    LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'somente owner da organização' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT cv.version, cv.config_sanitized, cv.published_at
  FROM public.config_versions cv
  JOIN public.integration_connections ic ON ic.id = cv.connection_id
  WHERE ic.organization_id = v_org
    AND (p_clinic_id IS NULL OR ic.clinic_id = p_clinic_id)
    AND ic.provider = btrim(p_provider)
    AND ic.connection_key = btrim(p_connection_key)
  ORDER BY cv.version DESC;
END;
$$;

-- ---------------------------------------------------------------------
-- 6) Concessões mínimas
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_save_integration_secret(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_test_connection(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rollback_config(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_config_versions(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_integration_secret(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_test_connection(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rollback_config(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_config_versions(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Replay idempotente
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_test_connection') THEN
    RAISE EXCEPTION 'RPC admin_test_connection não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_rollback_config') THEN
    RAISE EXCEPTION 'RPC admin_rollback_config não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_list_config_versions') THEN
    RAISE EXCEPTION 'RPC admin_list_config_versions não criada';
  END IF;
END $$;
