import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RewardsState } from '../hooks/useRewards'
import { api, messageOf } from '../lib/api'
import type { RedeemedOffer } from '../lib/demoReceipt'
import { ActivityEvidencePanel } from '../components/ActivityEvidencePanel'
import { ReceiptRecovery,RecoveryKeyButton } from '../components/ReceiptRecovery'
import { ScanIcon } from '../components/ScanIcon'
import './RewardsPage.css'

export function RewardsPage({ rewards }: { rewards: RewardsState }) {
  const [fulfilSelected, setFulfilSelected] = useState<string | null>(null)
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
  async function fulfil(id: string) {
    if (busy) return
    setBusy(true); setError('')
    try { await api.useDemo(id); setFulfilSelected(null); setMessage('Demo voucher marked used. No real product was issued.') }
    catch (cause) { setError(messageOf(cause)) }
    finally { await refresh(); setBusy(false) }
  }
  async function refund(id: string) {
    if (busy) return
    setBusy(true); setError('')
    try { await api.refund(id); setMessage('Unused demo voucher refunded. Points returned once.') }
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
  return <div className="rewards-page">
    <header className="rewards-heading"><div><p className="eyebrow">A LITTLE THANK YOU FOR LOOKING CLOSER</p><h1>Your demo rewards</h1><p>Keep clothes in the loop. Explore what your points could unlock.</p></div><span className="rewards-demo-tag">Demo experience</span></header>
    <section className="rewards-wallet" aria-label="Demo points balance">
      <div className="rewards-wallet-intro"><span className="rewards-wallet-icon"><ScanIcon name="gift"/></span><div><p className="rewards-kicker">SMALL CHOICES, MORE POSSIBILITIES</p><h2>A little care goes a long way.</h2><p>Give another piece a closer look, then explore the example offers below.</p><Link to="/scan">Scan clothes <ScanIcon name="arrow"/></Link></div></div>
      <div className="rewards-balance"><span>YOUR DEMO BALANCE</span><strong>{rewards.data ? rewards.data.demoPointsBalance + ' demo points' : rewards.loading ? 'Loading balance…' : 'Balance unavailable'}</strong><button className="secondary" disabled={rewards.loading || busy} onClick={() => void refresh()}><ScanIcon name="refresh"/>{rewards.loading ? 'Refreshing…' : 'Refresh balance'}</button></div>
    </section>
    <p className="rewards-demo-disclaimer"><ScanIcon name="leaf"/> Fictional offers, no real products or vouchers. Photos do not verify garment ownership or avoided purchases.</p>
    {rewards.error && <p className="error" role="alert">{rewards.error}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="note" role="status">{message}</p>}
    {!rewards.data && rewards.loading && <p role="status">Loading offers…</p>}
    {redeemedOffers.length > 0 && <section className="receipts rewards-history" aria-labelledby="receipts-heading">
      <h2 id="receipts-heading">Your reward history</h2>
      <p className="muted">Download a record of each example redemption. These PDFs are not vouchers for real products.</p>
      {redeemedOffers.map((offer) => <article className="demo-receipt" key={offer.id}>
        <p className="badge">Demo redemption saved</p>
        <h3>{offer.title}</h3>
        <p><strong>Reference:</strong> <code>{offer.receipt.reference}</code></p>
        <p className="muted">Issued {new Date(offer.receipt.redeemedAt).toLocaleDateString()} · {offer.receipt.status ?? 'issued'}{offer.receipt.expiresAt && <> · expires {new Date(offer.receipt.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</>}</p>
        {['issued', 'expired'].includes(offer.receipt.status ?? 'issued') && <button className="secondary" disabled={busy} onClick={() => void refund(offer.id)}>Refund unused demo voucher</button>}
        {(offer.receipt.status ?? 'issued') === 'issued' && (fulfilSelected === offer.id ? <div className="note"><p>Mark this demo voucher used? It cannot be refunded afterward. No real goods or benefits will be issued.</p><button disabled={busy} onClick={() => void fulfil(offer.id)}>Confirm demo fulfilment</button><button className="secondary" disabled={busy} onClick={() => setFulfilSelected(null)}>Cancel fulfilment</button></div> : <button className="secondary" disabled={busy} onClick={() => setFulfilSelected(offer.id)}>Simulate demo fulfilment</button>)}
        <button className="secondary" onClick={() => void download(offer)}>Download sample PDF</button>
        <RecoveryKeyButton offerId={offer.id}/>
      </article>)}
    </section>}
    <section className="rewards-offers" aria-labelledby="offers-heading"><div className="rewards-section-heading"><div><p className="rewards-kicker">A SECOND LIFE STARTS SMALL</p><h2 id="offers-heading">Find your next good habit.</h2></div><span className="rewards-count">{rewards.data?.offers.length ?? 0} example offers</span></div><div className="offer-list">{rewards.data?.offers.map((offer) => <article className={`rewards-offer rewards-offer-${offer.id}`} key={offer.id}><div className="rewards-offer-art" aria-hidden="true"><span className="rewards-art-tag">DEMO ONLY</span><span className="rewards-art-circle"><ScanIcon name={offer.id === 'repair-kit' ? 'ruler' : offer.id === 'swap-pass' ? 'shirt' : 'leaf'}/></span><span className="rewards-art-caption">{offer.id === 'repair-kit' ? 'MEND & MAKE LAST' : offer.id === 'swap-pass' ? 'SWAP SOMETHING GOOD' : 'FIND A SECOND LIFE'}</span></div><div className="rewards-offer-body">
      <div className="offer-heading"><span className="rewards-offer-partner">{offer.partner ?? 'Demo offer'}</span><span className="rewards-offer-cost">{offer.pointsCost} points</span></div><h3>{offer.title}</h3><p className="rewards-offer-description">{offer.description}</p>
      <details className="rewards-offer-terms"><summary>Offer details <ScanIcon name="plus"/></summary><div><p>{offer.terms}</p><p>{offer.remaining ?? 0} remaining</p>{offer.expiresAt && <p>Offer available until {new Date(offer.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</div></details>
      {offer.redeemed && offer.receipt ? <p className="badge">{offer.receipt.status === 'refunded' ? 'Refunded' : offer.receipt.status === 'used' ? 'Used' : offer.receipt.status === 'expired' ? 'Expired' : 'Issued'} · Receipt above</p> : selected === offer.id ? <div className="note"><p>Redeem this demo offer for <strong>{offer.pointsCost} points</strong>? Its cost will be deducted from your balance. You will receive a sample receipt, not a real product or voucher.</p><div className="actions"><button disabled={busy || !!rewards.error} onClick={() => void redeem(offer.id)}>{busy ? 'Redeeming…' : 'Confirm redemption'}</button><button className="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></div> :
        <><button disabled={!offer.canRedeem || busy || rewards.loading || !!rewards.error} onClick={() => { setSelected(offer.id); setError(''); setMessage('') }}>Redeem demo offer</button>{!offer.canRedeem && <p className="muted">{offer.expired ? 'This offer has expired.' : offer.remaining === 0 ? 'Out of stock.' : 'You need ' + Math.max(0, offer.pointsCost - (rewards.data?.demoPointsBalance ?? 0)) + ' more points.'}</p>}</>}
    </div></article>)}</div>{rewards.data && rewards.data.offers.length === 0 && <p className="rewards-empty">No example offers are available right now. You can refresh your balance to check again.</p>}</section>
    <div className="rewards-tools"><ActivityEvidencePanel/><ReceiptRecovery/></div>
    <details className="rewards-earn"><summary><span><ScanIcon name="leaf"/> How do I earn points?</span><ScanIcon name="plus"/></summary><div><p>Keep a live AI-recognized item list unchanged and select a reuse scenario that replaces a planned purchase. Images and visually similar reuploads can earn once across sessions for 90 days; daily earnings are capped at 250 points per browser session (UTC); manual, edited, duplicate, or mock scans earn zero points. Your balance belongs to this browser session; these are not real-world rewards.</p><div className="actions"><Link to="/scan">Scan clothes</Link><Link to="/#how-it-works">Understand the points rules</Link></div></div></details>
  </div>
}
