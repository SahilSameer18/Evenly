import { Link, useOutletContext, useParams } from 'react-router'
import { useExpense } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { Chip, Panel, Skeleton } from '../components/Panel.jsx'
import { EmptyState, ErrorState } from '../components/States.jsx'
import { statusLabel } from '../lib/expenses.js'
import { formatMoney } from '../lib/money.js'

const KIND = { shared: 'Shared expense', personal: 'Personal expense', on_behalf: 'Paid on behalf', refund: 'Refund' }
const METHOD = { equal: 'Equally', exact: 'Exact amounts', percentage: 'By percentage', weights: 'By weights' }

export default function ExpenseDetail() {
  const { household } = useOutletContext()
  const { expenseId } = useParams()
  const { data: expense, isPending, error, refetch } = useExpense(household.id, expenseId)
  const people = useHousehold(household.id)
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
  return (
    <div className="flex flex-col gap-3">
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
      </Panel>

      {expense.type !== 'personal' && (
        <Panel className="flex flex-col gap-2">
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
    </div>
  )
}
