import { useCallback, useEffect, useState } from 'react'
import { Copy, Monitor, MoveRight, Power, RefreshCw, Users as UsersIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './LedDisplay.css'

export type DisplayScene = 'welcome' | 'lucky_draw' | 'attendance' | 'manual_checkin' | 'blackout'

function mapScene(rawScene: unknown): DisplayScene {
  if (rawScene === 'blackout') return 'blackout'
  if (rawScene === 'manual_checkin') return 'manual_checkin'
  if (rawScene === 'attendance') return 'attendance'
  if (rawScene === 'lucky_draw' || rawScene === 'winner_announcement') return 'lucky_draw'
  return 'welcome'
}

export default function LedDisplayControl() {
  const [liveScene, setLiveScene] = useState<DisplayScene | null>(null)
  const [previewScene, setPreviewScene] = useState<DisplayScene | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [controllerUserId, setControllerUserId] = useState<string | null>(null)
  const [controllerLeaseExpiresAt, setControllerLeaseExpiresAt] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const isController = Boolean(currentUserId && controllerUserId === currentUserId)
  const leaseActive = Boolean(controllerLeaseExpiresAt && new Date(controllerLeaseExpiresAt).getTime() > Date.now())
  const outputLink = currentUserId ? `${window.location.origin}${window.location.pathname}#/display?controller=${encodeURIComponent(currentUserId)}` : ''

  const refreshController = useCallback(async () => {
    const [{ data: userData, error: userError }, { data: stateData, error: stateError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('display_state')
        .select('active_controller_user_id, controller_lease_expires_at')
        .eq('id', 1)
        .maybeSingle(),
    ])
    if (userError || stateError) {
      setError(userError?.message ?? stateError?.message ?? 'Could not verify the LED controller.')
      return
    }
    setCurrentUserId(userData.user?.id ?? null)
    setControllerUserId(stateData?.active_controller_user_id ?? null)
    setControllerLeaseExpiresAt(stateData?.controller_lease_expires_at ?? null)
  }, [])

  const loadScene = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('display_state').select('scene').eq('id', 1).maybeSingle()
    if (queryError) setError(queryError.message)
    else if (data?.scene) {
      const mapped = mapScene(data.scene)
      setLiveScene(mapped)
      setPreviewScene(mapped)
      setError('')
    } else setError('Display controls are not available. No live display state was found.')
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadScene() }, 0)
    const channel = supabase
      .channel('led-control-display-state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_state', filter: 'id=eq.1' }, (change) => {
        const nextRow = change.new as { scene?: unknown } | null
        if (nextRow?.scene) {
          setLiveScene(mapScene(nextRow.scene))
        }
      })
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [loadScene])

  useEffect(() => {
    void refreshController()
    const channel = supabase
      .channel('led-control-controller-owner')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_state', filter: 'id=eq.1' }, (change) => {
        const nextRow = change.new as { active_controller_user_id?: string | null; controller_lease_expires_at?: string | null } | null
        setControllerUserId(nextRow?.active_controller_user_id ?? null)
        setControllerLeaseExpiresAt(nextRow?.controller_lease_expires_at ?? null)
      })
      .subscribe()
    const interval = window.setInterval(() => void refreshController(), 10000)
    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [refreshController])

  async function takeControl() {
    if (claiming || isController) return
    setClaiming(true)
    setError('')
    setMessage('')
    const { data, error: claimError } = await supabase.rpc('acquire_display_controller', { p_lease_seconds: 90 })
    const claim = Array.isArray(data) ? data[0] : data
    if (claimError) {
      setError(claimError.message)
    } else if (claim?.acquired) {
      setControllerUserId(claim.controller_user_id)
      setControllerLeaseExpiresAt(claim.lease_expires_at)
      setMessage('You are now the active LED controller. Other admins cannot change the live display or Lucky Draw session.')
      await loadScene()
    } else {
      setControllerUserId(claim?.controller_user_id ?? null)
      setControllerLeaseExpiresAt(claim?.lease_expires_at ?? null)
      setError('Another administrator currently controls the LED display. Control becomes available after their lease expires or they release it.')
    }
    setClaiming(false)
  }

  async function releaseControl() {
    if (!isController || claiming) return
    setClaiming(true)
    const { data, error: releaseError } = await supabase.rpc('release_display_controller')
    if (releaseError) {
      setError(releaseError.message)
    } else if (data) {
      setControllerUserId(null)
      setControllerLeaseExpiresAt(null)
      setMessage('LED control released. Another administrator can now take control.')
    }
    setClaiming(false)
  }

  async function publishPreview() {
    if (!isController || saving || !previewScene || !liveScene || previewScene === liveScene) return
    setSaving(true)
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.from('display_state').update({ scene: previewScene, updated_at: new Date().toISOString() }).eq('id', 1)
    if (updateError) setError(updateError.message)
    else {
      setLiveScene(previewScene)
      setMessage(`The ${previewLabel} preview is now live.`)
    }
    setSaving(false)
  }

  async function copyOutputLink() {
    if (!isController || !outputLink) return
    try {
      await navigator.clipboard.writeText(outputLink)
      setMessage('Unique display link copied. Open it on the LED laptop and sign in with this same admin account.')
    } catch {
      setError('Could not copy the link. Select and copy it from the box below.')
    }
  }

  const previewLabel = previewScene === 'welcome'
    ? 'Welcome Page'
    : previewScene === 'attendance'
      ? 'Attendance Roll'
      : previewScene === 'manual_checkin'
        ? 'Manual Check-in'
        : previewScene === 'blackout'
          ? 'Blackout'
          : 'Lucky Draw Sessions'

  const sceneButton = (scene: DisplayScene, title: string, description: string) => {
    const live = liveScene === scene
    const preview = previewScene === scene
    return <button className={`led-scene-button ${live ? 'is-live' : ''} ${preview && !live ? 'is-preview' : ''}`} onClick={() => { setPreviewScene(scene); setMessage(''); setError('') }} disabled={!isController || loading || saving} aria-pressed={preview}>
      <span className={`led-live-indicator ${live ? 'is-on-air' : preview ? 'is-preview-label' : ''}`}>{live ? <><span className="led-live-dot" /> LIVE NOW</> : preview ? 'PREVIEW SELECTED' : ''}</span>
      <span className={`led-scene-icon ${scene === 'lucky_draw' ? 'draw' : scene === 'manual_checkin' ? 'manual' : scene === 'blackout' ? 'blackout' : ''}`}>{scene === 'welcome' ? <Monitor size={34} /> : scene === 'attendance' ? <UsersIcon size={34} /> : scene === 'manual_checkin' ? <UsersIcon size={34} /> : scene === 'blackout' ? <Power size={34} /> : <span>★</span>}</span>
      <strong>{title}</strong><small>{description}</small>
    </button>
  }

  return <div className="led-control-page">
    <div className="led-control-heading">
      <button className="button-secondary" onClick={() => void loadScene()} disabled={loading || saving}><RefreshCw size={16} /> Refresh</button>
    </div>
    {error && <div className="led-message error" role="alert">{error}</div>}
    {message && <div className="led-message success" role="status">{message}</div>}
    <section className="panel led-controller-panel">
      <div>
        <h3>LED Display Controller</h3>
        <p>{isController
          ? 'This admin account owns the live display and Lucky Draw controls.'
          : leaseActive
            ? `Another admin currently owns control (ID ${controllerUserId?.slice(0, 8)}…). Wait for release or lease expiry.`
            : 'No admin currently owns the display. Take control before operating the LED or Lucky Draw.'}</p>
        {currentUserId && <small>Your admin ID: {currentUserId}</small>}
      </div>
      {isController
        ? <button className="button-secondary" onClick={() => void releaseControl()} disabled={claiming}>{claiming ? 'Releasing…' : 'Release control'}</button>
        : <button className="button-primary" onClick={() => void takeControl()} disabled={claiming || leaseActive}>{claiming ? 'Taking control…' : 'Take control'}</button>}
    </section>
    <section className="led-scene-grid" aria-label="Choose a display scene, then fade it live">
      {sceneButton('welcome', 'Welcome Page', 'Event welcome screen')}
      {sceneButton('lucky_draw', 'Lucky Draw Sessions', 'Live prize draw screen')}
      {sceneButton('attendance', 'Attendance Roll', 'Checked-in guest list')}
      {sceneButton('manual_checkin', 'Manual Check-in', 'Guest check-in instructions')}
      {sceneButton('blackout', 'Blackout', 'Turn the venue screen black')}
      <button className="led-fade-button" onClick={() => void publishPreview()} disabled={!isController || loading || saving || !previewScene || previewScene === liveScene}>
        <span>{saving ? 'Fading…' : 'Fade'}</span><MoveRight size={24} /><small>{previewScene === liveScene ? 'Select a scene first' : `Send ${previewLabel} live`}</small>
      </button>
    </section>
    {loading && <p className="led-loading">Connecting to the live display…</p>}
    <section className="led-output-link panel">
      <div><h3>LED laptop output link</h3><p>{isController ? 'This unique link is bound to your admin ID. Sign in on the LED laptop with the same admin account.' : 'Take control first. Only the active controller can generate and copy the display link.'}</p></div>
      <div className="led-link-row"><input aria-label="LED laptop display link" readOnly value={isController ? outputLink : 'Take control to generate your unique display link'} onFocus={(event) => event.currentTarget.select()} /><button className="button-primary" onClick={() => void copyOutputLink()} disabled={!isController}><Copy size={16} /> Copy link</button></div>
    </section>
  </div>
}
