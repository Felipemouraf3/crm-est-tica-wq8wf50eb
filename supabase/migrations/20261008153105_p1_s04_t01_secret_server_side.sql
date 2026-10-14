-- =====================================================================
-- P1-S04-T01 — Gravação server-side de segredos e referência opaca
-- SPEC: P1-S04-admin-secrets-config · Critério: CA-P1-S04-01
-- "Salvar segredo retorna somente estado/sufixo mascarado seguro;
--  inspeção de rede não revela valor."
-- Data: 2026-10-08 · Autorizada por Felipe ("implementar a proxima task")
-- Nota: rotinas internas do schema vault pertencem ao postgres; o REVOKE
-- cobre apenas tabelas (rotinas já inacessíveis ao authenticated).
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'vault'
      AND p.proname IN ('create_secret','decrypted_secret','secret_id_by_name')
  ) THEN
    RAISE EXCEPTION 'supabase_vault indisponível: extensão/rotinas ausentes';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='vault' AND grantee='authenticated'
  ) THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM anon, authenticated';
  END IF;
END $$;

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

  INSERT INTO public.integration_connections
    (organization_id, clinic_id, provider, connection_key, secret_ref,
     config_sanitized, health_status)
  VALUES
    (v_org, v_clinic, btrim(p_provider), btrim(p_connection_key), v_secret_ref,
     coalesce(p_config_sanitized, '{}'::jsonb), 'unknown')
  ON CONFLICT (organization_id, clinic_id, provider, connection_key)
  DO UPDATE SET
    secret_ref = EXCLUDED.secret_ref,
    config_sanitized = EXCLUDED.config_sanitized,
    health_status = 'unknown',
    last_tested_at = NULL,
    updated_at = now()
  RETURNING
    public.integration_connections.id,
    public.integration_connections.secret_ref,
    public.integration_connections.health_status,
    (public.integration_connections.created_at = public.integration_connections.updated_at),
    public.integration_connections.updated_at
  INTO v_conn_id, v_secret_ref, v_health_status_dummy, v_is_new, v_updated;

  RETURN QUERY
  SELECT v_conn_id, v_secret_ref, '●●●●' || right(p_secret, 4),
         v_health_status_dummy, v_is_new, v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_connection_status(
  p_clinic_id uuid,
  p_provider text,
  p_connection_key text
) RETURNS TABLE (
  connection_id uuid,
  secret_ref text,
  secret_hint text,
  health_status text,
  last_tested_at timestamptz,
  updated_at timestamptz
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
  SELECT ic.id, ic.secret_ref, '●●●●',
         ic.health_status, ic.last_tested_at, ic.updated_at
  FROM public.integration_connections ic
  WHERE ic.organization_id = v_org
    AND (p_clinic_id IS NULL OR ic.clinic_id = p_clinic_id)
    AND ic.provider = btrim(p_provider)
    AND ic.connection_key = btrim(p_connection_key);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_integration_secret(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_connection_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_integration_secret(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_connection_status(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_save_integration_secret') THEN
    RAISE EXCEPTION 'RPC admin_save_integration_secret não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_get_connection_status') THEN
    RAISE EXCEPTION 'RPC admin_get_connection_status não criada';
  END IF;
END $$;
