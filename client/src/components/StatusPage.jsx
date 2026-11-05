import { Link } from 'react-router'
import { stagger } from '../lib/motion.js'

// A whole-page message (not found, something broke): a big visual, a plain title, one sentence, then the way out.
export function StatusPage({ visual, title, children, actions }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6 sm:px-6">
      <Link to="/" className="num inline-flex min-h-11 items-center self-start text-2xl">Evenly</Link>
      <div className="flex flex-1 flex-col items-start justify-center gap-4 py-10">
        <p aria-hidden="true" className="enter-pop num text-[clamp(5.5rem,26vw,10rem)] leading-none text-owed">{visual}</p>
        <h1 style={stagger(1)} className="enter num text-[clamp(1.75rem,6vw,2.5rem)] leading-tight">{title}</h1>
        <p style={stagger(2)} className="enter max-w-[40ch] text-ink-2">{children}</p>
        <div style={stagger(3)} className="enter mt-2 flex flex-wrap gap-3">{actions}</div>
      </div>
    </main>
  )
}
