import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AsciiFlower } from './AsciiFlower'
import './WardrobeHero.css'

const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia?.(motionQuery)
  query?.addEventListener('change', callback)
  return () => query?.removeEventListener('change', callback)
}
const readMotion = () => window.matchMedia?.(motionQuery).matches ?? false

export function WardrobeHero({ ongoing }: { ongoing: boolean }) {
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, () => true)
  const [unavailable, setUnavailable] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const stopped = reduced

  useEffect(() => {
    const element = video.current
    if (!element) return
    let visible = typeof IntersectionObserver === 'undefined'
    const sync = () => {
      if (stopped || !visible || document.hidden || unavailable) element.pause()
      else void element.play()?.catch(() => { /* Keep the poster if autoplay is unavailable. */ })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() }, { threshold: .15 })
    observer?.observe(element)
    element.addEventListener('canplay', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => { observer?.disconnect(); element.removeEventListener('canplay', sync); document.removeEventListener('visibilitychange', sync); element.pause() }
  }, [stopped, unavailable])

  return <section className="wardrobe-hero" aria-labelledby="hero-title" data-paused={stopped}>
    <div className="ascii-hero">
      <div className="hero-heading">
        <p className="eyebrow">A little care goes a long way</p>
        <h1 id="hero-title">See your clothes.<br /><em>Think beyond the label.</em></h1>
        <p className="hero-description">Scan a photo. Understand its estimated footprint. <br />Find a little more life in what you already own.</p>
        <div className="hero-actions"><Link className="button" to="/scan">{ongoing ? 'Continue your scan' : 'Scan clothes'}</Link></div>
      </div>
      <AsciiFlower paused={stopped} />
    </div>
    <div className="hero-feature-cards">
      <article className="hero-feature story-feature">
        <div className="feature-visual">
          <video ref={video} muted loop playsInline preload="metadata" poster="/media/ecoscan-wordless-poster.jpg" aria-label="Wordless EcoScan story: scan clothing, explore impact, reuse and demo rewards" onError={() => setUnavailable(true)}><source src="/media/ecoscan-wordless.mp4" type="video/mp4" /></video>
          {unavailable && <span className="feature-media-note">Still preview</span>}
        </div>
        <div className="feature-copy"><span className="feature-kicker">Discover</span><h2>A photo starts the story.</h2><p>See how a wardrobe becomes an estimate, a reuse idea, and a little encouragement.</p><Link to="/scan">Try a scan</Link></div>
      </article>
      <article className="hero-feature estimate-feature">
        <div className="feature-visual estimate-visual" aria-label="Illustrative production estimate: T-shirt 5 kilograms CO₂e">
          <span className="estimate-example">One T-shirt, for example</span><strong>5 <span>kg CO₂e</span></strong><span className="estimate-footnote">Estimated production · demo catalogue</span>
          <div className="estimate-ticks" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} />)}</div>
        </div>
        <div className="feature-copy"><span className="feature-kicker">Understand</span><h2>Give impact some context.</h2><p>Explore item estimates and the assumptions behind them. Curiosity starts with clear information.</p><Link to="/#how-it-works">Read the assumptions</Link></div>
      </article>
      <article className="hero-feature reward-feature">
        <div className="feature-visual reward-visual" aria-hidden="true"><div className="reward-object"><img src="/media/tour-objects.png" alt="" loading="lazy" /></div><span className="reward-visual-label">Another wear. Another possibility.</span></div>
        <div className="feature-copy"><span className="feature-kicker">Reimagine</span><h2>Make room for another wear.</h2><p>Explore a reuse scenario and its demo rewards. Small choices, thoughtfully considered.</p><Link to="/rewards">Explore demo offers</Link></div>
      </article>
    </div>
  </section>
}
