import { useEffect, useRef, useState } from 'react'

/**
 * True once the page has scrolled away from the top. A 1 px marker at the top is watched with an
 * IntersectionObserver, so there is no scroll listener running on every frame (battery).
 * Usage: const [marker, scrolled] = useScrolled(); <div ref={marker} /> above a sticky header.
 */
export function useScrolled() {
  const marker = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = marker.current
    if (!el || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [marker, scrolled]
}
