import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpotlightNav } from '../src/components/SpotlightNav'

it('highlights the current route and tracks pointer position', () => {
  render(<MemoryRouter initialEntries={['/rewards']}><SpotlightNav /></MemoryRouter>)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(screen.getByRole('link', { name: 'Rewards' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Results' }).getAttribute('aria-current')).toBeNull()
  fireEvent.pointerEnter(nav)
  fireEvent.pointerMove(nav, { clientX: 64 })
  expect(nav.getAttribute('data-hovered')).toBe('true')
  expect(nav.style.getPropertyValue('--spotlight-x')).toBe('64px')
})
