-- P1-S01-T02 — Contratos de configuração, equipes, contatos e conexões
-- Cria exatamente seis tabelas: clinic_settings, teams, team_members, contacts,
-- contact_identities, integration_connections. PKs UUID + timestamps padrão.
-- Constraints UNIQUE de negócio ficam para P1-S01-T04; esta migration não as cria.
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

CREATE TABLE IF NOT EXISTS public.clinic_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  setting_key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  inherits_org boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_settings_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  queue_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  capacity integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_members_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  CONSTRAINT team_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  primary_phone_e164 text,
  email text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  channel text NOT NULL,
  external_id text,
  normalized_value text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_identities_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT
);

-- clinic_id NULL = conexão padrão da organização; preenchido = override da clínica,
-- sempre da mesma organização (FK composta com clinics(id, organization_id)).
-- Persiste apenas secret_ref (referência opaca); o valor do segredo fica em
-- Supabase Secrets/Vault. connection_key é estável e não contém segredo.
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid,
  provider text NOT NULL,
  connection_key text NOT NULL,
  secret_ref text NOT NULL,
  config_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_status text NOT NULL DEFAULT 'unknown',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_connections_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT integration_connections_clinic_tenant_fkey
    FOREIGN KEY (clinic_id, organization_id)
    REFERENCES public.clinics(id, organization_id) ON DELETE RESTRICT
);

-- Índices de busca para as FKs (unicidade de negócio é T04).
CREATE INDEX IF NOT EXISTS clinic_settings_clinic_id_idx
  ON public.clinic_settings (clinic_id);
CREATE INDEX IF NOT EXISTS teams_clinic_id_idx
  ON public.teams (clinic_id);
CREATE INDEX IF NOT EXISTS team_members_team_id_idx
  ON public.team_members (team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx
  ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS contacts_organization_id_idx
  ON public.contacts (organization_id);
CREATE INDEX IF NOT EXISTS contact_identities_contact_id_idx
  ON public.contact_identities (contact_id);
CREATE INDEX IF NOT EXISTS integration_connections_organization_id_idx
  ON public.integration_connections (organization_id);
CREATE INDEX IF NOT EXISTS integration_connections_clinic_id_idx
  ON public.integration_connections (clinic_id);

-- Tabelas fechadas até as policies RLS de P1-S02; nenhuma policy criada aqui.
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
