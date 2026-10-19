// scripts/test_p2_s02_t03_emenda.mjs — P2-S02-T03 (runner SQL)
// Emenda do link_expert_patient: sales/reception/post_sales CRIAM vínculo;
// viewer NÃO cria; unlink só owner/clinic_admin; manual_provavel aceito
// (confidence 0.7); contato de outra organização é recusado.
// Execução: node --experimental-strip-types scripts/test_p2_s02_t03_emenda.mjs → N/N
import { PGlite } from '@electric-sql/pglite'

let passou = 0,
  total = 0
function ok(nome, cond, extra = '') {
  total++
  if (cond) {
    passou++
    console.log(`  ✓ ${nome}`)
  } else console.error(`  × ${nome} ${extra}`)
}

// ---- mocks de pgcrypto (PGlite não tem) ----
const MOCKS = `
CREATE SCHEMA IF NOT EXISTS mock;
CREATE OR REPLACE FUNCTION mock.gen_salt(_type text, _iter int) RETURNS text AS $$
  BEGIN RETURN '$2a$10$abcdefghijklmnopqrstuv'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION mock.gen_salt(_type text) RETURNS text AS $$
  BEGIN RETURN '$2a$10$abcdefghijklmnopqrstuv'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION mock.crypt(pw text, salt text) RETURNS text AS $$
  BEGIN RETURN 'x' || md5(pw || salt); END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION mock.gen_random_bytes(n int) RETURNS bytea AS $$
  BEGIN RETURN decode(lpad('', n*2, 'ab'), 'hex'); END $$ LANGUAGE plpgsql;
`

const db = new PGlite()
await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`).catch(() => {})
await db.exec(MOCKS)
// papéis exigidos pelas policies/grants (lição P1: criar anon/authenticated)
for (const role of ['anon', 'authenticated']) {
  await db
    .exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN
      CREATE ROLE ${role} NOLOGIN;
    END IF;
  END $$;`)
    .catch(() => {})
}

// sessão simulada: auth.uid() via _session (schema auth)
await db.exec(`CREATE TABLE IF NOT EXISTS _session (uid uuid);`)
await db.exec(`CREATE SCHEMA IF NOT EXISTS auth;`)
await db.exec(`
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT uid FROM _session LIMIT 1;
$$ LANGUAGE sql;`)

// ---- migrations mínimas (tenancy + cache/links) ----
const TENANCY = `
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
  name text NOT NULL, primary_phone_e164 text, email text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.external_patient_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  expert_patient_uuid text NOT NULL,
  match_method text NOT NULL DEFAULT 'manual' CHECK (match_method IN ('manual','manual_provavel')),
  confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  linked_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX external_patient_links_scope_uniq ON public.external_patient_links (clinic_id, contact_id, expert_patient_uuid);
CREATE UNIQUE INDEX external_patient_links_patient_uniq ON public.external_patient_links (clinic_id, expert_patient_uuid);
`
await db.exec(TENANCY)

// helpers de papel (mesma semântica das funções do banco real)
await db.exec(`
CREATE OR REPLACE FUNCTION public.has_clinic_role(p_clinic uuid, p_roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.clinic_id = p_clinic AND m.user_id = auth.uid()
      AND m.active = true AND m.role = ANY(p_roles));
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.active = true);
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.is_clinic_writer(p_org uuid, p_clinic uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.organization_id = p_org AND m.clinic_id = p_clinic
      AND m.user_id = auth.uid() AND m.active = true
      AND m.role IN ('owner','clinic_admin'));
$$ LANGUAGE sql STABLE;
`)

// normalize_e164 (da migration real) — só para montar contato
await db.exec(`
CREATE OR REPLACE FUNCTION public.normalize_e164(p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $f$
DECLARE v_digits text; v_local text; v_ddd text; v_numero text;
BEGIN
  v_digits := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  IF v_digits ~ '^\+[1-9][0-9]{7,14}$' THEN RETURN v_digits; END IF;
  v_local := regexp_replace(v_digits, '^\+', '', '');
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

// ---- EMENDA (o código em teste) ----
const EMENDA = await import('node:fs').then((fs) =>
  fs.readFileSync(
    new URL('../supabase/migrations/20261019190000_p2_s02_t03_link_emenda.sql', import.meta.url),
    'utf8',
  ),
)
await db.exec(EMENDA)

// ---- fixtures ----
await db.exec(`
INSERT INTO public.profiles (id, name, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Felipe', 'felipe@teste.local'),
  ('22222222-2222-2222-2222-222222222222', 'Vendas', 'vendas@teste.local'),
  ('33333333-3333-3333-3333-333333333333', 'Recep', 'recep@teste.local'),
  ('44444444-4444-4444-4444-444444444444', 'Viewer', 'viewer@teste.local');
INSERT INTO public.organizations (id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Org A'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org B');
INSERT INTO public.clinics (id, organization_id, name, code) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PSC', 'PSC'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PSB', 'PSB');
INSERT INTO public.contacts (id, organization_id, name, primary_phone_e164) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Renata', '+5581999990001'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Contato Org B', '+5581999990001');
INSERT INTO public.memberships (user_id, organization_id, clinic_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'sales'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'reception'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'viewer');
`)

async function setSessao(uid) {
  await db.exec(`DELETE FROM _session;`)
  if (uid) await db.exec(`INSERT INTO _session (uid) VALUES ('${uid}');`)
}
const OWNER = '11111111-1111-1111-1111-111111111111'
const SALES = '22222222-2222-2222-2222-222222222222'
const RECEP = '33333333-3333-3333-3333-333333333333'
const VIEWER = '44444444-4444-4444-4444-444444444444'
const PSC = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const CONTATO_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const CONTATO_B = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PAC = 'expert-uuid-1'

async function tenta(uid, contato, metodo = 'manual') {
  await setSessao(uid)
  try {
    const r = await db.query(`SELECT public.link_expert_patient($1, $2, $3, $4) AS out`, [
      PSC,
      contato,
      PAC,
      metodo,
    ])
    return { ok: true, out: r.rows[0].out }
  } catch (e) {
    return { ok: false, msg: String(e.message ?? e) }
  }
}

console.log('P2-S02-T03 — emenda do link_expert_patient')

// 1. owner cria vínculo manual
{
  const r = await tenta(OWNER, CONTATO_A, 'manual')
  ok('owner cria vínculo manual', r.ok && r.out.vinculado === true, JSON.stringify(r))
}
// 2. sales cria vínculo (emenda)
{
  const r = await tenta(SALES, CONTATO_A, 'manual')
  ok('sales cria vínculo (emenda da SPEC)', r.ok && r.out.vinculado === true, JSON.stringify(r))
}
// 3. reception cria vínculo manual_provavel (etapa b) → confidence 0.7
{
  await setSessao(RECEP)
  try {
    const r = await db.query(
      `SELECT public.link_expert_patient($1,$2,$3,'manual_provavel') AS out`,
      [PSC, CONTATO_A, PAC],
    )
    ok(
      'reception cria manual_provavel',
      r.rows[0].out.vinculado === true,
      JSON.stringify(r.rows[0]),
    )
    const conf = await db.query(
      `SELECT confidence, match_method FROM public.external_patient_links WHERE clinic_id=$1 AND expert_patient_uuid=$2`,
      [PSC, PAC],
    )
    ok(
      'confidence 0.7 e match_method manual_provavel',
      conf.rows[0].confidence === '0.7' && conf.rows[0].match_method === 'manual_provavel',
      JSON.stringify(conf.rows[0]),
    )
  } catch (e) {
    ok('reception cria manual_provavel', false, String(e))
  }
}
// 4. viewer NÃO cria
{
  const r = await tenta(VIEWER, CONTATO_A, 'manual')
  ok(
    'viewer não cria vínculo (42501)',
    !r.ok && r.msg.includes('papel nao permite'),
    JSON.stringify(r),
  )
}
// 5. match_method inválido recusado
{
  const r = await tenta(OWNER, CONTATO_A, 'automatico')
  ok(
    'match_method inválido recusado',
    !r.ok && r.msg.includes('match_method invalido'),
    JSON.stringify(r),
  )
}
// 6. contato de outra organização recusado
{
  const r = await tenta(OWNER, CONTATO_B, 'manual')
  ok(
    'contato de outra organização recusado',
    !r.ok && r.msg.includes('Contato nao encontrado'),
    JSON.stringify(r),
  )
}
// 7. unlink: sales NÃO desfaz
{
  await setSessao(SALES)
  try {
    await db.query(`SELECT public.unlink_expert_patient($1,$2)`, [PSC, PAC])
    ok('sales não desfaz vínculo', false, 'deveria ter falhado')
  } catch (e) {
    ok(
      'sales não desfaz vínculo (42501)',
      String(e.message ?? e).includes('Somente owner/clinic_admin'),
    )
  }
}
// 8. unlink: owner desfaz
{
  await setSessao(OWNER)
  try {
    const r = await db.query(`SELECT public.unlink_expert_patient($1,$2) AS out`, [PSC, PAC])
    ok('owner desfaz vínculo', r.rows[0].out.desfeito === true)
    const n = await db.query(
      `SELECT count(*)::int AS n FROM public.external_patient_links WHERE clinic_id=$1`,
      [PSC],
    )
    ok('vínculo removido do banco', n.rows[0].n === 0)
  } catch (e) {
    ok('owner desfaz vínculo', false, String(e))
  }
}
// 9. grants: EXECUTE só para authenticated
{
  const g = await db.query(`
    SELECT COALESCE(bool_or(grantee='authenticated'), false) AS auth_ok,
           COALESCE(bool_or(grantee='PUBLIC'), false) AS public_ok
    FROM information_schema.routine_privileges
    WHERE routine_name='link_expert_patient' AND routine_schema='public'`)
  ok(
    'grants: authenticated sim, PUBLIC não',
    g.rows[0].auth_ok === true && g.rows[0].public_ok === false,
    JSON.stringify(g.rows[0]),
  )
}
// 10. idempotência: reexecuta a emenda sem erro
{
  try {
    await db.exec(EMENDA)
    ok('emenda idempotente (replay)', true)
  } catch (e) {
    ok('emenda idempotente (replay)', false, String(e))
  }
}

await db.close()
console.log(`\nRESULTADO: ${passou}/${total}`)
process.exit(passou === total ? 0 : 1)
