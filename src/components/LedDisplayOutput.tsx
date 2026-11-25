import { useEffect, useState, type CSSProperties } from 'react'
import type { DisplayScene } from './LedDisplayControl'
import LedLuckyDrawOutput from './LedLuckyDrawOutput'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './LedDisplay.css'

type Attendee = { participant_id: string; checked_in_at: string; participant: { full_name: string; category: string } }
type BackgroundScene = 'lucky_draw' | 'attendance' | 'manual_checkin'
type SceneBackground = { mode: 'theme' | 'key_visual' | 'custom'; path: string }
type DisplayPayload = {
  welcome_background?: unknown
  welcome_poster?: unknown
  theme_colors?: unknown
  event_name?: unknown
  event_date?: unknown
  event_location?: unknown
  scene_backgrounds?: unknown
  assets_updated_at?: unknown
  participant_categories?: unknown
}

const BACKGROUND_SCENES: BackgroundScene[] = ['lucky_draw', 'attendance', 'manual_checkin']
const DEFAULT_SCENE_BACKGROUNDS: Record<BackgroundScene, SceneBackground> = {
  lucky_draw: { mode: 'theme', path: '' }, attendance: { mode: 'theme', path: '' }, manual_checkin: { mode: 'theme', path: '' },
}
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']
const DEFAULT_KV_URL = `${import.meta.env.BASE_URL}johor-meetup-x-2026-kv.png`

function mapScene(rawScene: unknown): DisplayScene {
  if (rawScene === 'blackout') return 'blackout'
  if (rawScene === 'manual_checkin') return 'manual_checkin'
  if (rawScene === 'attendance') return 'attendance'
  if (rawScene === 'lucky_draw' || rawScene === 'winner_announcement') return 'lucky_draw'
  return 'welcome'
}

function readSceneBackgrounds(value: unknown): Record<BackgroundScene, SceneBackground> {
  const source = value && typeof value === 'object' ? value as Partial<Record<BackgroundScene, Partial<SceneBackground>>> : {}
  return Object.fromEntries(BACKGROUND_SCENES.map((scene) => {
    const saved = source[scene]
    const mode = saved?.mode === 'key_visual' || saved?.mode === 'custom' ? saved.mode : 'theme'
    return [scene, { mode, path: typeof saved?.path === 'string' ? saved.path : '' }]
  })) as Record<BackgroundScene, SceneBackground>
}

function isValidThemeColors(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === 5 && value.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
}

function isExactFullHd(image: HTMLImageElement) {
  return image.naturalWidth === 1920 && image.naturalHeight === 1080
}

export default function LedDisplayOutput() {
  const displayParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const controllerUserId = displayParams.get('controller')
  const requestedView = displayParams.get('view') === 'box' || displayParams.get('view') === 'winners' ? displayParams.get('view') as 'box' | 'winners' : 'full'
  const [accessDenied, setAccessDenied] = useState(false)
  const [scene, setScene] = useState<DisplayScene>('welcome')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [participantCategories, setParticipantCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [generatedWelcomeFill, setGeneratedWelcomeFill] = useState('')
  const [welcomePoster, setWelcomePoster] = useState(DEFAULT_KV_URL)
  const [welcomePosterIsFullHd, setWelcomePosterIsFullHd] = useState(false)
  const [eventDetails, setEventDetails] = useState({ name: 'Johor Meetup X', date: '', venue: '' })
  const [themeColors, setThemeColors] = useState<string[]>(DEFAULT_THEME)
  const [sceneBackgrounds, setSceneBackgrounds] = useState(DEFAULT_SCENE_BACKGROUNDS)
  const [assetsVersion, setAssetsVersion] = useState('')
  const [signedSceneBackgrounds, setSignedSceneBackgrounds] = useState<Partial<Record<BackgroundScene, string>>>({})
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let currentScene: DisplayScene | null = null
    let lastPosterSignature = ''
    let lastBackgroundSignature = ''
    let transitionTimer = 0
    let visibleTimer = 0
    let authChecked = false
    let authenticatedUserId: string | null = null

    async function syncWelcomeArtwork(payload: DisplayPayload, nextAssetsVersion: string) {
      const rawPoster = typeof payload.welcome_poster === 'string' ? payload.welcome_poster : ''
      const rawBackground = typeof payload.welcome_background === 'string' ? payload.welcome_background : ''
      const posterSignature = `${rawPoster}|${nextAssetsVersion}`
      const backgroundSignature = `${rawBackground}|${nextAssetsVersion}`
      if (posterSignature === lastPosterSignature && backgroundSignature === lastBackgroundSignature) return

      lastPosterSignature = posterSignature
      lastBackgroundSignature = backgroundSignature

      let posterUrl = DEFAULT_KV_URL
      if (rawPoster.startsWith('data:image/')) {
        posterUrl = rawPoster
      } else if (rawPoster) {
        const { data: signed, error: signedError } = await supabase.storage.from('event-assets').createSignedUrl(rawPoster, 86400)
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

      if (isFullHd) {
        setGeneratedWelcomeFill('')
      } else if (rawBackground.startsWith('data:image/')) {
        setGeneratedWelcomeFill(rawBackground)
      } else if (rawBackground) {
        const { data: signed, error: signedError } = await supabase.storage.from('event-assets').createSignedUrl(rawBackground, 86400)
        if (cancelled) return
        if (signedError) setError('The saved LED background could not be loaded. Regenerate the fill in Event Settings.')
        else setGeneratedWelcomeFill(signed?.signedUrl ?? '')
      } else {
        setGeneratedWelcomeFill('')
      }
    }

    async function applyDisplayRow(row: { scene?: unknown; payload?: unknown } | null | undefined) {
      if (cancelled || !row) return
      const payload: DisplayPayload = row.payload && typeof row.payload === 'object' ? row.payload as DisplayPayload : {}
      const nextAssetsVersion = typeof payload.assets_updated_at === 'string' ? payload.assets_updated_at : ''
      setParticipantCategories(readParticipantCategories(payload))

      const nextEventDetails = {
        name: typeof payload.event_name === 'string' && payload.event_name.trim() ? payload.event_name.trim() : 'Johor Meetup X',
        date: typeof payload.event_date === 'string' ? payload.event_date.trim() : '',
        venue: typeof payload.event_location === 'string' ? payload.event_location.trim() : '',
      }
      setEventDetails((current) => current.name === nextEventDetails.name && current.date === nextEventDetails.date && current.venue === nextEventDetails.venue ? current : nextEventDetails)

      if (isValidThemeColors(payload.theme_colors)) {
        const nextTheme = payload.theme_colors
        setThemeColors((current) => current.every((color, index) => color === nextTheme[index]) ? current : nextTheme)
      }

      const incomingBackgrounds = readSceneBackgrounds(payload.scene_backgrounds)
      setSceneBackgrounds((current) => BACKGROUND_SCENES.every((key) => current[key].mode === incomingBackgrounds[key].mode && current[key].path === incomingBackgrounds[key].path) ? current : incomingBackgrounds)
      setAssetsVersion((current) => current === nextAssetsVersion ? current : nextAssetsVersion)

      void syncWelcomeArtwork(payload, nextAssetsVersion)

      const incoming = mapScene(row.scene)
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
        setAttendees((attendanceData ?? []).map((attendanceRow) => {
          const participant = Array.isArray(attendanceRow.participants) ? attendanceRow.participants[0] : attendanceRow.participants
          return { participant_id: attendanceRow.participant_id, checked_in_at: attendanceRow.checked_in_at, participant: { full_name: participant?.full_name ?? 'Guest', category: participant?.category ?? '' } }
        }))
      }

      if (currentScene === incoming) return
      const wasInitialized = currentScene !== null
      currentScene = incoming
      window.clearTimeout(transitionTimer)
      window.clearTimeout(visibleTimer)
      setVisible(false)
      transitionTimer = window.setTimeout(() => {
        if (cancelled) return
        setScene(incoming)
        visibleTimer = window.setTimeout(() => { if (!cancelled) setVisible(true) }, 80)
      }, wasInitialized ? 300 : 0)
    }

    async function refreshScene() {
      if (!authChecked) {
        const { data: userData } = await supabase.auth.getUser()
        authenticatedUserId = userData.user?.id ?? null
        authChecked = true
      }
      const { data, error: queryError } = await supabase.from('display_state')
        .select('scene, payload, active_controller_user_id')
        .eq('id', 1)
        .maybeSingle()
      if (cancelled) return
      if (queryError) {
        setError('Cannot connect to the display. Sign in with the linked administrator account and check the connection.')
        return
      }
      if (!controllerUserId || authenticatedUserId !== controllerUserId || data?.active_controller_user_id !== controllerUserId) {
        setAccessDenied(true)
        setError('This display link is not assigned to the signed-in admin account or is no longer the active controller.')
        return
      }
      setAccessDenied(false)
      setError('')
      await applyDisplayRow(data)
    }

    void refreshScene()
    const channel = supabase
      .channel('led-output-display-state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_state', filter: 'id=eq.1' }, (change) => {
        const nextRow = change.new as { scene?: unknown; payload?: unknown; active_controller_user_id?: string | null } | null
        if (!authChecked || !controllerUserId || authenticatedUserId !== controllerUserId || nextRow?.active_controller_user_id !== controllerUserId) {
          setAccessDenied(true)
          setError('This display link is not assigned to the signed-in admin account or is no longer the active controller.')
          return
        }
        setAccessDenied(false)
        setError('')
        void applyDisplayRow(nextRow)
      })
      .subscribe()

    const interval = window.setInterval(() => void refreshScene(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearTimeout(transitionTimer)
      window.clearTimeout(visibleTimer)
      void supabase.removeChannel(channel)
    }
  }, [controllerUserId])

  useEffect(() => {
    let cancelled = false
    async function loadCustomSceneBackgrounds() {
      const resolved: Partial<Record<BackgroundScene, string>> = {}
      await Promise.all(BACKGROUND_SCENES.map(async (backgroundScene) => {
        const background = sceneBackgrounds[backgroundScene]
        if (background.mode !== 'custom' || !background.path) return
        const { data } = await supabase.storage.from('event-assets').createSignedUrl(background.path, 86400)
        if (data?.signedUrl) resolved[backgroundScene] = data.signedUrl
      }))
      if (!cancelled) setSignedSceneBackgrounds(resolved)
    }
    void loadCustomSceneBackgrounds()
    return () => { cancelled = true }
  }, [sceneBackgrounds, assetsVersion])

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

  if (accessDenied) {
    return <main className="led-output-screen"><div className="led-output-error">This display link is not assigned to the signed-in admin account or its controller session has changed. Copy the current LED link from the active controller account.</div></main>
  }

  return <main className={`led-output-screen ${scene === 'lucky_draw' ? 'is-lucky-scene' : ''} ${scene === 'blackout' ? 'is-blackout-scene' : ''}`} style={themeStyles}>
    {error ? <div className="led-output-error">{error}</div> : <div className={`led-output-scene ${scene === 'attendance' ? 'is-attendance-scene' : ''} ${scene === 'manual_checkin' ? 'is-manual-checkin-scene' : ''} ${scene === 'blackout' ? 'is-blackout-scene' : ''} ${visible ? 'is-visible' : ''}`}>
      {scene !== 'welcome' && scene !== 'lucky_draw' && scene !== 'blackout' && sceneBackgroundImage && <img className="led-scene-background" src={sceneBackgroundImage} alt="" aria-hidden="true" />}
      {scene === 'blackout' ? <div className="led-blackout-stage" aria-label="Display blackout active" /> : scene === 'welcome' ? <>
        <div className={`led-welcome-kv ${welcomePosterIsFullHd ? 'is-fullscreen-kv' : ''}`} aria-label={`${eventDetails.name} event key visual`}>
          {!welcomePosterIsFullHd && (generatedWelcomeFill ? <img className="led-generated-fill" src={generatedWelcomeFill} alt="" /> : <img className="led-welcome-backdrop" src={welcomePoster} alt="" />)}
          <img className="led-welcome-poster" src={welcomePoster} alt="Event key visual" />
        </div>
      </> : scene === 'lucky_draw' ? <LedLuckyDrawOutput categories={participantCategories} themeColors={themeColors} backgroundImage={sceneBackgroundImage} view={requestedView} /> : scene === 'manual_checkin' ? <>
        <div className="led-manual-checkin-brand"><div className="led-output-brand">MAQNA EVENTFLOW</div></div>
        <div className="led-manual-checkin-event"><h2>{eventDetails.name}</h2><p>{eventDetails.date || 'Date to be announced'} <span>·</span> {eventDetails.venue || 'Venue to be announced'}</p></div>
        <div className="led-manual-checkin-copy"><span className="led-manual-checkin-kicker">GUEST ARRIVAL</span><h1>Manual Check-in</h1><p>Please proceed to the check-in desk.</p></div>
        <div className="led-manual-checkin-message" role="status">Our event staff will assist you with your attendance check-in.</div>
      </> : <>
        <div className="led-attendance-heading"><div className="led-output-brand">{eventDetails.name.toUpperCase()}</div><p className="led-event-meta">{[eventDetails.date, eventDetails.venue].filter(Boolean).join(' · ')}</p><h1>Our Guests Are Here</h1><p>{attendees.length} checked in and counting</p></div>
        {attendees.length ? <div className="led-credits-window" aria-label="List of checked-in guests">
          <div className="led-credits-track">{repeatedAttendees.map((guest, index) => <div className="led-credit-name" key={`${guest.participant_id}-${index}`}><strong>{guest.participant.full_name}</strong><span>{categoryName(participantCategories, guest.participant.category)}</span></div>)}</div>
        </div> : <div className="led-attendance-empty">Waiting for the first guests to check in</div>}
      </>}
      {scene !== 'lucky_draw' && scene !== 'blackout' && !(scene === 'welcome' && welcomePosterIsFullHd) && scene !== 'manual_checkin' && <div className="led-output-bottom">MAQNA EVENTFLOW</div>}
    </div>}
  </main>
}
