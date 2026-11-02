import { useEffect, useRef, useState } from 'react'
import {
  MAX_UPLOAD_BYTES,
  type GarmentComponent,
  GARMENT_WEIGHT_GRAMS,
  type ClothingCategory,
  materialProfileSchema,
  materialTypeSchema,
  type MaterialComponent,
  type MaterialProfile,
  type MaterialType,
} from 'shared'
import { api, messageOf } from '../lib/api'

const names: Record<MaterialType, string> = {
  cotton: 'Cotton', polyester: 'Polyester', nylon: 'Nylon', wool: 'Wool', linen: 'Linen',
  viscose: 'Viscose / rayon', acrylic: 'Acrylic', elastane: 'Elastane / spandex', leather: 'Leather', other: 'Other',
}

interface Props {
  itemNumber: number
  category: ClothingCategory | ''
  profile?: MaterialProfile
  disabled: boolean
  onConfirm(profile: MaterialProfile): void
  onInvalidate(): void
  draftKey?: string
  onReadingChange?(reading: boolean): void
}

export function MaterialProfileEditor({ itemNumber, category, profile, disabled, onConfirm, onInvalidate, draftKey, onReadingChange }: Props) {
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [saved] = useState(() => { try { return draftKey ? JSON.parse(sessionStorage.getItem('ecoscan.material.' + draftKey) ?? 'null') : null } catch { return null } })
  const [components, setComponents] = useState<GarmentComponent[]>(saved?.components ?? profile?.components ?? [])
  const [componentMode, setComponentMode] = useState(saved?.componentMode ?? !!profile?.components)
  const [preview, setPreview] = useState('')
  const [zoom, setZoom] = useState(false)
  const [composition, setComposition] = useState<MaterialComponent[]>(saved?.composition ?? profile?.composition ?? [])
  const [wholeItem, setWholeItem] = useState(saved?.wholeItem ?? !!profile)
  const [weight, setWeight] = useState(saved?.weight ?? profile?.weightGrams?.toString() ?? '')
  const [source, setSource] = useState<'care_label_ocr' | 'manual'>(saved?.source ?? profile?.source ?? 'manual')
  const [labelPhoto, setLabelPhoto] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!draftKey) return
    try { sessionStorage.setItem('ecoscan.material.' + draftKey, JSON.stringify({ composition, wholeItem, weight, source, components, componentMode })) } catch { /* Draft storage is optional. */ }
  }, [draftKey, composition, wholeItem, weight, source, components, componentMode])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  function setComponent(index: number, value: GarmentComponent) { setComponents(rows => rows.map((row, i) => i === index ? value : row)); onInvalidate() }
  const update = (next: MaterialComponent[]) => { setComposition(next); setSource('manual'); onInvalidate(); setMessage('Review and confirm these details.') }
  const defaultWeight = category ? GARMENT_WEIGHT_GRAMS[category] : null
  const total = composition.reduce((sum, part) => sum + (Number(part.percentage) || 0), 0)
  const candidate = materialProfileSchema.safeParse({
    composition: componentMode ? [] : composition,
    ...(componentMode ? { components } : {}),
    source: componentMode ? 'manual' : source,
    userConfirmed: true,
    ...(weight ? { weightGrams: Number(weight) } : {}),
  })

  async function readLabel() {
    if (!labelPhoto || reading) return
    setReading(true); onReadingChange?.(true); onInvalidate(); setMessage('')
    try {
      const result = await api.recognizeMaterialLabel(labelPhoto)
      if (!mounted.current) return
      if (!result.materials.length) {
        setMessage(result.recognitionMode === 'mock'
          ? 'Care-label OCR is unavailable in demo mode. Enter the printed blend manually.'
          : 'No complete, legible blend totaling 100% was found. Enter the label values manually.')
        return
      }
      setComposition(result.materials); setSource('care_label_ocr'); onInvalidate()
      setMessage('Label values extracted. Check them against the photo, then confirm.')
    } catch (error) { if (mounted.current) setMessage(messageOf(error)) }
    finally { if (mounted.current) { setReading(false); onReadingChange?.(false) } }
  }

  return <details className="material-editor">
    <summary>Material and weight {profile ? <span className="badge">confirmed</span> : <span className="muted">optional, improves the estimate</span>}</summary>
    <div className="material-editor-body">
      <h3>Read the care label</h3>
      <p className="muted">Use a close, well-lit photo of the fibre-composition text. EcoScan reads the printed label; it does not guess material from the garment photo.</p>
      <input disabled={disabled || reading} aria-label={`Care-label photo for item ${itemNumber}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          if (file && (file.size > MAX_UPLOAD_BYTES || !['image/jpeg','image/png','image/webp'].includes(file.type))) { setMessage('Choose a JPEG, PNG or WebP label up to 4 MiB.'); return }
          onInvalidate(); setLabelPhoto(file); setPreview(file ? URL.createObjectURL(file) : ''); setZoom(false); setMessage('')
        }} />
      {preview && <div className={zoom ? 'label-preview zoomed' : 'label-preview'}><img src={preview} alt="Selected care label for checking the extracted blend" /><button type="button" className="secondary" onClick={() => setZoom(value => !value)}>{zoom ? 'Fit label' : 'Zoom label'}</button></div>}
      <button type="button" className="secondary" disabled={disabled || componentMode || !labelPhoto || reading} onClick={() => void readLabel()}>{reading ? 'Reading label…' : 'Read label'}</button>
      <p className="muted">With AI enabled, this photo is sent to OpenAI for reading and is not saved with your result. Do not include people or personal information.</p>

      <h3>Confirm the printed blend</h3>
      <label><input type="checkbox" disabled={disabled || reading} checked={componentMode} onChange={event => { setComponentMode(event.target.checked); onInvalidate() }} /> Enter measured garment components</label>
      {componentMode && <div><p>Weigh the whole item and each provided shell, lining, padding, upper or sole separately. Missing or unsupported components are excluded and coverage is shown on Results. OCR above is for whole-item blends; enter component labels manually.</p>
        {components.map((component, index) => <fieldset key={index} disabled={disabled || reading}><legend>Component {index + 1}</legend>
          <label>Component type<select value={component.kind} onChange={event => setComponent(index, { ...component, kind: event.target.value as GarmentComponent['kind'] })}>{['shell','lining','padding','upper','sole'].map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>Component mass in grams<input type="number" min="0.1" step="any" value={component.weightGrams || ''} onChange={event => setComponent(index, { ...component, weightGrams: Number(event.target.value) })} /></label>
          {component.composition.map((part, row) => <div className="material-row" key={row}><label>Component fibre<select value={part.material} onChange={event => setComponent(index, { ...component, composition: component.composition.map((p, i) => i === row ? { ...p, material: event.target.value as MaterialType } : p) })}>{materialTypeSchema.options.map(material => <option key={material} value={material}>{names[material]}</option>)}</select></label><label>Component percent<input type="number" min="0.01" max="100" step="any" value={part.percentage || ''} onChange={event => setComponent(index, { ...component, composition: component.composition.map((p, i) => i === row ? { ...p, percentage: Number(event.target.value) } : p) })} /></label><button type="button" className="secondary" onClick={() => setComponent(index, { ...component, composition: component.composition.filter((_, i) => i !== row) })}>Remove component fibre</button></div>)}
          <button type="button" className="secondary" disabled={component.composition.length >= 6} onClick={() => setComponent(index, { ...component, composition: [...component.composition, { material: 'polyester', percentage: 0 }] })}>Add component fibre</button>
          <button type="button" className="secondary" onClick={() => { setComponents(rows => rows.filter((_, i) => i !== index)); onInvalidate() }}>Remove component</button>
        </fieldset>)}
        <button type="button" className="secondary" disabled={disabled || reading || components.length >= 5} onClick={() => { setComponents(rows => [...rows, { kind: 'shell', weightGrams: 0, composition: [] }]); onInvalidate() }}>Add component</button>
      </div>}
      <p>Enter the blend from the label. For lined, padded or mixed-component items, do not apply a shell or upper label to the entire item weight. Leave details unconfirmed if component weights are unknown.</p>
      <label><input type="checkbox" disabled={disabled || reading} checked={wholeItem} onChange={(event) => { setWholeItem(event.target.checked); onInvalidate() }} /> {componentMode ? 'I confirm these measured component masses and their label blends.' : 'This blend represents the whole weighed item, not only its shell or lining.'}</label>
      <p className="muted">Blends or components without a verified factor are excluded from the material estimate. The category benchmark remains available; Results shows the supported mass.</p>
      {!componentMode && composition.map((part, index) => <div className="material-row" key={`${index}-${part.material}`}>
        <label>Material<select disabled={disabled || reading} value={part.material} onChange={(event) => update(composition.map((value, row) => row === index ? { ...value, material: event.target.value as MaterialType } : value))}>
          {materialTypeSchema.options.map((material) => <option key={material} value={material}>{names[material]}</option>)}
        </select></label>
        <label>Percent<input disabled={disabled || reading} type="number" min="0.01" step="any" max="100" value={part.percentage || ''} onChange={(event) => update(composition.map((value, row) => row === index ? { ...value, percentage: Number(event.target.value) } : value))} /></label>
        {composition.length > 1 && <button disabled={disabled || reading} type="button" className="secondary" onClick={() => update(composition.filter((_, row) => row !== index))}>Remove</button>}
      </div>)}
      <div className="actions"><button disabled={disabled || reading || componentMode || composition.length >= 6} type="button" className="secondary" onClick={() => update([...composition, { material: 'polyester', percentage: Math.max(1, 100 - total) }])}>Add material</button><span className={total === 100 ? 'muted' : 'error-inline'}>Total: {total}%</span></div>
      <label className="weight-field">Weight of one item in grams <span className="muted">(optional)</span><input disabled={disabled || reading} type="number" min="20" max="5000" required={componentMode} value={weight} placeholder="Use a category weight range" onChange={(event) => { setWeight(event.target.value); onInvalidate(); setMessage('Review and confirm these details.') }} /></label>
      <p className="muted">Weigh one dry item (a pair for shoes); quantity multiplies this weight. If you do not know the weight, EcoScan uses category screening bounds. {defaultWeight && <>Low {defaultWeight.low} g · central {defaultWeight.central} g · high {defaultWeight.high} g per item. These are assumptions, not population statistics; measure unusual garments.</>}</p>
      {message && <p role="status" className="note compact-note">{message}</p>}
      <div className="actions"><button type="button" disabled={disabled || reading || !wholeItem || !candidate.success} onClick={() => { if (candidate.success) { onConfirm(candidate.data); setMessage('Material details confirmed.') } }}>Confirm material details</button>{profile && <button type="button" className="secondary" disabled={disabled || reading} onClick={() => { onInvalidate(); setMessage('Material details removed from this estimate.') }}>Remove material details</button>}</div>
      {!candidate.success && <p className="error-inline">Use unique fibres totaling 100% per blend. Components need a whole-item weight and masses no greater than that weight. Weight must be 20–5,000 g.</p>}
    </div>
  </details>
}
