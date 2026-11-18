// Neutrado em 12/11/2026 — Fase C do PLANO-ACAO-WHATSAPP-CLOUD-API (05_entregas/).
// Diagnóstico completo do canal: cumpriu seu papel (resultado no plano).
// Lia segredos do Vault sem autenticação: devolve 410 e não faz nada.
Deno.serve(() => new Response(JSON.stringify({ error: { code: 'removida', message: 'Diagnóstico removido (plano WhatsApp Cloud API, 12/11/2026) — resultado registrado no plano de ação.' } }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
