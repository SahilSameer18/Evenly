import { useId, useState } from 'react'
import { Icon } from './Icon.jsx'

// A labelled password input with a lock icon and a show/hide button (44 px, announced as pressed or not).
export function PasswordField({ label, error, hint, ...input }) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-2">{label}</label>
      <div className="relative">
        <Icon name="lock" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={note}
          className="min-h-12 w-full rounded-xl border border-ink-2/40 bg-panel pl-11 pr-12 text-ink transition-colors placeholder:text-ink-2/70"
          {...input}
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="absolute right-0 top-0 inline-flex size-12 items-center justify-center text-ink-2 transition-colors hover:text-ink"
        >
          <Icon name={shown ? 'eye-off' : 'eye'} />
        </button>
      </div>
      {error && <p id={`${id}-err`} className="text-owe">{error}</p>}
      {!error && hint && <div id={`${id}-hint`}>{hint}</div>}
    </div>
  )
}
