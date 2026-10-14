-- Corretiva: auth.users.id não tem DEFAULT; gerar UUID explicitamente no convite.
CREATE OR REPLACE FUNCTION public.admin_invite_user(
  p_email text,
  p_name text,
  p_clinic_roles jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_count int;
  v_rec record;
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

    INSERT INTO public.memberships (user_id, organization_id, clinic_id, role, active)
    VALUES (v_user_id, v_org_id, v_rec.clinic_id, v_rec.role, true);
  END LOOP;

  RETURN v_user_id;
END;
$$;
