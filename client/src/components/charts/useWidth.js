import { useCallback, useState } from 'react'

// The drawn width of an element, kept up to date, so a chart is drawn at its real pixel size: text stays 12 px
// on a 320 px phone instead of shrinking with a scaled viewBox. Use: const [ref, width] = useWidth(); <div ref={ref}>
export function useWidth(fallback = 320) {
  const [width, setWidth] = useState(fallback)
  const ref = useCallback((node) => {
    if (!node) return
    setWidth(Math.round(node.getBoundingClientRect().width) || fallback)
    if (typeof ResizeObserver !== 'function') return // old browsers and tests keep the first measurement
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback))
    observer.observe(node)
    return () => observer.disconnect()
  }, [fallback])
  return [ref, width]
}
