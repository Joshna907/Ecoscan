import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Co2eRange, ConfirmScanResponse, MaterialType } from 'shared'
import type { ScanFlow } from '../hooks/useScan'
import { api, messageOf } from '../lib/api'
import { kg, labels } from '../lib/labels'
import { ScanIcon } from '../components/ScanIcon'
import './ResultsPage.css'
import { EstimateMethodology } from '../components/EstimateMethodology'

const materialNames: Record<MaterialType, string> = {
  cotton: 'cotton', polyester: 'polyester', nylon: 'nylon', wool: 'wool', linen: 'linen',
  viscose: 'viscose/rayon', acrylic: 'acrylic', elastane: 'elastane/spandex', leather: 'leather', other: 'other fibre',
}
const range = (value: Co2eRange) => `${kg(value.low)}–${kg(value.high)} kg CO₂e (central ${kg(value.central)})`

function ResultsState({ children }: { children: ReactNode }) {
  return <div className="results-page"><section className="results-card results-empty"><span className="results-empty-icon"><ScanIcon name="leaf"/></span>{children}</section></div>
}

export function ResultsPage({ scan }: { scan: ScanFlow }) {
  const [legacy, setLegacy] = useState(false)
  const [savedResult, setSavedResult] = useState<ConfirmScanResponse | null>(null)
  const [loading, setLoading] = useState(!scan.result)
  const [error, setError] = useState('')
  useEffect(() => {
    if (scan.result) return
    let active = true
    void api.latestScan().then(({ result, legacyResult }) => { if (active) { setSavedResult(result); setLegacy(!!legacyResult) } })
      .catch((cause) => { if (active) setError(messageOf(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scan.result])
  const result = scan.result ?? savedResult
  const materialIsPartial=result?.items.some(item=>!item.materialStageKgCo2e||item.materialCoverage?.status==='partial'||item.materialCoverage?.status==='unsupported'||(item.materialCoverageGrams!==undefined&&item.effectiveWeightGrams&&item.materialCoverageGrams<item.effectiveWeightGrams.central))??false
  if (!result && loading) return <ResultsState><p role="status">Loading your latest result…</p></ResultsState>
  if (!result && error) return <ResultsState><p className="eyebrow">Scan results</p><h1>We could not load your result</h1><p className="error" role="alert">{error}</p><Link className="button" to="/scan">Return to scanner</Link></ResultsState>
  if (!result && legacy) return <ResultsState><h1>Your earlier estimate uses an older methodology</h1><p>Your balance and receipts remain available in this browser session. Start a fresh scan to use current ranges and material factors.</p><Link className="button" to="/scan">Create an updated estimate</Link></ResultsState>
  if (!result) return <ResultsState><p className="eyebrow">Scan results</p><h1>No estimate yet</h1><p>Upload a photo and confirm its items to see their estimated footprint here.</p><Link className="button" to="/scan">{scan.phase === 'upload' ? 'Scan clothes' : 'Continue your scan'}</Link></ResultsState>
  const rewardExplanation = result.rewardStatus === 'reward_limit'
    ? 'No points were added because the reward limit was reached. The daily allowance is 250 points per browser session, resetting at midnight UTC. Your estimate is still available.'
    : result.rewardStatus === 'duplicate_image'
    ? 'This image or a visually similar image has already earned points. The estimate is saved, but duplicate points were not added.'
    : result.rewardStatus === 'unverified_items'
      ? 'The confirmed items did not exactly match a live AI recognition result. You still receive an estimate, but manual, corrected, or mock items do not earn points.'
      : result.rewardStatus === 'awarded'
        ? 'The unchanged AI-recognized list matched your planned-purchase comparison, so this demo awarded points. This is not proof of real-world savings.'
        : 'You did not select a replacement for a planned purchase, so this scan earns no demo points. You still receive the production estimate.'
  return <div className="results-page">
    <header className="results-heading"><div><p className="eyebrow"><span className="results-status-dot"/> Your latest confirmed scan</p><h1>Your clothing estimate</h1>
    <p className="lead">A clearer picture of your clothes’ impact, one estimate at a time.</p></div><Link className="button secondary results-new-scan" to="/scan" onClick={() => scan.reset()}>Scan another photo <ScanIcon name="plus"/></Link></header>
    <p className="results-disclaimer">Screening estimates, not product measurements. Care-label details add a separate fibre-production estimate.</p>
    <section className="results-metrics" aria-label="Estimate summary">
      <article className="results-metric results-metric-primary"><div className="results-metric-label"><ScanIcon name="shirt"/><span>Category production benchmark</span></div><strong>{kg(result.totalEstimatedProductionRangeKgCo2e.low)}–{kg(result.totalEstimatedProductionRangeKgCo2e.high)} <span>kg CO₂e</span></strong><p>Central estimate <b>{kg(result.totalEstimatedProductionRangeKgCo2e.central)} kg CO₂e</b></p><small>Illustrative whole-garment production</small></article>
      <article className="results-metric"><div className="results-metric-label"><ScanIcon name="leaf"/><span>Potential avoided production</span></div><strong>{kg(result.scenarioPotentialAvoidedRangeKgCo2e.low)}–{kg(result.scenarioPotentialAvoidedRangeKgCo2e.high)} <span>kg CO₂e</span></strong><p>Central estimate <b>{kg(result.scenarioPotentialAvoidedRangeKgCo2e.central)} kg CO₂e</b></p><small>Hypothetical scenario · not verified savings</small></article>
      <article className="results-metric results-points"><div className="results-metric-label"><ScanIcon name="check"/><span>Demo points awarded</span></div><strong>{result.demoPointsAwarded} <span>points</span></strong><p>For this confirmed scan</p><Link to="/rewards">View rewards <ScanIcon name="arrow"/></Link></article>
    </section>
    {result.materialStageKgCo2e && <section className="material-result results-card"><p className="eyebrow">Items with supported material/component estimates: {result.materialProfiledQuantity} of {result.totalQuantity} items</p><h2>{materialIsPartial?'Known fibre contribution — incomplete':'Fibre-production estimate'}</h2><strong className="range-number">{range(result.materialStageKgCo2e)}</strong>{materialIsPartial&&<p className="note">This range covers supported fibres only. Missing materials and components remain unknown, not zero. This is not a range for the complete garment, and its high value is not an upper bound for the garment.</p>}<p>Only supported, provided components are included; missing masses are excluded. This covers fibre production from raw-material inputs to the fibre factory gate. It is shown separately because the category benchmark has overlapping and different boundaries.</p></section>}
    <section className="results-card results-breakdown"><div className="results-section-heading"><div><p className="results-kicker">YOUR SCAN, IN DETAIL</p><h2>Item breakdown</h2></div><span className="results-pill">{result.totalQuantity} {result.totalQuantity === 1 ? 'item' : 'items'}</span></div><div className="table-wrap"><table><caption className="sr-only">Screening estimates · {result.assumptionsVersion}</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Category benchmark</th><th scope="col">Confirmed material stage</th></tr></thead><tbody>
      {result.items.map((item, index) => <tr key={index}><td data-label="Item"><div className="results-item-name"><span className="results-garment-icon"><ScanIcon name={item.category === 'tshirt' ? 'shirt' : item.category === 'shoes' ? 'shoe' : item.category === 'jeans' ? 'jeans' : 'jacket'}/></span><strong>{labels[item.category]}</strong></div>{item.materialProfile && <small className="table-detail">{item.materialProfile.components?.map(component => component.kind + ': ' + component.weightGrams + ' g').join(', ')}{item.materialProfile.composition.map((part) => `${part.percentage}% ${materialNames[part.material]}`).join(', ')}</small>}</td><td data-label="Quantity"><span className="results-quantity">×{item.quantity}</span></td><td data-label="Category benchmark">{range(item.estimatedProductionRangeKgCo2e)}</td><td data-label="Confirmed material stage">{item.materialStageKgCo2e ? <>{range(item.materialStageKgCo2e)}<small className="table-detail">Supported material mass: {item.materialCoverageGrams ?? item.effectiveWeightGrams?.central} g of {item.effectiveWeightGrams?.central} g per item. Weight: {item.effectiveWeightGrams?.source === 'measured' ? `${item.effectiveWeightGrams.central} g confirmed` : `${item.effectiveWeightGrams?.low}–${item.effectiveWeightGrams?.high} g category range`}</small></> : item.materialProfile ? 'No verified factor for this blend; category benchmark retained' : <span className="results-no-label">No label details added</span>}</td></tr>)}
    </tbody></table></div><p className="results-table-note">Screening estimates · {result.assumptionsVersion}. Category and material estimates have different boundaries; do not add them together.</p></section>
    {result.items.some(item=>item.materialCoverage&&item.materialCoverage.status!=='complete')&&<section className="results-card results-missing"><h2>What is missing from the material calculation?</h2>{result.items.map((item,index)=>item.materialCoverage&&item.materialCoverage.status!=='complete'&&<div key={index}><p><strong>{labels[item.category]}:</strong> {item.materialCoverage.uncoveredMassGrams} g per item is not covered.</p>{item.materialCoverage.missingFactors.map((part,i)=><p key={i}>No approved fibre-production factor: {materialNames[part.material]}{part.component?` (${part.component})`:''}, {part.weightGrams} g per item.</p>)}{item.materialCoverage.unallocatedMassGrams>0&&<p>{item.materialCoverage.unallocatedMassGrams} g has no component composition supplied.</p>}</div>)}</section>}
    <EstimateMethodology result={result} rewardExplanation={rewardExplanation}/>
    <section className="results-next"><div><ScanIcon name="leaf"/><div><h2>Keep the good habit going.</h2><p>Explore your demo rewards or give another piece a closer look.</p></div></div><Link className="button" to="/rewards">View rewards and current balance <ScanIcon name="arrow"/></Link></section>
    <p className="results-session-note">Your latest confirmed estimate is saved with your session. It is tied to this browser and expires after inactivity; there is no account or cross-device recovery.</p>
  </div>
}
