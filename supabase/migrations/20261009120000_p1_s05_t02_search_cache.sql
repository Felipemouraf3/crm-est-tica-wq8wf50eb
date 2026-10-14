-- ============================================================
-- P1-S05-T02 — Busca, normalização E.164, deduplicação, vínculo
-- humano e cache mínimo com TTL
-- SPEC: P1-S05-clinica-experts-paciente
-- Recorte SQL desta task:
--   0. normalize_e164 — normalização server-side (RN-P1-S05-01);
--   1. external_patient_links — vínculo CONFIRMADO por humano
--      (nunca automático) com deduplicação;
--   2. expert_patients_cache — cache mínimo com TTL (validade) e
--      invalidação explícita (leitura por membro, escrita por membro
--      ativo da org — cache é dado derivado da busca);
--   3. RPC invalidate_expert_cache — invalidação explícita;
--   4. RPC link_expert_patient — vínculo humano com deduplicação.
-- A orquestração (cache→API→classificação zero/um/múltiplos) é da
-- Edge Function search-expert-patient (mesma task, código Deno),
-- que usa o módulo T01 e grava neste cache.
-- Idempotente (IF NOT EXISTS / OR REPLACE); replay seguro.
-- ============================================================

-- ------------------------------------------------------------
-- 0) normalize_e164 — normalização server-side (RN-P1-S05-01)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_e164(p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public AS $f$
DECLARE v_digits text; v_cc text DEFAULT '55'; v_local text; v_ddd text; v_numero text;
BEGIN
  v_digits := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  IF v_digits ~ '^\+[1-9][0-9]{7,14}$' THEN RETURN v_digits; END IF;
  v_local := regexp_replace(v_digits, '^\+', '', '');
  IF v_local LIKE '55%' AND length(v_local) BETWEEN 11 AND 13 THEN
    v_local := substr(v_local, 3);
  END IF;
  IF length(v_local) = 11 AND substr(v_local, 3, 1) = '9' THEN
    v_ddd := substr(v_local, 1, 2); v_numero := substr(v_local, 3);
    RETURN '+' || v_cc || v_ddd || v_numero;
  END IF;
  IF length(v_local) IN (10, 11) THEN
    v_ddd := substr(v_local, 1, 2); v_numero := substr(v_local, 3);
    IF length(v_numero) = 8 THEN v_numero := '9' || v_numero; END IF;
    RETURN '+' || v_cc || v_ddd || v_numero;
  END IF;
  RAISE EXCEPTION 'Telefone invalido para normalizacao E.164: %', p_raw USING ERRCODE = '22023';
END $f$;

-- ------------------------------------------------------------
-- 1) external_patient_links — vínculo humano (fonte de verdade do vínculo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_patient_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  expert_patient_uuid text NOT NULL,
  match_method text NOT NULL DEFAULT 'manual' CHECK (match_method IN ('manual')),
  confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  linked_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplicação: um vínculo por (clínica, contato, paciente externo)…
CREATE UNIQUE INDEX IF NOT EXISTS external_patient_links_scope_uniq
  ON public.external_patient_links (clinic_id, contact_id, expert_patient_uuid);

-- …e o MESMO paciente externo não pode ficar vinculado a dois contatos
-- na mesma clínica (senão a busca "um" fica ambígua de novo).
CREATE UNIQUE INDEX IF NOT EXISTS external_patient_links_patient_uniq
  ON public.external_patient_links (clinic_id, expert_patient_uuid);

ALTER TABLE public.external_patient_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_external_patient_links_select ON public.external_patient_links;
CREATE POLICY rls_external_patient_links_select ON public.external_patient_links
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rls_external_patient_links_write ON public.external_patient_links;
CREATE POLICY rls_external_patient_links_write ON public.external_patient_links
  FOR ALL TO authenticated
  USING (public.is_clinic_writer(organization_id, clinic_id))
  WITH CHECK (public.is_clinic_writer(organization_id, clinic_id));

-- ------------------------------------------------------------
-- 2) expert_patients_cache — cache mínimo com TTL e invalidação
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expert_patients_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_class text NOT NULL DEFAULT 'zero' CHECK (result_class IN ('zero','um','multiplos','erro')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  invalidated boolean NOT NULL DEFAULT false,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cache é por clínica (isolamento por organization_id/clinic_id).
CREATE UNIQUE INDEX IF NOT EXISTS expert_patients_cache_scope_phone_uniq
  ON public.expert_patients_cache (clinic_id, phone_e164);

CREATE INDEX IF NOT EXISTS expert_patients_cache_expiry_idx
  ON public.expert_patients_cache (expires_at);

ALTER TABLE public.expert_patients_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_expert_patients_cache_select ON public.expert_patients_cache;
CREATE POLICY rls_expert_patients_cache_select ON public.expert_patients_cache
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Escrita do cache: qualquer membro ativo da org (a busca grava o que
-- a API devolveu); links/vínculos continuam restritos a writer.
DROP POLICY IF EXISTS rls_expert_patients_cache_write ON public.expert_patients_cache;
CREATE POLICY rls_expert_patients_cache_write ON public.expert_patients_cache
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ------------------------------------------------------------
-- 3) RPC: invalidação explícita do cache (RN: cache tem invalidation)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_expert_cache(
  p_clinic_id uuid,
  p_phone text
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_norm text;
  v_linhas integer;
BEGIN
  SELECT c.organization_id INTO v_org
    FROM public.clinics c
   WHERE c.id = p_clinic_id AND c.status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinica nao encontrada ou inativa' USING ERRCODE = 'P0004';
  END IF;
  IF NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'Sem permissao nesta clinica' USING ERRCODE = '42501';
  END IF;

  v_norm := public.normalize_e164(p_phone);
  UPDATE public.expert_patients_cache
     SET invalidated = true, updated_at = now()
   WHERE clinic_id = p_clinic_id AND phone_e164 = v_norm AND NOT invalidated;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$$;

-- ------------------------------------------------------------
-- 4) RPC: vínculo humano confirmado (deduplicação no servidor)
-- ------------------------------------------------------------
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
BEGIN
  -- Só writer (owner/clinic_admin) cria vínculo — decisão humana.
  SELECT c.organization_id INTO v_org
    FROM public.clinics c
   WHERE c.id = p_clinic_id AND c.status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Clinica nao encontrada ou inativa' USING ERRCODE = 'P0004';
  END IF;
  IF NOT public.is_clinic_writer(v_org, p_clinic_id) THEN
    RAISE EXCEPTION 'Somente owner/clinic_admin podem criar vinculos' USING ERRCODE = '42501';
  END IF;

  -- O contato precisa pertencer à organização da clínica.
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts ct
     WHERE ct.id = p_contact_id AND ct.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Contato nao encontrado nesta organizacao' USING ERRCODE = 'P0004';
  END IF;

  IF COALESCE(p_match_method,'') <> 'manual' THEN
    RAISE EXCEPTION 'Vinculo so pode ser criado por decisao humana (manual)' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.external_patient_links (
    organization_id, clinic_id, contact_id, expert_patient_uuid,
    match_method, confidence, linked_by)
  VALUES (
    v_org, p_clinic_id, p_contact_id, p_expert_patient_uuid,
    'manual', 1.0, auth.uid())
  ON CONFLICT (clinic_id, expert_patient_uuid) DO UPDATE
    SET contact_id = EXCLUDED.contact_id, linked_by = EXCLUDED.linked_by,
        updated_at = now()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object('link_id', v_link_id, 'vinculado', true);
END;
$$;

-- ------------------------------------------------------------
-- 5) Grants: EXECUTE só para authenticated (privilégio mínimo)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.invalidate_expert_cache(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_expert_patient(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_expert_cache(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_expert_patient(uuid, uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 6) Verificações de existência (falha clara se algo faltou)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='external_patient_links') THEN
    RAISE EXCEPTION 'Tabela external_patient_links não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='expert_patients_cache') THEN
    RAISE EXCEPTION 'Tabela expert_patients_cache não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='normalize_e164') THEN
    RAISE EXCEPTION 'Função normalize_e164 não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='invalidate_expert_cache') THEN
    RAISE EXCEPTION 'RPC invalidate_expert_cache não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='link_expert_patient') THEN
    RAISE EXCEPTION 'RPC link_expert_patient não criada';
  END IF;
END $$;
