import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import './SiteFooter.css'

const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia?.(motionQuery)
  query?.addEventListener('change', callback)
  return () => query?.removeEventListener('change', callback)
}
const readMotion = () => window.matchMedia?.(motionQuery).matches ?? false

export function SiteFooter() {
  const video = useRef<HTMLVideoElement>(null)
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, () => true)

  useEffect(() => {
    const element = video.current
    if (!element) return
    let visible = typeof IntersectionObserver === 'undefined'
    const sync = () => {
      if (reducedMotion || !visible || document.hidden) element.pause()
      else void element.play()?.catch(() => { /* The poster remains visible if autoplay is unavailable. */ })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() }, { threshold: .1 })
    observer?.observe(element)
    document.addEventListener('visibilitychange', sync)
    element.addEventListener('canplay', sync)
    sync()
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync); element.removeEventListener('canplay', sync); element.pause() }
  }, [reducedMotion])

  return <footer className="site-footer">
    <video ref={video} className="footer-video" muted loop playsInline preload="none" poster="/footer-poster.jpg" aria-hidden="true"><source src="/footer.mp4" type="video/mp4" /></video>
    <div className="footer-inner">
      <div className="footer-main">
        <div className="footer-intro"><Link className="footer-brand" to="/">EcoScan</Link><p>See your clothes. Think beyond the label.</p></div>
        <div className="footer-links"><Link to="/scan">Scan clothes</Link><Link to="/results">Results</Link><Link to="/rewards">Rewards</Link><Link to="/#faq">FAQs</Link></div>
      </div>
      <p className="footer-note">Illustrative estimates and fictional rewards.</p>
    </div>
  </footer>
}
