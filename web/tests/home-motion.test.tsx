import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WardrobeHero } from '../src/components/WardrobeHero'
import { ImpactExplorer } from '../src/components/ImpactExplorer'

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('plays motion by default without showing a motion control or disclaimer', () => {
  const { container } = render(<MemoryRouter><WardrobeHero ongoing={false} /></MemoryRouter>)
  expect(container.querySelector('section')?.dataset.paused).toBe('false')
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  expect(container.querySelector('.ascii-motion-control')).toBeNull()
  expect(container.querySelector('.hero-disclaimer')).toBeNull()
})
it('starts static for reduced motion', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const { container } = render(<MemoryRouter><WardrobeHero ongoing={true} /></MemoryRouter>)
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  expect(container.querySelector('section')?.dataset.paused).toBe('true')
  expect(screen.getByRole('link', { name: /Continue your scan/ }).getAttribute('href')).toBe('/scan')
})
it('keeps the introduction visible and provides three linked cards without a slideshow', () => {
  vi.useFakeTimers()
  const { container } = render(<MemoryRouter><WardrobeHero ongoing={false} /></MemoryRouter>)
  act(() => vi.advanceTimersByTime(60000))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Think beyond the label.')
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(container.querySelector('.story-feature video')).toBeTruthy()
  expect(container.querySelector('.petal-rain')).toBeNull()
  expect(container.querySelector('.hero-stage')).toBeNull()
  expect(screen.getByRole('link', { name: /Read the assumptions/ }).getAttribute('href')).toBe('/#how-it-works')
  expect(screen.getByRole('link', { name: /Explore demo offers/ }).getAttribute('href')).toBe('/rewards')
})
it('lets users explore and collapse the explanation', async () => {
  const user = userEvent.setup()
  const { container } = render(<ImpactExplorer />)
  await user.click(screen.getByRole('button', { name: 'Understand the estimate' }))
  expect(screen.getByRole('heading', { name: 'Give the numbers context.' })).toBeTruthy()
  const toggle = screen.getByRole('button', { name: 'Explore the EcoScan journey' })
  await user.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('.explorer-collapse')?.hasAttribute('inert')).toBe(true)
})
