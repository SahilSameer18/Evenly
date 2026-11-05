import { useEffect, useState } from 'react'

// Shown while the app waits to hear who is signed in. A sleeping server can take up to a minute to answer, so after
// a moment the screen says so instead of looking broken. The bar plays once and never loops; it is hidden when
// the person asked for reduced motion.
export function Splash() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 1500)
    return () => clearTimeout(id)
  }, [])

  return (
    <main role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <span aria-hidden="true" className="enter-pop num inline-flex size-16 items-center justify-center rounded-[20px] bg-dark text-3xl text-owed-fill">E</span>
      <span className="sr-only">Loading Evenly</span>
      {slow && (
        <div className="enter-fade flex max-w-[22rem] flex-col items-center gap-3">
          <p className="num text-xl">Waking up the server</p>
          <p className="text-ink-2">Evenly sleeps when nobody is using it, so the first visit can take up to a minute.</p>
          <span aria-hidden="true" className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-edge motion-reduce:hidden">
            <span className="fill block h-full origin-left rounded-full bg-owed" />
          </span>
        </div>
      )}
    </main>
  )
}
