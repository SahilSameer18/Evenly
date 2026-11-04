import { useId, useState } from 'react'
import { Button } from './Button.jsx'
import { Sheet } from './Sheet.jsx'

// A small sheet that asks "why?" (reject a repayment, reverse or dispute an expense). The reason is kept in the
// audit trail on the server, so when it is required an empty one is refused here with a clear line.
export function ReasonSheet({ open, onClose, title, intro, label = 'Reason', required = false, submitLabel, destructive = false, onSubmit }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <Form intro={intro} label={label} required={required} submitLabel={submitLabel} destructive={destructive} onSubmit={onSubmit} onClose={onClose} />}
    </Sheet>
  )
}

function Form({ intro, label, required, submitLabel, destructive, onSubmit, onClose }) {
  const id = useId()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const missing = required && !reason.trim()

  async function submit(e) {
    e.preventDefault()
    setTried(true)
    if (missing) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason.trim())
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="enter flex flex-col gap-4">
      {intro && <p className="text-ink-2">{intro}</p>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-ink-2">{required ? label : `${label} (optional)`}</label>
        <textarea
          id={id}
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={tried && missing ? true : undefined}
          aria-describedby={`${id}-note`}
          className="min-h-24 w-full rounded-xl border border-ink-2/40 bg-panel p-3 text-ink"
        />
        <p id={`${id}-note`} className="flex justify-between gap-3 text-xs text-ink-2">
          <span className="text-owe">{tried && missing ? 'Add a reason' : ''}</span>
          <span>{reason.length}/300</span>
        </p>
      </div>
      {error && (
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-owe">{error.message}</p>
          {error.requestId && <p className="text-xs text-ink-2">Reference: {error.requestId}</p>}
        </div>
      )}
      <Button type="submit" variant={destructive ? 'destructive' : 'action'} disabled={busy}>{busy ? 'Working…' : submitLabel}</Button>
      <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
    </form>
  )
}
