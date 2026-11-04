import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { newIdempotencyKey } from '../api/client.js'
import { useHousehold } from '../api/households.js'
import { createSettlement, refreshSettle } from '../api/settlements.js'
import { useAuth } from '../auth/context.js'
import { amountToMinor, minorToAmountText } from '../lib/amount.js'
import { fieldErrors } from '../lib/errors.js'
import { METHODS } from '../lib/settle.js'
import { AmountInput } from './AmountInput.jsx'
import { Button } from './Button.jsx'
import { Field } from './Field.jsx'
import { Skeleton } from './Panel.jsx'
import { Sheet } from './Sheet.jsx'
import { EmptyState, ErrorState } from './States.jsx'

const chip = (on) => `min-h-11 rounded-full border px-4 font-medium transition-colors duration-150 active:scale-[0.97] ${on ? 'border-transparent bg-action text-on-action' : 'border-edge text-ink'}`

/** Record that you paid someone back. It stays "waiting" until they confirm it; only then do balances move. */
export function RecordRepaymentSheet({ open, onClose, household, defaults, onSaved }) {
  return (
    <Sheet open={open} onClose={onClose} title="Record repayment">
      {open && <Loader household={household} defaults={defaults} onSaved={onSaved} onClose={onClose} />}
    </Sheet>
  )
}

function Loader({ household, defaults, onSaved, onClose }) {
  const { data, isPending, error, refetch } = useHousehold(household.id)
  if (isPending) return <Skeleton className="h-72" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return <Form household={household} members={data.members} defaults={defaults} onSaved={onSaved} onClose={onClose} />
}

function Form({ household, members, defaults, onSaved, onClose }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [idempotencyKey] = useState(newIdempotencyKey)
  const others = members.filter((m) => m.userId !== user.id)

  const [toUserId, setToUserId] = useState(defaults?.toUserId ?? others[0]?.userId ?? '')
  const [amountText, setAmountText] = useState(defaults?.amountMinor ? minorToAmountText(defaults.amountMinor) : '')
  const [method, setMethod] = useState('upi')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fields = fieldErrors(error)
  const amountMinor = amountToMinor(amountText)
  const amountProblem = amountMinor > 0 ? null : 'Enter an amount'

  if (others.length === 0) {
    return <EmptyState title="Invite a roommate first">Repayments are between two people. Invite someone from Settings.</EmptyState>
  }

  async function save(e) {
    e.preventDefault()
    setShowErrors(true)
    if (amountProblem || !toUserId) return
    setSaving(true)
    setError(null)
    try {
      const body = { toUserId, amountMinor, method, ...(reference.trim() && { paymentReference: reference.trim() }), ...(note.trim() && { note: note.trim() }) }
      // A retry after a failure reuses the same key, so it can never record the repayment twice.
      const settlement = await createSettlement(household.id, body, idempotencyKey)
      await refreshSettle(queryClient, household.id)
      onSaved(settlement, others.find((m) => m.userId === toUserId)?.name ?? 'them')
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="enter flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="repay-to" className="text-ink-2">You paid</label>
        <select id="repay-to" value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="min-h-12 rounded-xl border border-ink-2/40 bg-panel px-3 text-ink">
          {others.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
      </div>

      <AmountInput value={amountText} onChange={setAmountText} error={showErrors ? (amountProblem ?? fields.amountMinor) : undefined} />
      <p className="text-xs text-ink-2">You can pay more than you owe: the balance then flips the other way. Nothing changes until they confirm.</p>

      <div className="flex flex-col gap-2">
        <span className="text-ink-2">How</span>
        <div role="radiogroup" aria-label="How you paid" className="flex flex-wrap gap-2">
          {METHODS.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={method === value} onClick={() => setMethod(value)} className={chip(method === value)}>{label}</button>
          ))}
        </div>
      </div>

      <Field label="Reference (optional)" value={reference} maxLength={100} placeholder="UPI transaction ID" onChange={(e) => setReference(e.target.value)} error={fields.paymentReference} />
      <Field label="Note (optional)" value={note} maxLength={300} placeholder="Your share of the rent" onChange={(e) => setNote(e.target.value)} error={fields.note} />

      {error && (
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-owe">{error.message}{error.status === 0 ? ' Nothing was lost: try again.' : ''}</p>
          {error.requestId && <p className="text-xs text-ink-2">Reference: {error.requestId}</p>}
        </div>
      )}
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record repayment'}</Button>
    </form>
  )
}
