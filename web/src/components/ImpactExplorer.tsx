import { useEffect, useRef, useState } from 'react'

const chapters = [
  { title: 'See what you have', heading: 'Start with a photo.', body: 'Upload a garment or a whole outfit. Recognition suggests clothing categories, and you check or change them before anything is calculated.', detail: 'You stay in control of the items.' },
  { title: 'Understand the estimate', heading: 'Give the numbers context.', body: 'We use an illustrative catalogue to estimate production impact. One T-shirt is 5 kg CO₂e in this demo. Materials and manufacturing would make real-world results vary.', detail: 'An estimate, never a measurement from a photo.' },
  { title: 'Imagine another wear', heading: 'Explore a reuse scenario.', body: 'Would wearing it again replace a new purchase you planned? Compare that scenario and discover demo rewards. Points illustrate the idea; they are not verified carbon savings.', detail: 'More curiosity. More care for what you own.' },
]
export function ImpactExplorer() {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(true)
  const sectionRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setRevealed(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect() }
    }, { threshold: 0.15 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return <section ref={sectionRef} className={'impact-explorer' + (revealed ? ' impact-revealed' : '')} aria-labelledby="explorer-heading">
    <div className="explorer-intro"><p className="eyebrow">Small questions. A different perspective.</p><h2 id="explorer-heading">Good choices begin <br />with understanding.</h2><p>You don't need to be a carbon expert. <br />Start with the clothes you already own.</p></div>
    <div className="explorer-widget">
      <button className="explorer-toggle" aria-expanded={open} aria-controls="explorer-content" onClick={() => setOpen(!open)}><span>Explore the EcoScan journey</span><span aria-hidden="true">{open ? '−' : '+'}</span></button>
      <div className="explorer-collapse" data-open={open} inert={!open}>
        <div id="explorer-content">
          <div className="explorer-options" aria-label="Explore each stage">{chapters.map((chapter, index) => <button key={chapter.title} className={active === index ? 'selected' : ''} style={{ '--stagger': index } as React.CSSProperties} aria-pressed={active === index} onClick={() => setActive(index)}><span className="chapter-number" aria-hidden="true">0{index + 1}</span>{chapter.title}</button>)}</div>
          <div className="explorer-answer" key={active} aria-live="polite"><h3>{chapters[active].heading}</h3><p>{chapters[active].body}</p><small>{chapters[active].detail}</small></div>
        </div>
      </div>
    </div>
  </section>
}
