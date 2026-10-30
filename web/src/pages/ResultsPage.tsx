import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ConfirmScanResponse } from 'shared'
import type { ScanFlow } from '../hooks/useScan'
import { api, messageOf } from '../lib/api'
import { kg, labels } from '../lib/labels'

export function ResultsPage({ scan }: { scan: ScanFlow }) {
  const [savedResult, setSavedResult] = useState<ConfirmScanResponse | null>(null)
  const [loading, setLoading] = useState(!scan.result)
  const [error, setError] = useState('')
  useEffect(() => {
    if (scan.result) return
    let active = true
    void api.latestScan().then(({ result }) => { if (active) setSavedResult(result) })
      .catch((cause) => { if (active) setError(messageOf(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scan.result])
  const result = scan.result ?? savedResult
  if (!result && loading) return <p role="status">Loading your latest result…</p>
  if (!result && error) return <><p className="eyebrow">Scan results</p><h1>We could not load your result</h1><p className="error" role="alert">{error}</p><Link className="button" to="/scan">Return to scanner</Link></>
  if (!result) return <><p className="eyebrow">Scan results</p><h1>No estimate yet</h1><p>Upload a photo and confirm its items to see their estimated footprint here.</p><Link className="button" to="/scan">{scan.phase === 'upload' ? 'Scan clothes' : 'Continue your scan'}</Link></>
  const rewardExplanation = result.rewardStatus === 'duplicate_image'
    ? 'This image has already earned points in this session or account. The estimate is saved, but duplicate points were not added.'
    : result.rewardStatus === 'unverified_items'
      ? 'The confirmed items did not exactly match a live AI recognition result. You still receive an estimate, but manual, corrected, or mock items do not earn points.'
      : result.rewardStatus === 'awarded'
        ? 'The unchanged AI-recognized list matched your planned-purchase comparison, so this demo awarded points. This is not proof of real-world savings.'
        : 'You did not select a replacement for a planned purchase, so this scan earns no demo points. You still receive the production estimate.'
  return <>
    <p className="eyebrow">Your latest confirmed scan</p><h1>Your clothing estimate</h1>
    <p className="lead">These are illustrative category benchmarks for the items you confirmed—not measurements of the photographed products.</p>
    <div className="metrics">
      <div><span>Estimated production</span><strong>{kg(result.totalEstimatedProductionKgCo2e)} kg CO₂e</strong></div>
      <div><span>Potential avoided production</span><strong>{kg(result.scenarioPotentialAvoidedKgCo2e)} kg CO₂e</strong><small>In your selected comparison scenario</small></div>
      <div><span>Demo points awarded</span><strong>{result.demoPointsAwarded} points</strong></div>
    </div>
    <section><h2>Item breakdown</h2><div className="table-wrap"><table><caption>Production estimates · {result.assumptionsVersion}</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Estimated total</th></tr></thead><tbody>
      {result.items.map((item, index) => <tr key={index}><td>{labels[item.category]}</td><td>{item.quantity}</td><td>{kg(item.estimatedProductionKgCo2e)} kg CO₂e</td></tr>)}
    </tbody></table></div></section>
    <section className="note"><h2>What this means</h2><p>{result.scenarioPotentialAvoidedKgCo2e > 0 ? 'You selected a scenario where wearing these items again replaces a planned purchase. The demo shows a hypothetical comparison using half the category benchmark.' : 'You did not select a replacement for a planned purchase, so the avoided-production comparison is zero.'}</p><p><strong>Points:</strong> {rewardExplanation}</p><p>A photograph cannot prove a garment’s exact footprint or an avoided purchase. These points are not carbon credits.</p><Link to="/#how-it-works">See all assumptions</Link></section>
    <div className="actions"><Link className="button" to="/rewards">View rewards and current balance</Link><Link className="button secondary" to="/scan" onClick={() => scan.reset()}>Scan another photo</Link></div>
    <p className="muted">Your latest confirmed estimate is saved with your session. An account keeps it available across visits; anonymous sessions expire after inactivity.</p>
  </>
}
