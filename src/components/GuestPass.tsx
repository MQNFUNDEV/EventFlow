import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import './GuestPass.css'

type PassDetails = {
  participant: { name: string; email: string | null; phone: string | null; category: string; organisation: string | null; participant_code: string }
  event: { name: string; date: string | null; location: string | null }
}

export default function GuestPass() {
  const [qrImage, setQrImage] = useState('')
  const [passDetails, setPassDetails] = useState<PassDetails | null>(null)
  const [passError, setPassError] = useState('')
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ??
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token')?.trim() ?? ''
  const invalid = !/^[0-9a-f-]{36}$/i.test(token) || Boolean(passError)

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return
    }
    let cancelled = false
    async function loadPass() {
      const { data, error } = await supabase.functions.invoke('guest-pass', { body: { token } })
      if (cancelled) return
      if (error || !data?.participant) {
        setPassError(error?.message ?? 'Invitation link is invalid or inactive.')
        return
      }
      setPassDetails(data as PassDetails)
      const passUrl = `${window.location.origin}${window.location.pathname}#/guest-pass?token=${encodeURIComponent(token)}`
      try {
        const image = await QRCode.toDataURL(passUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
        if (!cancelled) setQrImage(image)
      } catch {
        if (!cancelled) setPassError('Unable to prepare your QR pass.')
      }
    }
    void loadPass()
    return () => { cancelled = true }
  }, [token])

  return (
    <main className="guest-pass-page">
      <section className="guest-pass-card">
        <div className="guest-pass-brand">MAQNA EVENTFLOW</div>
        {invalid ? (
          <><h1>Invitation link unavailable</h1><p>Ask the event organiser to resend your invitation.</p></>
        ) : (
          <>
            <h1>Your {passDetails?.event.name ?? 'EventFlow'} pass</h1>
            <p>Show this QR code to the Front Desk when you arrive. They will scan it to record your check-in.</p>
            {qrImage ? <img className="guest-pass-qr" src={qrImage} alt="Your event check-in QR code" /> : <div className="guest-pass-loading">Preparing your pass…</div>}
            {passDetails && <dl className="guest-pass-details">
              <div><dt>Name</dt><dd>{passDetails.participant.name}</dd></div>
              <div><dt>Participant code</dt><dd>{passDetails.participant.participant_code}</dd></div>
              <div><dt>Category</dt><dd>{passDetails.participant.category}</dd></div>
              {passDetails.participant.organisation && <div><dt>Organisation</dt><dd>{passDetails.participant.organisation}</dd></div>}
              {passDetails.participant.email && <div><dt>Email</dt><dd>{passDetails.participant.email}</dd></div>}
              {passDetails.participant.phone && <div><dt>Phone</dt><dd>{passDetails.participant.phone}</dd></div>}
              <div><dt>Date and time</dt><dd>{passDetails.event.date ?? 'To be announced'}</dd></div>
              <div><dt>Venue</dt><dd>{passDetails.event.location ?? 'To be announced'}</dd></div>
            </dl>}
            <p className="guest-pass-hint">Keep this link private and have the QR code ready at the entrance.</p>
          </>
        )}
      </section>
    </main>
  )
}
