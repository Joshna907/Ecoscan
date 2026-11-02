import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clothingCategorySchema, type ClothingCategory } from 'shared'
import type { ScanFlow } from '../hooks/useScan'
import { CameraCapture } from '../components/CameraCapture'
import { labels } from '../lib/labels'
import { MaterialProfileEditor } from '../components/MaterialProfileEditor'
import { ScanIcon } from '../components/ScanIcon'
import './ScanPage.css'

const garmentIcons = { tshirt: 'shirt', jeans: 'jeans', jacket: 'jacket', shoes: 'shoe' } as const

export function ScanPage({ scan }: { scan: ScanFlow }) {
  const navigate = useNavigate()
  const [readingItems, setReadingItems] = useState<Record<string, boolean>>({})
  const readingLabel = scan.items.some(item => readingItems[item.key])
  const [camera, setCamera] = useState(false)
  const [preview, setPreview] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState('')
  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!scan.file) { setPreview(''); return }
    const url = URL.createObjectURL(scan.file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [scan.file])
  /* oxlint-enable react/set-state-in-effect */
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (['upload', 'uploading', 'review'].includes(scan.phase)) window.scrollTo(0, 0) }, [scan.phase])
  const reviewing = scan.phase === 'review' || scan.phase === 'confirming'
  const working = ['uploading', 'queued', 'processing'].includes(scan.phase)
  const locked = scan.phase === 'confirming' || !!scan.confirmation
  const totalItems = scan.items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0)
  const valid = !readingLabel && scan.items.length > 0
    && scan.items.every(item => item.category !== '' && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10)
    && totalItems <= 10 && scan.replaces !== null
  const step = scan.phase === 'complete' ? 2 : reviewing ? 1 : 0
  function quantity(key: string, value: number) { scan.setItems(items => items.map(item => item.key === key ? { ...item, quantity: value } : item)) }
  return <div className="scan-page">
    <div className="scan-heading"><div><p className="eyebrow">YOUR WARDROBE, A LITTLE CLEARER</p><h1>{reviewing ? 'A closer look at your clothes.' : 'Every piece has a story.'}</h1><p>{reviewing ? 'Check the details. We’ll take care of the estimate.' : 'Start with a photo. Discover the estimated impact of what you wear.'}</p></div><span className="scan-heading-mark"><ScanIcon name="leaf"/></span></div>
    <ol className="scan-steps" aria-label="Scan progress">{['Add photo', 'Review items', 'See estimate'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span>{step > index ? <ScanIcon name="check"/> : `0${index + 1}`}</span><span>{label}</span></li>)}</ol>
    {(scan.error || dropError) && <div className="error" role="alert">{scan.error || dropError}</div>}

    {scan.phase === 'upload' && <div className="scan-upload-layout">
      <section className="scan-card scan-upload-card"><div className="scan-card-heading"><span className="scan-section-index">01 / YOUR PHOTO</span><h2>Let’s see what you’ve got.</h2><p>A single garment or a whole outfit. A clear photo is all you need to begin.</p></div>
        <label className={`scan-dropzone${dragging ? ' is-dragging' : ''}${preview ? ' has-photo' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) { setDropError('Choose one photo at a time.'); return } setDropError(''); scan.selectFile(event.dataTransfer.files[0]) }}>
          <input className="scan-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose an image" aria-describedby="photo-help" onChange={event => { setDropError(''); scan.selectFile(event.target.files?.[0] ?? null); event.target.value = '' }}/>
          {preview ? <><img className="scan-upload-image" src={preview} alt="Clothing photo selected for scanning"/><span className="scan-photo-change"><ScanIcon name="image"/> Choose a different photo</span></> : <><span className="scan-upload-symbol"><ScanIcon name="upload"/></span><strong>Drop your photo here</strong><span className="scan-drop-subtitle">or choose one from your device</span><span className="scan-choose-photo">Choose a photo <ScanIcon name="plus"/></span></>}
        </label>
        <div className="scan-file-meta"><p id="photo-help">JPEG, PNG, or WebP · up to 4 MB</p>{scan.file && <span title={scan.file.name}>{scan.file.name}</span>}</div>
        <div className="scan-upload-actions"><button disabled={!scan.file || camera} onClick={() => void scan.upload()}>Scan photo <ScanIcon name="arrow"/></button><button className="secondary" onClick={() => setCamera(true)}><ScanIcon name="camera"/> <span className="sr-only">use your camera</span><span aria-hidden="true">Use camera</span></button></div>
        {camera && <CameraCapture onCapture={file => { scan.selectFile(file); setCamera(false) }} onClose={() => setCamera(false)}/>}
        <p className="scan-privacy">With AI enabled, your photo is sent to OpenAI. Keep people and personal details out of the frame. <Link to="/#privacy">Photo and privacy details</Link></p>
      </section>
      <aside className="scan-tips"><p className="scan-section-index">A LITTLE PREPARATION</p><h2>A good photo.<br/> A better start.</h2><div className="scan-tip"><span>01</span><div><h3>Give it some space</h3><p>Lay your clothes flat or hang them against a simple background.</p></div></div><div className="scan-tip"><span>02</span><div><h3>Let the light in</h3><p>Use even lighting and keep the whole garment in the frame.</p></div></div><div className="scan-tip"><span>03</span><div><h3>You’re in control</h3><p>You can check and correct every item before calculating.</p></div></div><div className="scan-supported"><p>Currently scanning</p><div>{clothingCategorySchema.options.map(category => <span key={category}><ScanIcon name={garmentIcons[category]}/>{labels[category]}</span>)}</div></div></aside>
    </div>}

    {working && <section className="scan-card scan-working" role="status" aria-live="polite"><span className="scan-upload-symbol scan-pulse"><ScanIcon name="shirt"/></span><h2>{scan.phase === 'uploading' ? 'Uploading your photo…' : scan.phase === 'queued' ? 'Your photo is waiting to be scanned…' : 'Identifying your clothing…'}</h2><p>You’ll check the suggested items before we calculate anything.</p>{scan.phase !== 'uploading' && <p className="muted">You can visit another page and return here to check progress.</p>}</section>}
    {scan.phase === 'complete' && <section className="scan-card scan-working"><span className="scan-upload-symbol"><ScanIcon name="check"/></span><h2>Your last scan is complete</h2><div className="actions"><button onClick={() => scan.reset()}>Start a new scan</button><Link to="/results">View your latest result</Link></div></section>}
    {scan.phase === 'paused' && <section className="scan-card"><h2>Check scan progress</h2><p>Your scan may still be running. Checking again does not submit another photo.</p><div className="actions"><button onClick={scan.resume}>Check again</button><button className="secondary" onClick={() => scan.reset()}>Start a different scan</button></div></section>}
    {scan.phase === 'failed' && <div className="actions"><button onClick={() => scan.reset()}>Start a new scan</button><Link to="/rewards">Check your rewards</Link></div>}

    {reviewing && <form className="scan-review-layout" onSubmit={event => { event.preventDefault(); if (valid) void scan.confirm().then(success => { if (success && mounted.current) navigate('/results') }) }}>
      <aside className="scan-photo-column"><div className="scan-card scan-photo-card"><div className="scan-photo-caption"><span className="scan-section-index">YOUR PHOTO</span><span className="scan-detected">{scan.items.length} {scan.items.length === 1 ? 'item' : 'items'} listed</span></div>{preview ? <img className="scan-review-image" src={preview} alt="Your uploaded clothing for reference"/> : <div className="scan-photo-empty"><ScanIcon name="image"/><p>Your item details were restored.</p><small>Photos aren’t saved after a refresh.</small></div>}<button type="button" className="secondary scan-change-photo" disabled={scan.phase === 'confirming'} onClick={() => scan.reset()}><ScanIcon name="image"/> Use another photo</button></div><details className="scan-reward-note"><summary>About demo points <span>+</span></summary><p>Only an unchanged live-AI item list can earn points when reuse replaces a planned purchase. Similar photos earn once for 90 days, with a daily cap of 250 points per browser session (UTC). Corrected or manual items still get an estimate. Points are fictional.</p></details></aside>
      <div className="scan-review-content"><section className="scan-card scan-items-card"><div className="scan-card-heading"><span className="scan-section-index">02 / THE DETAILS</span><h2>Check the clothing items</h2><p>Does everything look right? Adjust the type or quantity below.</p></div>
        {scan.analysis?.recognitionMode === 'mock' ? <p className="scan-inline-notice"><strong>Demo recognition:</strong> this mode always suggests a T-shirt. It did not identify your photo; mock results cannot earn points.</p> : <p className="scan-ai-note"><ScanIcon name="check"/> Suggested by AI · checked by you</p>}
        {scan.confirmation && scan.phase !== 'confirming' && <p className="note">The previous confirmation may have completed. Your items are held unchanged so you can safely retry.</p>}
        {!scan.items.length && <p>No supported clothing was identified. Try another photo, or add a category manually for an estimate only.</p>}
        <fieldset disabled={locked}><legend className="sr-only">Clothing items</legend>
          {scan.items.map((item, index) => <div className="scan-item" key={item.key}><div className="scan-item-heading"><span className="scan-garment-icon"><ScanIcon name={item.category ? garmentIcons[item.category] : 'shirt'}/></span><div><span className="scan-section-index">ITEM {String(index + 1).padStart(2, '0')}</span><h3>{item.category ? labels[item.category] : 'Choose an item type'}</h3></div><button type="button" className="scan-icon-button" aria-label={'Remove item ' + (index + 1)} title="Remove item" onClick={() => scan.setItems(items => items.filter(row => row.key !== item.key))}><ScanIcon name="close"/></button></div>
            <div className="scan-item-fields"><label>Clothing type<select aria-label={'Category for item ' + (index + 1)} value={item.category} onChange={event => scan.setItems(items => items.map(row => row.key === item.key ? { ...row, category: event.target.value as ClothingCategory } : row))}><option value="" disabled>Select a category…</option>{clothingCategorySchema.options.map(category => <option key={category} value={category}>{labels[category]}</option>)}</select></label><div className="scan-quantity-field"><label htmlFor={`quantity-${item.key}`}>Quantity</label><div className="scan-quantity"><button type="button" aria-label={`Decrease quantity for item ${index + 1}`} disabled={item.quantity <= 1} onClick={() => quantity(item.key, Math.max(1, item.quantity - 1))}><ScanIcon name="minus"/></button><input id={`quantity-${item.key}`} type="number" min="1" max="10" required aria-label={'Quantity for item ' + (index + 1)} value={item.quantity || ''} onChange={event => quantity(item.key, Number(event.target.value))}/><button type="button" aria-label={`Increase quantity for item ${index + 1}`} disabled={item.quantity >= 10 || totalItems >= 10} onClick={() => quantity(item.key, Math.min(10, item.quantity + 1))}><ScanIcon name="plus"/></button></div></div></div>
            <MaterialProfileEditor draftKey={item.key} onReadingChange={reading => setReadingItems(items => ({ ...items, [item.key]: reading }))} category={item.category} itemNumber={index + 1} profile={item.materialProfile} disabled={locked} onConfirm={materialProfile => scan.setItems(items => items.map(row => row.key === item.key ? { ...row, materialProfile } : row))} onInvalidate={() => scan.setItems(items => items.map(row => row.key === item.key ? { ...row, materialProfile: undefined } : row))}/>
          </div>)}
          <button type="button" className="scan-add-item" disabled={scan.items.length >= 10 || totalItems >= 10} onClick={() => scan.setItems(items => [...items, { key: crypto.randomUUID(), category: '', quantity: 1 }])}><ScanIcon name="plus"/> Add an item</button>{totalItems > 10 && <p className="error" role="alert">A scan can contain at most 10 items.</p>}
        </fieldset>
      </section>
      <fieldset className="scan-card scan-scenario" disabled={locked}><legend className="sr-only">Would wearing these items again replace a new purchase you were already planning?</legend><div className="scan-scenario-heading"><span className="scan-garment-icon"><ScanIcon name="leaf"/></span><div><h2>One more wear?</h2><p>Would reusing these replace something you planned to buy?</p></div></div><div className="scan-choice-grid"><label className="scan-choice" data-selected={scan.replaces === true}><input type="radio" name="replacement" aria-label="Yes, it would replace a planned purchase" checked={scan.replaces === true} onChange={() => scan.setReplaces(true)} required/><span><strong>Yes, I had a purchase planned</strong><small>Include a reuse comparison</small></span></label><label className="scan-choice" data-selected={scan.replaces === false}><input type="radio" name="replacement" aria-label="No, or I’m not sure" checked={scan.replaces === false} onChange={() => scan.setReplaces(false)} required/><span><strong>No, or I’m not sure</strong><small>Just show the production estimate</small></span></label></div><p className="scan-scenario-help">Both choices include your estimate. The reuse comparison is hypothetical, not a verified carbon saving.</p></fieldset>
      <div className="scan-submit-bar"><div><strong>{totalItems} {totalItems === 1 ? 'item' : 'items'} to estimate</strong><span>{readingLabel ? 'Finish reading the label to continue.' : scan.replaces === null ? 'Choose a reuse option to continue.' : 'Your estimate will include a low–high range.'}</span></div><button type="submit" disabled={!valid || scan.phase === 'confirming'}>{scan.phase === 'confirming' ? 'Calculating…' : scan.confirmation ? 'Retry confirmation' : 'Confirm and see estimate'}<ScanIcon name="arrow"/></button></div>
      </div>
    </form>}
  </div>
}
