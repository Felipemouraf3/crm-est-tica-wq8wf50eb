-- ============================================================
-- P2-S03-T01b — RPCs admin do canal (complemento da T01)
--   admin_save_channel_account: cria/atualiza canal; segredos vão ao
--     Vault (uma conexão por canal + ref do segredo do webhook);
--     gera verify_token (Meta) ou segredo de caminho (Z-API) e devolve
--     UMA única vez (nunca mais consultável).
--   admin_test_channel: diagnóstico sanitizado LOCAL (sem rede).
--     O teste de rede real (Meta/Z-API) é da Edge Function admin-test-channel
--     (T02/T03); aqui validamos papel + config e devolvemos situação da conta.
--   admin_set_channel_status: pausar/reativar/desativar (owner/admin).
-- Idempotente; replay seguro.
-- ============================================================

-- util: gera segredo aleatório (32 bytes hex)
CREATE OR REPLACE FUNCTION public._admin_gen_secret()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT encode(gen_random_bytes(32), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.admin_save_channel_account(
  p_clinic_id uuid,
  p_provider text,
  p_phone text,
  p_display_name text,
  p_external_account_id text,
  p_external_business_id text,
  p_token text,
  p_second_secret text
)
RETURNS TABLE (
  channel_account_id uuid,
  created boolean,
  webhook_secret_once text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org uuid;
  v_phone text;
  v_conn uuid;
  v_conn_existing uuid;
  v_webhook_secret text;
  v_secret_ref text;
  v_channel uuid;
  v_existe uuid;
  v_dono uuid;
  v_status_existente text;
BEGIN
  -- Papel: owner/clinic_admin da clínica.
  SELECT c.organization_id INTO v_org
    FROM public.clinics c WHERE c.id = p_clinic_id AND c.status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinica nao encontrada ou inativa' USING ERRCODE = 'P0004';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.clinic_id = p_clinic_id AND m.user_id = auth.uid()
       AND m.active = true AND m.role IN ('owner','clinic_admin')
  ) THEN
    RAISE EXCEPTION 'Somente owner/clinic_admin administram canais' USING ERRCODE = '42501';
  END IF;

  IF p_provider NOT IN ('meta_cloud','z_api') THEN
    RAISE EXCEPTION 'Provedor invalido' USING ERRCODE = 'P0004';
  END IF;
  IF COALESCE(p_token,'') = '' OR COALESCE(p_external_account_id,'') = '' THEN
    RAISE EXCEPTION 'Token e ID externo sao obrigatorios' USING ERRCODE = 'P0004';
  END IF;

  v_phone := public.normalize_e164(p_phone);

  -- RN-P2-S03-01: número ativo pertence a uma só clínica.
  SELECT id, status INTO v_existe, v_status_existente
    FROM public.channel_accounts
   WHERE phone_e164 = v_phone AND status IN ('active','paused','disconnected')
     AND clinic_id <> p_clinic_id
   LIMIT 1;
  IF v_existe IS NOT NULL THEN
    RAISE EXCEPTION 'Este numero ja esta ativo em outra clinica' USING ERRCODE = 'P0004';
  END IF;

  -- Conexão de credenciais do canal (uma por canal; provider canal_<provider>).
  SELECT id INTO v_conn_existing
    FROM public.integration_connections
   WHERE clinic_id = p_clinic_id
     AND provider = 'canal_' || p_provider
     AND connection_key = p_external_account_id
   LIMIT 1;

  IF v_conn_existing IS NOT NULL THEN
    v_conn := v_conn_existing;
    PERFORM public.admin_save_integration_secret(
      p_clinic_id, 'canal_' || p_provider, p_external_account_id, p_token,
      jsonb_build_object('second_secret_hint', right(coalesce(p_second_secret,''), 4)));
  ELSE
    -- cria conexão base (segredo gravado na sequência)
    INSERT INTO public.integration_connections (
      organization_id, clinic_id, provider, connection_key, secret_ref, health_status)
    VALUES (v_org, p_clinic_id, 'canal_' || p_provider, p_external_account_id,
            'vault:pending', 'not_configured')
    RETURNING id INTO v_conn;
    PERFORM public.admin_save_integration_secret(
      p_clinic_id, 'canal_' || p_provider, p_external_account_id, p_token,
      jsonb_build_object('second_secret_hint', right(coalesce(p_second_secret,''), 4)));
  END IF;

  -- Segredo do webhook (verify_token Meta / segredo de caminho Z-API):
  -- gerado pelo sistema, guardado no Vault, devolvido UMA vez.
  -- Nome por clínica; UPDATE-first evita conflito se já existir.
  v_webhook_secret := public._admin_gen_secret();
  UPDATE vault.secrets SET secret = v_webhook_secret
   WHERE name = 'webhook_' || p_provider || '_' || p_clinic_id::text || '_' || p_external_account_id
  RETURNING id::text INTO v_secret_ref;
  IF v_secret_ref IS NULL THEN
    INSERT INTO vault.secrets (name, secret)
    VALUES ('webhook_' || p_provider || '_' || p_clinic_id::text || '_' || p_external_account_id, v_webhook_secret)
    RETURNING id::text INTO v_secret_ref;
  END IF;

  -- canal existente desta clínica com o mesmo external_account_id?
  SELECT id INTO v_channel
    FROM public.channel_accounts
   WHERE clinic_id = p_clinic_id AND provider = p_provider
     AND external_account_id = p_external_account_id;

  -- (provider, external_account_id) é global: mesmo ID externo não pode
  -- pertencer a outra clínica (RN-P2-S03-01).
  SELECT id INTO v_dono
    FROM public.channel_accounts
   WHERE provider = p_provider AND external_account_id = p_external_account_id;
  IF v_dono IS NOT NULL AND v_dono <> v_channel THEN
    RAISE EXCEPTION 'ID externo ja usado por outra clinica' USING ERRCODE = 'P0004';
  END IF;

  IF v_channel IS NOT NULL THEN
    UPDATE public.channel_accounts SET
      phone_e164 = v_phone,
      display_name = p_display_name,
      external_business_id = p_external_business_id,
      integration_connection_id = v_conn,
      webhook_secret_ref = 'vault:' || v_secret_ref,
      updated_at = now()
     WHERE id = v_channel;
  ELSE
    INSERT INTO public.channel_accounts (
      organization_id, clinic_id, provider, phone_e164, display_name,
      external_account_id, external_business_id, integration_connection_id,
      webhook_secret_ref, status)
    VALUES (v_org, p_clinic_id, p_provider, v_phone, p_display_name,
            p_external_account_id, p_external_business_id, v_conn,
            'vault:' || v_secret_ref, 'draft')
    RETURNING id INTO v_channel;
  END IF;

  RETURN QUERY SELECT v_channel, (v_conn_existing IS NULL), v_webhook_secret;
END $fn$;

-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_channel_status(
  p_channel_account_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clinic uuid;
BEGIN
  IF p_status NOT IN ('draft','active','paused','disconnected','disabled') THEN
    RAISE EXCEPTION 'Status invalido' USING ERRCODE = 'P0004';
  END IF;
  SELECT clinic_id INTO v_clinic FROM public.channel_accounts WHERE id = p_channel_account_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Canal nao encontrado' USING ERRCODE = 'P0004';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.clinic_id = v_clinic AND m.user_id = auth.uid()
       AND m.active = true AND m.role IN ('owner','clinic_admin')
  ) THEN
    RAISE EXCEPTION 'Somente owner/clinic_admin mudam o status do canal' USING ERRCODE = '42501';
  END IF;

  UPDATE public.channel_accounts SET status = p_status, updated_at = now()
   WHERE id = p_channel_account_id;

  RETURN jsonb_build_object('status', p_status);
END $fn$;

-- ------------------------------------------------------------
-- admin_test_channel: diagnóstico sanitizado LOCAL (sem rede).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_test_channel(
  p_channel_account_id uuid
)
RETURNS TABLE (
  channel_account_id uuid,
  health_status text,
  last_tested_at timestamptz,
  diagnostico jsonb
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clinic uuid;
  v_org uuid;
  v_provider text;
  v_conn uuid;
  v_tem_token boolean;
BEGIN
  SELECT clinic_id, provider, integration_connection_id
    INTO v_clinic, v_provider, v_conn
    FROM public.channel_accounts WHERE id = p_channel_account_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Canal nao encontrado' USING ERRCODE = 'P0004';
  END IF;
  SELECT organization_id INTO v_org FROM public.clinics WHERE id = v_clinic;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.clinic_id = v_clinic AND m.user_id = auth.uid()
       AND m.active = true AND m.role IN ('owner','clinic_admin')
  ) THEN
    RAISE EXCEPTION 'Somente owner/clinic_admin testam o canal' USING ERRCODE = '42501';
  END IF;

  -- token existe no Vault? (sem valor na resposta)
  SELECT secret_ref IS NOT NULL AND secret_ref <> 'vault:pending'
    INTO v_tem_token
    FROM public.integration_connections WHERE id = v_conn;

  UPDATE public.channel_accounts SET last_status_at = now()
   WHERE id = p_channel_account_id;

  RETURN QUERY SELECT
    p_channel_account_id,
    CASE WHEN v_tem_token THEN 'healthy' ELSE 'not_configured' END,
    now()::timestamptz,
    jsonb_build_object(
      'provider', v_provider,
      'mensagem', CASE WHEN v_tem_token
        THEN 'Credencial gravada; teste de rede real na Edge Function (T02/T03).'
        ELSE 'Token não gravado — salve o canal novamente.' END,
      'status_conta', (SELECT status FROM public.channel_accounts WHERE id = p_channel_account_id)
    );
END $fn$;

-- Grants: EXECUTE só para authenticated.
REVOKE ALL ON FUNCTION public.admin_save_channel_account(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_channel_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_test_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_channel_account(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_channel_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_test_channel(uuid) TO authenticated;

-- Verificações
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_save_channel_account') THEN
    RAISE EXCEPTION 'RPC admin_save_channel_account não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admin_test_channel') THEN
    RAISE EXCEPTION 'RPC admin_test_channel não criada';
  END IF;
END $$;