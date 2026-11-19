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

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const origin = request.headers.get('origin')
  if (!appUrl || !allowedOrigin || (origin && origin !== allowedOrigin)) {
    return respond({ error: 'Invitation sender is not configured for this site.' }, 403)
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ??
    (() => {
      try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default }
      catch { return '' }
    })()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    (() => {
      try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default }
      catch { return '' }
    })()

  if (!accessToken || !supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: 'Authentication or server configuration is missing.' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: authError } = await userClient.auth.getUser(accessToken)
  if (authError || !userData.user) return respond({ error: 'A valid staff login is required.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: roleData, error: roleError } = await adminClient
    .from('admin_roles').select('role, is_active').eq('user_id', userData.user.id).maybeSingle()
  if (roleError || !roleData?.is_active || !['super_admin', 'event_admin'].includes(roleData.role)) {
    return respond({ error: 'Only active Super Admins and Event Admins can send invitations.' }, 403)
  }

  let body: { participant_ids?: unknown; resend?: unknown }
  try {
    body = await request.json()
  }
  catch { return respond({ error: 'A participant selection is required.' }, 400) }
  const participantIds = body.participant_ids
  const resend = body.resend === true
  if (!Array.isArray(participantIds) || participantIds.length < 1 || participantIds.length > 100 ||
      participantIds.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    return respond({ error: 'Choose between 1 and 100 valid participants.' }, 400)
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const sender = Deno.env.get('INVITATION_FROM')
  if (!resendKey || !sender) return respond({ error: 'Email sending needs RESEND_API_KEY and INVITATION_FROM secrets.' }, 503)

  const { data: participants, error: participantsError } = await adminClient
    .from('participants')
    .select('id, full_name, email, phone, category, organisation, participant_code, qr_token')
    .in('id', participantIds)
    .eq('is_active', true)
  if (participantsError) return respond({ error: 'Unable to load the selected participants.' }, 500)

  const { data: invitationRows, error: invitationsError } = await adminClient
    .from('participant_invitations').select('participant_id, status, sent_at, updated_at').in('participant_id', participantIds)
  if (invitationsError) return respond({ error: 'Invitation tracking is not ready. Ask an administrator to apply the latest database update.' }, 503)
  const invitationByParticipant = new Map((invitationRows ?? []).map((row) => [row.participant_id, row]))

  const { data: displaySettings } = await adminClient.from('display_state').select('payload').eq('id', 1).maybeSingle()
  const eventSettings = displaySettings?.payload && typeof displaySettings.payload === 'object'
    ? displaySettings.payload as { event_name?: string; event_date?: string; event_location?: string }
    : {}
  const eventName = eventSettings.event_name?.trim() || Deno.env.get('EVENT_NAME') || 'Johor Meetup X'
  const eventDate = eventSettings.event_date?.trim() || Deno.env.get('EVENT_DATE') || ''
  const eventLocation = eventSettings.event_location?.trim() || Deno.env.get('EVENT_LOCATION') || ''
  let sent = 0
  let skipped = 0
  const failed: Array<{ name: string; reason: string }> = []

  for (const participant of participants ?? []) {
    const priorInvitation = invitationByParticipant.get(participant.id)
    if (priorInvitation?.status === 'sent' && !resend) {
      skipped++
      continue
    }
    const pendingIsStale = priorInvitation?.status === 'pending' && Date.now() - new Date(priorInvitation.updated_at).getTime() > 10 * 60 * 1000
    if (priorInvitation?.status === 'pending' && !pendingIsStale) {
      skipped++
      continue
    }
    const claimTime = new Date().toISOString()
    if (!priorInvitation) {
      const { error: claimError } = await adminClient.from('participant_invitations').insert({ participant_id: participant.id, status: 'pending', updated_at: claimTime, updated_by: userData.user.id })
      if (claimError) {
        skipped++
        continue
      }
    } else {
      const claim = adminClient.from('participant_invitations').update({ status: 'pending', last_error: null, updated_at: claimTime, updated_by: userData.user.id }).eq('participant_id', participant.id).eq('status', priorInvitation.status)
      const { data: claimRows, error: claimError } = pendingIsStale
        ? await claim.eq('updated_at', priorInvitation.updated_at).select('participant_id')
        : await claim.select('participant_id')
      if (claimError || !claimRows?.length) {
        skipped++
        continue
      }
    }
    if (!participant.email?.trim()) {
      const reason = 'No email address'
      failed.push({ name: participant.full_name, reason })
      await adminClient.from('participant_invitations').update({ status: 'failed', last_error: reason, sent_at: priorInvitation?.sent_at ?? null, updated_at: new Date().toISOString(), updated_by: userData.user.id }).eq('participant_id', participant.id)
      continue
    }
    const passUrl = `${appUrl}/#/guest-pass?token=${encodeURIComponent(participant.qr_token)}`
    const detailLines = [eventDate && `Date: ${eventDate}`, eventLocation && `Venue: ${eventLocation}`].filter(Boolean)
    const detailsText = detailLines.length ? `\n\n${detailLines.join('\n')}` : ''
    const detailsHtml = detailLines.length ? `<p>${detailLines.map(escapeHtml).join('<br>')}</p>` : ''
    const registrationText = [
      `Name: ${participant.full_name}`,
      `Participant code: ${participant.participant_code}`,
      `Category: ${participant.category}`,
      participant.email && `Email: ${participant.email}`,
      participant.phone && `Phone: ${participant.phone}`,
      participant.organisation && `Organisation: ${participant.organisation}`,
    ].filter(Boolean).join('\n')
    const registrationHtml = [
      `<li><strong>Name:</strong> ${escapeHtml(participant.full_name)}</li>`,
      `<li><strong>Participant code:</strong> ${escapeHtml(participant.participant_code)}</li>`,
      `<li><strong>Category:</strong> ${escapeHtml(participant.category)}</li>`,
      participant.email && `<li><strong>Email:</strong> ${escapeHtml(participant.email)}</li>`,
      participant.phone && `<li><strong>Phone:</strong> ${escapeHtml(participant.phone)}</li>`,
      participant.organisation && `<li><strong>Organisation:</strong> ${escapeHtml(participant.organisation)}</li>`,
    ].filter(Boolean).join('')
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
        from: sender,
        to: [participant.email],
        subject: `Your invitation to ${eventName}`,
        text: `Hello ${participant.full_name},\n\nYou are invited to ${eventName}.${detailsText}\n\nYour registration details:\n${registrationText}\n\nOpen your personal EventFlow pass: ${passUrl}\n\nShow the QR code to the Front Desk when you arrive. Please keep your pass link private.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Your invitation to ${escapeHtml(eventName)}</h2><p>Hello ${escapeHtml(participant.full_name)},</p><p>You are invited to ${escapeHtml(eventName)}.</p>${detailsHtml}<h3>Your registration details</h3><ul>${registrationHtml}</ul><p><a href="${escapeHtml(passUrl)}">Open your personal EventFlow pass and QR code</a></p><p>Show the QR code to the Front Desk when you arrive. Please keep your pass link private.</p></div>`,
        }),
      })
      const sentSuccessfully = response.ok
      const reason = sentSuccessfully ? null : `Email provider returned ${response.status}`
      const { data: trackingRows, error: trackingError } = await adminClient.from('participant_invitations').update({
        status: sentSuccessfully ? 'sent' : 'failed',
        sent_at: sentSuccessfully ? new Date().toISOString() : priorInvitation?.sent_at ?? null,
        last_error: reason,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id,
      }).eq('participant_id', participant.id).eq('status', 'pending').select('participant_id')
      if (trackingError || !trackingRows?.length) return respond({ error: 'Email was processed, but its invitation status could not be saved. Check the sender logs before retrying to avoid duplicates.' }, 500)
      if (sentSuccessfully) sent++
      else failed.push({ name: participant.full_name, reason: reason ?? 'Email provider error' })
    } catch {
      const reason = 'Email provider could not be reached.'
      failed.push({ name: participant.full_name, reason })
      await adminClient.from('participant_invitations').update({ status: 'failed', last_error: reason, sent_at: priorInvitation?.sent_at ?? null, updated_at: new Date().toISOString(), updated_by: userData.user.id }).eq('participant_id', participant.id).eq('status', 'pending')
    }
  }

  return respond({ sent, failed: failed.length, skipped, failures: failed }, sent || skipped || !failed.length ? 200 : 502)
})
