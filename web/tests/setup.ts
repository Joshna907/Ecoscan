import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(() => cleanup())
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:test-photo'), configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true })
