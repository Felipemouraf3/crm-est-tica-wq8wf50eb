// Edge temporária de diagnóstico v2: devolve o JSON bruto de um payload do bucket
// webhook-payloads (somente leitura, protegida por env OU valor do Vault).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const header = req.headers.get("x-internal-job") ?? "";
  const envSecret = Deno.env.get("INTERNAL_JOB_SECRET") ?? "";
  let ok = envSecret !== "" && header === envSecret;
  if (!ok) {
    try {
      const admin0 = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
      const { data: v } = await admin0.rpc("_edge_read_secret", { p_secret_ref: "vault:cf1c1eb8-5f95-4de0-81b0-3fbd6b6af59c" });
      if (typeof v === "string" && v !== "" && header === v) ok = true;
    } catch {}
  }
  if (!ok) return new Response(JSON.stringify({ error: "sem_permissao" }), { status: 403 });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!ref.startsWith("webhook-payloads/")) {
    return new Response(JSON.stringify({ error: "ref_invalida" }), { status: 400 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data } = await admin.storage.from("webhook-payloads").download(ref);
  if (!data) return new Response(JSON.stringify({ error: "nao_encontrado" }), { status: 404 });
  return new Response(await data.text(), { headers: { "Content-Type": "application/json" } });
});
