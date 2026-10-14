-- P1-S01-T04 — Constraints UNIQUE adicionais às PKs técnicas
-- Exatamente as chaves da seção "Chaves primárias e unicidade" da SPEC; nada além.
-- memberships: nenhuma constraint adicional (SPEC); a chave de suporte
-- (clinics.id, clinics.organization_id) já existe como clinics_organization_id_id_key (T01).
-- Unicidades condicionais usam índices UNIQUE parciais (Postgres não suporta
-- constraint de tabela com WHERE). Guards DO/EXCEPTION tornam o replay idempotente.
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

DO $$
BEGIN
  ALTER TABLE public.clinics
    ADD CONSTRAINT clinics_organization_id_code_key UNIQUE (organization_id, code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; -- já existe (replay)
END $$;

DO $$
BEGIN
  ALTER TABLE public.clinic_settings
    ADD CONSTRAINT clinic_settings_clinic_id_setting_key_version_key
      UNIQUE (clinic_id, setting_key, version);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_clinic_id_name_key UNIQUE (clinic_id, name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
-- contact_identities: unicidade de negócio apenas quando external_id não é nulo;
-- mesma identidade em contatos diferentes permanece permitida.
CREATE UNIQUE INDEX IF NOT EXISTS contact_identities_contact_channel_ext_uniq
  ON public.contact_identities (contact_id, channel, external_id)
  WHERE external_id IS NOT NULL;

-- integration_connections: uma conexão por escopo/provedor/chave; dois índices
-- parciais tratam clinic_id nulo (padrão da organização) vs preenchido (override da clínica).
CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_org_scope_uniq
  ON public.integration_connections (organization_id, provider, connection_key)
  WHERE clinic_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_clinic_scope_uniq
  ON public.integration_connections (clinic_id, provider, connection_key)
  WHERE clinic_id IS NOT NULL;
