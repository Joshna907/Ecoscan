import { Link } from 'react-router-dom'
import type { ConfirmScanResponse } from 'shared'
import { ScanIcon } from './ScanIcon'

export function EstimateMethodology({ result, rewardExplanation }: { result: ConfirmScanResponse; rewardExplanation: string }) {
  return <section className="results-methodology" aria-labelledby="methodology-title">
    <div className="results-method-introduction">
      <span className="results-method-emblem"><ScanIcon name="leaf"/></span>
      <p className="results-kicker">A LITTLE CONTEXT</p>
      <h2 id="methodology-title">Behind your<br/> estimate.</h2>
      <p>Useful insight starts with knowing what the numbers can tell you.</p>
      <div className="results-method-takeaway"><ScanIcon name="ruler"/><p>These are screening ranges. Neither estimate measures your garment’s complete lifecycle.</p></div>
      <Link className="results-assumptions" to="/#how-it-works">Explore all assumptions <ScanIcon name="arrow"/></Link>
    </div>
    <div className="results-method-cards">
      <details className="results-disclosure">
        <summary><span className="results-method-icon"><ScanIcon name="ruler"/></span><span className="results-method-label">Boundary and uncertainty<small>What the estimate covers, and where it stops.</small></span><span className="results-method-expand"><ScanIcon name="plus"/></span></summary>
        <div className="results-disclosure-body">
          <div className="results-boundary-grid">
            <div><span className="results-detail-tag">CATEGORY BENCHMARK</span><h3>Whole-garment production</h3><p>An illustrative benchmark with a broad range. It is not a product lifecycle assessment.</p></div>
            <div><span className="results-detail-tag">MATERIAL ESTIMATE</span><h3>Fibre production only</h3><p>Raw-material inputs to the fibre factory gate (cradle-to-gate). This overlaps with the category benchmark; do not add them together.</p></div>
          </div>
          <h3>What sits outside the material estimate?</h3>
          <p>Fabric construction, dyeing, cut-and-sew, trims, packaging, transport, washing, durability, reuse and end of life. A complete lifecycle result needs those stages and primary supplier data.</p>
          <h3>Why show a range?</h3>
          <p>Low/high values are sensitivity scenarios, not confidence intervals: bundled fibre factors use 50–150% of the sourced central value (imported snapshots use their recorded ranges). The illustrative category benchmark uses 60–160%. Unknown weights use category screening bounds. These ranges do not capture all uncertainty.</p>
          <p>OCR transcribes the label; you confirm the blend. Missing materials remain unknown, not zero.</p>
          <p className="results-dataset">Dataset <code>{result.factorDatasetVersion}</code></p>
        </div>
      </details>
      <details className="results-disclosure">
        <summary><span className="results-method-icon"><ScanIcon name="leaf"/></span><span className="results-method-label">Sources and methodology<small>See the evidence behind the calculation.</small></span><span className="results-method-expand"><ScanIcon name="plus"/></span></summary>
        <div className="results-disclosure-body">
          <p className="results-dataset">Dataset <code>{result.factorDatasetVersion}</code></p>
          {result.factorSources?.length ? <ul className="results-source-list">{result.factorSources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<span className="sr-only"> (opens in a new tab)</span></a><p>{source.note}</p></li>)}</ul> : <p>Earlier factor dataset. Refer to its recorded version when comparing estimates.</p>}
        </div>
      </details>
      <details className="results-disclosure">
        <summary><span className="results-method-icon"><ScanIcon name="check"/></span><span className="results-method-label">Your comparison and demo points<small>A hypothetical scenario, with clear limits.</small></span><span className="results-method-expand"><ScanIcon name="plus"/></span></summary>
        <div className="results-disclosure-body">
          <h3>Your comparison</h3>
          <p>{result.scenarioPotentialAvoidedKgCo2e > 0 ? 'You selected a scenario where wearing these items again replaces a planned purchase. The demo shows a hypothetical comparison using half the category benchmark.' : 'You did not select a replacement for a planned purchase, so the avoided-production comparison is zero.'}</p>
          <h3>Why this scan received {result.demoPointsAwarded} points</h3>
          <p>{rewardExplanation} Material and weight entries never increase rewards.</p>
          <p className="results-reward-limit">A photograph cannot prove a garment’s exact footprint or an avoided purchase. Demo points are not carbon credits.</p>
        </div>
      </details>
    </div>
  </section>
}
