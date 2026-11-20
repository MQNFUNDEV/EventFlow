import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired: EventFlow is an internal operator-only application.
// This endpoint intentionally performs no database or email operations.
Deno.serve(() => new Response(
  JSON.stringify({ error: "This feature has been retired. Use the EventFlow staff application." }),
  { status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
));
