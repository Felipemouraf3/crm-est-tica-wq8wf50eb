-- P1-S02-T02b — Aperto de escopo: escrita de clinics e memberships por CLÍNICA
-- Motivo: a policy FOR ALL org-level de clinics dava SELECT/UPDATE a clinic_admin
-- sobre clínicas sem vínculo (violaria CA-P1-S02-02). Agora:
--   clinics: SELECT = membro da clínica; INSERT = owner/clinic_admin da org (clínica nova);
--            UPDATE/DELETE = owner/clinic_admin DA clínica.
--   memberships: escrita = owner/clinic_admin da clínica do vínculo.

DROP POLICY IF EXISTS rls_clinics_write ON public.clinics;
CREATE POLICY rls_clinics_insert ON public.clinics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_writer(organization_id));
CREATE POLICY rls_clinics_update ON public.clinics
  FOR UPDATE TO authenticated
  USING (public.is_clinic_writer(organization_id, id))
  WITH CHECK (public.is_clinic_writer(organization_id, id));
CREATE POLICY rls_clinics_delete ON public.clinics
  FOR DELETE TO authenticated
  USING (public.is_clinic_writer(organization_id, id))
  WITH CHECK (public.is_clinic_writer(organization_id, id));

DROP POLICY IF EXISTS rls_memberships_write ON public.memberships;
CREATE POLICY rls_memberships_write ON public.memberships
  FOR ALL TO authenticated
  USING (public.is_clinic_writer(organization_id, clinic_id))
  WITH CHECK (public.is_clinic_writer(organization_id, clinic_id));
