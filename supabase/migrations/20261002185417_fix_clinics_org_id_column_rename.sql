-- Corretiva: coluna organization_id de clinics foi renomeada acidentalmente para "PSR"
-- durante edição manual no Table Editor (dados intactos). Restaura o nome do contrato da SPEC.
ALTER TABLE public.clinics RENAME COLUMN "PSR" TO organization_id;
