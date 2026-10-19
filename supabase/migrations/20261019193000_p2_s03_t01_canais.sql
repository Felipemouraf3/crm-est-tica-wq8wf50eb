-- ============================================================
-- P2-S03-T01 — Canais WhatsApp: tabelas, índices, RLS e filas
-- SPEC: P2-S03-numeros-whatsapp-meta-zapi
-- Tabelas: channel_accounts, webhook_receipts, provider_message_status,
--          outbound_requests, dead_letters
-- Filas pgmq: inbound_events, outbound_messages, dead_letter
--            (+ _dlq de entrada e saída = 5 filas da fase)
-- Idempotente (IF NOT EXISTS / OR REPLACE); replay seguro.
-- Notas:
--  - Papel checado via funções STABLE SECURITY DEFINER existentes
--    (is_clinic_member / is_clinic_writer — P1-S02-T02).
--  - pg_cron (consumidores a cada 10 s) entra na P2-S03-T02, quando as
--    funções consumidoras existirem — evita jobs 404 silenciosos.
--  - Runner: scripts/test_p2_s03_t01.mjs (18/18, PGlite).
-- ============================================================

-- ------------------------------------------------------------
-- 1) channel_accounts — um número de WhatsApp de uma clínica
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  provider text NOT NULL CHECK (provider IN ('meta_cloud','z_api')),
  phone_e164 text NOT NULL,
  display_name text,
  external_account_id text NOT NULL,
  external_business_id text,
  integration_connection_id uuid NOT NULL REFERENCES public.integration_connections(id),
  webhook_secret_ref text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{"templates": true, "janela_24h": true, "midia": true}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','disconnected','disabled')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_status_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_provider_external_uniq
  ON public.channel_accounts (provider, external_account_id);

-- Um número ativo pertence a uma só clínica (draft pode repetir).
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_phone_active_uniq
  ON public.channel_accounts (phone_e164)
  WHERE status IN ('active','paused','disconnected');

CREATE INDEX IF NOT EXISTS channel_accounts_clinic_idx
  ON public.channel_accounts (clinic_id);

-- organization_id tem que ser o da clínica (FK composta efetiva).
CREATE OR REPLACE FUNCTION public.channel_accounts_check_org()
RETURNS trigger LANGUAGE plpgsql AS $t$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.clinics WHERE id = NEW.clinic_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'organization_id não corresponde à clínica' USING ERRCODE = 'P0004';
  END IF;
  RETURN NEW;
END $t$;

DROP TRIGGER IF EXISTS channel_accounts_org_check ON public.channel_accounts;
CREATE TRIGGER channel_accounts_org_check
  BEFORE INSERT OR UPDATE OF organization_id, clinic_id ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.channel_accounts_check_org();

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_channel_accounts_select ON public.channel_accounts;
CREATE POLICY rls_channel_accounts_select ON public.channel_accounts
  FOR SELECT TO authenticated
  USING (public.is_clinic_writer(organization_id, clinic_id));

DROP POLICY IF EXISTS rls_channel_accounts_write ON public.channel_accounts;
CREATE POLICY rls_channel_accounts_write ON public.channel_accounts
  FOR ALL TO authenticated
  USING (public.is_clinic_writer(organization_id, clinic_id))
  WITH CHECK (public.is_clinic_writer(organization_id, clinic_id));

-- ------------------------------------------------------------
-- 2) webhook_receipts — recibo imutável de evento recebido
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('meta_cloud','z_api','clinica_experts')),
  channel_account_id uuid REFERENCES public.channel_accounts(id),
  organization_id uuid,
  clinic_id uuid,
  external_event_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('message','status','connection','other')),
  signature_valid boolean NOT NULL,
  payload_hash text NOT NULL,
  payload_ref text,
  status text NOT NULL CHECK (status IN
    ('accepted','duplicate','rejected_signature','rejected_unmapped','rejected_stale','rejected_rate','ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_receipts_provider_event_uniq
  ON public.webhook_receipts (provider, external_event_id);

CREATE INDEX IF NOT EXISTS webhook_receipts_received_idx
  ON public.webhook_receipts (received_at);

ALTER TABLE public.webhook_receipts ENABLE ROW LEVEL SECURITY;

-- Leitura: owner/clinic_admin da clínica mapeada. Escrita: só servidor
-- (nenhuma policy de INSERT/UPDATE para authenticated).
DROP POLICY IF EXISTS rls_webhook_receipts_select ON public.webhook_receipts;
CREATE POLICY rls_webhook_receipts_select ON public.webhook_receipts
  FOR SELECT TO authenticated
  USING (clinic_id IS NOT NULL
         AND public.is_clinic_writer(organization_id, clinic_id));

-- ------------------------------------------------------------
-- 3) provider_message_status — situação do provedor (imutável)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_message_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id),
  provider text NOT NULL,
  provider_message_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','delivered','read','failed')),
  error_code text,
  occurred_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_message_status_uniq
  ON public.provider_message_status (provider, provider_message_id, status);

CREATE INDEX IF NOT EXISTS provider_message_status_msg_idx
  ON public.provider_message_status (provider, provider_message_id);

ALTER TABLE public.provider_message_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_provider_message_status_select ON public.provider_message_status;
CREATE POLICY rls_provider_message_status_select ON public.provider_message_status
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id));

-- ------------------------------------------------------------
-- 4) outbound_requests — pedido de envio (idempotente)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbound_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id),
  idempotency_key text NOT NULL UNIQUE,
  to_phone_e164 text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','template')),
  body_ref uuid,
  test_body text,
  template_name text,
  template_language text,
  origin text NOT NULL CHECK (origin IN ('human','auto_reply','followup','campaign','system_test')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','blocked')),
  block_reason text,
  attempts int NOT NULL DEFAULT 0,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_requests_clinic_status_idx
  ON public.outbound_requests (clinic_id, status);

ALTER TABLE public.outbound_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_outbound_requests_select ON public.outbound_requests;
CREATE POLICY rls_outbound_requests_select ON public.outbound_requests
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id));

-- ------------------------------------------------------------
-- 5) dead_letters — fila de falha visível (leitura owner/clinic_admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clinic_id uuid,
  source_queue text NOT NULL,
  ref_id text,
  error_code text,
  attempts int NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text CHECK (resolution IN ('reprocessado','descartado'))
);

CREATE INDEX IF NOT EXISTS dead_letters_open_idx
  ON public.dead_letters (clinic_id) WHERE resolved_at IS NULL;

ALTER TABLE public.dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_dead_letters_select ON public.dead_letters;
CREATE POLICY rls_dead_letters_select ON public.dead_letters
  FOR SELECT TO authenticated
  USING (clinic_id IS NOT NULL
         AND public.is_clinic_writer(organization_id, clinic_id));

-- ------------------------------------------------------------
-- 6) Filas pgmq (5 da fase) — tolerante: se pgmq indisponível, NOTICE
-- ------------------------------------------------------------
DO $outer$
DECLARE q text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgmq') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pgmq;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pgmq não ativado: %', SQLERRM;
    END;
    FOR q IN SELECT x FROM unnest(ARRAY['inbound_events','outbound_messages','dead_letter',
                         'inbound_events_dlq','outbound_messages_dlq']) AS x LOOP
      BEGIN
        PERFORM pgmq.create(q);
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM NOT LIKE '%already exists%' AND SQLERRM NOT LIKE '%does not exist%' THEN RAISE; END IF;
      END;
    END LOOP;
    RAISE NOTICE 'filas pgmq prontas (5)';
  ELSE
    RAISE NOTICE 'pgmq indisponível neste banco — criar filas antes da P2-S03-T02';
  END IF;
END $outer$;

-- ------------------------------------------------------------
-- 7) Verificações de existência (falha clara se algo faltou)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT x FROM unnest(ARRAY['channel_accounts','webhook_receipts',
    'provider_message_status','outbound_requests','dead_letters']) AS x LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) THEN
      RAISE EXCEPTION 'Tabela % não criada', t;
    END IF;
  END LOOP;
END $$;