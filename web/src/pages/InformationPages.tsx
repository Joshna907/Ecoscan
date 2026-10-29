import { useEffect, useRef, useState } from 'react'
import { WardrobeHero } from '../components/WardrobeHero'
import { ImpactExplorer } from '../components/ImpactExplorer'
import { JourneyTour } from '../components/JourneyTour'
import { FaqSection } from '../components/FaqSection'
import type { ScanFlow } from '../hooks/useScan'

export function HomePage({ scan }: { scan: ScanFlow }) {
  const ongoing = !['upload', 'complete'].includes(scan.phase)
  return <>
    <WardrobeHero ongoing={ongoing} />
    <ImpactExplorer />
    <JourneyTour />
    <HowItWorksSection />
    <FaqSection />
  </>
}
function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setRevealed(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect() }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return <section ref={sectionRef} className={'home-how-it-works' + (revealed ? ' how-revealed' : '')} id="how-it-works" aria-labelledby="how-it-works-title">
    <div className="how-heading"><p className="eyebrow">The idea in three steps</p><h2 id="how-it-works-title">How EcoScan works</h2><p>From a photo to a useful estimate, with you in control.</p></div>
    <div className="how-cards">
      <article className="how-card how-card-photo" style={{ '--card-i': 0 } as React.CSSProperties}>
        <span className="how-card-index">01 / IDENTIFY</span>
        <div className="how-card-art how-photo-art" aria-hidden="true"><span>PHOTO</span><span>REVIEW</span></div>
        <h3>Show us the clothes.</h3><p>Add a photo. Check and edit the suggested items before any calculation.</p>
      </article>
      <article className="how-card how-card-estimate" style={{ '--card-i': 1 } as React.CSSProperties}>
        <span className="how-card-index">02 / ESTIMATE</span>
        <div className="how-card-art how-number-art" aria-hidden="true"><strong>5</strong><span>kg CO₂e<br />per T-shirt</span></div>
        <h3>See an estimate.</h3><p>We use clear example values for each clothing type, not a measurement from the photo.</p>
      </article>
      <article className="how-card how-card-reward" style={{ '--card-i': 2 } as React.CSSProperties}>
        <span className="how-card-index">03 / REIMAGINE</span>
        <div className="how-card-art how-number-art" aria-hidden="true"><strong>25</strong><span>demo points<br />in this example</span></div>
        <h3>Explore another wear.</h3><p>If reuse replaces a planned purchase, compare the potential impact and see demo rewards.</p>
      </article>
    </div>
    <details className="how-details">
      <summary>Scoring assumptions and photo details</summary>
      <div className="how-details-grid">
        <div><h3>Example catalogue</h3><p>T-shirt 5, jeans 10, jacket 15, shoes 8 kg CO₂e per item. CO₂e is a common unit for greenhouse gases. Materials, brand, and manufacturing can change the real impact; a photo cannot reveal them.</p><p>Recognition only suggests categories. In demo mode, every photo receives an example T-shirt suggestion, which you can edit.</p></div>
        <div><h3>Points and offers</h3><p>If reuse replaces a planned purchase, this demo treats half the production estimate as potentially avoided and gives 10 points per kg, rounded. Otherwise, it gives zero points. A T-shirt's 5 kg estimate can therefore produce 25 demo points.</p><p>This is a hypothetical comparison. Offers are fictional, and points are not carbon credits.</p></div>
        <div><h3>Your photo and session</h3><p>Camera access starts only when chosen and stops after capture or closing it. With AI recognition, your photo is sent to OpenAI. Queued photos are stored temporarily by EcoScan and deleted after processing, final failure, or expiry within one day.</p><p>Points use an anonymous browser session that expires after inactivity. Your latest result is kept during this visit.</p></div>
      </div>
    </details>
  </section>
}
