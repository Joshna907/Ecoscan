import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clothingCategorySchema, type ClothingCategory } from 'shared'
import type { ScanFlow } from '../hooks/useScan'
import { CameraCapture } from '../components/CameraCapture'
import { labels } from '../lib/labels'

export function ScanPage({ scan }: { scan: ScanFlow }) {
  const navigate = useNavigate()
  const [camera, setCamera] = useState(false)
  const [preview, setPreview] = useState('')
  // Object URLs are browser resources: create and revoke them with the selected file.
  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!scan.file) { setPreview(''); return }
    const url = URL.createObjectURL(scan.file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [scan.file])
  /* oxlint-enable react/set-state-in-effect */
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const reviewing = scan.phase === 'review' || scan.phase === 'confirming'
  const working = ['uploading', 'queued', 'processing'].includes(scan.phase)
  const locked = scan.phase === 'confirming' || !!scan.confirmation
  const totalItems = scan.items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0)
  const valid = scan.items.length > 0
    && scan.items.every((item) => item.category !== '' && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10)
    && totalItems <= 10
    && scan.replaces !== null
  return <>
    <p className="eyebrow">Clothing scanner</p><h1>Scan your clothes</h1>
    <ol className="steps" aria-label="Scan progress">
      <li aria-current={!reviewing && scan.phase !== 'complete' ? 'step' : undefined}>1. Add photo</li>
      <li aria-current={reviewing ? 'step' : undefined}>2. Review items</li><li>3. See estimate</li>
    </ol>
    {scan.error && <div className="error" role="alert">{scan.error}</div>}
    {scan.phase === 'upload' && <section className="panel">
      <h2>Add a clear clothing photo</h2><p>Lay clothes out in good light. We currently support T-shirts, jeans, jackets, and shoes.</p>
      <label className="file-label" htmlFor="clothing-photo">Choose an image</label>
      <input id="clothing-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help"
        onChange={(event) => scan.selectFile(event.target.files?.[0] ?? null)} />
      <p id="photo-help" className="muted">JPEG, PNG, or WebP · up to 5 MB</p>
      <p>Or <button className="text-button" onClick={() => setCamera(true)}>use your camera</button>.</p>
      {camera && <CameraCapture onCapture={(file) => { scan.selectFile(file); setCamera(false) }} onClose={() => setCamera(false)} />}
      {scan.file && preview && <div className="photo-preview"><img src={preview} alt="Clothing photo selected for scanning" /><p>{scan.file.name}</p></div>}
      <div className="actions"><button disabled={!scan.file || camera} onClick={() => void scan.upload()}>Scan photo</button></div>
      <p className="muted">With AI recognition enabled, your photo is sent to OpenAI. Do not upload people, documents, or sensitive information. <Link to="/#privacy">Photo and privacy details</Link></p>
    </section>}
    {working && <section className="panel" role="status" aria-live="polite">
      <h2>{scan.phase === 'uploading' ? 'Uploading your photo…' : scan.phase === 'queued' ? 'Your photo is waiting to be scanned…' : 'Identifying your clothing…'}</h2>
      <p>You will review the suggestions before any points are awarded.</p>
      {scan.phase !== 'uploading' && <p>You can visit another page here and return to Scan clothes to check the result.</p>}
    </section>}
    {scan.phase === 'complete' && <section className="panel"><h2>Your last scan is complete</h2><div className="actions"><button onClick={() => scan.reset()}>Start a new scan</button><Link to="/results">View your latest result</Link></div></section>}
    {scan.phase === 'paused' && <section className="panel"><h2>Check scan progress</h2><p>Your scan may still be running. Checking again does not submit another photo.</p><div className="actions"><button onClick={scan.resume}>Check again</button><button className="secondary" onClick={() => scan.reset()}>Start a different scan</button></div></section>}
    {scan.phase === 'failed' && <div className="actions"><button onClick={() => scan.reset()}>Start a new scan</button><Link to="/rewards">Check your rewards</Link></div>}
    {reviewing && <form onSubmit={(event) => { event.preventDefault(); if (valid) void scan.confirm().then((success) => { if (success && mounted.current) navigate('/results') }) }}>
      <section className="panel">
        <h2>Check the clothing items</h2>
        {scan.analysis?.recognitionMode === 'mock' ? <p className="note"><strong>Demo recognition:</strong> this mode always suggests a T-shirt. It did not identify the contents of your photo. Correct it for an estimate; mock results cannot earn points.</p> : <p>AI suggestions may be wrong. Correct the list before continuing; corrections remain estimate-only.</p>}
        {scan.confirmation && scan.phase !== 'confirming' && <p className="note">The previous confirmation may have completed. Your items are held unchanged so you can safely retry the same confirmation.</p>}
        {preview && <img className="review-photo" src={preview} alt="Your uploaded clothing for reference" />}
        {!scan.items.length && <p>No supported clothing was identified. Try another photo, or add a category manually for an estimate only.</p>}
        <p className="note"><strong>Reward check:</strong> points are available only when the confirmed list exactly matches the AI suggestions and this image has not earned points in this session or account. Manual or corrected items still receive an illustrative estimate, but no points.</p>
        <fieldset disabled={locked}><legend className="sr-only">Clothing items</legend>
          {scan.items.map((item, index) => <div className="item-row" key={item.key}>
            <label>Item {index + 1}<select aria-label={'Category for item ' + (index + 1)} value={item.category} onChange={(event) => scan.setItems((items) => items.map((row) => row.key === item.key ? { ...row, category: event.target.value as ClothingCategory } : row))}>
              <option value="" disabled>Select a category…</option>
              {clothingCategorySchema.options.map((category) => <option key={category} value={category}>{labels[category]}</option>)}
            </select></label>
            <label>Quantity<input type="number" min="1" max="10" required aria-label={'Quantity for item ' + (index + 1)} value={item.quantity || ''} onChange={(event) => scan.setItems((items) => items.map((row) => row.key === item.key ? { ...row, quantity: Number(event.target.value) } : row))} /></label>
            <button type="button" className="secondary" aria-label={'Remove item ' + (index + 1)} onClick={() => scan.setItems((items) => items.filter((row) => row.key !== item.key))}>Remove</button>
          </div>)}
          <button type="button" className="secondary" disabled={scan.items.length >= 10 || totalItems >= 10} onClick={() => scan.setItems((items) => [...items, { key: crypto.randomUUID(), category: '', quantity: 1 }])}>Add an item</button>
          {totalItems > 10 && <p className="error" role="alert">A scan can contain at most 10 items.</p>}
        </fieldset>
      </section>
      <fieldset className="panel" disabled={locked}>
        <legend>Would wearing these items again replace a new purchase you were already planning?</legend>
        <p>This choice creates an example comparison. It does not verify real emissions savings.</p>
        <label className="radio"><input type="radio" name="replacement" checked={scan.replaces === true} onChange={() => scan.setReplaces(true)} required /> Yes, it would replace a planned purchase</label>
        <label className="radio"><input type="radio" name="replacement" checked={scan.replaces === false} onChange={() => scan.setReplaces(false)} required /> No, or I’m not sure</label>
        <p className="muted">Both choices show an estimate. “Yes” can earn points only for an unchanged AI-recognized list; each image can earn once per session or account.</p>
      </fieldset>
      <div className="actions"><button type="submit" disabled={!valid || scan.phase === 'confirming'}>{scan.phase === 'confirming' ? 'Calculating…' : scan.confirmation ? 'Retry confirmation' : 'Confirm and see estimate'}</button><button type="button" className="secondary" disabled={scan.phase === 'confirming'} onClick={() => scan.reset()}>Use another photo</button></div>
    </form>}
  </>
}
