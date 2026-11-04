import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '../ThemeToggle.jsx'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => vi.unstubAllGlobals())

describe('ThemeToggle', () => {
  it('is dark by default and one tap switches to light, remembering the choice', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('evenly.theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('switches back to dark on the next tap', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('starts from the saved choice', () => {
    localStorage.setItem('evenly.theme', 'light')
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('when following the phone ("system"), shows what the phone is using', () => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('light'), addEventListener() {}, removeEventListener() {} }))
    render(<ThemeToggle />)
    // the phone prefers light, so the next step is dark
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('is a 44 px tap target', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button').className).toContain('size-11')
  })
})
