-- P1-S02-T02 — RLS: políticas por organização/clínica nas tabelas expostas
-- Recorte da SPEC: CA-P1-S02-02 (membro da clínica A não lê nem altera clínica B
-- via API direta) + revisão de views (não há views em public — documentado).
-- Modelo: memberships ativa = acesso de leitura à clínica do vínculo;
--         owner/clinic_admin = escrita; revogação (active=false) já remove acesso.
-- Correção legada: profiles SELECT era 'true' p/ authenticated (vazava perfis);
--                  substituída por escopo organização.
-- Alvo aprovado: Supabase psestetica (ref uhozizrpmmpemvegtqaq); nunca aplicar no projeto Skip.

-- ============================================================
-- 0) Funções auxiliares STABLE (evitam recursão de policy)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_active_member(p_org uuid, p_clinic uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND m.organization_id = p_org
      AND m.clinic_id = p_clinic
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_writer(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND m.organization_id = p_org
      AND m.role IN ('owner','clinic_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_writer(p_org uuid, p_clinic uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND m.organization_id = p_org
      AND m.clinic_id = p_clinic
      AND m.role IN ('owner','clinic_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND m.organization_id = p_org
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member_for_user(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = p_user
      AND m.active
      AND m.organization_id = p_org
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id FROM public.memberships m
  WHERE m.user_id = auth.uid() AND m.active;
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_member(p_clinic uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.active
      AND m.clinic_id = p_clinic
  );
$$;

CREATE OR REPLACE FUNCTION public.is_colleague(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.memberships m1
      JOIN public.memberships m2
        ON m2.clinic_id = m1.clinic_id
       AND m2.organization_id = m1.organization_id
     WHERE m1.user_id = auth.uid() AND m1.active
       AND m2.user_id = p_user AND m2.active
  );
$$;

-- ============================================================
-- 1) organizations — leitura: membro ativo da org; escrita: owner/clinic_admin
-- ============================================================
DROP POLICY IF EXISTS rls_org_select ON public.organizations;
CREATE POLICY rls_org_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS rls_org_write ON public.organizations;
CREATE POLICY rls_org_write ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_org_writer(id))
  WITH CHECK (public.is_org_writer(id));

-- ============================================================
-- 2) clinics — escopo: organization_id
-- ============================================================
DROP POLICY IF EXISTS rls_clinics_select ON public.clinics;
CREATE POLICY rls_clinics_select ON public.clinics
  FOR SELECT TO authenticated
  USING (public.is_active_member(organization_id, id));

DROP POLICY IF EXISTS rls_clinics_write ON public.clinics;
CREATE POLICY rls_clinics_write ON public.clinics
  FOR ALL TO authenticated
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- ============================================================
-- 3) memberships — leitura: os seus + os da sua organização;
--    escrita: owner da organização (convida/revoga)
-- ============================================================
DROP POLICY IF EXISTS rls_memberships_select ON public.memberships;
CREATE POLICY rls_memberships_select ON public.memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_clinic_member(clinic_id)
  );

DROP POLICY IF EXISTS rls_memberships_write ON public.memberships;
CREATE POLICY rls_memberships_write ON public.memberships
  FOR ALL TO authenticated
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- ============================================================
-- 4) profiles — CORREÇÃO LEGADA: substitui authenticated_select_profiles
--    (qual 'true' vazava todos os perfis). Agora: próprio perfil OU perfis
--    de colegas da mesma organização (via membership ativo).
--    INSERT/UPDATE próprios permanecem como no baseline.
-- ============================================================
DROP POLICY IF EXISTS authenticated_select_profiles ON public.profiles;
DROP POLICY IF EXISTS rls_profiles_select ON public.profiles;
CREATE POLICY rls_profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_colleague(id)
  );

-- ============================================================
-- 5) clinic_settings — escopo: clinic
-- ============================================================
DROP POLICY IF EXISTS rls_clinic_settings_select ON public.clinic_settings;
CREATE POLICY rls_clinic_settings_select ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = clinic_settings.clinic_id
      AND public.is_active_member(c.organization_id, c.id)
  ));

DROP POLICY IF EXISTS rls_clinic_settings_write ON public.clinic_settings;
CREATE POLICY rls_clinic_settings_write ON public.clinic_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = clinic_settings.clinic_id
      AND public.is_clinic_writer(c.organization_id, c.id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = clinic_settings.clinic_id
      AND public.is_clinic_writer(c.organization_id, c.id)
  ));

-- ============================================================
-- 6) teams — escopo: clinic
-- ============================================================
DROP POLICY IF EXISTS rls_teams_select ON public.teams;
CREATE POLICY rls_teams_select ON public.teams
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = teams.clinic_id
      AND public.is_active_member(c.organization_id, c.id)
  ));

DROP POLICY IF EXISTS rls_teams_write ON public.teams;
CREATE POLICY rls_teams_write ON public.teams
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = teams.clinic_id
      AND public.is_clinic_writer(c.organization_id, c.id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = teams.clinic_id
      AND public.is_clinic_writer(c.organization_id, c.id)
  ));

-- ============================================================
-- 7) team_members — escopo: clinic (via team)
-- ============================================================
DROP POLICY IF EXISTS rls_team_members_select ON public.team_members;
CREATE POLICY rls_team_members_select ON public.team_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM public.teams t
      JOIN public.clinics c ON c.id = t.clinic_id
     WHERE t.id = team_members.team_id
       AND public.is_active_member(c.organization_id, c.id)
  ));

DROP POLICY IF EXISTS rls_team_members_write ON public.team_members;
CREATE POLICY rls_team_members_write ON public.team_members
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM public.teams t
      JOIN public.clinics c ON c.id = t.clinic_id
     WHERE t.id = team_members.team_id
       AND public.is_clinic_writer(c.organization_id, c.id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
      FROM public.teams t
      JOIN public.clinics c ON c.id = t.clinic_id
     WHERE t.id = team_members.team_id
       AND public.is_clinic_writer(c.organization_id, c.id)
  ));

-- ============================================================
-- 8) contacts — escopo: organization
-- ============================================================
DROP POLICY IF EXISTS rls_contacts_select ON public.contacts;
CREATE POLICY rls_contacts_select ON public.contacts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rls_contacts_write ON public.contacts;
CREATE POLICY rls_contacts_write ON public.contacts
  FOR ALL TO authenticated
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- ============================================================
-- 9) contact_identities — escopo: organization (via contact)
-- ============================================================
DROP POLICY IF EXISTS rls_contact_identities_select ON public.contact_identities;
CREATE POLICY rls_contact_identities_select ON public.contact_identities
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contacts ct
     WHERE ct.id = contact_identities.contact_id
       AND public.is_org_member(ct.organization_id)
  ));

DROP POLICY IF EXISTS rls_contact_identities_write ON public.contact_identities;
CREATE POLICY rls_contact_identities_write ON public.contact_identities
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM public.contacts ct
     WHERE ct.id = contact_identities.contact_id
       AND public.is_org_writer(ct.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
      FROM public.contacts ct
     WHERE ct.id = contact_identities.contact_id
       AND public.is_org_writer(ct.organization_id)
  ));

-- ============================================================
-- 10) integration_connections — escopo: organization (clinic opcional)
--     Leitura: membro da org; escrita: owner/clinic_admin da org
-- ============================================================
DROP POLICY IF EXISTS rls_integration_connections_select ON public.integration_connections;
CREATE POLICY rls_integration_connections_select ON public.integration_connections
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rls_integration_connections_write ON public.integration_connections;
CREATE POLICY rls_integration_connections_write ON public.integration_connections
  FOR ALL TO authenticated
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));
