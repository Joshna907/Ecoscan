import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { api, ApiError } from '../src/lib/api'
import { downloadDemoReceipt } from '../src/lib/demoReceipt'

vi.mock('../src/lib/api', () => ({
  api: { offers: vi.fn(), upload: vi.fn(), status: vi.fn(), confirm: vi.fn(), latestScan: vi.fn(), redeem: vi.fn(), me: vi.fn(), signup: vi.fn(), login: vi.fn(), logout: vi.fn() },
  ApiError: class extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status } },
  messageOf: (error: Error) => error.message,
}))
vi.mock('../src/lib/demoReceipt', () => ({ downloadDemoReceipt: vi.fn() }))
const id = 'a1b2c3d4-1234-4123-8123-123456789abc'
const analysis = { analysisId: id, recognitionMode: 'mock' as const, needsReview: true as const, suggestions: [{ id: 'item-1', category: 'tshirt' as const }] }
const result = {
  items: [{ category: 'jeans' as const, quantity: 2, estimatedProductionKgCo2e: 20 }],
  totalEstimatedProductionKgCo2e: 20, scenarioPotentialAvoidedKgCo2e: 10,
  demoPointsAwarded: 100, demoPointsBalance: 100, assumptionsVersion: 'demo-v1' as const,
}
let balance = 0
let redeemed = false
const receipt = { reference: 'DEMO-TEST1234567890', redeemedAt: '2026-10-29T10:00:00.000Z' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.me).mockResolvedValue({ user: null })
  vi.mocked(api.latestScan).mockResolvedValue({ result: null })
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
  it('creates an account and logs out from the account page', async () => {
    const user = userEvent.setup()
    vi.mocked(api.signup).mockResolvedValue({ user: { id: 'account-1', email: 'joshna@example.com' } })
    vi.mocked(api.logout).mockResolvedValue()
    window.location.hash = '#/account'
    render(<App />)
    await user.type(screen.getByLabelText('Email address'), 'joshna@example.com')
    await user.type(screen.getByLabelText('Password'), 'long-password-123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(api.signup).toHaveBeenCalledWith('joshna@example.com', 'long-password-123')
    await screen.findByRole('heading', { name: 'Your demo rewards' })
    await user.click(screen.getByRole('link', { name: 'Account' }))
    await screen.findByText('joshna@example.com')
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(api.logout).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('link', { name: 'Sign up / Log in' }))
    await screen.findByRole('heading', { name: 'Keep your progress close.' })
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
    expect(screen.getAllByText('20 kg CO₂e').length).toBe(2)
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
    vi.mocked(api.latestScan).mockResolvedValue({ result })
    window.location.hash = '#/results'
    render(<App />)
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(screen.getAllByText('20 kg CO₂e').length).toBe(2)
    expect(api.latestScan).toHaveBeenCalledTimes(1)
  })
  it('rejects unsupported files before calling the backend', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.upload(screen.getByLabelText('Choose an image'), new File(['text'], 'bad.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert').textContent).toContain('JPEG, PNG, or WebP')
    expect((screen.getByRole('button', { name: 'Scan photo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.upload).not.toHaveBeenCalled()
  })
  it('shows a zero-points estimate when no planned purchase is replaced', async () => {
    vi.mocked(api.confirm).mockResolvedValue({ ...result, scenarioPotentialAvoidedKgCo2e: 0, demoPointsAwarded: 0, demoPointsBalance: 0 })
    const user = userEvent.setup()
    render(<App />)
    await uploadPhoto(user)
    await user.click(await screen.findByLabelText('No, or I’m not sure'))
    await user.click(screen.getByRole('button', { name: 'Confirm and see estimate' }))
    await screen.findByRole('heading', { name: 'Your clothing estimate' })
    expect(screen.getByText('0 points')).toBeTruthy()
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
})
