import { formatMoney } from './money.js'

const TITLES = {
  'expense.created': 'Added',
  'expense.updated': 'Edited',
  'expense.reversed': 'Reversed',
  'expense.disputed': 'Disputed',
  'expense.dispute_withdrawn': 'Dispute withdrawn',
  'expense.refunded': 'Refund recorded',
}

/** What changed in an edit, in words, from the before and after snapshots the server keeps. */
export function changesOf(before, after, nameOf) {
  if (!before || !after) return []
  const out = []
  if (before.description !== after.description) out.push(`Description: “${before.description}” to “${after.description}”`)
  if (before.amountMinor !== after.amountMinor) out.push(`Amount: ${formatMoney(before.amountMinor)} to ${formatMoney(after.amountMinor)}`)
  if (before.paidById !== after.paidById) out.push(`Paid by: ${nameOf(before.paidById)} to ${nameOf(after.paidById)}`)
  if ((before.splitMethod ?? null) !== (after.splitMethod ?? null)) out.push('How it was split changed')
  if ((before.notes ?? '') !== (after.notes ?? '')) out.push('Notes changed')
  return out
}

/** One audit event as a line for people: who, what, when, why, and what changed. */
export function describeEvent(event, nameOf) {
  return {
    id: event.id,
    title: `${TITLES[event.action] ?? 'Changed'} by ${event.actor?.name ?? 'someone'}`,
    at: event.createdAt,
    reason: event.reason ?? null,
    changes: event.action === 'expense.updated' ? changesOf(event.before, event.after, nameOf) : [],
  }
}
