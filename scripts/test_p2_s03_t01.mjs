// scripts/test_p2_s03_t01.mjs — P2-S03-T01 (runner)
// Matriz: 5 tabelas criadas; unicidade do número ativo (RN-01) e do
// (provider, external_account_id); RLS por papel (owner vê, sales não);
// segredo do webhook devolvido UMA vez e nunca mais; status via RPC;
// org divergente recusada; replay idempotente.
// Execução: node --experimental-strip-types scripts/test_p2_s03_t01.mjs → N/N
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

let passou = 0,
  total = 0
function ok(nome, cond, extra = '') {
  total++
  if (cond) {
    passou++
    console.log(`  ✓ ${nome}`)
  } else console.error(`  × ${nome} ${extra}`)
}

const db = new PGlite()
for (const role of ['anon', 'authenticated']) {
  await db
    .exec(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
    )
    .catch(() => {})
}
let temCrypto = true
try {
  await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
} catch {
  temCrypto = false
}
if (!temCrypto) {
  await db.exec(`
  CREATE OR REPLACE FUNCTION public.gen_random_bytes(n int) RETURNS bytea AS $$
    BEGIN RETURN decode(md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text), 'hex'); END $$ LANGUAGE plpgsql;
  `)
}
await db.exec(`CREATE TABLE IF NOT EXISTS _session (uid uuid); CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT uid FROM _session LIMIT 1; $$ LANGUAGE sql;`)

// ---- base mínima (tenancy + integration_connections + vault mock) ----
await db.exec(`
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, name text NOT NULL DEFAULT '', email text NOT NULL UNIQUE,
  role text, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL, code text UNIQUE, timezone text NOT NULL DEFAULT 'America/Recife',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  role text NOT NULL CHECK (role IN ('owner','clinic_admin','manager','sales','reception','post_sales','viewer')),
  active boolean NOT NULL DEFAULT true, invite_status text DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX memberships_unique ON public.memberships (user_id, organization_id, clinic_id, role);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL, primary_phone_e164 text, email text, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  clinic_id uuid REFERENCES public.clinics(id),
  provider text NOT NULL, connection_key text NOT NULL,
  secret_ref text NOT NULL DEFAULT 'vault:pending',
  config_sanitized jsonb DEFAULT '{}'::jsonb,
  health_status text NOT NULL DEFAULT 'not_configured',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX integration_connections_uniq ON public.integration_connections
  (provider, connection_key, COALESCE(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE, secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
`)

// normalize_e164 (real) — regex com [+] para não sofrer escape do template literal JS
await db.exec(`
CREATE OR REPLACE FUNCTION public.normalize_e164(p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $f$
DECLARE v_digits text; v_local text; v_ddd text; v_numero text;
BEGIN
  v_digits := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  IF v_digits ~ '^[+][1-9][0-9]{7,14}$' THEN RETURN v_digits; END IF;
  v_local := regexp_replace(v_digits, '^[+]', '', '');
  IF v_local LIKE '55%' AND length(v_local) BETWEEN 11 AND 13 THEN v_local := substr(v_local, 3); END IF;
  IF length(v_local) = 11 AND substr(v_local, 3, 1) = '9' THEN
    v_ddd := substr(v_local, 1, 2); v_numero := substr(v_local, 3);
    RETURN '+55' || v_ddd || v_numero;
  END IF;
  IF length(v_local) IN (10, 11) THEN
    v_ddd := substr(v_local, 1, 2); v_numero := substr(v_local, 3);
    IF length(v_numero) = 8 THEN v_numero := '9' || v_numero; END IF;
    RETURN '+55' || v_ddd || v_numero;
  END IF;
  RAISE EXCEPTION 'Telefone invalido' USING ERRCODE = '22023';
END $f$;
`)

// helpers de papel
await db.exec(`
CREATE OR REPLACE FUNCTION public.is_clinic_member(p_clinic uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.clinic_id = p_clinic AND m.user_id = auth.uid() AND m.active = true);
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.is_clinic_writer(p_org uuid, p_clinic uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.organization_id = p_org AND m.clinic_id = p_clinic
      AND m.user_id = auth.uid() AND m.active = true
      AND m.role IN ('owner','clinic_admin'));
$$ LANGUAGE sql STABLE;
`)

// admin_save_integration_secret (P1-S04, versão mínima p/ o runner)
await db.exec(`
CREATE OR REPLACE FUNCTION public.admin_save_integration_secret(
  p_clinic_id uuid, p_provider text, p_connection_key text, p_secret text, p_config_sanitized jsonb DEFAULT NULL
) RETURNS TABLE (connection_id uuid, secret_ref text, secret_hint text, health_status text, created boolean, version int, updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_org uuid; v_conn uuid; v_sid uuid; v_criou boolean;
BEGIN
  SELECT organization_id INTO v_org FROM public.clinics WHERE id = p_clinic_id;
  SELECT id INTO v_conn FROM public.integration_connections
   WHERE clinic_id = p_clinic_id AND provider = p_provider AND connection_key = p_connection_key;
  v_criou := v_conn IS NULL;
  IF v_criou THEN
    INSERT INTO public.integration_connections (organization_id, clinic_id, provider, connection_key, secret_ref, health_status)
    VALUES (v_org, p_clinic_id, p_provider, p_connection_key, 'vault:pending', 'not_configured')
    RETURNING id INTO v_conn;
  END IF;
  UPDATE vault.secrets SET secret = p_secret WHERE name = 'conn_' || v_conn::text
  RETURNING id::text INTO v_sid;
  IF v_sid IS NULL THEN
    INSERT INTO vault.secrets (name, secret) VALUES ('conn_' || v_conn::text, p_secret)
    RETURNING id::text INTO v_sid;
  END IF;
  UPDATE public.integration_connections SET secret_ref = 'vault:' || v_sid, updated_at = now() WHERE id = v_conn;
  RETURN QUERY SELECT v_conn, 'vault:' || v_sid, right(p_secret, 4), 'not_configured', v_criou, 1, now()::timestamptz;
END $fn$;
`)

// ---- MIGRATIONS EM TESTE ----
const DIR = './supabase/migrations/'
const M1 = readFileSync(
  new URL(DIR + '20261019193000_p2_s03_t01_canais.sql', import.meta.url),
  'utf8',
)
const M2 = readFileSync(
  new URL(DIR + '20261019193100_p2_s03_t01b_rpcs.sql', import.meta.url),
  'utf8',
)
await db.exec(M1)
await db.exec(M2)

// ---- fixtures ----
await db.exec(`
INSERT INTO public.profiles (id, name, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Felipe', 'felipe@teste.local'),
  ('22222222-2222-2222-2222-222222222222', 'Vendas', 'vendas@teste.local');
INSERT INTO public.organizations (id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Org A');
INSERT INTO public.clinics (id, organization_id, name, code) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PSC', 'PSC'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PSJ', 'PSJ');
INSERT INTO public.memberships (user_id, organization_id, clinic_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'sales');
`)
await db.exec(`INSERT INTO _session (uid) VALUES ('11111111-1111-1111-1111-111111111111');`)
// privilégios para o teste RLS sob SET ROLE authenticated
await db.exec(`GRANT SELECT ON public.channel_accounts TO authenticated;`)
await db.exec(`GRANT SELECT ON public.memberships TO authenticated;`)
await db.exec(`GRANT SELECT ON public._session TO authenticated;`)

const PSC = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PSJ = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

console.log('P2-S03-T01 — canais: tabelas, unicidade, RLS, segredo único')

// 1. cinco tabelas existem
{
  const r = await db.query(`SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN
    ('channel_accounts','webhook_receipts','provider_message_status','outbound_requests','dead_letters')`)
  ok('5 tabelas criadas', r.rows[0].n === 5, `n=${r.rows[0].n}`)
}

// 2. owner cria canal Meta (segredo devolvido uma vez)
let canal1, segredo1
{
  const r = await db.query(
    `SELECT * FROM public.admin_save_channel_account(
    $1,'meta_cloud','(81) 99999-0001','PS Caruaru','PHONE_ID_1','WABA_1','token-meta','appsecret')`,
    [PSC],
  )
  canal1 = r.rows[0].channel_account_id
  segredo1 = r.rows[0].webhook_secret_once
  ok('owner cria canal Meta (draft)', r.rows.length === 1 && !!canal1, JSON.stringify(r.rows[0]))
  ok(
    'segredo do webhook devolvido UMA vez (não vazio)',
    typeof segredo1 === 'string' && segredo1.length >= 32,
  )
}

// 3. segredo NUNCA mais devolvido: re-salvar mesmo canal → outro valor, e tabela não guarda o claro
{
  const r = await db.query(
    `SELECT * FROM public.admin_save_channel_account(
    $1,'meta_cloud','(81) 99999-0001','PS Caruaru','PHONE_ID_1','WABA_1','token-novo','appsecret')`,
    [PSC],
  )
  ok('re-salvar não devolve o segredo anterior', r.rows[0].webhook_secret_once !== segredo1)
  ok('created=false na atualização', r.rows[0].created === false)
  const n = await db.query(
    `SELECT count(*)::int AS n FROM public.channel_accounts WHERE clinic_id=$1`,
    [PSC],
  )
  ok('sem canal duplicado (upsert por external_account_id)', n.rows[0].n === 1, `n=${n.rows[0].n}`)
}

// 4. RN-01: mesmo número ativo em outra clínica → recusa
{
  await db.query(`SELECT public.admin_set_channel_status($1,'active')`, [canal1])
  let recusou = false
  try {
    await db.query(
      `SELECT public.admin_save_channel_account(
      $1,'z_api','+5581999990001',NULL,'INST_1',NULL,'token-zapi',NULL)`,
      [PSJ],
    )
  } catch (e) {
    recusou = String(e.message ?? e).includes('ja esta ativo em outra clinica')
  }
  ok('número ativo em outra clínica → recusa (RN-01)', recusou)
}

// 5. (provider, external_account_id) único
{
  let recusou = false
  try {
    await db.query(
      `SELECT public.admin_save_channel_account(
      $1,'meta_cloud','(81) 98888-0001',NULL,'PHONE_ID_1',NULL,'token-x',NULL)`,
      [PSJ],
    )
  } catch (e) {
    recusou = /duplicate key|unique|ja usado/i.test(String(e.message ?? e))
  }
  ok('(provider, external_account_id) único', recusou)
}

// 6. sales NÃO cria canal (RLS/papel)
{
  await db.exec(`UPDATE _session SET uid='22222222-2222-2222-2222-222222222222';`)
  let recusou = false
  try {
    await db.query(
      `SELECT public.admin_save_channel_account(
      $1,'z_api','(81) 97777-0001',NULL,'INST_2',NULL,'token-z',NULL)`,
      [PSC],
    )
  } catch (e) {
    recusou = String(e.message ?? e).includes('Somente owner/clinic_admin')
  }
  ok('sales não cria canal (42501)', recusou)
  await db.exec(`UPDATE _session SET uid='11111111-1111-1111-1111-111111111111';`)
}

// 7. RLS: sales não lê channel_accounts; owner lê (try/finally garante RESET ROLE)
{
  let nSales = -1,
    nOwner = -1
  await db.exec(`UPDATE _session SET uid='22222222-2222-2222-2222-222222222222';`)
  try {
    await db.exec(`SET ROLE authenticated;`)
    const r1 = await db.query(`SELECT count(*)::int AS n FROM public.channel_accounts`)
    nSales = r1.rows[0].n
  } finally {
    await db.exec(`RESET ROLE;`)
  }
  await db.exec(`UPDATE _session SET uid='11111111-1111-1111-1111-111111111111';`)
  try {
    await db.exec(`SET ROLE authenticated;`)
    const r2 = await db.query(`SELECT count(*)::int AS n FROM public.channel_accounts`)
    nOwner = r2.rows[0].n
  } finally {
    await db.exec(`RESET ROLE;`)
  }
  ok('RLS: sales vê 0 canais', nSales === 0, `n=${nSales}`)
  ok('RLS: owner vê os canais da clínica', nOwner === 1, `n=${nOwner}`)
}

// 8. status via RPC: pausar/reativar/desativar
{
  const r = await db.query(`SELECT public.admin_set_channel_status($1,'paused') AS out`, [canal1])
  ok('pausar via RPC', r.rows[0].out.status === 'paused')
  const st = await db.query(`SELECT status FROM public.channel_accounts WHERE id=$1`, [canal1])
  ok('status persistido', st.rows[0].status === 'paused')
}

// 9. webhook_secret_ref aponta para Vault (nunca valor claro)
{
  const r = await db.query(`SELECT webhook_secret_ref FROM public.channel_accounts WHERE id=$1`, [
    canal1,
  ])
  ok(
    'webhook_secret_ref = vault:<uuid>',
    /^vault:[0-9a-f-]{36}$/.test(r.rows[0].webhook_secret_ref),
    r.rows[0].webhook_secret_ref,
  )
}

// 10. admin_test_channel: diagnóstico sanitizado (sem token na resposta)
{
  const r = await db.query(`SELECT * FROM public.admin_test_channel($1)`, [canal1])
  const s = JSON.stringify(r.rows[0])
  ok(
    'teste do canal: sem token na resposta',
    !s.includes('token-meta') && !s.includes('token-novo'),
  )
  ok(
    'teste do canal: health_status presente',
    ['healthy', 'not_configured'].includes(r.rows[0].health_status),
  )
}

// 11. org check: canal com organization_id errado → recusa
{
  let recusou = false
  try {
    await db.query(
      `INSERT INTO public.channel_accounts (
      organization_id, clinic_id, provider, phone_e164, external_account_id,
      integration_connection_id, webhook_secret_ref)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, $1, 'z_api', '+5581966660001', 'INST_X',
      (SELECT id FROM public.integration_connections LIMIT 1), 'vault:00000000-0000-0000-0000-000000000000')`,
      [PSC],
    )
  } catch (e) {
    recusou = String(e.message ?? e).includes('organization_id não corresponde')
  }
  ok('organization_id divergente → recusa', recusou)
}

// 12. replay idempotente das migrations
{
  try {
    await db.exec(M1)
    await db.exec(M2)
    ok('migrations idempotentes (replay)', true)
  } catch (e) {
    ok('migrations idempotentes (replay)', false, String(e).slice(0, 160))
  }
}

await db.close()
console.log(`\nRESULTADO: ${passou}/${total}`)
process.exit(passou === total ? 0 : 1)
