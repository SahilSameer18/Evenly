/**
 * What one expense does to ONE person's balance, in paise: what they paid minus their share. A refund works the
 * other way round. Personal and reversed expenses do nothing to balances, so they return null.
 */
export function effectOn(expense, myId) {
  if (expense.type === 'personal' || expense.status === 'reversed') return null
  const paid = expense.paidById === myId ? expense.amountMinor : 0
  const share = expense.splits.find((s) => s.userId === myId)?.shareMinor ?? 0
  return expense.type === 'refund' ? share - paid : paid - share
}

export const statusLabel = (expense) => (expense.status === 'reversed' ? 'Reversed' : expense.status === 'disputed' ? 'Disputed' : null)

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/** Groups expenses (already newest first) under "Today", "Yesterday" or "24 Oct". */
export function groupByDay(expenses, now = new Date()) {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const groups = []
  for (const expense of expenses) {
    const date = new Date(expense.occurredAt)
    const key = dayKey(date)
    let group = groups.at(-1)
    if (group?.key !== key) {
      const label =
        key === dayKey(now) ? 'Today'
        : key === dayKey(yesterday) ? 'Yesterday'
        : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
      group = { key, label, items: [] }
      groups.push(group)
    }
    group.items.push(expense)
  }
  return groups
}
