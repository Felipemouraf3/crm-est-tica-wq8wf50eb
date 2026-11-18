// Neutrada em 12/11/2026 — Fase C do PLANO-ACAO-WHATSAPP-CLOUD-API (05_entregas/).
// Endpoint de diagnóstico DESTRUTIVO (podia desregistrar/excluir o número)
// exposto sem autenticação: devolve 410 e não faz nada.
Deno.serve(() => new Response(JSON.stringify({ error: { code: 'removida', message: 'Função de diagnóstico removida (plano WhatsApp Cloud API, 12/11/2026).' } }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
