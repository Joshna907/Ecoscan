import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Co2eRange, ConfirmScanResponse, MaterialType } from 'shared'
import type { ScanFlow } from '../hooks/useScan'
import { api, messageOf } from '../lib/api'
import { kg, labels } from '../lib/labels'

const materialNames: Record<MaterialType, string> = {
  cotton: 'cotton', polyester: 'polyester', nylon: 'nylon', wool: 'wool', linen: 'linen',
  viscose: 'viscose/rayon', acrylic: 'acrylic', elastane: 'elastane/spandex', leather: 'leather', other: 'other fibre',
}
const range = (value: Co2eRange) => `${kg(value.low)}–${kg(value.high)} kg CO₂e (central ${kg(value.central)})`

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
  if (!result && loading) return <p role="status">Loading your latest result…</p>
  if (!result && error) return <><p className="eyebrow">Scan results</p><h1>We could not load your result</h1><p className="error" role="alert">{error}</p><Link className="button" to="/scan">Return to scanner</Link></>
  if (!result && legacy) return <><h1>Your earlier estimate uses an older methodology</h1><p>Your balance and receipts remain available in this browser session. Start a fresh scan to use current ranges and material factors.</p><Link to="/scan">Create an updated estimate</Link></>
  if (!result) return <><p className="eyebrow">Scan results</p><h1>No estimate yet</h1><p>Upload a photo and confirm its items to see their estimated footprint here.</p><Link className="button" to="/scan">{scan.phase === 'upload' ? 'Scan clothes' : 'Continue your scan'}</Link></>
  const rewardExplanation = result.rewardStatus === 'reward_limit'
    ? 'No points were added because the reward limit was reached. The daily allowance is 250 points per browser session, resetting at midnight UTC. Your estimate is still available.'
    : result.rewardStatus === 'duplicate_image'
    ? 'This image or a visually similar image has already earned points. The estimate is saved, but duplicate points were not added.'
    : result.rewardStatus === 'unverified_items'
      ? 'The confirmed items did not exactly match a live AI recognition result. You still receive an estimate, but manual, corrected, or mock items do not earn points.'
      : result.rewardStatus === 'awarded'
        ? 'The unchanged AI-recognized list matched your planned-purchase comparison, so this demo awarded points. This is not proof of real-world savings.'
        : 'You did not select a replacement for a planned purchase, so this scan earns no demo points. You still receive the production estimate.'
  return <>
    <p className="eyebrow">Your latest confirmed scan</p><h1>Your clothing estimate</h1>
    <p className="lead">These are transparent screening ranges, not measurements of the photographed products. Confirmed care-label data adds a separate fibre-production estimate.</p>
    <div className="metrics">
      <div><span>Category production benchmark</span><strong>{range(result.totalEstimatedProductionRangeKgCo2e)}</strong></div>
      <div><span>Potential avoided production</span><strong>{range(result.scenarioPotentialAvoidedRangeKgCo2e)}</strong><small>Hypothetical scenario</small></div>
      <div><span>Demo points awarded</span><strong>{result.demoPointsAwarded} points</strong></div>
    </div>
    {result.materialStageKgCo2e && <section className="material-result"><p className="eyebrow">Items with supported material/component estimates: {result.materialProfiledQuantity} of {result.totalQuantity} items</p><h2>{materialIsPartial?'Known fibre contribution — incomplete':'Fibre-production estimate'}</h2><strong className="range-number">{range(result.materialStageKgCo2e)}</strong>{materialIsPartial&&<p className="note">This range covers supported fibres only. Missing materials and components remain unknown, not zero. This is not a range for the complete garment, and its high value is not an upper bound for the garment.</p>}<p>Only supported, provided components are included; missing masses are excluded. This covers fibre production from raw-material inputs to the fibre factory gate. It is shown separately because the category benchmark has overlapping and different boundaries.</p></section>}
    <section><h2>Item breakdown</h2><div className="table-wrap"><table><caption>Screening estimates · {result.assumptionsVersion}</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Category benchmark</th><th scope="col">Confirmed material stage</th></tr></thead><tbody>
      {result.items.map((item, index) => <tr key={index}><td>{labels[item.category]}{item.materialProfile && <small className="table-detail">{item.materialProfile.components?.map(component => component.kind + ': ' + component.weightGrams + ' g').join(', ')}{item.materialProfile.composition.map((part) => `${part.percentage}% ${materialNames[part.material]}`).join(', ')}</small>}</td><td>{item.quantity}</td><td>{range(item.estimatedProductionRangeKgCo2e)}</td><td>{item.materialStageKgCo2e ? <>{range(item.materialStageKgCo2e)}<small className="table-detail">Supported material mass: {item.materialCoverageGrams ?? item.effectiveWeightGrams?.central} g of {item.effectiveWeightGrams?.central} g per item. Weight: {item.effectiveWeightGrams?.source === 'measured' ? `${item.effectiveWeightGrams.central} g confirmed` : `${item.effectiveWeightGrams?.low}–${item.effectiveWeightGrams?.high} g category range`}</small></> : item.materialProfile ? 'No verified factor for this blend; category benchmark retained' : 'Not provided'}</td></tr>)}
    </tbody></table></div></section>
    {result.items.some(item=>item.materialCoverage&&item.materialCoverage.status!=='complete')&&<section className="note"><h2>What is missing from the material calculation?</h2>{result.items.map((item,index)=>item.materialCoverage&&item.materialCoverage.status!=='complete'&&<div key={index}><p><strong>{labels[item.category]}:</strong> {item.materialCoverage.uncoveredMassGrams} g per item is not covered.</p>{item.materialCoverage.missingFactors.map((part,i)=><p key={i}>No approved fibre-production factor: {materialNames[part.material]}{part.component?` (${part.component})`:''}, {part.weightGrams} g per item.</p>)}{item.materialCoverage.unallocatedMassGrams>0&&<p>{item.materialCoverage.unallocatedMassGrams} g has no component composition supplied.</p>}</div>)}</section>}
    <section className="note"><h2>Boundary and uncertainty</h2><p><strong>Category benchmark:</strong> an illustrative whole-garment production benchmark with a broad uncertainty range. It is not a product LCA.</p><p><strong>Material estimate:</strong> fibre production only (cradle-to-gate). It excludes fabric construction, dyeing, cut-and-sew, trims, packaging, transport, washing, durability, reuse and end of life. A full lifecycle result would need those stages and primary supplier data.</p><p>Low/high values are sensitivity scenarios, not confidence intervals: the bundled fibre factors use 50–150% of the sourced central value (imported snapshots use their recorded ranges); the illustrative category benchmark uses 60–160%. Unknown weights use category screening bounds. These do not capture all uncertainty. OCR only transcribes a label; you confirmed the blend. The dataset is versioned as <code>{result.factorDatasetVersion}</code>.</p>{result.factorSources?.length ? <p>Factor provenance: {result.factorSources.map((source, index) => <span key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.note} </span>)}</p> : <p>Earlier factor dataset. Refer to its recorded version when comparing estimates.</p>}<p>{result.scenarioPotentialAvoidedKgCo2e > 0 ? 'You selected a scenario where wearing these items again replaces a planned purchase. The demo shows a hypothetical comparison using half the category benchmark.' : 'You did not select a replacement for a planned purchase, so the avoided-production comparison is zero.'}</p><p><strong>Points:</strong> {rewardExplanation} Material and weight entries never increase rewards.</p><p>A photograph cannot prove a garment’s exact footprint or an avoided purchase. These points are not carbon credits.</p><Link to="/#how-it-works">See all assumptions</Link></section>
    <div className="actions"><Link className="button" to="/rewards">View rewards and current balance</Link><Link className="button secondary" to="/scan" onClick={() => scan.reset()}>Scan another photo</Link></div>
    <p className="muted">Your latest confirmed estimate is saved with your session. It is tied to this browser and expires after inactivity; there is no account or cross-device recovery.</p>
  </>
}
