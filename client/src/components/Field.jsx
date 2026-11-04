import { useId } from 'react'
import { Icon } from './Icon.jsx'

// A labelled input with a visible edge, an optional icon, and a placeholder showing what to type.
// The error is text next to the field, never colour alone.
export function Field({ label, error, hint, icon, ...input }) {
  const id = useId()
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-2">{label}</label>
      <div className="relative">
        {icon && <Icon name={icon} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note}
          className={`min-h-12 w-full rounded-xl border border-ink-2/40 bg-panel px-4 text-ink transition-colors placeholder:text-ink-2/70 ${icon ? 'pl-11' : ''}`}
          {...input}
        />
      </div>
      {error && <p id={`${id}-err`} className="text-owe">{error}</p>}
      {!error && hint && <p id={`${id}-hint`} className="text-ink-2">{hint}</p>}
    </div>
  )
}
