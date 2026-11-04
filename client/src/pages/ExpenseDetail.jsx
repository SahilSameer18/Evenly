import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { disputeExpense, refreshMoney, reverseExpense, useExpense, useExpenseHistory, withdrawDispute } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { AddExpenseSheet } from '../components/AddExpenseSheet.jsx'
import { Button } from '../components/Button.jsx'
import { ExpenseHistory } from '../components/ExpenseHistory.jsx'
import { Icon } from '../components/Icon.jsx'
import { Chip, Panel, Skeleton } from '../components/Panel.jsx'
import { ReasonSheet } from '../components/ReasonSheet.jsx'
import { EmptyState, ErrorState } from '../components/States.jsx'
import { useToast } from '../components/toast.js'
import { statusLabel } from '../lib/expenses.js'
import { formatMoney } from '../lib/money.js'
import { stagger } from '../lib/motion.js'
import { allowedActions, disputerOf } from '../lib/permissions.js'

const KIND = { shared: 'Shared expense', personal: 'Personal expense', on_behalf: 'Paid on behalf', refund: 'Refund' }
const METHOD = { equal: 'Equally', exact: 'Exact amounts', percentage: 'By percentage', weights: 'By weights' }

export default function ExpenseDetail() {
  const { household } = useOutletContext()
  const { expenseId } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: expense, isPending, error, refetch } = useExpense(household.id, expenseId)
  const history = useExpenseHistory(household.id, expenseId)
  const people = useHousehold(household.id)
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(null) // 'reverse' | 'dispute' | null
  const nameOf = (id) => people.data?.members.find((m) => m.userId === id)?.name ?? 'Someone'

  const back = (
    <Link to="/expenses" className="inline-flex min-h-11 items-center gap-1 text-ink-2 md:hidden"><Icon name="chevron-left" />All expenses</Link>
  )

  if (isPending) return <div className="flex flex-col gap-3">{back}<Skeleton className="h-56" /></div>
  if (error?.status === 404) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <EmptyState title="Expense not found" action={<Button to="/expenses" variant="quiet">Back to spending</Button>}>
          It may not exist, or it may be someone else's personal expense.
        </EmptyState>
      </div>
    )
  }
  if (error) return <div className="flex flex-col gap-3">{back}<ErrorState error={error} onRetry={refetch} /></div>

  const status = statusLabel(expense)
  const can = allowedActions(expense, user.id, disputerOf(history.data))

  // After any change, everything derived from it (balances, lists, suggestions, the history) is stale.
  const changed = async (message) => {
    await refreshMoney(queryClient, household.id)
    toast(message)
  }
  const withdraw = async () => {
    try {
      await withdrawDispute(household.id, expense.id)
      await changed('Dispute withdrawn.')
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <div className="enter-fade flex flex-col gap-3">
      {back}
      <Panel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-ink-2">{KIND[expense.type] ?? 'Expense'}</p>
            <h1 className={`break-words text-xl font-medium ${expense.status === 'reversed' ? 'text-ink-2 line-through' : ''}`}>{expense.description}</h1>
          </div>
          {status && <Chip tone={expense.status === 'disputed' ? 'pending' : 'quiet'}>{status}</Chip>}
        </div>

        <p className="num text-[clamp(2.25rem,10vw,3.25rem)] leading-none">{formatMoney(expense.amountMinor)}</p>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-ink-2">Paid by</dt><dd className="truncate text-right">{nameOf(expense.paidById)}</dd>
          <dt className="text-ink-2">Date</dt><dd className="text-right">{new Date(expense.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          <dt className="text-ink-2">Added by</dt><dd className="truncate text-right">{nameOf(expense.createdById)}</dd>
          {expense.version > 1 && (<><dt className="text-ink-2">Edited</dt><dd className="text-right">{expense.version - 1} {expense.version === 2 ? 'time' : 'times'}</dd></>)}
        </dl>
        {expense.notes && <p className="break-words text-ink-2">{expense.notes}</p>}

        {(can.edit || can.reverse || can.dispute || can.withdraw) && (
          <div className="flex flex-wrap gap-2 border-t border-edge pt-4">
            {can.edit && <Button variant="quiet" onClick={() => setEditing(true)}>Edit</Button>}
            {can.dispute && <Button variant="quiet" onClick={() => setAsking('dispute')}>Dispute</Button>}
            {can.withdraw && <Button variant="quiet" onClick={withdraw}>Withdraw dispute</Button>}
            {can.reverse && <Button variant="destructive" onClick={() => setAsking('reverse')}>Reverse</Button>}
          </div>
        )}
        {expense.status === 'disputed' && !can.withdraw && (
          <p className="text-ink-2">Someone has questioned this expense. It still counts in balances until {can.edit ? 'you edit or reverse it' : `${nameOf(expense.createdById)} edits or reverses it`}.</p>
        )}
      </Panel>

      {expense.type !== 'personal' && (
        <Panel style={stagger(2)} className="enter flex flex-col gap-2">
          <h2 className="num text-lg">How it was split</h2>
          <p className="text-ink-2">{METHOD[expense.splitMethod] ?? expense.splitMethod}</p>
          <ul className="flex flex-col divide-y divide-edge">
            {expense.splits.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">{nameOf(s.userId)}</span>
                <span className="num">{formatMoney(s.shareMinor)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ExpenseHistory query={history} nameOf={nameOf} />

      <AddExpenseSheet
        open={editing}
        onClose={() => setEditing(false)}
        household={household}
        expense={expense}
        onSaved={() => { setEditing(false); toast('Expense updated.') }}
        onStale={async () => { setEditing(false); await refreshMoney(queryClient, household.id); toast('Reloaded the latest version. Press Edit to try again.') }}
      />
      <ReasonSheet
        open={asking === 'reverse'}
        onClose={() => setAsking(null)}
        title="Reverse this expense"
        intro="It stops counting in balances. The record stays, with your reason, so everyone can see what happened."
        label="Why are you reversing it?"
        required
        submitLabel="Reverse expense"
        destructive
        onSubmit={async (reason) => { await reverseExpense(household.id, expense.id, reason); await changed('Expense reversed.') }}
      />
      <ReasonSheet
        open={asking === 'dispute'}
        onClose={() => setAsking(null)}
        title="Dispute this expense"
        intro={`Tell ${nameOf(expense.createdById)} what looks wrong. It still counts in balances until they edit or reverse it, and you can withdraw the dispute.`}
        label="What looks wrong?"
        required
        submitLabel="Send dispute"
        onSubmit={async (reason) => { await disputeExpense(household.id, expense.id, reason); await changed('Dispute sent.') }}
      />
    </div>
  )
}
