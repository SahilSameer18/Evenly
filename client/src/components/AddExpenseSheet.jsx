import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { newIdempotencyKey } from '../api/client.js'
import { createExpense, refreshMoney } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { amountToMinor, groupAmountText, sanitizeAmount } from '../lib/amount.js'
import { formatMoney } from '../lib/money.js'
import { buildExpenseBody, previewSplit } from '../lib/split.js'
import { Button } from './Button.jsx'
import { Field } from './Field.jsx'
import { Keypad } from './Keypad.jsx'
import { Panel, Skeleton } from './Panel.jsx'
import { Sheet } from './Sheet.jsx'
import { SplitEditor } from './SplitEditor.jsx'
import { ErrorState } from './States.jsx'

const segment = (on) => `min-h-11 flex-1 rounded-full px-4 font-medium ${on ? 'bg-action text-on-action' : 'text-ink-2'}`

export function AddExpenseSheet({ open, onClose, household, onSaved }) {
  // The form only exists while the sheet is open, so it starts fresh (and with a new idempotency key) every time.
  return (
    <Sheet open={open} onClose={onClose} title="Add expense">
      {open && <Loader household={household} onSaved={onSaved} />}
    </Sheet>
  )
}

function Loader({ household, onSaved }) {
  const { data, isPending, error, refetch } = useHousehold(household.id)
  if (isPending) return <Skeleton className="h-72" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return <Form household={household} members={data.members} onSaved={onSaved} />
}

function Form({ household, members, onSaved }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [idempotencyKey] = useState(newIdempotencyKey)

  const [step, setStep] = useState('details')
  const [type, setType] = useState('shared')
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [paidById, setPaidById] = useState(user.id)
  const [method, setMethod] = useState(household.defaultSplitMethod ?? 'equal')
  const [participants, setParticipants] = useState(members.map((m) => m.userId))
  const [rowsByMethod, setRowsByMethod] = useState({ weights: Object.fromEntries(members.map((m) => [m.userId, '1'])) })
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const rows = rowsByMethod[method] ?? {}
  const amountMinor = amountToMinor(amountText)
  const shared = type === 'shared'
  const preview = shared ? previewSplit(method, amountMinor, { participants, rows }) : null
  const problem = {
    amount: amountMinor > 0 ? null : 'Enter an amount',
    description: description.trim() ? null : 'Add a description',
    split: shared && amountMinor > 0 ? preview.error : null,
  }
  const valid = !problem.amount && !problem.description && !problem.split
  const nameOf = (id) => members.find((m) => m.userId === id)?.name ?? 'Someone'

  function review() {
    setShowErrors(true)
    if (valid) setStep('review')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = buildExpenseBody({ type, description, amountMinor, paidById, method, participants, rows })
      // A retry after a failure reuses the same key, so it can never create a second expense.
      const { expense } = await createExpense(household.id, body, idempotencyKey)
      await refreshMoney(queryClient, household.id)
      onSaved(expense)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (step === 'review') {
    return (
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-3">
          <div>
            <p className="text-ink-2">{shared ? 'Shared expense' : 'Personal expense'}</p>
            <p className="break-words font-medium">{description.trim()}</p>
          </div>
          <p className="num text-[clamp(2rem,11vw,3rem)] leading-none">{formatMoney(amountMinor)}</p>
          {shared && (
            <>
              <p className="text-ink-2">Paid by {nameOf(paidById)}</p>
              <ul className="flex flex-col divide-y divide-edge">
                {preview.shares.map((s) => (
                  <li key={s.userId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{nameOf(s.userId)}</span>
                    <span className="num">{formatMoney(s.shareMinor)}</span>
                  </li>
                ))}
              </ul>
              {preview.approximate && <p className="text-xs text-ink-2">The extra paise are assigned fairly when you save, so a share may differ by a paisa.</p>}
            </>
          )}
          {!shared && <p className="text-ink-2">Only you can see this. It never changes anyone's balance.</p>}
        </Panel>
        {error && (
          <div role="alert" className="flex flex-col gap-1">
            <p className="text-owe">{error.message}{error.status === 0 ? ' Nothing was lost: try again.' : ''}</p>
            {error.requestId && <p className="text-xs text-ink-2">Reference: {error.requestId}</p>}
          </div>
        )}
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</Button>
        <Button variant="quiet" onClick={() => setStep('details')} disabled={saving}>Back</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Kind of expense" className="flex rounded-full border border-edge bg-panel p-1">
        <button type="button" role="radio" aria-checked={shared} onClick={() => setType('shared')} className={segment(shared)}>Shared</button>
        <button type="button" role="radio" aria-checked={!shared} onClick={() => setType('personal')} className={segment(!shared)}>Personal</button>
      </div>

      {/* Phones show the amount big with the on-screen keypad; desktop has a normal text field. */}
      <div className="md:hidden">
        <p aria-live="polite" aria-label={`Amount: ${amountText || '0'} rupees`} className="num flex items-baseline justify-center gap-1 text-[clamp(2.25rem,13vw,3.5rem)] leading-tight">
          <span className="text-[0.5em] text-ink-2">₹</span>
          <span className={amountText ? '' : 'text-ink-2'}>{groupAmountText(amountText) || '0'}</span>
        </p>
        {showErrors && problem.amount && <p className="text-center text-owe">{problem.amount}</p>}
        <div className="mt-2"><Keypad value={amountText} onChange={setAmountText} /></div>
      </div>
      <div className="hidden md:block">
        <Field label="Amount (₹)" inputMode="decimal" autoFocus placeholder="0" value={amountText} onChange={(e) => setAmountText(sanitizeAmount(e.target.value))} error={showErrors ? problem.amount : undefined} />
      </div>

      <Field label="What was it for?" value={description} maxLength={140} placeholder="Groceries" onChange={(e) => setDescription(e.target.value)} error={showErrors ? problem.description : undefined} />

      {shared && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paid-by" className="text-ink-2">Paid by</label>
            <select id="paid-by" value={paidById} onChange={(e) => setPaidById(e.target.value)} className="min-h-12 rounded-xl border border-edge bg-panel px-3 text-ink">
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.userId === user.id ? `${m.name} (you)` : m.name}</option>)}
            </select>
          </div>
          <SplitEditor
            method={method}
            onMethod={setMethod}
            members={members}
            participants={participants}
            onParticipants={setParticipants}
            rows={rows}
            onRows={(next) => setRowsByMethod((all) => ({ ...all, [method]: next }))}
            preview={preview}
          />
        </>
      )}
      {showErrors && problem.split && <p role="alert" className="text-owe">{problem.split}</p>}

      <Button onClick={review}>Review</Button>
    </div>
  )
}
