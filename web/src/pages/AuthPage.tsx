import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, messageOf } from '../lib/api'
import './AuthPage.css'

type User = { id: string; email: string }
export function AuthPage({ user, onAuthenticated, onLogout }: {
  user: User | null | undefined
  onAuthenticated: (user: User) => void
  onLogout: () => Promise<void>
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = mode === 'signup' ? await api.signup(email, password) : await api.login(email, password)
      onAuthenticated(response.user)
      navigate('/rewards')
    } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  if (user) return <section className="auth-page"><p className="eyebrow">Your account</p><h1>You're signed in.</h1>
    <p className="auth-email">{user.email}</p><p>Your demo point balance is connected to this account.</p>
    <div className="actions"><Link className="button" to="/rewards">View rewards</Link><button className="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await onLogout(); navigate('/') } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) } }}>Log out</button></div>
    {error && <p role="alert" className="error">{error}</p>}</section>
  return <section className="auth-page"><div className="auth-intro"><p className="eyebrow">A place for your wardrobe</p>
    <h1>{mode === 'signup' ? 'Keep your progress close.' : 'Welcome back.'}</h1>
    <p>{mode === 'signup' ? 'Create an account to keep your demo point balance across visits.' : 'Sign in to return to your EcoScan rewards.'}</p>
    <p className="muted">Rewards remain examples, with no real-world redemption value.</p></div>
    <div className="auth-form-wrap"><div className="auth-switch" role="group" aria-label="Account action">
      <button type="button" className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
      <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError('') }}>Log in</button>
    </div><form onSubmit={submit} className="auth-form"><label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {mode === 'signup' && <p className="muted">Use at least 12 characters. Your current browser's demo points will be kept.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
    </form></div></section>
}
