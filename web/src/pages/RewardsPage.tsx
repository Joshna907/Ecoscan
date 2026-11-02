import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RewardsState } from '../hooks/useRewards'
import { api, messageOf } from '../lib/api'
import type { RedeemedOffer } from '../lib/demoReceipt'
import { ActivityEvidencePanel } from '../components/ActivityEvidencePanel'
import { ReceiptRecovery,RecoveryKeyButton } from '../components/ReceiptRecovery'

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
  return <>
    <p className="eyebrow">Example offers</p><h1>Your demo rewards</h1>
    <p className="lead">Explore what rewards could look like. These offers are fictional and do not issue real vouchers. Photos do not verify garment ownership or avoided purchases.</p>
    <ActivityEvidencePanel />
    <ReceiptRecovery />
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
        <p className="muted">Issued {new Date(offer.receipt.redeemedAt).toLocaleDateString()} · {offer.receipt.status ?? 'issued'}{offer.receipt.expiresAt && <> · expires {new Date(offer.receipt.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</>}</p>
        {['issued', 'expired'].includes(offer.receipt.status ?? 'issued') && <button className="secondary" disabled={busy} onClick={() => void refund(offer.id)}>Refund unused demo voucher</button>}
        {(offer.receipt.status ?? 'issued') === 'issued' && (fulfilSelected === offer.id ? <div className="note"><p>Mark this demo voucher used? It cannot be refunded afterward. No real goods or benefits will be issued.</p><button disabled={busy} onClick={() => void fulfil(offer.id)}>Confirm demo fulfilment</button><button className="secondary" disabled={busy} onClick={() => setFulfilSelected(null)}>Cancel fulfilment</button></div> : <button className="secondary" disabled={busy} onClick={() => setFulfilSelected(offer.id)}>Simulate demo fulfilment</button>)}
        <button className="secondary" onClick={() => void download(offer)}>Download sample PDF</button>
        <RecoveryKeyButton offerId={offer.id}/>
      </div>)}
    </section>}
    <div className="offer-list">{rewards.data?.offers.map((offer) => <section className="panel" key={offer.id}>
      <div className="offer-heading"><h2>{offer.title}</h2><strong>{offer.pointsCost} points</strong></div><p>{offer.description}</p><p className="muted">{offer.partner} · {offer.remaining ?? 0} remaining</p><p className="muted">{offer.terms}</p>{offer.expiresAt && <p className="muted">Offer available until {new Date(offer.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
      {offer.redeemed && offer.receipt ? <p className="badge">{offer.receipt.status === 'refunded' ? 'Refunded' : offer.receipt.status === 'used' ? 'Used' : offer.receipt.status === 'expired' ? 'Expired' : 'Issued'} · Receipt above</p> : selected === offer.id ? <div className="note"><p>Redeem this demo offer for <strong>{offer.pointsCost} points</strong>? Its cost will be deducted from your balance. You will receive a sample receipt, not a real product or voucher.</p><div className="actions"><button disabled={busy || !!rewards.error} onClick={() => void redeem(offer.id)}>{busy ? 'Redeeming…' : 'Confirm redemption'}</button><button className="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></div> :
        <><button disabled={!offer.canRedeem || busy || rewards.loading || !!rewards.error} onClick={() => { setSelected(offer.id); setError(''); setMessage('') }}>Redeem demo offer</button>{!offer.canRedeem && <p className="muted">{offer.expired ? 'This offer has expired.' : offer.remaining === 0 ? 'Out of stock.' : 'You need ' + Math.max(0, offer.pointsCost - (rewards.data?.demoPointsBalance ?? 0)) + ' more points.'}</p>}</>}
    </section>)}</div>
    <section className="note"><h2>How do I earn points?</h2><p>Keep a live AI-recognized item list unchanged and select a reuse scenario that replaces a planned purchase. Images and visually similar reuploads can earn once across sessions for 90 days; daily earnings are capped at 250 points per browser session (UTC); manual, edited, duplicate, or mock scans earn zero points. Your balance belongs to this browser session; these are not real-world rewards.</p><div className="actions"><Link to="/scan">Scan clothes</Link><Link to="/#how-it-works">Understand the points rules</Link></div></section>
  </>
}
