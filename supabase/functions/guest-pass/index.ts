import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0'

const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '') ?? ''
const allowedOrigin = appUrl ? new URL(appUrl).origin : ''
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: corsHeaders })
  if (!appUrl || (request.headers.get('origin') && request.headers.get('origin') !== allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'This guest pass is not available.' }), { status: 403, headers: corsHeaders })
  }

  let token: unknown
  try { token = (await request.json()).token }
  catch { token = null }
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response(JSON.stringify({ error: 'Invitation link is invalid.' }), { status: 400, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => {
    try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default }
    catch { return '' }
  })()
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Guest pass service is not configured.' }), { status: 503, headers: corsHeaders })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: participant, error } = await adminClient
    .from('participants')
    .select('full_name, email, phone, category, organisation, participant_code, is_active')
    .eq('qr_token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !participant) {
    return new Response(JSON.stringify({ error: 'Invitation link is invalid or no longer active.' }), { status: 404, headers: corsHeaders })
  }

  const { data: displaySettings } = await adminClient.from('display_state').select('payload').eq('id', 1).maybeSingle()
  const eventSettings = displaySettings?.payload && typeof displaySettings.payload === 'object'
    ? displaySettings.payload as { event_name?: string; event_date?: string; event_location?: string }
    : {}

  return new Response(JSON.stringify({
    participant: {
      name: participant.full_name,
      email: participant.email,
      phone: participant.phone,
      category: participant.category,
      organisation: participant.organisation,
      participant_code: participant.participant_code,
    },
    event: {
      name: eventSettings.event_name?.trim() || Deno.env.get('EVENT_NAME') || 'Johor Meetup X',
      date: eventSettings.event_date?.trim() || Deno.env.get('EVENT_DATE') || null,
      location: eventSettings.event_location?.trim() || Deno.env.get('EVENT_LOCATION') || null,
    },
  }), { headers: corsHeaders })
})
