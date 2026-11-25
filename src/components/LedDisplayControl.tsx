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
  const outputLink = `${window.location.origin}${window.location.pathname}#/display`
  const boxOnlyLink = `${window.location.origin}${window.location.pathname}#/display?view=box`
  const winnerListLink = `${window.location.origin}${window.location.pathname}#/display?view=winners`
  useEffect(() => { let cancelled = false; void supabase.auth.getUser().then(({data}) => { if (!cancelled) setCurrentUserId(data.user?.id ?? null) }); return () => { cancelled = true } }, [])

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

  async function publishPreview() {
    if (saving || !previewScene || !liveScene || previewScene === liveScene) return
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

  async function copyOutputLink(link: string, label: string) {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setMessage(`${label} link copied. Open it on the display device and sign in with this same admin account.`)
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
    return <button className={`led-scene-button ${live ? 'is-live' : ''} ${preview && !live ? 'is-preview' : ''}`} onClick={() => { setPreviewScene(scene); setMessage(''); setError('') }} disabled={loading || saving} aria-pressed={preview}>
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
    <section className="led-scene-grid" aria-label="Choose a display scene, then fade it live">
      {sceneButton('welcome', 'Welcome Page', 'Event welcome screen')}
      {sceneButton('lucky_draw', 'Lucky Draw Sessions', 'Live prize draw screen')}
      {sceneButton('attendance', 'Attendance Roll', 'Checked-in guest list')}
      {sceneButton('manual_checkin', 'Manual Check-in', 'Guest check-in instructions')}
      {sceneButton('blackout', 'Blackout', 'Turn the venue screen black')}
      <button className="led-fade-button" onClick={() => void publishPreview()} disabled={loading || saving || !previewScene || previewScene === liveScene}>
        <span>{saving ? 'Fading…' : 'Fade'}</span><MoveRight size={24} /><small>{previewScene === liveScene ? 'Select a scene first' : `Send ${previewLabel} live`}</small>
      </button>
    </section>
    {loading && <p className="led-loading">Connecting to the live display…</p>}
    <section className="led-output-link panel">
      <div><h3>Full LED output</h3><p>Complete display: Lucky Draw Box animation and winner list together.</p></div>
      <div className="led-link-row"><input aria-label="Full LED output link" readOnly value={currentUserId ? outputLink : 'Sign in with an administrator account to generate the display link'} onFocus={(event) => event.currentTarget.select()} /><button className="button-primary" onClick={() => void copyOutputLink(outputLink, 'Full LED output')} disabled={!currentUserId}><Copy size={16} /> Copy link</button></div>
      <div><h3>Box animation only</h3><p>Shows only the 3D Lucky Draw Box animation.</p></div>
      <div className="led-link-row"><input aria-label="Box animation only link" readOnly value={currentUserId ? boxOnlyLink : 'Sign in with an administrator account to generate the display link'} onFocus={(event) => event.currentTarget.select()} /><button className="button-primary" onClick={() => void copyOutputLink(boxOnlyLink, 'Box animation')} disabled={!currentUserId}><Copy size={16} /> Copy link</button></div>
      <div><h3>Winner list only</h3><p>Shows only the live winner list.</p></div>
      <div className="led-link-row"><input aria-label="Winner list only link" readOnly value={currentUserId ? winnerListLink : 'Sign in with an administrator account to generate the display link'} onFocus={(event) => event.currentTarget.select()} /><button className="button-primary" onClick={() => void copyOutputLink(winnerListLink, 'Winner list')} disabled={!currentUserId}><Copy size={16} /> Copy link</button></div>
    </section>
  </div>
}
