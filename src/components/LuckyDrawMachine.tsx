import { useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Sparkles } from 'lucide-react'
import './LuckyDrawMachine.css'

type MachinePhase = 'ready' | 'loading' | 'pulling' | 'shaking' | 'ejecting' | 'revealing'

const phaseLabels: Record<MachinePhase, string> = {
  ready: 'MACHINE READY',
  loading: 'PAPER SLIPS LOADING',
  pulling: 'PULL THE LEVER',
  shaking: 'MIXING THE DRAW',
  ejecting: 'A WINNER IS ON THE WAY',
  revealing: 'WE HAVE A WINNER!',
}

export default function LuckyDrawMachine() {
  const [phase, setPhase] = useState<MachinePhase>('ready')
  const [winnerName, setWinnerName] = useState('ALEXANDER TAN')
  const timers = useRef<number[]>([])
  const busy = phase !== 'ready' && phase !== 'revealing'

  function clearTimers() {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  function schedule(callback: () => void, delay: number) {
    timers.current.push(window.setTimeout(callback, delay))
  }

  function replay() {
    if (busy) return
    clearTimers()
    setWinnerName('ALEXANDER TAN')
    setPhase('loading')
    schedule(() => setPhase('pulling'), 1700)
    schedule(() => setPhase('shaking'), 2500)
    schedule(() => setPhase('ejecting'), 4300)
    schedule(() => setPhase('revealing'), 5400)
  }

  function reset() {
    clearTimers()
    setPhase('ready')
  }

  useEffect(() => () => clearTimers(), [])

  return <section className="ld-machine-preview" aria-label="Lucky Draw machine animation preview">
    <div className="ld-machine-preview-head">
      <div>
        <span className="ld-machine-kicker"><Sparkles size={13} /> NEW DRAW EXPERIENCE</span>
        <h2>Lucky Draw Machine</h2>
        <p>A playful isometric machine concept. The animation is a visual presentation only.</p>
      </div>
      <div className={`ld-machine-status ${phase}`}><i />{phaseLabels[phase]}</div>
    </div>

    <div className={`ld-machine-stage phase-${phase}`}>
      <div className="ld-stage-glow" />
      <div className="ld-confetti" aria-hidden="true"><span>✦</span><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>
      <div className="ld-machine-scene">
        <div className="ld-machine-shadow" />
        <div className="ld-machine">
          <div className="ld-hopper">
            <div className="ld-hopper-rim" />
            <div className="ld-hopper-mouth">
              {Array.from({ length: 12 }, (_, index) => <span className={`ld-slip ld-slip-${index + 1}`} key={index} />)}
            </div>
            <div className="ld-hopper-front"><b>EVENTFLOW</b><small>LUCKY DRAW</small></div>
          </div>
          <div className="ld-machine-body">
            <div className="ld-machine-top" />
            <div className="ld-machine-front">
              <div className="ld-machine-sign">THE<br /><strong>LUCKY BOX</strong></div>
              <div className="ld-window"><div className="ld-window-glass" /><div className="ld-window-paper"><span>GOOD<br />LUCK!</span></div></div>
              <div className="ld-gear ld-gear-one">✿</div>
              <div className="ld-gear ld-gear-two">✿</div>
              <div className="ld-machine-bolts"><i /><i /><i /><i /></div>
            </div>
            <div className="ld-machine-side"><span className="ld-side-gear">✿</span><span className="ld-side-label">DRAW<br />MECHANISM</span></div>
            <div className="ld-machine-base" />
          </div>
          <div className="ld-lever">
            <div className="ld-lever-socket" />
            <div className="ld-lever-arm"><i /></div>
            <div className="ld-lever-knob" />
          </div>
          <div className="ld-ticket-chute"><div className="ld-chute-mouth" /></div>
          <div className="ld-ejected-ticket"><span>WINNER</span><strong>{winnerName}</strong><small>CONGRATULATIONS!</small></div>
          <div className="ld-air-slips"><i /><i /><i /><i /><i /><i /></div>
        </div>
        <div className="ld-machine-floor"><span>EVENTFLOW · MAKE EVERY MOMENT COUNT</span></div>
      </div>
      <div className="ld-machine-caption">{phase === 'revealing' ? 'And the lucky winner is…' : phase === 'ready' ? 'Ready when you are.' : phaseLabels[phase].replaceAll('_', ' ').toLowerCase() + '…'}</div>
    </div>

    <div className="ld-machine-preview-footer">
      <div><strong>Animation prototype</strong><span>Sample name only · No participant data is used</span></div>
      <div className="ld-machine-actions">
        <button className="ld-machine-replay" onClick={replay} disabled={busy}><Play size={15} fill="currentColor" /> {phase === 'revealing' ? 'Play again' : 'Preview animation'}</button>
        <button className="ld-machine-reset" onClick={reset} aria-label="Reset animation" title="Reset animation"><RotateCcw size={15} /></button>
      </div>
    </div>
  </section>
}
