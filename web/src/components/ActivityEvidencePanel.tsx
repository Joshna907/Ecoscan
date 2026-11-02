import { useCallback, useEffect, useState } from 'react'
import type { ActivityEvidenceSnapshot, QualifyingActivity } from 'shared'
import { api, messageOf } from '../lib/api'
import { ScanIcon } from './ScanIcon'

const activityNames: Record<QualifyingActivity, string> = { repair: 'Completed repair', secondhand_purchase: 'Completed secondhand purchase', donation: 'Accepted donation', recycling: 'Accepted recycling' }

export function ActivityEvidencePanel() {
  const [data, setData] = useState<ActivityEvidenceSnapshot | null>(null)
  const [partnerId, setPartnerId] = useState('')
  const [activity, setActivity] = useState<QualifyingActivity>('repair')
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setData(await api.activityEvidence()); setError('') }
    catch (cause) { setError(messageOf(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    void api.activityEvidence().then(snapshot => { if (active) setData(snapshot) }).catch(cause => { if (active) setError(messageOf(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const partner = data?.partners.find(p => p.id === partnerId) ?? data?.partners[0]
  const selectedActivity = partner?.activities.includes(activity) ? activity : partner?.activities[0]
  async function create() {
    if (!partner || !selectedActivity || busy) return
    setBusy(true); setError(''); setCode(null)
    try { setCode(await api.requestActivityEvidence(partner.id, selectedActivity)) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }
  return <section className="panel rewards-tool rewards-activity" aria-labelledby="activity-heading">
    <div className="rewards-tool-heading"><span className="rewards-tool-icon"><ScanIcon name="check"/></span><div><p className="eyebrow">INDEPENDENT EVIDENCE</p><h2 id="activity-heading">Partner-confirmed activity</h2></div></div>
    <p>A partner can confirm a repair, secondhand purchase, donation, or recycling. A photo or your own declaration cannot confirm an activity.</p>
    <p className="rewards-activity-credit"><strong>{data ? `${data.verifiedActivityCredits} verified activity credits` : loading ? 'Checking activity credits…' : 'Activity credits unavailable'}</strong></p>
    {error && <p role="alert" className="error">{error}</p>}
    {loading && <p role="status">Checking activity verification…</p>}
    {data && !data.enabled && <p className="rewards-unavailable"><span/>No activity verification partner is connected yet. Verification will become available when an approved partner is connected.</p>}
    {data?.enabled && <>
      <label>Verification partner<select value={partner?.id ?? ''} onChange={event => { setPartnerId(event.target.value); setCode(null) }} disabled={busy}>{data.partners.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Qualifying activity<select value={selectedActivity ?? ''} onChange={event => { setActivity(event.target.value as QualifyingActivity); setCode(null) }} disabled={busy}>{partner?.activities.map(a => <option value={a} key={a}>{activityNames[a]}</option>)}</select></label>
      <p className="muted">Ask the partner to confirm its completed transaction using this code. Share it only with your selected partner. Codes last 15 minutes; up to five can be created per browser session per UTC day. Each code can confirm one event.</p>
      <button disabled={busy || loading} onClick={() => void create()}>{busy ? 'Creating code…' : 'Create verification code'}</button>
      {code && <div className="note" role="status"><p><strong>Share with {partner?.name} for {selectedActivity && activityNames[selectedActivity].toLowerCase()}:</strong></p><p className="verification-code">{code.code}</p><p>Expires {new Date(code.expiresAt).toLocaleString()}. After confirmation, refresh activity to see the receipt. This code is not saved when you leave this page.</p></div>}
    </>}
    <button className="secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh activity</button>
    {data && data.receipts.length > 0 && <div><h3>Activity evidence history</h3>{data.receipts.map(receipt => <article className="demo-receipt" key={receipt.id}>
      <h4>{activityNames[receipt.activity]}</h4><p>{receipt.partnerName} · {receipt.status === 'confirmed' ? `${receipt.credits} credits confirmed` : `Reversed: ${receipt.reversalReason}`}</p>
      <p className="muted">Completed {new Date(receipt.occurredAt).toLocaleString()} · Evidence reference {receipt.id}</p>
    </article>)}</div>}
    <details className="rewards-tool-details"><summary>About activity credits <ScanIcon name="plus"/></summary><div><p>Separate from demo points. These credits have no cash value and cannot redeem offers. They confirm the partner’s activity record, not garment ownership, an avoided purchase, or a measured CO₂ saving.</p><p>Evidence and credits belong to this anonymous browser session. If you lose the cookie or the session expires, they cannot be recovered here. Partners must use a stable participant reference; switching browsers does not reset the partner’s participant limit. References are retained as keyed hashes to stop repeated claims, including after session expiry.</p></div></details>
  </section>
}
