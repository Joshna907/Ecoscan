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
        <h3>Explore another wear.</h3><p>Compare a hypothetical reuse scenario. Eligible unchanged AI results can receive demo points.</p>
      </article>
    </div>
    <details className="how-details">
      <summary>Scoring assumptions and photo details</summary>
      <div className="how-details-grid">
        <div><h3>Illustrative catalogue</h3><p>T-shirt 5, jeans 10, jacket 15, shoes 8 kg CO₂e per item. These are fixed demo benchmarks, not measured product footprints or verified lifecycle assessments. Materials, factory energy, transport, use, and end of life can change real impact; a photo cannot reveal them.</p><p>Recognition suggests only the four supported categories. If recognition is unavailable, a clearly labelled mock suggestion may appear; mock suggestions do not earn points.</p></div>
        <div><h3>Points and offers</h3><p>For an unchanged live AI suggestion that replaces a planned purchase, the demo treats half the category benchmark as a hypothetical avoided amount and gives 10 points per kg, rounded. Images and visually similar reuploads can earn once across sessions for 90 days. Daily earnings are capped at 250 points per browser session, resetting at midnight UTC. Manual, corrected, duplicate, mock, and non-replacement scans earn zero points.</p><p>Offers are fictional, and points are not carbon credits or proof of emissions savings.</p></div>
        <div id="privacy"><h3>Your photo and session</h3><p>Camera access starts only when chosen and stops after capture or closing it. With AI recognition, your photo is sent to OpenAI. EcoScan deletes its queued copy after processing, final failure, or scheduled expiry cleanup, but keeps image fingerprints, including a perceptual similarity signature, for 90 days to prevent repeated reward claims across sessions. Fingerprints are not the original photograph, but are not anonymous proof of ownership.</p><p>OpenAI says API content may be retained in abuse-monitoring logs for up to 30 days by default. Do not upload people, documents, or sensitive information. <a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noreferrer">Read OpenAI’s API data controls</a>.</p><p>Points use an anonymous browser session that expires after inactivity. There is no login, cross-device sync, or recovery after session expiry.</p><p>If you request partner verification, share the short-lived code only with the selected partner. The partner sends its activity type, completion time, transaction reference, and stable participant reference. EcoScan keeps keyed hashes of the references and the activity audit record, including reversals, after session expiry to prevent repeated claims. These pseudonymous records are not anonymous; raw references are not stored. Unused requests are removed by scheduled cleanup after a day. Partner confirmation does not establish garment ownership or measured CO₂ savings.</p></div>
        <p>If you generate a receipt recovery key, EcoScan keeps its hash and the receipt archive for 180 days from issuance, independently of your browser session. Keep the downloaded key private: anyone holding it can view that receipt. Recovery restores neither points nor spending authority. Suspicious reward attempts are recorded for 30 days using opaque network/session references. Operator review decisions and holds are retained for accountability; only restricted operators can view them. Raw IP addresses, private keys, cookies and partner references are not included in these monitoring records.</p>
      </div>
    </details>
  </section>
}
