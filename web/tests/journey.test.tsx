import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { api, ApiError } from '../src/lib/api'
import { downloadDemoReceipt } from '../src/lib/demoReceipt'

vi.mock('../src/lib/api', () => ({
  api: { offers: vi.fn(), upload: vi.fn(), status: vi.fn(), confirm: vi.fn(), latestScan: vi.fn(), redeem: vi.fn(), refund: vi.fn(), useDemo: vi.fn(), activityEvidence: vi.fn(), requestActivityEvidence: vi.fn() },
  ApiError: class extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status } },
  messageOf: (error: Error) => error.message,
}))
vi.mock('../src/lib/demoReceipt', () => ({ downloadDemoReceipt: vi.fn() }))
const id = 'a1b2c3d4-1234-4123-8123-123456789abc'
const analysis = { analysisId: id, recognitionMode: 'mock' as const, needsReview: true as const, suggestions: [{ id: 'item-1', category: 'tshirt' as const }] }
const result = {
  items: [{ category: 'jeans' as const, quantity: 2, estimatedProductionKgCo2e: 20, estimatedProductionRangeKgCo2e: { low: 12, central: 20, high: 32 } }],
  totalEstimatedProductionRangeKgCo2e: { low: 12, central: 20, high: 32 }, scenarioPotentialAvoidedRangeKgCo2e: { low: 6, central: 10, high: 16 }, materialProfiledQuantity: 0, totalQuantity: 2, factorDatasetVersion: 'ecoscan-material-factors-v2' as const, lifecycleBoundary: { categoryBenchmark: 'illustrative whole-garment production benchmark' as const, materialStage: 'fibre production, cradle-to-gate' as const }, totalEstimatedProductionKgCo2e: 20, scenarioPotentialAvoidedKgCo2e: 10,
  demoPointsAwarded: 100, demoPointsBalance: 100, rewardStatus: 'awarded' as const, assumptionsVersion: 'demo-v2' as const,
}
let balance = 0
let redeemed = false
const receipt = { reference: 'DEMO-TEST1234567890', redeemedAt: '2026-10-29T10:00:00.000Z' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.latestScan).mockResolvedValue({ result: null })
  vi.mocked(api.activityEvidence).mockResolvedValue({ enabled: false, verifiedActivityCredits: 0, receipts: [], partners: [] })
  sessionStorage.clear()
  window.location.hash = '#/scan'
  balance = 0; redeemed = false
  vi.mocked(api.offers).mockImplementation(async () => ({
    demoPointsBalance: balance, offers: [{ id: 'repair-kit', title: 'Clothing repair kit', description: 'Sample reward.',
      pointsCost: 25, canRedeem: balance >= 25 && !redeemed, redeemed, receipt: redeemed ? receipt : null }],
  }))
  vi.mocked(api.upload).mockResolvedValue({ kind: 'ready', analysis })
  vi.mocked(api.confirm).mockImplementation(async () => { balance = 100; return result })
  vi.mocked(api.redeem).mockImplementation(async () => { balance -= 25; redeemed = true; return { offerId: 'repair-kit', demoPointsBalance: balance, receipt, message: 'Demo reward redeemed.' } })
})
async function uploadPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Choose an image'), new File(['photo'], 'shirt.png', { type: 'image/png' }))
  await user.click(screen.getByRole('button', { name: 'Scan photo' }))
}
describe('EcoScan user journeys', () => {
  it('accepts one dropped photo and keeps quantity steppers inside the item limit',async()=>{
    const user=userEvent.setup();render(<App/>)
    const dropzone=screen.getByText('Drop your photo here').closest('label')!
    const file=new File(['photo'],'shirt.png',{type:'image/png'})
    fireEvent.drop(dropzone,{dataTransfer:{files:[file,file]}})
    expect(screen.getByRole('alert').textContent).toContain('Choose one photo at a time')
    fireEvent.drop(dropzone,{dataTransfer:{files:[file]}})
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button',{name:'Scan photo',exact:true}))
    await screen.findByRole('heading',{name:'Check the clothing items'})
    await user.click(screen.getByRole('button',{name:'Increase quantity for item 1'}))
    expect((screen.getByLabelText('Quantity for item 1') as HTMLInputElement).value).toBe('2')
    await user.click(screen.getByRole('button',{name:'Decrease quantity for item 1'}))
    expect((screen.getByLabelText('Quantity for item 1') as HTMLInputElement).value).toBe('1')
    await user.clear(screen.getByLabelText('Quantity for item 1'));await user.type(screen.getByLabelText('Quantity for item 1'),'10')
    expect((screen.getByRole('button',{name:'Increase quantity for item 1'}) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button',{name:'Add an item'}) as HTMLButtonElement).disabled).toBe(true)
  })
  it('labels supported fibre contributions as incomplete and names missing elastane mass',async()=>{
    vi.mocked(api.latestScan).mockResolvedValue({result:{...result,assumptionsVersion:'materials-v2',materialProfiledQuantity:2,materialStageKgCo2e:{low:0.89,central:1.78,high:2.67},items:[{...result.items[0],materialProfile:{source:'manual',userConfirmed:true,weightGrams:200,composition:[{material:'cotton',percentage:98},{material:'elastane',percentage:2}]},materialStageKgCo2e:{low:0.89,central:1.78,high:2.67},effectiveWeightGrams:{low:200,central:200,high:200,source:'measured'},materialCoverageGrams:196,materialCoverage:{status:'partial',supportedMassGrams:196,uncoveredMassGrams:4,unallocatedMassGrams:0,missingFactors:[{material:'elastane',weightGrams:4}]}}]}})
    window.location.hash='#/results';render(<App/>)
    await screen.findByRole('heading',{name:'Known fibre contribution — incomplete'})
    expect(screen.getByText(/elastane\/spandex, 4 g per item/)).toBeTruthy()
    expect(screen.getByText(/high value is not an upper bound/)).toBeTruthy()
  })
  it('keeps the full guide on home with only Results and Rewards in navigation', () => {
    window.location.hash = '#/'
    const { container } = render(<App />)
    expect(within(screen.getByRole('navigation')).getAllByRole('link').map((link) => link.textContent)).toEqual(['Results', 'Rewards'])
    expect(screen.getByRole('heading', { name: 'How EcoScan works' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'A little space for your progress.' })).toBeNull()
    expect(container.querySelectorAll('.how-card')).toHaveLength(3)
    expect(screen.getByText('Scoring assumptions and photo details')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Read the assumptions' }).getAttribute('href')).toBe('#/#how-it-works')
    expect(container.textContent).not.toMatch(/[↗→]/)
  })
  it('reviews items, displays server estimates, and confirms a demo redemption', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await user.selectOptions(await screen.findByLabelText('Category for item 1'), 'jeans')
    await user.clear(screen.getByLabelText('Quantity for item 1'))
    await user.type(screen.getByLabelText('Quantity for item 1'), '2')
    await user.click(screen.getByLabelText('Yes, it would replace a planned purchase'))
    await user.click(screen.getByRole('button', { name: 'Confirm and see estimate' }))
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(api.confirm).toHaveBeenCalledWith({ analysisId: id, items: [{ category: 'jeans', quantity: 2 }], replacesPlannedNewPurchase: true })
    expect(screen.getByText('12–32 kg CO₂e (central 20)')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('20 kg CO₂e')).toBeTruthy()
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Rewards' }))
    await screen.findByText('100 demo points')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Redeem demo offer' }) as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Redeem demo offer' }))
    expect(api.redeem).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm redemption' }))
    await screen.findByText('75 demo points')
    expect(screen.getByText('Demo redemption saved')).toBeTruthy()
    expect(screen.getByText('DEMO-TEST1234567890')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Download sample PDF' }))
    await waitFor(() => expect(downloadDemoReceipt).toHaveBeenCalledWith(expect.objectContaining({ receipt })))
    expect(api.redeem).toHaveBeenCalledTimes(1)
  })
  it('loads the latest saved estimate after a page refresh', async () => {
    const user = userEvent.setup()
    vi.mocked(api.latestScan).mockResolvedValue({ result })
    window.location.hash = '#/results'
    render(<App />)
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(screen.getByText('12–32 kg CO₂e (central 20)')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('20 kg CO₂e')).toBeTruthy()
    expect(api.latestScan).toHaveBeenCalledTimes(1)
    const boundary = screen.getByText(/Low\/high values are sensitivity scenarios/).closest('details')!
    expect(boundary.open).toBe(false)
    await user.click(within(boundary).getByText(/Boundary and uncertainty/))
    expect(boundary.open).toBe(true)
    expect(boundary.textContent).toContain(result.factorDatasetVersion)
    const rewards = screen.getByText(/Material and weight entries never increase rewards/).closest('details')!
    await user.click(within(rewards).getByText(/Your comparison and demo points/))
    expect(rewards.open).toBe(true)
  })
  it('rejects unsupported files before calling the backend', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.upload(screen.getByLabelText('Choose an image'), new File(['text'], 'bad.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert').textContent).toContain('JPEG, PNG, or WebP')
    expect((screen.getByRole('button', { name: 'Scan photo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.upload).not.toHaveBeenCalled()
  })
  it('does not silently turn an unrecognized image into a T-shirt', async () => {
    vi.mocked(api.upload).mockResolvedValue({
      kind: 'ready',
      analysis: { analysisId: id, recognitionMode: 'vision', needsReview: true, suggestions: [] },
    })
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    expect(await screen.findByText(/No supported clothing was identified/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add an item' }))
    expect((screen.getByLabelText('Category for item 1') as HTMLSelectElement).value).toBe('')
    await user.click(screen.getByLabelText('Yes, it would replace a planned purchase'))
    expect((screen.getByRole('button', { name: 'Confirm and see estimate' }) as HTMLButtonElement).disabled).toBe(true)
    await user.selectOptions(screen.getByLabelText('Category for item 1'), 'jeans')
    expect((screen.getByRole('button', { name: 'Confirm and see estimate' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('shows a zero-points estimate when no planned purchase is replaced', async () => {
    vi.mocked(api.confirm).mockResolvedValue({ ...result, scenarioPotentialAvoidedKgCo2e: 0, demoPointsAwarded: 0, demoPointsBalance: 0 })
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await user.click(await screen.findByLabelText('No, or I’m not sure'))
    await user.click(screen.getByRole('button', { name: 'Confirm and see estimate' }))
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(screen.getByText((_, node) => node?.tagName === 'STRONG' && node.textContent === '0 points')).toBeTruthy()
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ replacesPlannedNewPurchase: false }))
  })
  it('holds an uncertain confirmation unchanged for a safe retry', async () => {
    vi.mocked(api.confirm).mockRejectedValueOnce(new ApiError('Connection interrupted.', 0))
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await user.click(await screen.findByLabelText('Yes, it would replace a planned purchase'))
    await user.click(screen.getByRole('button', { name: 'Confirm and see estimate' }))
    await screen.findByText('Connection interrupted.')
    expect((screen.getByLabelText('Category for item 1') as HTMLSelectElement).closest('fieldset')?.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Retry confirmation' }))
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(vi.mocked(api.confirm).mock.calls[0]).toEqual(vi.mocked(api.confirm).mock.calls[1])
  })
  it('continues polling while the user visits the home page', async () => {
    vi.mocked(api.upload).mockResolvedValue({ kind: 'queued', job: { analysisId: id, status: 'queued' } })
    vi.mocked(api.status).mockResolvedValueOnce({ analysisId: id, status: 'queued' }).mockResolvedValue({ ...analysis, status: 'ready' })
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await screen.findByRole('heading', { name: 'Your photo is waiting to be scanned…' })
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'EcoScan' }))
    await waitFor(() => expect(api.status).toHaveBeenCalledTimes(2), { timeout: 4000 })
    await user.click(screen.getAllByRole('link', { name: 'Continue your scan' })[0])
    await screen.findByRole('heading', { name: 'Check the clothing items' })
    expect(api.upload).toHaveBeenCalledTimes(1)
  })
  it('resumes a queued scan after reload without uploading again', async () => {
    sessionStorage.setItem('ecoscan.pending-analysis', id)
    vi.mocked(api.status).mockResolvedValue({ ...analysis, status: 'ready' })
    render(<App />)
    await screen.findByRole('heading', { name: 'Check the clothing items' })
    expect(api.upload).not.toHaveBeenCalled()
  })

  it('offers a fresh scan when a resumed analysis has expired', async () => {
    sessionStorage.setItem('ecoscan.pending-analysis', id)
    vi.mocked(api.status).mockRejectedValue(new ApiError('This analysis is unavailable. Upload an image again.', 404))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Start a new scan' }))
    expect(screen.getByLabelText('Choose an image')).toBeTruthy()
    expect(sessionStorage.getItem('ecoscan.pending-analysis')).toBeNull()
  })
  it('releases the camera when navigating away', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'use your camera' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'EcoScan' }))
    expect(stop).toHaveBeenCalledTimes(1)
  })
  it('keeps file upload available when camera permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) }, configurable: true })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'use your camera' }))
    await screen.findByText(/Camera access is unavailable/)
    await user.click(screen.getByRole('button', { name: 'Close camera' }))
    expect(screen.getByLabelText('Choose an image')).toBeTruthy()
  })
  it('has no login links and opens the privacy disclosure from a deep link', async () => {
    window.location.hash = '#/#privacy'
    render(<App />)
    expect(screen.queryByRole('link', { name: /sign up|log in|account/i })).toBeNull()
    const heading = await screen.findByRole('heading', { name: 'Your photo and session' })
    expect(heading.closest('details')?.open).toBe(true)
  })
  it('explains an older saved result instead of presenting an empty history', async () => {
    vi.mocked(api.latestScan).mockResolvedValue({ result: null, legacyResult: true })
    window.location.hash = '#/results'
    render(<App />)
    await screen.findByRole('heading', { name: 'Your earlier estimate uses an older methodology' })
  })

  it('simulates demo fulfilment only after confirmation and removes refund access', async () => {
    const user = userEvent.setup()
    let used = false
    vi.mocked(api.offers).mockImplementation(async () => ({
      demoPointsBalance: 0,
      offers: [{ id: 'repair-kit', title: 'Clothing repair kit', description: 'Demo only', pointsCost: 25, canRedeem: false, redeemed: true, receipt: { ...receipt, status: used ? 'used' : 'issued' } }],
    }))
    vi.mocked(api.useDemo).mockImplementation(async () => { used = true; return { demoPointsBalance: 0, receipt: { ...receipt, status: 'used' as const } } })
    window.location.hash = '#/rewards'
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Simulate demo fulfilment' }))
    expect(api.useDemo).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm demo fulfilment' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Refund unused demo voucher' })).toBeNull())
    expect(api.useDemo).toHaveBeenCalledWith('repair-kit')
  })

})
