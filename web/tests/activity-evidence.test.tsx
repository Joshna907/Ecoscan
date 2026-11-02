import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityEvidencePanel } from '../src/components/ActivityEvidencePanel'
import { api } from '../src/lib/api'

vi.mock('../src/lib/api', () => ({ api: { activityEvidence: vi.fn(), requestActivityEvidence: vi.fn() }, messageOf: (error: Error) => error.message }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.activityEvidence).mockResolvedValue({ enabled: false, partners: [], receipts: [], verifiedActivityCredits: 0 })
})
describe('partner activity review', () => {
  it('shows unavailable verification without a partner and does not offer self-confirmation', async () => {
    render(<ActivityEvidencePanel />)
    await screen.findByText(/No activity verification partner is connected/)
    expect(screen.queryByRole('button', { name: 'Create verification code' })).toBeNull()
    expect(screen.getByText(/no cash value and cannot redeem offers/)).toBeTruthy()
    expect(api.requestActivityEvidence).not.toHaveBeenCalled()
  })
  it('creates a code for the selected activity and refreshes partner evidence', async () => {
    const user = userEvent.setup()
    const empty = { enabled: true, partners: [{ id: 'repair-shop', name: 'Test Repair Shop', activities: ['repair' as const, 'donation' as const] }], receipts: [], verifiedActivityCredits: 0 }
    vi.mocked(api.activityEvidence).mockResolvedValueOnce(empty).mockResolvedValue({ ...empty, verifiedActivityCredits: 10, receipts: [{ id: 'a1b2c3d4-1234-4123-8123-123456789abc', partnerId: 'repair-shop', partnerName: 'Test Repair Shop', activity: 'donation', credits: 10, occurredAt: '2026-11-02T08:00:00.000Z', confirmedAt: '2026-11-02T08:01:00.000Z', status: 'confirmed', reversalReason: null }] })
    vi.mocked(api.requestActivityEvidence).mockResolvedValue({ code: 'a'.repeat(43), expiresAt: '2026-11-02T08:15:00.000Z' })
    render(<ActivityEvidencePanel />)
    await screen.findByRole('combobox', { name: 'Qualifying activity' })
    await user.selectOptions(screen.getByLabelText('Qualifying activity'), 'donation')
    await user.click(screen.getByRole('button', { name: 'Create verification code' }))
    await screen.findByText('a'.repeat(43))
    expect(api.requestActivityEvidence).toHaveBeenCalledWith('repair-shop', 'donation')
    await user.click(screen.getByRole('button', { name: 'Refresh activity' }))
    await screen.findByText('10 verified activity credits')
    expect(screen.getByText('Test Repair Shop · 10 credits confirmed')).toBeTruthy()
  })
  it('does not claim success when creating a code fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.activityEvidence).mockResolvedValue({ enabled: true, partners: [{ id: 'repair-shop', name: 'Test Repair Shop', activities: ['repair'] }], receipts: [], verifiedActivityCredits: 0 })
    vi.mocked(api.requestActivityEvidence).mockRejectedValue(new Error('Verification temporarily unavailable.'))
    render(<ActivityEvidencePanel />)
    await screen.findByLabelText('Verification partner')
    await user.click(screen.getByRole('button', { name: 'Create verification code' }))
    expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
    expect(screen.getByText('0 verified activity credits')).toBeTruthy()
  })
})
