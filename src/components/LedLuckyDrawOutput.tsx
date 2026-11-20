import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Wheel, type WheelItem } from 'spin-wheel'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './LedDisplay.css'

type DrawEntry = { participant_id: string; name: string; category: string }
type DrawWinner = { id: string; participant_id: string; status: string; notes: string | null; participant: { full_name: string; category: string } }
type DrawRound = { id: string; name: string; pool_type: string; updated_at: string }
type SpinFlash = { id: string; name: string; left: number; top: number; size: number; color: string; delay: number }
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function related<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value }

function randomSpinFlashBatch(pool: DrawEntry[], colors: string[], batch: number): SpinFlash[] {
  const shuffled = [...pool]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  const count = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 4))
  return shuffled.slice(0, count).map((entry, index) => ({
    id: `${batch}-${entry.participant_id}-${index}`,
    name: entry.name,
    left: 6 + Math.random() * 82,
    top: 20 + Math.random() * 64,
    size: 18 + Math.random() * 16,
    color: colors[Math.floor(Math.random() * colors.length)] ?? '#ffffff',
    delay: Math.random() * 70,
  }))
}

export default function LedLuckyDrawOutput({ eventName = 'EventFlow Event', categories = DEFAULT_PARTICIPANT_CATEGORIES }: { eventName?: string; categories?: ParticipantCategory[] }) {
  const [round, setRound] = useState<DrawRound | null>(null)
  const [entries, setEntries] = useState<DrawEntry[]>([])
  const [winner, setWinner] = useState<DrawEntry | null>(null)
  const [themeColors, setThemeColors] = useState(DEFAULT_THEME)
  const [wheelReady, setWheelReady] = useState(false)
  const [wheelSpinning, setWheelSpinning] = useState(false)
  const [spinFlashes, setSpinFlashes] = useState<SpinFlash[]>([])
  const [soundReady, setSoundReady] = useState(false)
  const wheelContainer = useRef<HTMLDivElement>(null)
  const wheelInstance = useRef<Wheel | null>(null)
  const entriesRef = useRef<DrawEntry[]>([])
  const latestWinnerId = useRef<string | null>(null)
  const lastRoundId = useRef<string | null>(null)
  const lastRoundUpdatedAt = useRef<string | null>(null)
  const polling = useRef(false)
  const audioContext = useRef<AudioContext | null>(null)
  const flashTimer = useRef<number | null>(null)
  const flashBatch = useRef(0)

  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearInterval(flashTimer.current)
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
    async function loadTheme() {
      const { data } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (!active) return
      const payload = data?.payload && typeof data.payload === 'object' ? data.payload as { theme_colors?: unknown } : {}
      if (Array.isArray(payload.theme_colors) && payload.theme_colors.length === 5 && payload.theme_colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) setThemeColors(payload.theme_colors as string[])
    }
    void loadTheme()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!wheelContainer.current) return
    const wheel = new Wheel(wheelContainer.current, {
      items: [],
      isInteractive: false,
      pointerAngle: 0,
      radius: 0.98,
      itemLabelAlign: 'right',
      itemLabelRadius: 0.95,
      itemLabelRadiusMax: 0.08,
      itemLabelFont: 'Manrope, sans-serif',
      itemLabelFontSizeMax: 80,
      itemLabelColors: ['#ffffff'],
      itemLabelStrokeColor: '#06152d',
      itemLabelStrokeWidth: 2,
      itemBackgroundColors: themeColors,
      lineColor: '#ffffff',
      lineWidth: 2,
      borderColor: themeColors[3],
      borderWidth: 5,
      onRest: (event: { currentIndex: number }) => {
        setWheelSpinning(false)
        if (flashTimer.current !== null) window.clearInterval(flashTimer.current)
        flashTimer.current = null
        setSpinFlashes([])
        const participant = entriesRef.current[event.currentIndex]
        if (participant) setWinner(participant)
      },
    })
    wheelInstance.current = wheel
    setWheelReady(true)
    return () => { wheel.remove(); wheelInstance.current = null; setWheelReady(false) }
  }, [themeColors])

  useEffect(() => {
    let active = true
    async function pollDraw() {
      if (polling.current || !active) return
      polling.current = true
      try {
        const { data: activeRound } = await supabase.from('draw_rounds').select('id, name, pool_type, updated_at').eq('status', 'drawing').order('updated_at', { ascending: false }).limit(1).maybeSingle()
        if (!active) return
        if (!activeRound) {
          lastRoundId.current = null
          lastRoundUpdatedAt.current = null
          latestWinnerId.current = null
          entriesRef.current = []
          setRound(null)
          setEntries([])
          setWinner(null)
          return
        }
        const roundChanged = activeRound.id !== lastRoundId.current
        const roundRefreshRequested = activeRound.updated_at !== lastRoundUpdatedAt.current
        if (roundChanged || roundRefreshRequested) {
          lastRoundId.current = activeRound.id
          lastRoundUpdatedAt.current = activeRound.updated_at
          if (roundChanged) {
            latestWinnerId.current = null
            setWinner(null)
          }
          const { data: entryRows } = await supabase.from('draw_entries').select('participant_id, participants!inner(full_name, category)').eq('draw_round_id', activeRound.id).order('participant_id', { ascending: true })
          if (!active) return
          const mappedEntries = (entryRows ?? []).map((row) => {
            const participant = related(row.participants)
            return { participant_id: row.participant_id, name: participant?.full_name ?? 'Guest', category: participant?.category ?? '' }
          })
          entriesRef.current = mappedEntries
          setEntries(mappedEntries)
          setRound(activeRound)
        }

        const { data: winnerRows } = await supabase.from('draw_winners')
          .select('id, participant_id, status, notes, participants!inner(full_name, category)')
          .eq('draw_round_id', activeRound.id)
          .order('drawn_at', { ascending: false })
          .limit(100)
        if (!active) return
        const mappedWinners: DrawWinner[] = (winnerRows ?? []).map((row) => ({
          id: row.id,
          participant_id: row.participant_id,
          status: row.status,
          notes: row.notes,
          participant: related(row.participants) ?? { full_name: 'Guest', category: '' },
        }))
        const latest = mappedWinners[0]
        const currentlyEligible = entriesRef.current.filter((entry) => !mappedWinners.some((drawn) => drawn.participant_id === entry.participant_id) || (latest?.participant_id === entry.participant_id && latest.status === 'pending' && latest.notes !== 'Confirmed by operator'))
        if (wheelInstance.current && !wheelSpinning) {
          const items: WheelItem[] = currentlyEligible.map((entry) => ({ label: entry.name, value: entry.participant_id }))
          wheelInstance.current.items = items
          entriesRef.current = currentlyEligible
        }
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
        if (latest.id !== latestWinnerId.current) {
          latestWinnerId.current = latest.id
          const selectedIndex = entriesRef.current.findIndex((entry) => entry.participant_id === latest.participant_id)
          if (selectedIndex >= 0 && wheelInstance.current && wheelReady) {
            setWinner(null)
            setWheelSpinning(true)
            flashBatch.current += 1
            setSpinFlashes(randomSpinFlashBatch(entriesRef.current, themeColors, flashBatch.current))
            if (flashTimer.current !== null) window.clearInterval(flashTimer.current)
            flashTimer.current = window.setInterval(() => {
              flashBatch.current += 1
              setSpinFlashes(randomSpinFlashBatch(entriesRef.current, themeColors, flashBatch.current))
            }, 520)
            wheelInstance.current.spinToItem(selectedIndex, 10000, true, 6, 1)
          } else setWinner({ participant_id: latest.participant_id, name: latest.participant.full_name, category: latest.participant.category })
        }
      } finally {
        polling.current = false
      }
    }

    void pollDraw()
    const timer = window.setInterval(() => { void pollDraw() }, winner ? 900 : 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [themeColors, wheelReady, wheelSpinning, winner])

  const themeStyle = {
    '--led-theme-1': themeColors[0], '--led-theme-2': themeColors[1], '--led-theme-3': themeColors[2], '--led-theme-4': themeColors[3], '--led-theme-5': themeColors[4],
  } as CSSProperties
  const winnerRecord = round && winner ? `Winner · ${categoryName(categories, winner.category)}` : ''
  const confettiColors = [themeColors[2], themeColors[3], themeColors[4], '#fff1b8', '#ffffff']

  return <div className="led-lucky-output" style={themeStyle}>
    {soundReady
      ? <div className="led-lucky-sound-state" aria-label="Winner sound enabled">♪ SOUND ON</div>
      : <button className="led-lucky-sound-toggle" type="button" aria-label="Enable winner sound" onClick={() => void enableWinnerSound()}>SOUND</button>}
    <header className="led-lucky-event-name">{eventName}</header>
    <div className="led-lucky-side-title is-left" role="img" aria-label="Lucky">
      {'LUCKY'.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
    </div>
    <div className="led-lucky-side-title is-right" role="img" aria-label="Draw">
      {'DRAW'.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
    </div>
    <div className="led-lucky-wheel-stage is-revealed">
      <div className={`led-lucky-wheel-shell ${wheelSpinning ? 'is-spinning' : ''}`}><span className="led-lucky-pointer" /><div className="led-lucky-wheel" ref={wheelContainer} />{!entries.length && <div className="led-lucky-no-pool">Start a checked-in guest pool from the Lucky Draw tab</div>}</div>
    </div>
    {wheelSpinning && <div className="led-spin-flash-layer" aria-hidden="true">{spinFlashes.map((flash) => <span key={flash.id} style={{ left: `${flash.left}%`, top: `${flash.top}%`, '--flash-size': `${flash.size}px`, '--flash-color': flash.color, '--flash-delay': `${flash.delay}ms` } as CSSProperties}>{flash.name}</span>)}</div>}
    {winner && <div className="led-lucky-winner-backdrop" role="status" aria-live="assertive">
      <div className="led-lucky-fireworks" aria-hidden="true"><i /><i /><i /></div>
      <div className="led-lucky-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ '--confetti-left': `${(index * 37) % 100}%`, '--confetti-delay': `${-((index * 13) % 53) / 10}s`, '--confetti-duration': `${3.6 + (index % 5) * 0.45}s`, '--confetti-drift': `${(index % 7 - 3) * 3}vw`, '--confetti-color': confettiColors[index % confettiColors.length] } as CSSProperties} />)}</div>
      <section className="led-lucky-winner"><span>SELECTED GUEST</span><strong>{winner.name}</strong><small>{winnerRecord}</small></section>
    </div>}
    <div className="led-output-bottom">MAQNA EVENTFLOW</div>
  </div>
}
