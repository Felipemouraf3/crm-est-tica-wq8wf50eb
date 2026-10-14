-- Corretiva: coluna organization_id de clinics foi renomeada acidentalmente para "PSR"
-- durante edição manual no Table Editor (dados intactos). Restaura o nome do contrato da SPEC.
-- Guarda P2-S01: em instalação limpa a coluna já nasce organization_id — o rename
-- só executa se a coluna "PSR" existir (replay seguro em reset).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clinics' AND column_name='PSR'
  ) THEN
    ALTER TABLE public.clinics RENAME COLUMN "PSR" TO organization_id;
  END IF;
END $$;
