import { useEffect, useState, type CSSProperties } from 'react'
import './LuckyDrawHexMachine.css'

type PreviewPhase = 'empty' | 'loaded' | 'mixing'
type Props = { totalBalls?: number; categoryLabel?: string }

const balls = Array.from({ length: 36 }, (_, index) => ({
  number: String(index + 1).padStart(2, '0'),
  x: 12 + ((index * 37) % 76),
  y: 15 + ((index * 53) % 68),
  delay: (index % 9) * -0.17,
  driftX: ((index % 5) - 2) * 12,
  driftY: ((index % 7) - 3) * 10,
}))

export default function LuckyDrawHexMachine({ totalBalls = 36, categoryLabel = 'Selected category' }: Props) {
  const [phase, setPhase] = useState<PreviewPhase>('empty')
  const [animationKey, setAnimationKey] = useState(0)
  const [counter, setCounter] = useState(0)

  useEffect(() => {
    if (phase !== 'loaded') return
    setCounter(0)
    const target = Math.max(0, totalBalls)
    if (!target) return
    const increment = Math.max(1, Math.ceil(target / 50))
    const timer = window.setInterval(() => {
      setCounter((value) => {
        const next = Math.min(target, value + increment)
        if (next >= target) window.clearInterval(timer)
        return next
      })
    }, 30)
    return () => window.clearInterval(timer)
  }, [phase, totalBalls, animationKey])

  useEffect(() => {
    if (phase !== 'mixing') return
    const timer = window.setTimeout(() => setPhase('loaded'), 2600)
    return () => window.clearTimeout(timer)
  }, [phase, animationKey])

  function fillBalls() {
    setAnimationKey((value) => value + 1)
    setPhase('loaded')
  }

  function previewLever() {
    if (phase === 'empty') setPhase('loaded')
    setAnimationKey((value) => value + 1)
    setPhase('mixing')
  }

  function resetPreview() {
    setAnimationKey((value) => value + 1)
    setPhase('empty')
  }

  return (
    <section className="hex-draw-preview" aria-label="Hexagonal numbered ball lucky draw machine preview">
      <div className="hex-draw-preview-heading">
        <div>
          <span className="hex-draw-kicker">ALTERNATIVE CONCEPT · 3D PREVIEW</span>
          <h2>Hexagon Ball Draw Machine</h2>
          <p>Transparent six-sided chamber with numbered balls and a mechanical side lever.</p>
        </div>
        <span className={`hex-draw-state state-${phase}`}>{phase === 'empty' ? 'PREVIEW READY' : phase === 'loaded' ? 'BALLS LOADED' : 'MIXING BALLS'}</span>
      </div>

      <div className={`hex-draw-stage phase-${phase}`} key={animationKey}>
        <div className="hex-draw-floor-shadow" />
        <div className="hex-draw-machine">
          <div className="hex-draw-chamber">
            <div className="hex-draw-chamber-back" />
            <div className="hex-draw-ball-field">
              {balls.map((ball) => {
                const style = {
                  '--ball-x': `${ball.x}%`,
                  '--ball-y': `${ball.y}%`,
                  '--ball-delay': `${ball.delay}s`,
                  '--ball-drift-x': `${ball.driftX}px`,
                  '--ball-drift-y': `${ball.driftY}px`,
                } as CSSProperties
                return <span className="hex-draw-ball" style={style} key={ball.number}>{ball.number}</span>
              })}
            </div>
            <div className="hex-draw-glass-front" />
            <div className="hex-draw-glass-glint" />
            <div className="hex-draw-chamber-rim" />
            <div className="hex-draw-chamber-hub"><span>MAQNA</span><strong>LUCKY DRAW</strong></div>
          </div>

          <div className="hex-draw-neck">
            <div className="hex-draw-neck-ring" />
            <div className="hex-draw-feed-cap" />
          </div>

          <div className="hex-draw-base">
            <div className="hex-draw-base-top" />
            <div className="hex-draw-counter">
              <small>BALL COUNTER</small>
              <strong>{String(counter).padStart(3, '0')}</strong>
            </div>
            <div className="hex-draw-base-label">{categoryLabel.toUpperCase()} · NUMBERED BALL SYSTEM</div>
            <div className="hex-draw-base-foot" />
          </div>

          <div className="hex-draw-lever">
            <div className="hex-draw-lever-mount"><i /></div>
            <div className="hex-draw-lever-arm"><span /></div>
            <div className="hex-draw-lever-grip" />
          </div>
        </div>
        <span className="hex-draw-stage-note">TRANSPARENT HEXAGON CHAMBER · NUMBERED BALLS</span>
      </div>

      <div className="hex-draw-preview-footer">
        <div className="hex-draw-preview-copy">
          <strong>Design preview only</strong>
          <span>This concept does not change the live draw pool, winner queue or production draw logic.</span>
        </div>
        <div className="hex-draw-preview-actions">
          <button type="button" className="hex-preview-secondary" onClick={resetPreview}>Reset</button>
          <button type="button" className="hex-preview-secondary" onClick={fillBalls}>Load balls</button>
          <button type="button" className="hex-preview-primary" onClick={previewLever}>Preview lever</button>
        </div>
      </div>
    </section>
  )
}
