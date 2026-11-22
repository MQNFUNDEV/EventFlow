import { useCallback, useState } from 'react'
import { Activity, RefreshCw, Share2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

const HIVE_MIND_BRIDGE_URL =
  'https://ulbkkjgbmvjxqbqurtux.supabase.co/functions/v1/eventflow-bridge'

type HiveMindStatus = {
  ok: boolean
  integration: string
  project_key: string
  staff_role: string
  data_scope: string
  metrics: {
    participants: number | null
    attendance_checkins: number | null
    lucky_draw: {
      drawing_rounds: number | null
      pending: number | null
      collected: number | null
      available: number | null
    } | null
  }
  checked_at: string
}

type Props = {
  currentRole: string
}

export default function HiveMindPanel({ currentRole }: Props) {
  const [status, setStatus] = useState<HiveMindStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Your EventFlow session has expired. Sign in again.')

      const result = await fetch(HIVE_MIND_BRIDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'status' }),
      })
      const payload = await result.json()
      if (!result.ok) throw new Error(payload.error || 'Hive Mind connection failed.')
      setStatus(payload as HiveMindStatus)
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : 'Unable to connect to Hive Mind.')
    } finally {
      setLoading(false)
    }
  }, [])

  const shareStatus = useCallback(async () => {
    if (!status) return
    setSharing(true)
    setError('')
    setMessage('')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Your EventFlow session has expired. Sign in again.')

      const draw = status.metrics.lucky_draw
      const body = [
        `Aggregate operational snapshot captured at ${status.checked_at}.`,
        `Active participants: ${status.metrics.participants ?? 'unavailable'}.`,
        `Attendance check-ins: ${status.metrics.attendance_checkins ?? 'unavailable'}.`,
        draw
          ? `Lucky Draw: ${draw.drawing_rounds ?? 'unavailable'} active rounds; ${draw.pending ?? 'unavailable'} pending; ${draw.collected ?? 'unavailable'} collected; ${draw.available ?? 'unavailable'} available.`
          : 'Lucky Draw metrics were not included for this staff role.',
        'This update contains aggregate counts only. No participant names, emails, phone numbers or row-level records are shared.',
      ].join(' ')

      const result = await fetch(HIVE_MIND_BRIDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'submit-project-update',
          update_type: 'status',
          title: 'EventFlow aggregate operational snapshot',
          body,
        }),
      })
      const payload = await result.json()
      if (!result.ok) throw new Error(payload.error || 'Unable to submit the update.')
      setMessage('Status submitted to Hive Mind for review.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to share status with Hive Mind.')
    } finally {
      setSharing(false)
    }
  }, [status])

  const isAdmin = currentRole === 'super_admin' || currentRole === 'event_admin'
  const draw = status?.metrics.lucky_draw

  return (
    <section className="panel" aria-labelledby="hive-mind-heading">
      <div className="panel-header">
        <div>
          <h3 id="hive-mind-heading">Hive Mind</h3>
          <p>Shared project intelligence and secure status sync</p>
        </div>
        <div className="hive-mind-heading-icon"><Activity size={19} /></div>
      </div>

      <div className="hive-mind-connection">
        <div className="hive-mind-connection-label">
          <span className={status ? 'status-dot' : 'status-dot hive-mind-offline'} />
          <strong>{loading ? 'Connecting…' : status ? 'Connected' : 'Not connected'}</strong>
          <span className="hive-mind-project-key">eventflow-attendance</span>
        </div>
        <button className="panel-link" type="button" onClick={() => void refreshStatus()} disabled={loading || sharing}>
          <RefreshCw size={15} className={loading ? 'hive-mind-spin' : ''} />
          {loading ? 'Checking…' : status ? 'Refresh' : 'Check connection'}
        </button>
      </div>

      {status && (
        <>
          <div className="hive-mind-metrics">
            <div><span>Participants</span><strong>{status.metrics.participants ?? '—'}</strong></div>
            <div><span>Checked in</span><strong>{status.metrics.attendance_checkins ?? '—'}</strong></div>
            {draw && (
              <>
                <div><span>Draw pending</span><strong>{draw.pending ?? '—'}</strong></div>
                <div><span>Draw available</span><strong>{draw.available ?? '—'}</strong></div>
              </>
            )}
          </div>
          <div className="hive-mind-privacy">
            <ShieldCheck size={15} />
            Aggregate-only data. Participant personal details are not shared.
          </div>
          <div className="hive-mind-actions">
            {isAdmin && (
              <button className="button-secondary" type="button" onClick={() => void shareStatus()} disabled={sharing || loading}>
                <Share2 size={15} />
                {sharing ? 'Sharing…' : 'Share status with Hive Mind'}
              </button>
            )}
            <span className="hive-mind-checked-at">
              Synced {new Intl.DateTimeFormat('en-MY', { hour: '2-digit', minute: '2-digit' }).format(new Date(status.checked_at))}
            </span>
          </div>
        </>
      )}

      {error && <p className="hive-mind-error" role="alert">{error}</p>}
      {message && <p className="hive-mind-success" role="status">{message}</p>}
    </section>
  )
}
