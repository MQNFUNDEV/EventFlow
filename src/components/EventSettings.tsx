import { useCallback, useEffect, useState } from 'react'
import { ImagePlus, Save, RefreshCw, ScanLine, Palette, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './EventSettings.css'

type EventPayload = {
  event_name?: string
  event_date?: string
  event_location?: string
  welcome_background?: string | null
  welcome_poster?: string | null
  theme_colors?: string[]
  scene_backgrounds?: Partial<Record<BackgroundScene, SceneBackground>>
  assets_updated_at?: string
  [key: string]: unknown
}

type BackgroundScene = 'lucky_draw' | 'attendance' | 'manual_checkin'
type SceneBackground = { mode: 'theme' | 'key_visual' | 'custom'; path: string }
const BACKGROUND_SCENES: { id: BackgroundScene; name: string }[] = [
  { id: 'lucky_draw', name: 'Lucky Draw' },
  { id: 'attendance', name: 'Attendance Roll' },
  { id: 'manual_checkin', name: 'Manual Check-in' },
]
const DEFAULT_SCENE_BACKGROUNDS: Record<BackgroundScene, SceneBackground> = {
  lucky_draw: { mode: 'theme', path: '' },
  attendance: { mode: 'theme', path: '' },
  manual_checkin: { mode: 'theme', path: '' },
}

const KV_PATH = `${import.meta.env.BASE_URL}johor-meetup-x-2026-kv.png`
const ASSET_BUCKET = 'event-assets'
const POSTER_OBJECT_PATH = 'welcome/key-visual.jpg'
const BACKGROUND_OBJECT_PATH = 'welcome/background-1920x1080.jpg'
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function isDataImage(value: string) { return value.startsWith('data:image/') }

function dataImageToBlob(dataUrl: string) {
  const [metadata, content] = dataUrl.split(',')
  const mimeType = metadata.match(/^data:(.*?);base64$/)?.[1]
  if (!mimeType || !content) throw new Error('The image data could not be read.')
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

async function uploadEventImage(path: string, image: Blob) {
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, image, { contentType: image.type, cacheControl: '3600', upsert: true })
  if (error) throw error
}

async function decodeImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

function isExactFullHd(image: HTMLImageElement) {
  return image.naturalWidth === 1920 && image.naturalHeight === 1080
}

function colorDistance(first: string, second: string) {
  const a = [1, 3, 5].map((offset) => Number.parseInt(first.slice(offset, offset + 2), 16))
  const b = [1, 3, 5].map((offset) => Number.parseInt(second.slice(offset, offset + 2), 16))
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function scanKeyVisualColors(source: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 144
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('This browser cannot scan the key visual colors.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>()
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const brightness = (r + g + b) / 3
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    if (brightness < 32 || brightness > 244 || saturation < 42) continue
    const channels = [r, g, b].map((channel) => Math.min(255, Math.round(channel / 24) * 24))
    const key = channels.join(',')
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 }
    bucket.r += r
    bucket.g += g
    bucket.b += b
    bucket.count += 1
    buckets.set(key, bucket)
  }
  const candidates = [...buckets.values()]
    .map(({ r, g, b, count }) => ({ color: `#${[r, g, b].map((channel) => Math.round(channel / count).toString(16).padStart(2, '0')).join('')}`, count }))
    .sort((a, b) => b.count - a.count)
  const selected: string[] = []
  const darkAnchor = candidates.find(({ color }) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
    return channels.reduce((sum, channel) => sum + channel, 0) / 3 < 110
  })
  selected.push(darkAnchor?.color ?? DEFAULT_THEME[0])

  while (selected.length < 5) {
    const nextCandidate = candidates
      .filter(({ color }) => !selected.includes(color))
      .map(({ color, count }) => ({ color, score: Math.min(...selected.map((chosen) => colorDistance(color, chosen))) + Math.log2(count + 1) * 3 }))
      .filter(({ color }) => Math.min(...selected.map((chosen) => colorDistance(color, chosen))) >= 92)
      .sort((a, b) => b.score - a.score)[0]
    if (nextCandidate) {
      selected.push(nextCandidate.color)
      continue
    }
    const fallback = DEFAULT_THEME.find((color) => !selected.includes(color) && Math.min(...selected.map((chosen) => colorDistance(color, chosen))) >= 92)
    if (fallback) selected.push(fallback)
    else selected.push(DEFAULT_THEME[selected.length])
  }
  return selected
}

function make16x9Fill(source: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the 16:9 artwork.')

  const scale = Math.max(canvas.width / source.width, canvas.height / source.height)
  const backgroundWidth = source.width * scale
  const backgroundHeight = source.height * scale
  context.filter = 'blur(30px) brightness(0.42) saturate(1.25)'
  context.drawImage(source, (canvas.width - backgroundWidth) / 2 - 45, (canvas.height - backgroundHeight) / 2 - 45, backgroundWidth + 90, backgroundHeight + 90)
  context.filter = 'none'
  context.fillStyle = 'rgba(5, 9, 22, 0.28)'
  context.fillRect(0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/jpeg', 0.9)
}

async function compressUploadedKV(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.')
  if (file.size > 15 * 1024 * 1024) throw new Error('The original image must be 15 MB or smaller.')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const scale = Math.min(1, 1920 / image.naturalWidth, 1080 / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare the uploaded key visual.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
    if (Math.ceil(dataUrl.length * 0.75) > 2.25 * 1024 * 1024) throw new Error('This image is still too large after compression. Please choose a simpler image.')
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export default function EventSettings() {
  const [settingsTab, setSettingsTab] = useState<'led' | 'event'>('led')
  const [eventName, setEventName] = useState('Johor Meetup X')
  const [eventDate, setEventDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [generatedFill, setGeneratedFill] = useState('')
  const [backgroundPath, setBackgroundPath] = useState('')
  const [keyVisual, setKeyVisual] = useState(KV_PATH)
  const [keyVisualIsFullHd, setKeyVisualIsFullHd] = useState(false)
  const [posterPath, setPosterPath] = useState('')
  const [themeColors, setThemeColors] = useState<string[]>(DEFAULT_THEME)
  const [sceneBackgrounds, setSceneBackgrounds] = useState<Record<BackgroundScene, SceneBackground>>(DEFAULT_SCENE_BACKGROUNDS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const savePayloadPatch = useCallback(async (patch: EventPayload) => {
    const { data: latest, error: readError } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
    if (readError) throw readError
    const latestPayload = latest?.payload && typeof latest.payload === 'object' ? latest.payload as EventPayload : {}
    const nextPayload: EventPayload = { ...latestPayload, ...patch }
    const { error: saveError } = await supabase.from('display_state').update({ payload: nextPayload, updated_at: new Date().toISOString() }).eq('id', 1)
    if (saveError) throw saveError
    return nextPayload
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      const { data, error: queryError } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (cancelled) return
      if (queryError) setError(queryError.message)
      else {
        let values = data?.payload && typeof data.payload === 'object' ? data.payload as EventPayload : {}
        const savedSceneBackgrounds = values.scene_backgrounds ?? {}
        setSceneBackgrounds(Object.fromEntries(BACKGROUND_SCENES.map(({ id }) => {
          const saved = savedSceneBackgrounds[id]
          const mode = saved?.mode === 'key_visual' || saved?.mode === 'custom' ? saved.mode : 'theme'
          return [id, { mode, path: typeof saved?.path === 'string' ? saved.path : '' }]
        })) as Record<BackgroundScene, SceneBackground>)
        let savedPoster = typeof values.welcome_poster === 'string' ? values.welcome_poster : ''
        let savedBackground = typeof values.welcome_background === 'string' ? values.welcome_background : ''
        try {
          if (isDataImage(savedPoster)) {
            await uploadEventImage(POSTER_OBJECT_PATH, dataImageToBlob(savedPoster))
            values = await savePayloadPatch({ welcome_poster: POSTER_OBJECT_PATH, assets_updated_at: new Date().toISOString() })
            savedPoster = POSTER_OBJECT_PATH
          }
          if (isDataImage(savedBackground)) {
            await uploadEventImage(BACKGROUND_OBJECT_PATH, dataImageToBlob(savedBackground))
            values = await savePayloadPatch({ welcome_background: BACKGROUND_OBJECT_PATH, assets_updated_at: new Date().toISOString() })
            savedBackground = BACKGROUND_OBJECT_PATH
          }
        } catch (migrationError) {
          setError(migrationError instanceof Error ? `Artwork migration needs attention: ${migrationError.message}` : 'Artwork could not be moved into private file storage.')
        }
        setEventName(values.event_name ?? 'Johor Meetup X')
        setEventDate(values.event_date ?? '')
        setEventLocation(values.event_location ?? '')
        setPosterPath(savedPoster && !isDataImage(savedPoster) ? savedPoster : '')
        let posterUrl = KV_PATH
        if (savedPoster) {
          if (isDataImage(savedPoster)) posterUrl = savedPoster
          else {
            const { data: signed } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(savedPoster, 86400)
            posterUrl = signed?.signedUrl ?? KV_PATH
          }
        }
        setKeyVisual(posterUrl)
        let fullHd = false
        try {
          fullHd = isExactFullHd(await decodeImage(posterUrl))
        } catch { /* The default artwork remains available if the uploaded image cannot be decoded. */ }
        if (cancelled) return
        setKeyVisualIsFullHd(fullHd)
        if (fullHd && savedBackground) {
          try {
            values = await savePayloadPatch({ welcome_background: null, assets_updated_at: new Date().toISOString() })
            savedBackground = ''
          } catch (clearError) {
            setError(clearError instanceof Error ? `Full HD artwork is ready, but its old generated fill could not be cleared: ${clearError.message}` : 'Full HD artwork is ready, but its old generated fill could not be cleared.')
          }
        } else if (!fullHd && !savedBackground) {
          try {
            const generatedBackground = make16x9Fill(await decodeImage(posterUrl))
            await uploadEventImage(BACKGROUND_OBJECT_PATH, dataImageToBlob(generatedBackground))
            values = await savePayloadPatch({ welcome_background: BACKGROUND_OBJECT_PATH, assets_updated_at: new Date().toISOString() })
            savedBackground = BACKGROUND_OBJECT_PATH
          } catch (generationError) {
            setError(generationError instanceof Error ? `The KV loaded, but its 16:9 fill could not be generated: ${generationError.message}` : 'The KV loaded, but its 16:9 fill could not be generated.')
          }
        }
        setBackgroundPath(savedBackground && !isDataImage(savedBackground) ? savedBackground : '')
        if (savedBackground) {
          if (isDataImage(savedBackground)) setGeneratedFill(savedBackground)
          else {
            const { data: signed } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(savedBackground, 86400)
            setGeneratedFill(signed?.signedUrl ?? '')
          }
        } else setGeneratedFill('')
        setThemeColors(Array.isArray(values.theme_colors) && values.theme_colors.length === 5 && values.theme_colors.every(isHexColor) ? values.theme_colors : DEFAULT_THEME)
      }
      setLoading(false)
    }
    void loadSettings()
    return () => { cancelled = true }
  }, [savePayloadPatch])

  async function saveEventDetails() {
    setSaving(true)
    setError('')
    setMessage('')
    const eventPatch: EventPayload = {
      event_name: eventName.trim() || 'Johor Meetup X',
      event_date: eventDate.trim(),
      event_location: eventLocation.trim(),
    }
    try {
      await savePayloadPatch(eventPatch)
      setMessage('Event details saved and synced to the dashboard and LED output.')
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save event details.') }
    setSaving(false)
  }

  async function saveThemeColors() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await savePayloadPatch({ theme_colors: themeColors })
      setMessage('LED theme colors saved and synced to the display.')
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save LED theme colors.') }
    setSaving(false)
  }

  async function saveSceneBackgroundSettings() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await savePayloadPatch({ scene_backgrounds: sceneBackgrounds })
      setMessage('LED scene backgrounds saved. Changes apply automatically on the live LED output.')
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save the LED scene backgrounds.') }
    setSaving(false)
  }

  async function uploadSceneBackground(scene: BackgroundScene, file?: File) {
    if (!file) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const compressed = await compressUploadedKV(file)
      const path = `scene-backgrounds/${scene}.jpg`
      await uploadEventImage(path, dataImageToBlob(compressed))
      const nextBackgrounds = { ...sceneBackgrounds, [scene]: { mode: 'custom' as const, path } }
      await savePayloadPatch({ scene_backgrounds: nextBackgrounds, assets_updated_at: new Date().toISOString() })
      setSceneBackgrounds(nextBackgrounds)
      setMessage(`${BACKGROUND_SCENES.find((item) => item.id === scene)?.name ?? 'Scene'} background uploaded and synced to the live LED output.`)
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this scene background.') }
    setSaving(false)
  }

  async function generateFill() {
    if (keyVisualIsFullHd) {
      setGeneratedFill('')
      setMessage('This KV is exactly 1920 × 1080, so it fills the LED screen directly without a generated surround.')
      return
    }
    setGenerating(true)
    setError('')
    setMessage('')
    try {
      const image = await decodeImage(keyVisual)
      setGeneratedFill(make16x9Fill(image))
      setMessage('16:9 fill generated. Save the settings to send it to the LED Welcome Page.')
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Could not generate the 16:9 background fill.')
    }
    setGenerating(false)
  }

  async function scanKV() {
    setScanning(true)
    setError('')
    setMessage('')
    try {
      const image = new Image()
      image.src = keyVisual
      await image.decode()
      setThemeColors(scanKeyVisualColors(image))
      setMessage('Five theme colors scanned from the KV. Save theme colors to apply them to the LED scenes.')
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Could not scan colors from the KV.')
    }
    setScanning(false)
  }

  async function uploadKV(file?: File) {
    if (!file) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const compressedPoster = await compressUploadedKV(file)
      const image = await decodeImage(compressedPoster)
      const isFullHd = isExactFullHd(image)
      const generatedBackground = isFullHd ? '' : make16x9Fill(image)
      await uploadEventImage(POSTER_OBJECT_PATH, dataImageToBlob(compressedPoster))
      if (generatedBackground) await uploadEventImage(BACKGROUND_OBJECT_PATH, dataImageToBlob(generatedBackground))
      await savePayloadPatch({
        welcome_poster: POSTER_OBJECT_PATH,
        welcome_background: generatedBackground ? BACKGROUND_OBJECT_PATH : null,
        assets_updated_at: new Date().toISOString(),
      })
      setKeyVisual(compressedPoster)
      setKeyVisualIsFullHd(isFullHd)
      setPosterPath(POSTER_OBJECT_PATH)
      setBackgroundPath(generatedBackground ? BACKGROUND_OBJECT_PATH : '')
      setGeneratedFill(generatedBackground)
      setMessage(isFullHd
        ? '1920 × 1080 key visual uploaded and synced to the live LED output.'
        : 'Key visual uploaded with a 1920 × 1080 fill and synced to the live LED output.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the key visual.')
    }
    setSaving(false)
  }

  async function saveFill() {
    if (!generatedFill) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await uploadEventImage(BACKGROUND_OBJECT_PATH, dataImageToBlob(generatedFill))
      const patch: EventPayload = { welcome_background: BACKGROUND_OBJECT_PATH, assets_updated_at: new Date().toISOString() }
      if (posterPath) patch.welcome_poster = posterPath
      await savePayloadPatch(patch)
      setBackgroundPath(BACKGROUND_OBJECT_PATH)
      setMessage('Generated 16:9 fill saved and synced to the live LED output.')
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save the LED background.') }
    setSaving(false)
  }

  return <main className="event-settings-page">
    <header className="event-settings-heading"><button className="button-secondary" onClick={() => window.location.reload()} disabled={loading || saving}><RefreshCw size={16} /> Refresh</button></header>
    <nav className="event-settings-tabs" aria-label="Settings sections" role="tablist">
      <button type="button" role="tab" aria-selected={settingsTab === 'led'} className={settingsTab === 'led' ? 'active' : ''} onClick={() => { setSettingsTab('led'); setError(''); setMessage('') }}>LED Settings</button>
      <button type="button" role="tab" aria-selected={settingsTab === 'event'} className={settingsTab === 'event' ? 'active' : ''} onClick={() => { setSettingsTab('event'); setError(''); setMessage('') }}>Event Settings</button>
    </nav>
    {error && <div className="event-settings-message error" role="alert">{error}</div>}
    {message && <div className="event-settings-message success" role="status">{message}</div>}
    {settingsTab === 'led' ? <>
      <section className="panel event-settings-card">
        <div className="event-settings-card-heading"><div><h3>LED theme colors</h3><p>Choose five clearly distinct colors for the Lucky Draw and Attendance Roll scenes, or scan the KV for a separated, high contrast palette.</p></div></div>
        <div className="event-theme-palette">
          {themeColors.map((color, index) => <label key={index}><span>Color {index + 1}</span><div className="event-theme-color-control"><input aria-label={`Theme color ${index + 1}`} type="color" value={color} onChange={(event) => setThemeColors((current) => current.map((value, colorIndex) => colorIndex === index ? event.target.value : value))} /><code>{color.toUpperCase()}</code></div></label>)}
        </div>
        <div className="event-settings-actions"><button className="button-secondary" onClick={() => void scanKV()} disabled={loading || scanning || generating}><ScanLine size={16} /> {scanning ? 'Scanning KV…' : 'Scan KV colors'}</button><button className="button-primary" onClick={() => void saveThemeColors()} disabled={loading || saving}>{saving ? 'Saving…' : <><Palette size={16} /> Save theme colors</>}</button></div>
        <div className="event-theme-preview" aria-label="Current LED color theme">{themeColors.map((color, index) => <span key={index} style={{ backgroundColor: color }} />)}</div>
      </section>
      <section className="panel event-settings-card">
        <div className="event-settings-card-heading"><div><h3>LED scene backgrounds</h3><p>Choose the event KV or animated theme colors for each scene, or upload a separate background image.</p></div></div>
        <div className="event-scene-background-list">{BACKGROUND_SCENES.map(({ id, name }) => <article className="event-scene-background-row" key={id}>
          <div className="event-scene-background-title"><strong>{name}</strong><small>{sceneBackgrounds[id].mode === 'custom' && sceneBackgrounds[id].path ? 'Custom image uploaded' : sceneBackgrounds[id].mode === 'key_visual' ? 'Using event KV' : 'Using animated theme'}</small></div>
          <label className="event-scene-background-mode">Background source<select value={sceneBackgrounds[id].mode} onChange={(event) => setSceneBackgrounds((current) => ({ ...current, [id]: { ...current[id], mode: event.target.value as SceneBackground['mode'] } }))} disabled={loading || saving}><option value="theme">Animated theme colors</option><option value="key_visual">Event key visual</option><option value="custom">Separate uploaded image</option></select></label>
          <label className="event-settings-upload"><Upload size={15} /> {saving ? 'Saving…' : 'Upload background'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadSceneBackground(id, event.target.files?.[0]); event.currentTarget.value = '' }} disabled={loading || saving} /></label>
        </article>)}</div>
        <button className="button-primary" onClick={() => void saveSceneBackgroundSettings()} disabled={loading || saving}><Save size={16} /> {saving ? 'Saving…' : 'Save scene backgrounds'}</button>
        <p className="event-settings-hint">Separate images are compressed before upload and apply automatically on the live LED output.</p>
      </section>
      <section className="panel event-settings-card">
        <div className="event-settings-card-heading"><div><h3>Welcome screen artwork</h3><p>1920 × 1080 artwork fills the screen edge-to-edge. Other image sizes get an automatically generated 16:9 surround, with the original KV centered.</p></div></div>
        <div className="event-settings-kv-preview">{keyVisualIsFullHd ? <img className="event-settings-fullhd-preview" src={keyVisual} alt="Full-screen 1920 by 1080 event key visual" /> : generatedFill ? <><img className="event-settings-fill-preview" src={generatedFill} alt="Generated 16:9 color fill" /><img className="event-settings-poster-preview" src={keyVisual} alt="Centered event key visual" /></> : <img src={keyVisual} alt="Preview of the current event key visual" />}</div>
        <div className="event-settings-actions"><label className="event-settings-upload button-secondary"><Upload size={16} /> Upload KV image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadKV(event.target.files?.[0]); event.currentTarget.value = '' }} disabled={loading || saving} /></label>{!keyVisualIsFullHd && <><button className="button-secondary" onClick={() => void generateFill()} disabled={loading || generating || scanning || saving}><ImagePlus size={16} /> {generating ? 'Generating fill…' : 'Regenerate 16:9 fill'}</button><button className="button-primary" onClick={() => void saveFill()} disabled={loading || saving || !generatedFill}>{saving ? 'Saving…' : <><Save size={16} /> {backgroundPath ? 'Replace LED Welcome Page fill' : 'Save for LED Welcome Page'}</>}</button></>}</div>
        <p className="event-settings-hint">Changes sync automatically to the live LED output screen. The original poster file remains unchanged.</p>
      </section>
    </> : <section className="panel event-settings-card">
      <div className="event-settings-card-heading"><div><h3>Event details</h3><p>Manage the event identity and venue information shown in the dashboard and LED display.</p></div></div>
      <div className="event-settings-fields">
        <label>Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="Johor Meetup X" disabled={loading} /></label>
        <label>Date and time<input value={eventDate} onChange={(event) => setEventDate(event.target.value)} placeholder="To be announced" disabled={loading} /></label>
        <label>Venue<input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} placeholder="To be announced" disabled={loading} /></label>
      </div>
      <button className="button-primary" onClick={() => void saveEventDetails()} disabled={loading || saving}>{saving ? 'Saving…' : <><Save size={16} /> Save event details</>}</button>
    </section>}
  </main>
}
