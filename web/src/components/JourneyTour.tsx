import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './JourneyTour.css'

const steps = [
  { number: '01', label: 'Snap', title: 'Start with what you already own.', description: 'Upload a clear photo or use your camera. A single garment or a whole outfit is a good place to start.', object: 0, overlay: 'scan' },
  { number: '02', label: 'Check', title: 'A little check makes a difference.', description: 'Recognition suggests the clothing. You can correct the categories and quantities before calculating your estimate.', object: 2, overlay: 'review' },
  { number: '03', label: 'See', title: 'See the story behind the clothes.', description: 'Explore estimated production impact and a reuse comparison. Illustrative catalogue values, not measurements from a photo.', object: 0, overlay: 'estimate' },
  { number: '04', label: 'Earn', title: 'Give another wear a little reward.', description: 'If reuse replaces a planned new purchase, the demo scenario awards points. Explore example offers; no real vouchers are issued.', object: 4, overlay: 'reward' },
]

export function JourneyTour() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const step = steps[active]

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observers: IntersectionObserver[] = []
    stepRefs.current.forEach((el, index) => {
      if (!el) return
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) setActive(index)
      }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 })
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

  return <section className="journey-tour" aria-labelledby="journey-heading">
    <div className="journey-tour-header">
      <p className="eyebrow">A little tour of EcoScan</p>
      <h2 id="journey-heading">From a photo to an estimate</h2>
      <p>Four small steps. A fresh way to see your wardrobe.</p>
    </div>
    <div className="journey-split">
      {/* Left: scrolling steps */}
      <div className="journey-left">
        {steps.map((s, i) => (
          <div
            key={s.number}
            ref={el => { stepRefs.current[i] = el }}
            className={'journey-step' + (i === active ? ' journey-step-active' : '')}
          >
            <div className="step-marker">
              <span className="step-dot" />
              {i < steps.length - 1 && <span className="step-line" />}
            </div>
            <div className="step-text">
              <span className="step-num">{s.number} — {s.label}</span>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </div>
          </div>
        ))}
        <div className="journey-end">
          <Link className="button" to="/scan">Try your first scan</Link>
          <p>Your photo and points are only created in the scanner.</p>
        </div>
      </div>

      {/* Right: sticky visual */}
      <div className="journey-right">
        <div className="journey-sticky">
          <div className="journey-visual" key={active}>
            <div className="journey-visual-bg" aria-hidden="true" />
            <div className={'journey-obj journey-obj-' + step.object}>
              <img src="/media/tour-objects.png" alt="" loading="lazy" />
            </div>
            {step.overlay === 'scan' && <div className="journey-overlay-scan"><i /><i /><i /><i /></div>}
            {step.overlay === 'review' && <div className="journey-overlay-review"><span>✓</span> Jacket <small>1 item</small></div>}
            {step.overlay === 'estimate' && <div className="journey-overlay-estimate"><strong>5 <small>kg CO₂e</small></strong><span>Illustrative estimate</span></div>}
            {step.overlay === 'reward' && <span className="journey-overlay-reward">✳</span>}
          </div>
        </div>
      </div>
    </div>
  </section>
}
