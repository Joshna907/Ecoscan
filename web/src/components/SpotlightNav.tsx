import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import './SpotlightNav.css'

const items = [
  { to: '/results', label: 'Results' },
  { to: '/rewards', label: 'Rewards' },
]

export function SpotlightNav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [hovered, setHovered] = useState(false)
  const [active, setActive] = useState<{ left: number; width: number } | null>(null)

  const measureActive = useCallback(() => {
    const nav = navRef.current
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !link) { setActive(null); return }
    setActive({ left: link.offsetLeft, width: link.offsetWidth })
  }, [])

  useLayoutEffect(() => {
    measureActive()
    const nav = navRef.current
    const observer = nav && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureActive) : undefined
    if (nav) observer?.observe(nav)
    window.addEventListener('resize', measureActive)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measureActive) }
  }, [pathname, measureActive])

  return <nav ref={navRef} className="spotlight-nav" aria-label="Main navigation" data-hovered={hovered}
    onPointerEnter={() => setHovered(true)}
    onPointerMove={(event) => {
      const nav = navRef.current
      if (nav) nav.style.setProperty('--spotlight-x', `${event.clientX - nav.getBoundingClientRect().left}px`)
    }}
    onPointerLeave={() => setHovered(false)}>
    <span className="spotlight-cursor" aria-hidden="true" />
    {active && <span className="spotlight-active" style={{ left: active.left, width: active.width }} aria-hidden="true" />}
    {items.map(({ to, label }) => <NavLink key={to} to={to} end>{label}</NavLink>)}
  </nav>
}
