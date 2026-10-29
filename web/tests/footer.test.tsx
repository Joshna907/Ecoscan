import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SiteFooter } from '../src/components/SiteFooter'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses the optimized blossom video behind useful EcoScan links', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const { container } = render(<MemoryRouter><SiteFooter /></MemoryRouter>)
  const footer = screen.getByRole('contentinfo')
  const video = container.querySelector('video')
  expect(video?.querySelector('source')?.getAttribute('src')).toBe('/footer.mp4')
  expect(video?.getAttribute('poster')).toBe('/footer-poster.jpg')
  expect(video?.muted).toBe(true)
  expect(within(footer).getByRole('link', { name: 'FAQs' }).getAttribute('href')).toBe('/#faq')
  expect(container.querySelector('.footer-grid')).toBeNull()
  expect(within(footer).queryByText('Example estimates')).toBeNull()
})
