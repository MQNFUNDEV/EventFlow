import { useEffect, useState, type CSSProperties } from 'react'
import type { DisplayScene } from './LedDisplayControl'
import LedLuckyDrawOutput from './LedLuckyDrawOutput'
import { supabase } from '../lib/supabase'
import './LedDisplay.css'

type Attendee = { participant_id: string; checked_in_at: string; participant: { full_name: string; category: string } }
type BackgroundScene = 'lucky_draw' | 'attendance' | 'manual_checkin'
type SceneBackground = { mode: 'theme' | 'key_visual' | 'custom'; path: string }
const BACKGROUND_SCENES: BackgroundScene[] = ['lucky_draw', 'attendance', 'manual_checkin']
const DEFAULT_SCENE_BACKGROUNDS: Record<BackgroundScene, SceneBackground> = {
  lucky_draw: { mode: 'theme', path: '' }, attendance: { mode: 'theme', path: '' }, manual_checkin: { mode: 'theme', path: '' },
}
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function readSceneBackgrounds(value: unknown): Record<BackgroundScene, SceneBackground> {
  const source = value && typeof value === 'object' ? value as Partial<Record<BackgroundScene, Partial<SceneBackground>>> : {}
  return Object.fromEntries(BACKGROUND_SCENES.map((scene) => {
    const saved = source[scene]
    const mode = saved?.mode === 'key_visual' || saved?.mode === 'custom' ? saved.mode : 'theme'
    return [scene, { mode, path: typeof saved?.path === 'string' ? saved.path : '' }]
  })) as Record<BackgroundScene, SceneBackground>
}

function isExactFullHd(image: HTMLImageElement) {
  return image.naturalWidth === 1920 && image.naturalHeight === 1080
}

export default function LedDisplayOutput() {
  const [scene, setScene] = useState<DisplayScene>('welcome')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [generatedWelcomeFill, setGeneratedWelcomeFill] = useState('')
  const [welcomePoster, setWelcomePoster] = useState(`${import.meta.env.BASE_URL}johor-meetup-x-2026-kv.png`)
  const [welcomePosterIsFullHd, setWelcomePosterIsFullHd] = useState(false)
  const [eventDetails, setEventDetails] = useState({ name: 'Johor Meetup X', date: '', venue: '' })
  const [themeColors, setThemeColors] = useState<string[]>(DEFAULT_THEME)
  const [sceneBackgrounds, setSceneBackgrounds] = useState(DEFAULT_SCENE_BACKGROUNDS)
  const [signedSceneBackgrounds, setSignedSceneBackgrounds] = useState<Partial<Record<BackgroundScene, string>>>({})
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let currentScene: DisplayScene | null = null
    let transitionTimer = 0
    let visibleTimer = 0

    async function loadWelcomeFill() {
      const { data } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (cancelled) return
      const payload = data?.payload && typeof data.payload === 'object' ? data.payload as { welcome_background?: unknown; welcome_poster?: unknown; theme_colors?: unknown; event_name?: unknown; event_date?: unknown; event_location?: unknown; scene_backgrounds?: unknown } : {}
      setSceneBackgrounds(readSceneBackgrounds(payload.scene_backgrounds))
      setEventDetails({
        name: typeof payload.event_name === 'string' && payload.event_name.trim() ? payload.event_name.trim() : 'Johor Meetup X',
        date: typeof payload.event_date === 'string' ? payload.event_date.trim() : '',
        venue: typeof payload.event_location === 'string' ? payload.event_location.trim() : '',
      })
      let posterUrl = `${import.meta.env.BASE_URL}johor-meetup-x-2026-kv.png`
      if (typeof payload.welcome_poster === 'string' && payload.welcome_poster.startsWith('data:image/')) posterUrl = payload.welcome_poster
      else if (typeof payload.welcome_poster === 'string') {
        const { data: signed, error: signedError } = await supabase.storage.from('event-assets').createSignedUrl(payload.welcome_poster, 86400)
        if (cancelled) return
        if (signedError) setError('The uploaded key visual could not be loaded. Check Event Settings and try again.')
        else posterUrl = signed?.signedUrl ?? posterUrl
      }
      let isFullHd = false
      try {
        const image = new Image()
        image.src = posterUrl
        await image.decode()
        isFullHd = isExactFullHd(image)
      } catch { /* Keep the standard poster layout when image metadata cannot load. */ }
      if (cancelled) return
      setWelcomePoster(posterUrl)
      setWelcomePosterIsFullHd(isFullHd)
      if (isFullHd) setGeneratedWelcomeFill('')
      else if (typeof payload.welcome_background === 'string' && payload.welcome_background.startsWith('data:image/')) setGeneratedWelcomeFill(payload.welcome_background)
      else if (typeof payload.welcome_background === 'string') {
        const { data: signed, error: signedError } = await supabase.storage.from('event-assets').createSignedUrl(payload.welcome_background, 86400)
        if (cancelled) return
        if (signedError) setError('The saved LED background could not be loaded. Refresh the display or regenerate the fill in Event Settings.')
        else setGeneratedWelcomeFill(signed?.signedUrl ?? '')
      } else setGeneratedWelcomeFill('')
      if (Array.isArray(payload.theme_colors) && payload.theme_colors.length === 5 && payload.theme_colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) setThemeColors(payload.theme_colors)
    }

    async function refreshScene() {
      const { data, error: queryError } = await supabase.from('display_state').select('scene, payload').eq('id', 1).maybeSingle()
      if (cancelled) return
      if (queryError) {
        setError('Cannot connect to the display. Sign in with an administrator account and check the connection.')
        return
      }
      setError('')
      const payload = data?.payload && typeof data.payload === 'object' ? data.payload as { event_name?: unknown; event_date?: unknown; event_location?: unknown } : {}
      const nextEventDetails = {
        name: typeof payload.event_name === 'string' && payload.event_name.trim() ? payload.event_name.trim() : 'Johor Meetup X',
        date: typeof payload.event_date === 'string' ? payload.event_date.trim() : '',
        venue: typeof payload.event_location === 'string' ? payload.event_location.trim() : '',
      }
      setEventDetails((current) => current.name === nextEventDetails.name && current.date === nextEventDetails.date && current.venue === nextEventDetails.venue ? current : nextEventDetails)
      const incomingBackgrounds = readSceneBackgrounds((data?.payload && typeof data.payload === 'object' ? data.payload as { scene_backgrounds?: unknown } : {}).scene_backgrounds)
      setSceneBackgrounds((current) => BACKGROUND_SCENES.every((key) => current[key].mode === incomingBackgrounds[key].mode && current[key].path === incomingBackgrounds[key].path) ? current : incomingBackgrounds)
      const incoming: DisplayScene = data?.scene === 'manual_checkin' ? 'manual_checkin' : data?.scene === 'attendance' ? 'attendance' : data?.scene === 'lucky_draw' || data?.scene === 'winner_announcement' ? 'lucky_draw' : 'welcome'
      if (incoming === 'attendance') {
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('attendance')
          .select('participant_id, checked_in_at, participants!inner(full_name, category, is_active)')
          .eq('participants.is_active', true)
          .order('checked_in_at', { ascending: true })
        if (cancelled) return
        if (attendanceError) {
          setError('The attendance roll could not load. Check the display account permissions and try again.')
          return
        }
        setAttendees((attendanceData ?? []).map((row) => {
          const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants
          return { participant_id: row.participant_id, checked_in_at: row.checked_in_at, participant: { full_name: participant?.full_name ?? 'Guest', category: participant?.category ?? '' } }
        }))
      }
      if (currentScene === incoming) return
      const wasInitialized = currentScene !== null
      currentScene = incoming
      setVisible(false)
      transitionTimer = window.setTimeout(() => {
        if (cancelled) return
        setScene(incoming)
        visibleTimer = window.setTimeout(() => { if (!cancelled) setVisible(true) }, 80)
      }, wasInitialized ? 300 : 0)
    }

    void loadWelcomeFill()
    void refreshScene()
    const interval = window.setInterval(() => void refreshScene(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearTimeout(transitionTimer)
      window.clearTimeout(visibleTimer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadCustomSceneBackgrounds() {
      const resolved: Partial<Record<BackgroundScene, string>> = {}
      await Promise.all(BACKGROUND_SCENES.map(async (scene) => {
        const background = sceneBackgrounds[scene]
        if (background.mode !== 'custom' || !background.path) return
        const { data } = await supabase.storage.from('event-assets').createSignedUrl(background.path, 86400)
        if (data?.signedUrl) resolved[scene] = data.signedUrl
      }))
      if (!cancelled) setSignedSceneBackgrounds(resolved)
    }
    void loadCustomSceneBackgrounds()
    return () => { cancelled = true }
  }, [sceneBackgrounds])

  const repeatedAttendees = attendees.length > 0 ? [...attendees, ...attendees] : []
  const themeStyles = {
    '--led-theme-1': themeColors[0],
    '--led-theme-2': themeColors[1],
    '--led-theme-3': themeColors[2],
    '--led-theme-4': themeColors[3],
    '--led-theme-5': themeColors[4],
  } as CSSProperties
  const activeSceneBackground = scene === 'lucky_draw' || scene === 'attendance' || scene === 'manual_checkin' ? sceneBackgrounds[scene] : null
  const sceneBackgroundImage = activeSceneBackground?.mode === 'key_visual'
    ? welcomePoster
    : activeSceneBackground?.mode === 'custom'
      ? signedSceneBackgrounds[scene as BackgroundScene] ?? ''
      : ''

  return <main className={`led-output-screen ${scene === 'lucky_draw' ? 'is-lucky-scene' : ''}`} style={themeStyles}>
    {error ? <div className="led-output-error">{error}</div> : <div className={`led-output-scene ${scene === 'attendance' ? 'is-attendance-scene' : ''} ${scene === 'manual_checkin' ? 'is-manual-checkin-scene' : ''} ${visible ? 'is-visible' : ''}`}>
      {scene !== 'welcome' && scene !== 'lucky_draw' && sceneBackgroundImage && <img className="led-scene-background" src={sceneBackgroundImage} alt="" aria-hidden="true" />}
      {scene === 'welcome' ? <>
        <div className={`led-welcome-kv ${welcomePosterIsFullHd ? 'is-fullscreen-kv' : ''}`} aria-label="Johor Meetup X 2026 event key visual">
          {!welcomePosterIsFullHd && (generatedWelcomeFill ? <img className="led-generated-fill" src={generatedWelcomeFill} alt="" /> : <img className="led-welcome-backdrop" src={welcomePoster} alt="" />)}
          <img className="led-welcome-poster" src={welcomePoster} alt="Event key visual" />
        </div>
      </> : scene === 'lucky_draw' ? <LedLuckyDrawOutput eventName={eventDetails.name} /> : scene === 'manual_checkin' ? <>
        <div className="led-manual-checkin-brand"><div className="led-output-brand">MAQNA EVENTFLOW</div></div>
        <div className="led-manual-checkin-event"><h2>{eventDetails.name}</h2><p>{eventDetails.date || 'Date to be announced'} <span>·</span> {eventDetails.venue || 'Venue to be announced'}</p></div>
        <div className="led-manual-checkin-copy"><span className="led-manual-checkin-kicker">WALK-IN GUESTS</span><h1>Manual Check-in</h1><p>Scan the QR code to register your details.</p></div>
        <div className="led-manual-checkin-qr-frame" role="img" aria-label="Sample QR code placeholder. Not scannable.">
          <div className="led-manual-checkin-qr" aria-hidden="true">{Array.from({ length: 29 * 29 }, (_, index) => {
            const row = Math.floor(index / 29)
            const column = index % 29
            const finderOrigins = [[1, 1], [1, 21], [21, 1]]
            const finder = finderOrigins.find(([top, left]) => row >= top && row < top + 7 && column >= left && column < left + 7)
            let dark = finder ? row === finder[0] || row === finder[0] + 6 || column === finder[1] || column === finder[1] + 6 || (row >= finder[0] + 2 && row <= finder[0] + 4 && column >= finder[1] + 2 && column <= finder[1] + 4) : ((row * 17 + column * 31 + row * column * 7) % 13) < 6
            if (finder && !dark) dark = false
            return <i className={dark ? 'is-dark' : ''} key={index} />
          })}</div>
          <span>SAMPLE</span>
        </div>
        <div className="led-manual-checkin-note">Google Form link and scannable QR will be added in Event Settings.</div>
      </> : <>
        <div className="led-attendance-heading"><div className="led-output-brand">JOHOR MEETUP X</div><h1>Our Guests Are Here</h1><p>{attendees.length} checked in and counting</p></div>
        {attendees.length ? <div className="led-credits-window" aria-label="List of checked-in guests">
          <div className="led-credits-track">{repeatedAttendees.map((guest, index) => <div className="led-credit-name" key={`${guest.participant_id}-${index}`}><strong>{guest.participant.full_name}</strong><span>{guest.participant.category}</span></div>)}</div>
        </div> : <div className="led-attendance-empty">Waiting for the first guests to check in</div>}
      </>}
      {scene !== 'lucky_draw' && !(scene === 'welcome' && welcomePosterIsFullHd) && scene !== 'manual_checkin' && <div className="led-output-bottom">MAQNA EVENTFLOW</div>}
    </div>}
  </main>
}
