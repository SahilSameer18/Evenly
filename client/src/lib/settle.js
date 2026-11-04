import { formatMoney } from './money.js'

export const METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['bank', 'Bank transfer'], ['other', 'Other']]
export const methodLabel = (method) => METHODS.find(([value]) => value === method)?.[1] ?? method

/** One suggestion row from the point of view of one person: do they pay, get paid, or just watch. */
export const withRole = (suggestion, myId) => ({
  ...suggestion,
  role: suggestion.from.userId === myId ? 'payer' : suggestion.to.userId === myId ? 'payee' : 'other',
})

/** Pending repayments split into what needs my answer (sent to me) and what I am waiting on (sent by me). */
export function splitPending(settlements, myId) {
  return {
    toAnswer: settlements.filter((s) => s.status === 'pending' && s.toUserId === myId),
    waiting: settlements.filter((s) => s.status === 'pending' && s.fromUserId === myId),
  }
}

/** The formula behind a balance, with the real numbers: Paid - Share + Sent - Received = Net. */
export const formulaOf = (m) => ({ paid: m.paidMinor, share: m.shareMinor, sent: m.sentMinor, received: m.receivedMinor, net: m.netMinor })

/** A balance in words: always a sign or words, never colour alone. */
export function balanceWords(minor) {
  if (minor > 0) return `You are owed ${formatMoney(minor)}`
  if (minor < 0) return `You owe ${formatMoney(-minor)}`
  return 'All even'
}

const NOT_COUNTED = { pending: 'Waiting for confirmation', reversed: 'Reversed', rejected: 'Rejected', cancelled: 'Cancelled' }

/** One ledger entry as it affects one person. */
export function describeEntry(entry, myId) {
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    at: entry.at,
    effect: entry.deltas[myId] ?? 0,
    running: entry.running[myId] ?? 0,
    counted: entry.counted,
    note: entry.counted ? null : (NOT_COUNTED[entry.status] ?? 'Not counted'),
    href: entry.kind === 'repayment' ? null : `/expenses/${entry.id}`,
  }
}
