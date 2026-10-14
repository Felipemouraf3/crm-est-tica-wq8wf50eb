-- P1-S01-T03 (pré-requisito) — UNIQUE de vínculo de memberships
-- Decisão da consultora (2026-10-02): memberships mantém a PK técnica `id`
-- da migration T01; a unicidade de vínculo vira constraint UNIQUE adicional.
-- Guard DO/EXCEPTION para replay idempotente (mesmo padrão da T04).
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

DO $$
BEGIN
  ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_user_org_clinic_role_key
    UNIQUE (user_id, organization_id, clinic_id, role);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; -- já existe (replay)
END $$;
