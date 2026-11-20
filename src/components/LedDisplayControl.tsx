import { useCallback, useEffect, useState } from 'react'
import { Copy, Monitor, MoveRight, Power, RefreshCw, Users as UsersIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './LedDisplay.css'

export type DisplayScene = 'welcome' | 'lucky_draw' | 'attendance' | 'blackout'

function mapScene(rawScene: unknown): DisplayScene {
  if (rawScene === 'blackout') return 'blackout'
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
  const outputLink = `${window.location.origin}${window.location.pathname}#/display`

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

  async function copyOutputLink() {
    try {
      await navigator.clipboard.writeText(outputLink)
      setMessage('Display link copied. Open it on the LED laptop and sign in with an administrator account.')
    } catch {
      setError('Could not copy the link. Select and copy it from the box below.')
    }
  }

  const previewLabel = previewScene === 'welcome'
    ? 'Welcome Page'
    : previewScene === 'attendance'
      ? 'Attendance Roll'
      : previewScene === 'blackout'
          ? 'Blackout'
          : 'Lucky Draw Sessions'

  const sceneButton = (scene: DisplayScene, title: string, description: string) => {
    const live = liveScene === scene
    const preview = previewScene === scene
    return <button className={`led-scene-button ${live ? 'is-live' : ''} ${preview && !live ? 'is-preview' : ''}`} onClick={() => { setPreviewScene(scene); setMessage(''); setError('') }} disabled={loading || saving} aria-pressed={preview}>
      <span className={`led-live-indicator ${live ? 'is-on-air' : preview ? 'is-preview-label' : ''}`}>{live ? <><span className="led-live-dot" /> LIVE NOW</> : preview ? 'PREVIEW SELECTED' : ''}</span>
      <span className={`led-scene-icon ${scene === 'lucky_draw' ? 'draw' : scene === 'blackout' ? 'blackout' : ''}`}>{scene === 'welcome' ? <Monitor size={34} /> : scene === 'attendance' ? <UsersIcon size={34} /> : scene === 'blackout' ? <Power size={34} /> : <span>★</span>}</span>
      <strong>{title}</strong><small>{description}</small>
    </button>
  }

  return <div className="led-control-page">
    <header className="led-control-heading">
      <div><span className="led-control-eyebrow"><Monitor size={15} /> VENUE DISPLAY</span><h2>LED Display</h2><p>Select a screen to preview it, then press Fade to send it to the output.</p></div>
      <button className="button-secondary" onClick={() => void loadScene()} disabled={loading || saving}><RefreshCw size={16} /> Refresh</button>
    </header>
    {error && <div className="led-message error" role="alert">{error}</div>}
    {message && <div className="led-message success" role="status">{message}</div>}
    <section className="led-scene-grid" aria-label="Choose a preview, then fade it live">
      {sceneButton('welcome', 'Welcome Page', 'Show the welcome screen to guests')}
      <button className="led-fade-button" onClick={() => void publishPreview()} disabled={loading || saving || !previewScene || previewScene === liveScene}>
        <span>{saving ? 'Fading…' : 'Fade'}</span><MoveRight size={20} /><small>{previewScene === liveScene ? 'Select a screen first' : `Send ${previewLabel} live`}</small>
      </button>
      {sceneButton('lucky_draw', 'Lucky Draw Sessions', 'Show the draw session on the event display')}
      <div className="led-secondary-scenes">
        {sceneButton('attendance', 'Attendance Roll', 'Scroll through guests who are checked in')}
        {sceneButton('blackout', 'Blackout', 'Fade the venue LED screen to pure black for stage safety')}
      </div>
    </section>
    {loading && <p className="led-loading">Connecting to the live display…</p>}
    <section className="led-output-link panel">
      <div><h3>LED laptop output link</h3><p>Open this link in the browser used on the event screen. Sign in there with an administrator account to view the display.</p></div>
      <div className="led-link-row"><input aria-label="LED laptop display link" readOnly value={outputLink} onFocus={(event) => event.currentTarget.select()} /><button className="button-primary" onClick={() => void copyOutputLink()}><Copy size={16} /> Copy link</button></div>
    </section>
  </div>
}
