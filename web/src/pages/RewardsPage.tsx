import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RewardsState } from '../hooks/useRewards'
import { api, messageOf } from '../lib/api'
import type { RedeemedOffer } from '../lib/demoReceipt'

export function RewardsPage({ rewards }: { rewards: RewardsState }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { refresh } = rewards
  useEffect(() => { void refresh() }, [refresh])
  async function redeem(id: string) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { const result = await api.redeem(id); setMessage(result.message); setSelected(null) }
    catch (cause) { setError(messageOf(cause)) }
    finally { await refresh(); setBusy(false) }
  }
  async function download(offer: RedeemedOffer) {
    try {
      const { downloadDemoReceipt } = await import('../lib/demoReceipt')
      downloadDemoReceipt(offer)
    } catch {
      setError('The PDF could not be created. Please try again.')
    }
  }
  const redeemedOffers = rewards.data?.offers.filter((offer): offer is RedeemedOffer => offer.receipt !== null) ?? []
  return <>
    <p className="eyebrow">Example offers</p><h1>Your demo rewards</h1>
    <p className="lead">Explore what rewards could look like. These offers are fictional and do not issue real vouchers.</p>
    <div className="balance"><strong>{rewards.data ? rewards.data.demoPointsBalance + ' demo points' : rewards.loading ? 'Loading balance…' : 'Balance unavailable'}</strong><button className="secondary" disabled={rewards.loading || busy} onClick={() => void refresh()}>{rewards.loading ? 'Refreshing…' : 'Refresh balance'}</button></div>
    {rewards.error && <p className="error" role="alert">{rewards.error}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="note" role="status">{message}</p>}
    {!rewards.data && rewards.loading && <p role="status">Loading offers…</p>}
    {redeemedOffers.length > 0 && <section className="receipts" aria-labelledby="receipts-heading">
      <h2 id="receipts-heading">Your reward history</h2>
      <p className="muted">Download a record of each example redemption. These PDFs are not vouchers for real products.</p>
      {redeemedOffers.map((offer) => <div className="demo-receipt" key={offer.id}>
        <p className="badge">Demo redemption saved</p>
        <h3>{offer.title}</h3>
        <p><strong>Reference:</strong> <code>{offer.receipt.reference}</code></p>
        <p className="muted">Redeemed {new Date(offer.receipt.redeemedAt).toLocaleDateString()}</p>
        <button className="secondary" onClick={() => void download(offer)}>Download sample PDF</button>
      </div>)}
    </section>}
    <div className="offer-list">{rewards.data?.offers.map((offer) => <section className="panel" key={offer.id}>
      <div className="offer-heading"><h2>{offer.title}</h2><strong>{offer.pointsCost} points</strong></div><p>{offer.description}</p>
      {offer.redeemed && offer.receipt ? <p className="badge">Redeemed · Receipt above</p> : selected === offer.id ? <div className="note"><p>Redeem this demo offer for <strong>{offer.pointsCost} points</strong>? Its cost will be deducted from your balance. You will receive a sample receipt, not a real product or voucher.</p><div className="actions"><button disabled={busy || !!rewards.error} onClick={() => void redeem(offer.id)}>{busy ? 'Redeeming…' : 'Confirm redemption'}</button><button className="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></div> :
        <><button disabled={!offer.canRedeem || busy || rewards.loading || !!rewards.error} onClick={() => { setSelected(offer.id); setError(''); setMessage('') }}>Redeem demo offer</button>{!offer.canRedeem && <p className="muted">You need {Math.max(0, offer.pointsCost - (rewards.data?.demoPointsBalance ?? 0))} more points.</p>}</>}
    </section>)}</div>
    <section className="note"><h2>How do I earn points?</h2><p>Keep a live AI-recognized item list unchanged and select a reuse scenario that replaces a planned purchase. Each image can earn once per session or account; manual, edited, duplicate, or mock scans earn zero points. <Link to="/account">An account</Link> keeps your demo balance across visits; these are not real-world rewards.</p><div className="actions"><Link to="/scan">Scan clothes</Link><Link to="/#how-it-works">Understand the points rules</Link></div></section>
  </>
}
