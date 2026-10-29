import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { JourneyTour } from '../src/components/JourneyTour'

it('shows the four scan stages and a link to the scanner', () => {
  const { container } = render(<MemoryRouter><JourneyTour /></MemoryRouter>)
  expect(container.querySelectorAll('.journey-step')).toHaveLength(4)
  expect(screen.getByRole('heading', { name: 'From a photo to an estimate' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Start with what you already own.' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Give another wear a little reward.' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Try your first scan' }).getAttribute('href')).toBe('/scan')
})
