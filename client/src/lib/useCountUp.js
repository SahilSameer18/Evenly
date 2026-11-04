import { useEffect, useState } from 'react'
import { easeOutCubic, prefersReducedMotion } from './motion.js'

const at = (from, to, t) => Math.round(from + (to - from) * easeOutCubic(t))
const hidden = () => typeof document !== 'undefined' && document.hidden

/**
 * Counts a number (whole paise) up to `target` once on first show, and again whenever the target changes.
 * It must never leave a wrong balance on screen: with reduced motion or a hidden tab (where animation frames
 * do not run) it shows the real number at once, and a timer guarantees it lands on the target regardless.
 */
export function useCountUp(target, ms = 600) {
  const instant = prefersReducedMotion() || hidden()
  const [last, setLast] = useState(target)
  const [from, setFrom] = useState(instant ? target : 0)
  const [t, setT] = useState(instant ? 1 : 0)

  // The target changed: start from whatever is on screen right now.
  if (last !== target) {
    setFrom(at(from, last, t))
    setLast(target)
    setT(instant ? 1 : 0)
  }

  useEffect(() => {
    if (instant) return
    let frame
    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / ms)
      setT(progress)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const finish = setTimeout(() => setT(1), ms + 150)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(finish)
    }
  }, [target, from, ms, instant])

  return t >= 1 ? target : at(from, target, t)
}
