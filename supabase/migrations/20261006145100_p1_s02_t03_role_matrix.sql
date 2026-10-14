-- P1-S02-T03 — Matriz por role, membership e revogação (CA-P1-S02-03)
-- Aditivo e idempotente. Duas lacunas da matriz negativa:
--   1. memberships.role sem validação → CHECK com os 7 papéis da SPEC P1-S02.
--   2. revogação via API não registrava o momento → trigger updated_at.
-- Revogação permanece soft (active=false): remove acesso futuro e preserva
-- histórico/autoria (RN-P1-S02-01), já garantido pelas funções is_* da T02.

-- 1. Papéis válidos (SPEC P1-S02: owner, clinic_admin, manager, sales, reception, post_sales, viewer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'memberships'
      AND con.conname = 'memberships_role_check'
  ) THEN
    -- dados existentes devem estar conformes; se houver role fora da lista, a constraint falha
    -- e a migration NÃO é aplicada (proposital: falha segura, sem alterar nada).
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_role_check
      CHECK (role IN ('owner','clinic_admin','manager','sales','reception','post_sales','viewer'));
  END IF;
END $$;

-- 2. Trilha de revogação: updated_at sempre reflete a última alteração
CREATE OR REPLACE FUNCTION public.touch_membership_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS memberships_touch_updated_at ON public.memberships;
CREATE TRIGGER memberships_touch_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_membership_updated_at();
