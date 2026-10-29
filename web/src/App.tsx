import { useEffect, useRef, useState } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useScan } from './hooks/useScan'
import { useRewards } from './hooks/useRewards'
import { HomePage } from './pages/InformationPages'
import { ScanPage } from './pages/ScanPage'
import { ResultsPage } from './pages/ResultsPage'
import { RewardsPage } from './pages/RewardsPage'
import { SiteFooter } from './components/SiteFooter'
import { SpotlightNav } from './components/SpotlightNav'
import { AuthPage } from './pages/AuthPage'
import { api } from './lib/api'
import './App.css'

const pageTitles: Record<string, string> = { '/': 'Home', '/scan': 'Scan clothes', '/results': 'Results', '/rewards': 'Rewards', '/account': 'Account' }
function Shell() {
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined)
  const authVersion = useRef(0)
  const rewards = useRewards()
  const scan = useScan(() => { void rewards.refresh() })
  useEffect(() => {
    const version = authVersion.current
    void api.me().then(({ user }) => { if (version === authVersion.current) setUser(user) })
      .catch(() => { if (version === authVersion.current) setUser(null) })
  }, [])
  function authenticated(value: { id: string; email: string }) {
    authVersion.current++; scan.reset(true); setUser(value); void rewards.refresh()
  }
  async function logout() {
    await api.logout(); authVersion.current++; scan.reset(true); setUser(null); await rewards.refresh()
  }
  const { pathname, hash } = useLocation()
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    document.title = (pageTitles[pathname] ?? 'Page not found') + ' · EcoScan'
    main.current?.focus()
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
    <header className="site-header">
      <div className="header-inner"><Link className="brand" to="/">EcoScan</Link><SpotlightNav /><Link className="account-link" to="/account">{user ? 'Account' : 'Sign up / Log in'}</Link></div>
    </header>
    <main id="main-content" ref={main} tabIndex={-1}>
      <Routes>
        <Route path="/" element={<HomePage scan={scan} />} />
        <Route path="/scan" element={<ScanPage scan={scan} />} />
        <Route path="/results" element={<ResultsPage scan={scan} />} />
        <Route path="/rewards" element={<RewardsPage rewards={rewards} />} />
        <Route path="/account" element={<AuthPage user={user} onAuthenticated={authenticated} onLogout={logout} />} />
        <Route path="/how-it-works" element={<Navigate to="/#how-it-works" replace />} />
        <Route path="*" element={<><h1>Page not found</h1><p>Choose a page in the navigation or <Link to="/">return home</Link>.</p></>} />
      </Routes>
    </main>
    <SiteFooter />
  </>
}
export default function App() { return <HashRouter><Shell /></HashRouter> }
