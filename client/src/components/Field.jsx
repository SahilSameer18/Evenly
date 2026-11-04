import { useId } from 'react'

// A labelled input. The error is text next to the field, never colour alone.
export function Field({ label, error, hint, ...input }) {
  const id = useId()
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-2">{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note}
        className="min-h-12 rounded-xl border border-edge bg-panel px-4 text-ink placeholder:text-ink-2"
        {...input}
      />
      {error && <p id={`${id}-err`} className="text-owe">{error}</p>}
      {!error && hint && <p id={`${id}-hint`} className="text-ink-2">{hint}</p>}
    </div>
  )
}
