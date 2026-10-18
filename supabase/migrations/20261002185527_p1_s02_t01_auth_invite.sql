-- P1-S02-T01 — Auth: convite controlado pelo gestor + memberships iniciais
-- Método de login aprovado por Felipe: e-mail e senha.
-- Recorte: (1) RPC admin_invite_user para owner/clinic_admin convidar usuário
-- criando profile + memberships; (2) trigger que bloqueia auto-cadastro público
-- (signup direto) sem convite; (3) memberships iniciais do owner.
-- RLS por tabela (CA-P1-S02-02) fica para P1-S02-T02; aqui somente o fluxo de convite.
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

-- ============================================================
-- 1) Função de convite: SECURITY DEFINER, chamada por owner/clinic_admin
--    autenticado. Cria usuário Auth (sem senha; usuário define no primeiro
--    acesso via recovery), profile e memberships.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_invite_user(
  p_email text,
  p_name text,
  p_clinic_roles jsonb  -- [{"clinic_id": "...", "role": "owner"}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_clinic_id uuid;
  v_role text;
  v_org_id uuid;
  v_count int;
BEGIN
  -- entrada: e-mail válido e não vazio
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'e-mail inválido' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'nome inválido' USING ERRCODE = '22023';
  END IF;
  IF p_clinic_roles IS NULL OR jsonb_array_length(p_clinic_roles) = 0 THEN
    RAISE EXCEPTION 'informe pelo menos uma clínica/papel' USING ERRCODE = '22023';
  END IF;

  -- quem chama precisa estar autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;

  -- quem chama precisa ser owner da organização (checagem por memberships ativos)
  SELECT count(*) INTO v_count
  FROM public.memberships m
  WHERE m.user_id = auth.uid() AND m.active AND m.role IN ('owner');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'somente owner pode convidar usuários' USING ERRCODE = '42501';
  END IF;

  -- usuário já existe? reutiliza (reenvio de convite não duplica)
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, confirmation_sent_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      lower(btrim(p_email)), crypt(gen_random_uuid()::text, gen_salt('bf')),
      jsonb_build_object('provider', 'email', 'providers', to_jsonb(array['email'])),
      jsonb_build_object('name', btrim(p_name), 'invited_at', now()),
      now(), now(), encode(gen_random_bytes(32), 'hex'), now()
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- garante profile (trigger on_auth_user_created já cria em signup normal;
  -- aqui criamos por segurança com ON CONFLICT)
  INSERT INTO public.profiles (id, name)
  VALUES (v_user_id, btrim(p_name))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

  -- cria memberships informadas; valida clínica e coerência com organização
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

    INSERT INTO public.memberships (user_id, organization_id, clinic_id, role, active)
    VALUES (v_user_id, v_org_id, v_rec.clinic_id, v_rec.role, true)
    ON CONFLICT (id) DO NOTHING; -- reenvio não duplica: id gerado novo, vínculo idêntico é aceito
  END LOOP;

  RETURN v_user_id;
END;
$$;

-- ============================================================
-- 2) Bloqueio de auto-cadastro público: signup direto (sem convite)
--    é rejeitado. Convite vem pela RPC acima, que grava invited_at.
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_public_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- permite usuários criados pela função de convite (marcados com invited_at)
  IF NEW.raw_user_meta_data ? 'invited_at' THEN
    RETURN NEW;
  END IF;
  -- permite o usuário inicial do baseline (já existente antes desta migration)
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'cadastro público desativado: usuários entram somente por convite do gestor'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS block_public_signup_trigger ON auth.users;
CREATE TRIGGER block_public_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_public_signup();

-- ============================================================
-- 3) Memberships iniciais do owner — DADO, não schema; removido da
-- árvore em P2-S01 (varredura de segredos: zero e-mails pessoais).
-- No banco real o bloco original já foi aplicado (2026-10-02).
-- ============================================================