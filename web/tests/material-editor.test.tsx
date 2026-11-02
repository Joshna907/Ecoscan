import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MaterialProfileEditor } from '../src/components/MaterialProfileEditor'
import { api } from '../src/lib/api'

vi.mock('../src/lib/api', () => ({ api: { recognizeMaterialLabel: vi.fn() }, messageOf: (error: Error) => error.message }))
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear() })

describe('label-first material review', () => {
  it('has no assumed blend and requires review before accepting OCR suggestions', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    vi.mocked(api.recognizeMaterialLabel).mockResolvedValue({ recognitionMode: 'vision', needsConfirmation: true, materials: [{ material: 'cotton', percentage: 97.5 }, { material: 'polyester', percentage: 2.5 }] })
    render(<MaterialProfileEditor category="tshirt" itemNumber={1} disabled={false} onConfirm={onConfirm} onInvalidate={vi.fn()} />)
    await user.click(screen.getByText('Material and weight'))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/Low 130 g/)).toBeTruthy()
    await user.upload(screen.getByLabelText('Care-label photo for item 1'), new File(['label'], 'label.png', { type: 'image/png' }))
    expect(screen.getByAltText('Selected care label for checking the extracted blend')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zoom label' }))
    expect(screen.getByRole('button', { name: 'Fit label' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Read label' }))
    await screen.findByText('Label values extracted. Check them against the photo, then confirm.')
    expect(onConfirm).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Confirm material details' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: 'This blend represents the whole weighed item, not only its shell or lining.' }))
    await user.click(screen.getByRole('button', { name: 'Confirm material details' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ source: 'care_label_ocr', userConfirmed: true, composition: [{ material: 'cotton', percentage: 97.5 }, { material: 'polyester', percentage: 2.5 }] }))
  })
  it('restores text edits after remount without storing the label photo', async () => {
    const user = userEvent.setup()
    const props = { category: 'tshirt' as const, itemNumber: 1, disabled: false, draftKey: 'persistent-item', onConfirm: vi.fn(), onInvalidate: vi.fn() }
    const view = render(<MaterialProfileEditor {...props} />)
    await user.click(screen.getByText('Material and weight'))
    await user.click(screen.getByRole('button', { name: 'Add material', exact: true }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Material', exact: true }), 'cotton')
    await user.type(screen.getByRole('spinbutton', { name: 'Weight of one item in grams (optional)' }), '220')
    view.unmount()
    render(<MaterialProfileEditor {...props} />)
    await user.click(screen.getByText('Material and weight'))
    expect((screen.getByRole('combobox', { name: 'Material', exact: true }) as HTMLSelectElement).value).toBe('cotton')
    expect((screen.getByRole('spinbutton', { name: 'Weight of one item in grams (optional)' }) as HTMLInputElement).value).toBe('220')
    expect(screen.queryByAltText('Selected care label for checking the extracted blend')).toBeNull()
  })
})
