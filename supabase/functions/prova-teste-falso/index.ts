// Neutrado em 12/11/2026 — Fase C do PLANO-ACAO-WHATSAPP-CLOUD-API (05_entregas/).
// Prova do teste falso (Fase A): cumpriu seu papel e está registrada no plano.
// Lia segredos do Vault sem autenticação: devolve 410 e não faz nada.
Deno.serve(() => new Response(JSON.stringify({ error: { code: 'removida', message: 'Prova removida (plano WhatsApp Cloud API, 12/11/2026) — resultado registrado no plano de ação.' } }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
