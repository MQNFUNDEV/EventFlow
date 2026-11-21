import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './LedDisplay.css'
import LuckyDrawMachine, { type BoxPhase } from './LuckyDrawMachine'

type DrawEntry = { participant_id: string; name: string; category: string }
type DrawRound = { id: string; name: string; pool_type: string; updated_at: string }
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function related<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value }

export default function LedLuckyDrawOutput({ categories = DEFAULT_PARTICIPANT_CATEGORIES, themeColors = DEFAULT_THEME, backgroundImage = '' }: { categories?: ParticipantCategory[]; themeColors?: string[]; backgroundImage?: string }) {
  const [round, setRound] = useState<DrawRound | null>(null)
  const [winner, setWinner] = useState<DrawEntry | null>(null)
  const [soundReady, setSoundReady] = useState(false)
  const [boxState, setBoxState] = useState<{ category: string; total: number; phase: BoxPhase; startedAt: number; animationId: number; cameraView: { position: [number,number,number]; target: [number,number,number] } | null }>({ category: 'No category selected', total: 0, phase: 'idle', startedAt: 0, animationId: 0, cameraView: null })
  const latestWinnerId = useRef<string | null>(null)
  const lastRoundId = useRef<string | null>(null)
  const lastRoundUpdatedAt = useRef<string | null>(null)
  const polling = useRef(false)
  const audioContext = useRef<AudioContext | null>(null)

  useEffect(() => () => {
    void audioContext.current?.close()
  }, [])

  async function enableWinnerSound() {
    try {
      audioContext.current ??= new window.AudioContext()
      await audioContext.current.resume()
      setSoundReady(audioContext.current.state === 'running')
    } catch {
      setSoundReady(false)
    }
  }

  useEffect(() => {
    const context = audioContext.current
    if (!winner || !soundReady || !context || context.state !== 'running') return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(820, now)
    oscillator.frequency.exponentialRampToValueAtTime(460, now + 0.16)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.45, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.27)
  }, [winner, soundReady])

  useEffect(() => {
    let active = true
    async function loadBoxState() {
      const { data } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (!active || !data?.payload || typeof data.payload !== 'object') return
      const payload = data.payload as Record<string, unknown>
      const rawPhase = payload.box_phase
      const phase: BoxPhase = rawPhase === 'loading' || rawPhase === 'loaded' || rawPhase === 'cranking' || rawPhase === 'shaking' || rawPhase === 'reveal' ? rawPhase : 'idle'
      setBoxState({
        category: typeof payload.box_category === 'string' ? payload.box_category : 'No category selected',
        total: typeof payload.box_total === 'number' ? Math.max(0, payload.box_total) : 0,
        phase,
        startedAt: typeof payload.box_started_at === 'number' ? payload.box_started_at : 0,
        animationId: typeof payload.box_animation_id === 'number' ? payload.box_animation_id : 0,
        cameraView: payload.machine_camera && typeof payload.machine_camera === 'object' ? payload.machine_camera as { position: [number,number,number]; target: [number,number,number] } : null,
      })
    }
    void loadBoxState()
    const timer = window.setInterval(() => { void loadBoxState() }, 650)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    async function pollWinner() {
      if (!active || polling.current) return
      polling.current = true
      try {
        const { data: activeRound, error: roundError } = await supabase
          .from('draw_rounds')
          .select('id, name, pool_type, updated_at')
          .eq('status', 'drawing')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!active) return
        if (roundError) return
        if (!activeRound) {
          lastRoundId.current = null
          lastRoundUpdatedAt.current = null
          latestWinnerId.current = null
          setRound(null)
          setWinner(null)
          return
        }

        const roundChanged = activeRound.id !== lastRoundId.current
        if (roundChanged) {
          lastRoundId.current = activeRound.id
          latestWinnerId.current = null
          setWinner(null)
        }
        if (roundChanged || activeRound.updated_at !== lastRoundUpdatedAt.current) {
          lastRoundUpdatedAt.current = activeRound.updated_at
          setRound(activeRound)
        }

        const { data: winnerRows, error: winnerError } = await supabase
          .from('draw_winners')
          .select('id, participant_id, status, notes, participants!inner(full_name, category)')
          .eq('draw_round_id', activeRound.id)
          .order('drawn_at', { ascending: false })
          .limit(1)
        if (!active || winnerError) return
        const latest = winnerRows?.[0]
        if (!latest) {
          latestWinnerId.current = null
          setWinner(null)
          return
        }
        if (latest.status === 'skipped' || latest.notes === 'Confirmed by operator') {
          latestWinnerId.current = latest.id
          setWinner(null)
          return
        }

        // The selected database row remains hidden until the operator's machine
        // completes its crank and shake sequence and publishes the reveal phase.
        if (boxState.phase !== 'reveal' || latest.id === latestWinnerId.current) return
        latestWinnerId.current = latest.id
        const participant = related(latest.participants)
        setWinner({
          participant_id: latest.participant_id,
          name: participant?.full_name ?? 'Guest',
          category: participant?.category ?? '',
        })
      } finally {
        polling.current = false
      }
    }
    void pollWinner()
    const timer = window.setInterval(() => { void pollWinner() }, 900)
    return () => { active = false; window.clearInterval(timer) }
  }, [boxState.phase])

  const themeStyle = {
    '--led-theme-1': themeColors[0], '--led-theme-2': themeColors[1], '--led-theme-3': themeColors[2], '--led-theme-4': themeColors[3], '--led-theme-5': themeColors[4],
  } as CSSProperties
  const winnerRecord = round && winner ? `Winner · ${categoryName(categories, winner.category)}` : ''
  const confettiColors = [themeColors[2], themeColors[3], themeColors[4], '#fff1b8', '#ffffff']

  return <div className="led-lucky-output" style={themeStyle}>
    {soundReady
      ? <div className="led-lucky-sound-state" aria-label="Winner sound enabled">♪ SOUND ON</div>
      : <button className="led-lucky-sound-toggle" type="button" aria-label="Enable winner sound" onClick={() => void enableWinnerSound()}>SOUND</button>}
    {backgroundImage && <div className="led-lucky-scene-background" style={{ backgroundImage: `linear-gradient(rgba(3, 10, 25, .62), rgba(3, 10, 25, .72)), url("${backgroundImage}")` }} aria-hidden="true" />}
    <header className="led-lucky-title"><span>LUCKY DRAW · 3D MACHINE</span><small>Acrylic Name Draw Box</small></header>
    <div className="led-lucky-side-title is-left" role="img" aria-label="Lucky">
      {'LUCKY'.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
    </div>
    <div className="led-lucky-side-title is-right" role="img" aria-label="Draw">
      {'DRAW'.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
    </div>
    <div className="led-lucky-machine-stage">
      <LuckyDrawMachine totalNames={boxState.total} categoryLabel={boxState.category} phase={boxState.phase} startedAt={boxState.startedAt} animationId={boxState.animationId} cameraView={boxState.cameraView} interactiveCamera={false} />
    </div>

    {winner && <div className="led-lucky-winner-backdrop" role="status" aria-live="assertive">
      <div className="led-lucky-fireworks" aria-hidden="true"><i /><i /><i /></div>
      <div className="led-lucky-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ '--confetti-left': `${(index * 37) % 100}%`, '--confetti-delay': `${-((index * 13) % 53) / 10}s`, '--confetti-duration': `${3.6 + (index % 5) * 0.45}s`, '--confetti-drift': `${(index % 7 - 3) * 3}vw`, '--confetti-color': confettiColors[index % confettiColors.length] } as CSSProperties} />)}</div>
      <section className="led-lucky-winner"><span>SELECTED GUEST</span><strong>{winner.name}</strong><small>{winnerRecord}</small></section>
    </div>}
    <div className="led-output-bottom">MAQNA EVENTFLOW</div>
  </div>
}
