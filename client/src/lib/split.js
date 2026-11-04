import { LedgerError, splitByBasisPoints, splitByWeights, splitEqual, splitExact } from '@ledger'
import { minorToAmountText } from './amount.js'
import { formatMoney } from './money.js'

// The server picks who gets a leftover paisa with a hash seeded by the new expense's id, which does not exist
// yet, so the preview uses a stand-in seed. The saved expense shows the real shares.
const PREVIEW_SEED = 'preview'

const AMOUNT = /^\d+(\.\d{1,2})?$/
// "12.5" -> 1250 (paise for an amount, basis points for a percentage); null when it is not that shape.
function hundredths(text) {
  const t = text.trim().replace(/,/g, '')
  if (!AMOUNT.test(t)) return null
  const [whole, fraction = ''] = t.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

const BAD = {
  exact: 'Enter amounts like 120 or 120.50',
  percentage: 'Enter percentages like 50 or 33.33',
  weights: 'Weights are whole numbers like 1 or 2',
}

// Reads what the person typed per member. A blank box means zero and is left out of the split.
function readParts(method, { participants, rows }) {
  if (method === 'equal') {
    return participants.length ? { parts: participants.map((userId) => ({ userId, value: 1 })) } : { error: 'Pick at least one person' }
  }
  const parts = []
  for (const [userId, text] of Object.entries(rows)) {
    if (text.trim() === '') continue
    const value = method === 'weights' ? (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null) : hundredths(text)
    if (value === null) return { error: BAD[method] }
    if (value > 0) parts.push({ userId, value })
  }
  return parts.length ? { parts } : { error: method === 'exact' ? 'Assign the amount to at least one person' : 'Give at least one person a share' }
}

/**
 * Live preview of a split. Returns { shares, approximate } or { error } in plain words.
 * `approximate` is true when leftover paise exist, so the saved split may give the extra paisa to someone else.
 */
export function previewSplit(method, amountMinor, input) {
  if (!(amountMinor > 0)) return { error: 'Enter an amount first' }
  const read = readParts(method, input)
  if (read.error) return { error: read.error }
  const { parts } = read
  const sum = parts.reduce((s, p) => s + p.value, 0)

  if (method === 'exact' && sum !== amountMinor) {
    const diff = amountMinor - sum
    return { error: diff > 0 ? `${formatMoney(diff)} left to assign` : `${formatMoney(-diff)} too much` }
  }
  if (method === 'percentage' && sum !== 10000) return { error: `Percentages add up to ${sum / 100}%, they need to add up to 100%` }

  try {
    const people = parts.map((p) => ({ userId: p.userId }))
    let shares
    if (method === 'exact') shares = splitExact(amountMinor, parts.map((p) => ({ userId: p.userId, shareMinor: p.value })))
    else if (method === 'percentage') shares = splitByBasisPoints(amountMinor, parts.map((p) => ({ userId: p.userId, bps: p.value })), PREVIEW_SEED)
    else if (method === 'weights') shares = splitByWeights(amountMinor, parts.map((p) => ({ userId: p.userId, weight: p.value })), PREVIEW_SEED)
    else shares = splitEqual(amountMinor, people.map((p) => p.userId), PREVIEW_SEED)
    const total = method === 'equal' ? parts.length : sum
    const approximate = method !== 'exact' && parts.some((p) => (amountMinor * p.value) % total !== 0)
    return { shares, approximate }
  } catch (err) {
    if (err instanceof LedgerError) return { error: "Those numbers don't work for this split" }
    throw err
  }
}

/**
 * The starting state of the edit form for an existing expense. The server keeps only the shares of a percentage or
 * weights split (not the original inputs), so those open as exact amounts, which always add up.
 */
export function prefillFromExpense(expense) {
  const equal = expense.splitMethod === 'equal'
  return {
    type: expense.type,
    amountText: minorToAmountText(expense.amountMinor),
    description: expense.description,
    paidById: expense.paidById,
    method: equal ? 'equal' : 'exact',
    participants: expense.splits.map((s) => s.userId),
    rowsByMethod: { exact: Object.fromEntries(expense.splits.map((s) => [s.userId, minorToAmountText(s.shareMinor)])) },
    converted: !equal && expense.splitMethod !== 'exact',
  }
}

/** The request body for POST /expenses (and, with `version`, PATCH), exactly as the server's schemas expect it. */
export function buildExpenseBody({ type, description, amountMinor, notes, paidById, method, participants = [], rows = {}, version }) {
  // An edit sends the whole expense again plus the version that was edited.
  const common = { description: description.trim(), amountMinor, ...(notes?.trim() && { notes: notes.trim() }), ...(version != null && { version }) }
  if (type === 'personal') return { type: 'personal', ...common }

  const { parts } = readParts(method, { participants, rows })
  const split =
    method === 'equal' ? { method, participants }
    : method === 'exact' ? { method, shares: parts.map((p) => ({ userId: p.userId, shareMinor: p.value })) }
    : method === 'percentage' ? { method, parts: parts.map((p) => ({ userId: p.userId, bps: p.value })) }
    : { method, parts: parts.map((p) => ({ userId: p.userId, weight: p.value })) }
  return { type: 'shared', paidById, ...common, split }
}
