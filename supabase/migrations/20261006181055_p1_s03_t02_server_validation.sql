-- P1-S03-T02 — Validação server-side: campos, herança, estados de convite e restrições de role
-- Critério: clinic_admin administra apenas a própria clínica.
-- Aditivo e idempotente.

-- ============ 1. CAMPOS: status válidos ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'clinics_status_check') THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_status_check CHECK (status IN ('active','inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'clinic_settings_status_check') THEN
    -- 'draft' = configuração incompleta permanece em rascunho (CA-P1-S03-03); só 'active' tem efeito
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_status_check CHECK (status IN ('draft','active'));
  END IF;
END $$;

-- ============ 2. ESTADOS DE CONVITE ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='memberships' AND column_name='invite_status'
  ) THEN
    ALTER TABLE public.memberships
      ADD COLUMN invite_status text NOT NULL DEFAULT 'accepted';
  END IF;
END $$;

-- backfill: vínculos de usuários que nunca confirmaram e-mail ficam 'invited'
UPDATE public.memberships m
SET invite_status = 'invited'
WHERE m.invite_status = 'accepted'
  AND EXISTS (SELECT 1 FROM auth.users u
              WHERE u.id = m.user_id AND u.email_confirmed_at IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'memberships_invite_status_check') THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_invite_status_check CHECK (invite_status IN ('invited','accepted'));
  END IF;
END $$;

-- aceitação automática: quando o e-mail do usuário é confirmado, os convites dele viram 'accepted'
CREATE OR REPLACE FUNCTION public.accept_membership_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at <> NEW.email_confirmed_at) THEN
    UPDATE public.memberships SET invite_status = 'accepted' WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS memberships_accept_invite ON auth.users;
CREATE TRIGGER memberships_accept_invite
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.accept_membership_invites();

-- RPC de convite passa a gravar o estado ('invited' em vínculo novo/reenvio; aceito permanece)
CREATE OR REPLACE FUNCTION public.admin_invite_user(p_email text, p_name text, p_clinic_roles jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_count int;
  v_rec record;
  v_existing int;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'e-mail inválido' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'nome inválido' USING ERRCODE = '22023';
  END IF;
  IF p_clinic_roles IS NULL OR jsonb_array_length(p_clinic_roles) = 0 THEN
    RAISE EXCEPTION 'informe pelo menos uma clínica/papel' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.memberships m
  WHERE m.user_id = auth.uid() AND m.active AND m.role = 'owner';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'somente owner pode convidar usuários' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, confirmation_sent_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      lower(btrim(p_email)), crypt(gen_random_uuid()::text, gen_salt('bf')),
      jsonb_build_object('provider', 'email', 'providers', to_jsonb(array['email'])),
      jsonb_build_object('name', btrim(p_name), 'invited_at', now()),
      now(), now(), encode(gen_random_bytes(32), 'hex'), now()
    )
    RETURNING id INTO v_user_id;
  END IF;

  INSERT INTO public.profiles (id, name)
  VALUES (v_user_id, btrim(p_name))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

  FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_clinic_roles) AS x(clinic_id uuid, role text)
  LOOP
    SELECT c.organization_id INTO v_org_id
    FROM public.clinics c WHERE c.id = v_rec.clinic_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'clínica inexistente: %', v_rec.clinic_id USING ERRCODE = '23503';
    END IF;
    IF v_rec.role IS NULL OR btrim(v_rec.role) = '' OR v_rec.role NOT IN
       ('owner','clinic_admin','manager','sales','reception','post_sales','viewer') THEN
      RAISE EXCEPTION 'papel inválido: %', v_rec.role USING ERRCODE = '22023';
    END IF;

    -- reenvio reativa o vínculo existente; não duplica; aceito não regride para invited
    UPDATE public.memberships
    SET active = true, updated_at = now(),
        invite_status = CASE WHEN public.memberships.invite_status = 'accepted'
                             THEN 'accepted' ELSE 'invited' END
    WHERE user_id = v_user_id AND organization_id = v_org_id
      AND clinic_id = v_rec.clinic_id AND role = v_rec.role
    RETURNING 1 INTO v_existing;

    IF v_existing IS NULL THEN
      INSERT INTO public.memberships (user_id, organization_id, clinic_id, role, active, invite_status)
      VALUES (v_user_id, v_org_id, v_rec.clinic_id, v_rec.role, true, 'invited');
    END IF;
  END LOOP;

  RETURN v_user_id;
END;
$function$;

-- ============ 3. HERANÇA: valor efetivo e origem visíveis ============
-- Exceção da clínica (inherits_org=false) devolve o valor da clínica, origem 'clinic'.
-- Herdando (inherits_org=true) devolve origem 'organization' (valor org ainda não definido
-- no schema atual — retorna NULL até existir fonte org-level).
-- Configuração em 'draft' NUNCA tem efeito (rascunho permanece rascunho).
-- Somente membro ativo da clínica consulta.
CREATE OR REPLACE FUNCTION public.effective_clinic_setting(p_clinic uuid, p_key text)
RETURNS TABLE (value_json jsonb, origin text, setting_version int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE WHEN cs.inherits_org THEN NULL::jsonb ELSE cs.value_json END AS value_json,
         CASE WHEN cs.inherits_org THEN 'organization' ELSE 'clinic' END AS origin,
         cs.version AS setting_version
  FROM public.clinic_settings cs
  JOIN public.clinics c ON c.id = cs.clinic_id
  WHERE cs.clinic_id = p_clinic
    AND cs.setting_key = p_key
    AND cs.status = 'active'
    AND is_active_member(c.organization_id, c.id)
  ORDER BY cs.version DESC
  LIMIT 1
$fn$;

-- ============ 4. RESTRIÇÃO DE ROLE: administração além da própria clínica é do owner ============
CREATE OR REPLACE FUNCTION public.is_org_owner(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid() AND m.active
      AND m.organization_id = p_org AND m.role = 'owner');
$fn$;

-- criar clínica nova: só owner (refina o INSERT org-level da S02-T02 conforme critério da S03-T02)
DROP POLICY IF EXISTS rls_clinics_insert ON public.clinics;
CREATE POLICY rls_clinics_insert ON public.clinics
  FOR INSERT TO authenticated
  WITH CHECK (is_org_owner(organization_id));

-- editar a organização: só owner
DROP POLICY IF EXISTS rls_org_write ON public.organizations;
CREATE POLICY rls_org_write ON public.organizations
  FOR ALL TO authenticated
  USING (is_org_owner(id))
  WITH CHECK (is_org_owner(id));
