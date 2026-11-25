import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './LedDisplay.css'
import LuckyDrawMachine, { type BoxPhase } from './LuckyDrawMachine'

type DrawEntry = { participant_id: string; name: string; category: string }
type DrawLogEntry = { id: string; name: string; status: 'pending' | 'collected' | 'skipped'; notes: string | null }
type DrawRound = { id: string; name: string; pool_type: string; updated_at: string }
const DEFAULT_THEME = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function related<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value }

export type LuckyDrawOutputView = 'full' | 'box' | 'winners'

export default function LedLuckyDrawOutput({ categories = DEFAULT_PARTICIPANT_CATEGORIES, themeColors = DEFAULT_THEME, backgroundImage = '', view = 'full' }: { categories?: ParticipantCategory[]; themeColors?: string[]; backgroundImage?: string; view?: LuckyDrawOutputView }) {
  const [round, setRound] = useState<DrawRound | null>(null)
  const [winner, setWinner] = useState<DrawEntry | null>(null)
  const [drawLog, setDrawLog] = useState<DrawLogEntry[]>([])
  const [drawnCount, setDrawnCount] = useState(0)
  const [boxState, setBoxState] = useState<{ category: string; total: number; phase: BoxPhase; startedAt: number; animationId: number; soundEnabled: boolean; cameraView: { position: [number,number,number]; target: [number,number,number] } | null }>({ category: 'No category selected', total: 0, phase: 'idle', startedAt: 0, animationId: 0, soundEnabled: false, cameraView: null })
  const latestWinnerId = useRef<string | null>(null)
  const lastRoundId = useRef<string | null>(null)
  const lastRoundUpdatedAt = useRef<string | null>(null)
  const polling = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [audioReady, setAudioReady] = useState(false)

  function unlockOutputAudio() {
    try {
      audioContextRef.current ??= new window.AudioContext()
      const context = audioContextRef.current
      void context.resume().then(() => setAudioReady(context.state === 'running')).catch(() => setAudioReady(false))
    } catch { setAudioReady(false) }
  }

  function playOutputTone(startFrequency: number, endFrequency: number, duration: number, waveform: OscillatorType = 'sine', volume = 0.18, delay = 0) {
    const context = audioContextRef.current
    if (!context || context.state !== 'running') return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = waveform
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 4))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.start(start); oscillator.stop(start + duration + 0.01)
  }

  function playOutputNoise(duration: number, volume: number, filterFrequency: number, delay = 0) {
    const context = audioContextRef.current
    if (!context || context.state !== 'running') return
    const start = context.currentTime + delay
    const length = Math.max(1, Math.floor(context.sampleRate * duration))
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = filterFrequency; filter.Q.value = 0.8
    gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter); filter.connect(gain); gain.connect(context.destination)
    source.start(start); source.stop(start + duration)
  }

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
        soundEnabled: payload.sound_enabled === true,
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
          .in('status', ['ready', 'drawing', 'completed'])
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
          setDrawLog([])
          setDrawnCount(0)
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

        const { data: winnerRows, error: winnerError, count: winnerCount } = await supabase
          .from('draw_winners')
          .select('id, participant_id, status, notes, drawn_at, participants!inner(full_name, category)', { count: 'exact' })
          .eq('draw_round_id', activeRound.id)
          .order('drawn_at', { ascending: false })
          .limit(10)
        if (!active || winnerError) return
        setDrawnCount(winnerCount ?? winnerRows?.length ?? 0)
        setDrawLog((winnerRows ?? []).map((row) => {
          const participant = related(row.participants)
          return { id: row.id, name: participant?.full_name ?? 'Guest', status: row.status as DrawLogEntry['status'], notes: row.notes }
        }))
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

  useEffect(() => {
    if (!boxState.soundEnabled || !audioReady || !audioContextRef.current || audioContextRef.current.state !== 'running') return
    if (boxState.phase === 'cranking') {
      const tick = () => { playOutputTone(240 + Math.random() * 90, 75, 0.075, 'square', 0.12); playOutputNoise(0.045, 0.055, 1500) }
      tick()
      const timer = window.setInterval(tick, 145)
      return () => window.clearInterval(timer)
    }
    if (boxState.phase === 'shaking') {
      const rattle = () => { playOutputNoise(0.11, 0.13, 850 + Math.random() * 1100); playOutputTone(150 + Math.random() * 100, 90, 0.09, 'triangle', 0.07) }
      rattle()
      const timer = window.setInterval(rattle, 175)
      return () => window.clearInterval(timer)
    }
  }, [boxState.phase, boxState.soundEnabled, boxState.animationId, audioReady])

  useEffect(() => {
    if (!winner || !boxState.soundEnabled || !audioReady) return
    // Winner reveal pop, followed by a short celebratory firework and confetti chime.
    playOutputNoise(0.16, 0.32, 520)
    playOutputTone(520, 105, 0.24, 'sawtooth', 0.22)
    playOutputTone(1180, 420, 0.48, 'sine', 0.14, 0.12)
    playOutputTone(920, 610, 0.38, 'triangle', 0.11, 0.48)
    playOutputTone(660, 990, 0.22, 'sine', 0.10, 0.72)
    playOutputTone(880, 1320, 0.24, 'sine', 0.09, 0.94)
  }, [winner?.participant_id, boxState.soundEnabled, audioReady])

  useEffect(() => () => { void audioContextRef.current?.close() }, [])

  return <div className={`led-lucky-output ${view === 'box' ? 'is-box-only' : view === 'winners' ? 'is-winners-only' : ''}`} style={themeStyle} onPointerDown={unlockOutputAudio}>
    {backgroundImage && <div className="led-lucky-scene-background" style={{ backgroundImage: `linear-gradient(rgba(3, 10, 25, .62), rgba(3, 10, 25, .72)), url("${backgroundImage}")` }} aria-hidden="true" />}
    
    {view !== 'box' && <aside className="led-lucky-session-log" aria-label="Current session winner results">
      <header><strong>{boxState.category} Winners!</strong><span>{drawnCount} selected</span></header>
      {drawLog.length ? <ol>{drawLog.map((entry, index) => <li key={entry.id} className={`${entry.status === 'skipped' ? 'is-skipped' : entry.notes === 'Confirmed by operator' || entry.status === 'collected' ? 'is-claimed' : 'is-pending'}${index >= 6 ? ` is-fade-${index - 5}` : ''}`}>
        <strong>{entry.name}</strong>
        <span>{entry.status === 'skipped' ? 'SKIPPED' : entry.notes === 'Confirmed by operator' || entry.status === 'collected' ? 'CLAIMED' : 'PENDING'}</span>
      </li>)}</ol> : <p>Winner results will appear here.</p>}
    </aside>}
    {view !== 'winners' && <div className="led-lucky-machine-stage">
      <LuckyDrawMachine totalNames={boxState.total} remainingNames={Math.max(0, boxState.total - drawnCount)} categoryLabel={boxState.category} phase={boxState.phase} startedAt={boxState.startedAt} animationId={boxState.animationId} cameraView={boxState.cameraView} interactiveCamera={false} />
    </div>}

    {view === 'full' && winner && <div className="led-lucky-winner-backdrop" role="status" aria-live="assertive">
      <div className="led-lucky-fireworks" aria-hidden="true"><i /><i /><i /></div>
      <div className="led-lucky-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ '--confetti-left': `${(index * 37) % 100}%`, '--confetti-delay': `${-((index * 13) % 53) / 10}s`, '--confetti-duration': `${3.6 + (index % 5) * 0.45}s`, '--confetti-drift': `${(index % 7 - 3) * 3}vw`, '--confetti-color': confettiColors[index % confettiColors.length] } as CSSProperties} />)}</div>
      <section className="led-lucky-winner"><span>SELECTED GUEST</span><strong>{winner.name}</strong><small>{winnerRecord}</small></section>
    </div>}
    {view === 'full' && <div className="led-output-bottom">MAQNA EVENTFLOW</div>}
  </div>
}
