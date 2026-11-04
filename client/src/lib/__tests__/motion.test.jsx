import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { easeOutCubic, stagger } from '../motion.js'
import { useCountUp } from '../useCountUp.js'
import { useScrolled } from '../useScrolled.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('motion helpers', () => {
  it('stagger is the list position, capped at 8 so long lists never wait', () => {
    expect(stagger(0)).toEqual({ '--i': 0 })
    expect(stagger(3)).toEqual({ '--i': 3 })
    expect(stagger(40)).toEqual({ '--i': 8 })
  })

  it('easeOutCubic runs from 0 to 1 and only goes up', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    let last = -1
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeOutCubic(t)).toBeGreaterThanOrEqual(last)
      last = easeOutCubic(t)
    }
  })
})

describe('useCountUp', () => {
  const fakeFrames = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })

  it('counts from zero up to the exact target, then stops', () => {
    fakeFrames()
    const { result } = renderHook(() => useCountUp(12345))
    expect(result.current).toBe(0)
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(12345)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current).toBe(12345)
  })

  it('goes on from what is on screen when the target changes', () => {
    fakeFrames()
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 1000 } })
    act(() => { vi.advanceTimersByTime(900) })
    expect(result.current).toBe(1000)
    rerender({ v: 5000 })
    expect(result.current).toBe(1000) // still at the old value at the moment it changes
    act(() => { vi.advanceTimersByTime(900) })
    expect(result.current).toBe(5000)
  })

  it('shows the final number straight away when the person asked for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    const { result } = renderHook(() => useCountUp(777))
    expect(result.current).toBe(777)
  })

  it('lands on the real number even if animation frames never run (a background tab)', () => {
    fakeFrames()
    vi.stubGlobal('requestAnimationFrame', () => 0) // frames are paused, as in a hidden tab
    const { result } = renderHook(() => useCountUp(31415))
    expect(result.current).toBe(0)
    act(() => { vi.advanceTimersByTime(800) })
    expect(result.current).toBe(31415)
  })

  it('shows the real number at once when the tab is hidden', () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    try {
      const { result } = renderHook(() => useCountUp(2500))
      expect(result.current).toBe(2500)
    } finally {
      delete document.hidden
      if (original) Object.defineProperty(Document.prototype, 'hidden', original)
    }
  })

  it('stops its animation frame when it goes away', () => {
    fakeFrames()
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { unmount } = renderHook(() => useCountUp(500))
    unmount()
    expect(cancel).toHaveBeenCalled()
  })
})

describe('useScrolled', () => {
  function Probe() {
    const [marker, scrolled] = useScrolled()
    return <div><div ref={marker} data-testid="marker" /><span>{scrolled ? 'scrolled' : 'top'}</span></div>
  }

  it('is scrolled only while the top marker is out of view, and cleans up', () => {
    let callback
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class { constructor(cb) { callback = cb } observe() {} disconnect() { disconnect() } })
    const { getByText, unmount } = render(<Probe />)
    expect(getByText('top')).toBeInTheDocument()
    act(() => callback([{ isIntersecting: false }]))
    expect(getByText('scrolled')).toBeInTheDocument()
    act(() => callback([{ isIntersecting: true }]))
    expect(getByText('top')).toBeInTheDocument()
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('the animation stylesheet', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8') // tests run from the client folder

  it('every keyframe animates only opacity and transform', () => {
    const blocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
    expect(blocks.length).toBeGreaterThanOrEqual(6)
    for (const [, name, body] of blocks) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.filter((p) => !['opacity', 'transform'].includes(p)), `@keyframes ${name}`).toEqual([])
    }
  })

  it('nothing loops', () => {
    expect(css).not.toMatch(/infinite/)
  })

  it('switches motion off, including delays, for people who ask for reduced motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const rule of ['transition-duration', 'animation-duration', 'animation-delay']) expect(block).toContain(rule)
  })
})
