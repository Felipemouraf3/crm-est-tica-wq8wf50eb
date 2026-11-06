-- 2026-11-06: o login do usuário felipef3energydrink@gmail.com falhava com
-- "Invalid login credentials". Investigaçãoo no banco mostrou que o usuário
-- EXISTE e está CONFIRMADO (auth.users, created 2026-09-29, email_confirmed_at
-- preenchido), com membership owner ativa e identity de e-mail — mas o hash de
-- senha em encrypted_password NÃO correspondia à senha Skip@Pass que ele usava.
-- O usuário estava preso no fluxo de recuperação (/forgot-password) sem sucesso.
-- Correção: restaura a senha para o valor de seed conhecido (Skip@Pass),
-- garantindo também que os tokens de string do GoTrue não estejam nulos
-- (NULL nesses colunas causa HTTP 500 no GoTrue — supabase/auth#1940).
-- Idempotente: só altera quando o hash NÃO confere com Skip@Pass.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'felipef3energydrink@gmail.com') THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('Skip@Pass', extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change = '',
        email_change_token_current = '',
        phone_change = '',
        phone_change_token = '',
        reauthentication_token = '',
        updated_at = now()
    WHERE email = 'felipef3energydrink@gmail.com'
      AND encrypted_password <> extensions.crypt('Skip@Pass', encrypted_password);
  ELSE
    -- Usuário ausente (banco reconstruído): recria com senha conhecida e confirma.
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'felipef3energydrink@gmail.com',
      extensions.crypt('Skip@Pass', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Dra. Ana Silveira", "clinic_name": "Silveira Estética Avançada"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;
END $$;

-- Garante que um usuário (re)criado por migração tenha profile e vínculo,
-- replicando o seed original (20260929135430) de forma idempotente.
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'felipef3energydrink@gmail.com';
  IF uid IS NULL THEN
    RAISE EXCEPTION 'usuario de seed ausente apos insercao';
  END IF;

  INSERT INTO public.profiles (id, name, email, clinic_name, role, status)
  VALUES (uid, 'Dra. Ana Silveira', 'felipef3energydrink@gmail.com',
          'Silveira Estética Avançada', 'admin', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- memberships: sem ON CONFLICT global (chave única usa org+clinic+role),
  -- então só insere o par user/clinic quando ainda não existir.
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships WHERE user_id = uid
  ) THEN
    INSERT INTO public.memberships (user_id, organization_id, clinic_id, role, active, invite_status)
    SELECT uid, c.organization_id, c.id, 'owner', true, 'accepted'
    FROM public.clinics c
    WHERE c.status = 'active'
    ORDER BY c.created_at
    LIMIT 1;
  END IF;
END $$;
