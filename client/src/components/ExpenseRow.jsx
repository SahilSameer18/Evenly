import { Link } from 'react-router'
import { effectOn, statusLabel } from '../lib/expenses.js'
import { formatMoney } from '../lib/money.js'
import { Chip } from './Panel.jsx'

// Your effect on your own balance, always with a sign AND words, never colour alone.
export function Effect({ minor, personal }) {
  if (personal) return <span className="shrink-0 text-xs text-ink-2">Personal</span>
  if (minor === null) return null
  if (minor === 0) return <span className="shrink-0 text-xs text-ink-2">Not involved</span>
  const owed = minor > 0
  return (
    <span className="shrink-0 text-right">
      <span className={`num block ${owed ? 'text-owed' : 'text-owe'}`}>{owed ? '+' : '−'}{formatMoney(Math.abs(minor))}</span>
      <span className="block text-xs text-ink-2">{owed ? 'you lent' : 'you owe'}</span>
    </span>
  )
}

export function ExpenseRow({ expense, myId, nameOf, selected }) {
  const status = statusLabel(expense)
  const payer = expense.paidById === myId ? 'You paid' : `${nameOf(expense.paidById)} paid`
  return (
    <Link
      to={`/expenses/${expense.id}`}
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ${selected ? 'bg-panel' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${expense.status === 'reversed' ? 'text-ink-2 line-through' : ''}`}>{expense.description}</span>
        <span className="block truncate text-xs text-ink-2">{expense.type === 'personal' ? 'Only you' : payer}</span>
      </span>
      {status && <Chip tone={expense.status === 'disputed' ? 'pending' : 'quiet'}>{status}</Chip>}
      <Effect minor={effectOn(expense, myId)} personal={expense.type === 'personal'} />
    </Link>
  )
}
