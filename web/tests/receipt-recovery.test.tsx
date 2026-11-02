import { beforeEach,describe,expect,it,vi } from 'vitest'
import { render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReceiptRecovery,RecoveryKeyButton } from '../src/components/ReceiptRecovery'
import { api } from '../src/lib/api'
vi.mock('../src/lib/api',()=>({api:{recoverReceipt:vi.fn(),createRecoveryKey:vi.fn()},messageOf:(error:Error)=>error.message}))
beforeEach(()=>vi.resetAllMocks())
describe('receipt recovery without login',()=>{
  it('retrieves a read-only receipt and clears the entered secret',async()=>{
    const user=userEvent.setup()
    vi.mocked(api.recoverReceipt).mockResolvedValue({offerId:'repair-kit',title:'Repair kit',receipt:{reference:'DEMO-SAVED',redeemedAt:'2026-11-02T00:00:00.000Z',expiresAt:'2026-12-02T00:00:00.000Z',status:'refunded'},readOnly:true,recoveryExpiresAt:'2027-05-01T00:00:00.000Z'})
    render(<ReceiptRecovery/>)
    await user.type(screen.getByLabelText('Private receipt recovery key'),'a'.repeat(43))
    await user.click(screen.getByRole('button',{name:'Recover saved receipt'}))
    expect((await screen.findByRole('status')).textContent).toContain('DEMO-SAVED · refunded')
    expect((screen.getByLabelText('Private receipt recovery key') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button',{name:/refund/i})).toBeNull()
    expect(api.recoverReceipt).toHaveBeenCalledWith('a'.repeat(43))
  })
  it('shows an invalid key error without claiming recovery',async()=>{
    const user=userEvent.setup();vi.mocked(api.recoverReceipt).mockRejectedValue(new Error('Recovery key is invalid or expired.'))
    render(<ReceiptRecovery/>);await user.type(screen.getByLabelText('Private receipt recovery key'),'b'.repeat(43));await user.click(screen.getByRole('button',{name:'Recover saved receipt'}))
    expect((await screen.findByRole('alert')).textContent).toContain('invalid or expired')
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('only generates a private key after an explicit user action',async()=>{
    const user=userEvent.setup();vi.mocked(api.createRecoveryKey).mockResolvedValue({recoveryKey:'c'.repeat(43),recoveryExpiresAt:'2027-05-01T00:00:00.000Z'})
    render(<RecoveryKeyButton offerId="repair-kit"/>)
    expect(api.createRecoveryKey).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button',{name:'Generate receipt recovery key'}))
    expect((await screen.findByRole('status')).textContent).toContain('c'.repeat(43))
    expect(api.createRecoveryKey).toHaveBeenCalledWith('repair-kit')
  })
})
