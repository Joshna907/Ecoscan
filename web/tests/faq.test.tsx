import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FaqSection } from '../src/components/FaqSection'

it('lets a visitor expand an EcoScan answer', async () => {
  const user = userEvent.setup()
  const { container } = render(<FaqSection />)
  const rows = container.querySelectorAll<HTMLDetailsElement>('.faq-item')
  expect(screen.getByText('What is a partner-confirmed activity?')).toBeTruthy()
  expect(rows[0].open).toBe(false)
  await user.click(screen.getByText('Can a photo tell me my clothing’s exact footprint?'))
  expect(rows[0].open).toBe(true)
  expect(rows[0].textContent).toContain('illustrative estimate')
})
