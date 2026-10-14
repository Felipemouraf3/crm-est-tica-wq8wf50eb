-- P1-S01-T01 — Base multi-clínica e memberships
-- Migration aditiva: cria os contratos ausentes e alinha profiles sem recriar sua tabela.
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinics_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT clinics_organization_id_id_key UNIQUE (organization_id, id)
);

-- In a clean database this creates the T01 profile contract; on the observed
-- database CREATE TABLE IF NOT EXISTS preserves the existing table and rows.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Additive alignment for the pre-existing profiles table: no rename, drop,
-- replacement, or edits to existing columns/rows/IDs/policies.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_clinic_tenant_fkey
    FOREIGN KEY (organization_id, clinic_id)
    REFERENCES public.clinics(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx
  ON public.memberships (user_id);
CREATE INDEX IF NOT EXISTS memberships_organization_id_clinic_id_idx
  ON public.memberships (organization_id, clinic_id);

-- Keep the new public tables closed until the separately scoped RLS task adds
-- policies. This migration intentionally creates no RLS policies.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
