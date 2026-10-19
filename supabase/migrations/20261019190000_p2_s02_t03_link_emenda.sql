-- ============================================================
-- P2-S02-T03 — Emenda do vínculo humano (SPEC P2-S02)
--   link_expert_patient passa a aceitar sales/reception/post_sales
--   da clínica para CRIAR vínculo; desfazer continua owner/clinic_admin.
--   match_method aceita 'manual' e 'manual_provavel' (etapa b da busca).
--   confidence: manual = 1.0 · manual_provavel = 0.7.
--   Idempotente (CREATE OR REPLACE); replay seguro.
--   Runner: scripts/test_p2_s02_t03_emenda.mjs (12/12, PGlite).
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_expert_patient(
  p_clinic_id uuid,
  p_contact_id uuid,
  p_expert_patient_uuid text,
  p_match_method text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_link_id uuid;
  v_conf numeric;
  v_metodo text;
BEGIN
  -- Clínica ativa da organização.
  SELECT c.organization_id INTO v_org
    FROM public.clinics c
   WHERE c.id = p_clinic_id AND c.status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinica nao encontrada ou inativa' USING ERRCODE = 'P0004';
  END IF;

  -- CRIAR vínculo: owner/clinic_admin/manager/sales/reception/post_sales
  -- da clínica (decisão humana registrada). viewer NÃO vincula.
  IF NOT public.has_clinic_role(p_clinic_id,
      ARRAY['owner','clinic_admin','manager','sales','reception','post_sales']) THEN
    RAISE EXCEPTION 'Seu papel nao permite confirmar vinculos nesta clinica' USING ERRCODE = '42501';
  END IF;

  -- O contato precisa pertencer à organização da clínica.
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts ct
     WHERE ct.id = p_contact_id AND ct.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Contato nao encontrado nesta organizacao' USING ERRCODE = 'P0004';
  END IF;

  -- match_method: manual (etapa a) ou manual_provavel (etapa b — pede confirmação).
  v_metodo := COALESCE(p_match_method, 'manual');
  IF v_metodo NOT IN ('manual', 'manual_provavel') THEN
    RAISE EXCEPTION 'match_method invalido (use manual ou manual_provavel)' USING ERRCODE = 'P0004';
  END IF;
  v_conf := CASE WHEN v_metodo = 'manual' THEN 1.0 ELSE 0.7 END;

  INSERT INTO public.external_patient_links (
    organization_id, clinic_id, contact_id, expert_patient_uuid,
    match_method, confidence, linked_by)
  VALUES (
    v_org, p_clinic_id, p_contact_id, p_expert_patient_uuid,
    v_metodo, v_conf, auth.uid())
  ON CONFLICT (clinic_id, expert_patient_uuid) DO UPDATE
    SET contact_id = EXCLUDED.contact_id, linked_by = EXCLUDED.linked_by,
        match_method = EXCLUDED.match_method, confidence = EXCLUDED.confidence,
        updated_at = now()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object('link_id', v_link_id, 'vinculado', true,
                            'match_method', v_metodo);
END;
$$;

-- desfazer vínculo: RPC separada, restrita a owner/clinic_admin (SPEC).
CREATE OR REPLACE FUNCTION public.unlink_expert_patient(
  p_clinic_id uuid,
  p_expert_patient_uuid text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT c.organization_id INTO v_org
    FROM public.clinics c
   WHERE c.id = p_clinic_id AND c.status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinica nao encontrada ou inativa' USING ERRCODE = 'P0004';
  END IF;
  IF NOT public.has_clinic_role(p_clinic_id, ARRAY['owner','clinic_admin']) THEN
    RAISE EXCEPTION 'Somente owner/clinic_admin podem desfazer vinculos' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.external_patient_links
   WHERE clinic_id = p_clinic_id AND expert_patient_uuid = p_expert_patient_uuid;

  RETURN jsonb_build_object('desfeito', true);
END;
$$;

-- Grants: EXECUTE só para authenticated (privilégio mínimo).
REVOKE ALL ON FUNCTION public.link_expert_patient(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_expert_patient(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_expert_patient(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_expert_patient(uuid, text) TO authenticated;

-- Verificação de existência (falha clara se algo faltou).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='link_expert_patient') THEN
    RAISE EXCEPTION 'RPC link_expert_patient não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='unlink_expert_patient') THEN
    RAISE EXCEPTION 'RPC unlink_expert_patient não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='has_clinic_role') THEN
    RAISE EXCEPTION 'Função has_clinic_role não existe (pré-condição da emenda)';
  END IF;
END $$;