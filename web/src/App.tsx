import { useEffect, useRef } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useScan } from './hooks/useScan'
import { useRewards } from './hooks/useRewards'
import { HomePage } from './pages/InformationPages'
import { ScanPage } from './pages/ScanPage'
import { ResultsPage } from './pages/ResultsPage'
import { RewardsPage } from './pages/RewardsPage'
import { SiteFooter } from './components/SiteFooter'
import { SpotlightNav } from './components/SpotlightNav'
import './App.css'

const pageTitles: Record<string, string> = { '/': 'Home', '/scan': 'Scan clothes', '/results': 'Results', '/rewards': 'Rewards' }
function Shell() {
  const rewards = useRewards()
  const scan = useScan(() => { void rewards.refresh() })
  const { pathname, hash } = useLocation()
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    document.title = (pageTitles[pathname] ?? 'Page not found') + ' · EcoScan'
    main.current?.focus()
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      let ancestor = target?.parentElement
      while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement }
      target?.scrollIntoView?.()
    }
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
    <header className="site-header">
      <div className="header-inner"><Link className="brand" to="/">EcoScan</Link><SpotlightNav /></div>
    </header>
    <main id="main-content" ref={main} tabIndex={-1}>
      <Routes>
        <Route path="/" element={<HomePage scan={scan} />} />
        <Route path="/scan" element={<ScanPage scan={scan} />} />
        <Route path="/results" element={<ResultsPage scan={scan} />} />
        <Route path="/rewards" element={<RewardsPage rewards={rewards} />} />
        <Route path="/how-it-works" element={<Navigate to="/#how-it-works" replace />} />
        <Route path="*" element={<><h1>Page not found</h1><p>Choose a page in the navigation or <Link to="/">return home</Link>.</p></>} />
      </Routes>
    </main>
    <SiteFooter />
  </>
}
export default function App() { return <HashRouter><Shell /></HashRouter> }
