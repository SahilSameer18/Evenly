import { formatMoney } from './money.js'

// Pure helpers for the charts and the monthly report. Money is whole paise throughout; nothing here does ledger arithmetic.

/**
 * Round axis ticks that cover [lo, hi] (the range always includes both), about `target` of them.
 * Steps are 1, 2, 2.5 or 5 times a power of ten, so labels read as clean numbers.
 */
export function niceTicks(lo, hi, target = 4) {
  if (hi === lo) { hi = lo + (Math.abs(lo) || 100); }
  const rough = (hi - lo) / Math.max(target, 1)
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks = []
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t))
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1] }
}

/**
 * Your balance after each thing that changed it, oldest first, from the /ledger answer.
 * Entries that did not count (reversed, unconfirmed) or did not move your balance are left out.
 */
export function balanceSeries(ledger, userId) {
  return ledger.entries
    .filter((e) => e.counted && e.deltas[userId] !== 0)
    .map((e) => ({ at: new Date(e.at), label: e.label, kind: e.kind, delta: e.deltas[userId], value: e.running[userId] }))
}

const UTC = { timeZone: 'UTC' }
const asDate = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)) }

/** "2026-11" -> "Nov" (short) or "November 2026". */
export const monthLabel = (month, short = false) =>
  short
    ? new Intl.DateTimeFormat('en-IN', { month: 'short', ...UTC }).format(asDate(month)).slice(0, 3) // en-IN says "Sept"
    : new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', ...UTC }).format(asDate(month))

export const monthName = (month) => new Intl.DateTimeFormat('en-IN', { month: 'long', ...UTC }).format(asDate(month))

/** "5 Nov" */
export const shortDate = (date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date)

/** The month it is now on the wall clock of `timeZone`, as "YYYY-MM" (the same rule the server uses). */
export function currentMonthIn(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now)
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "Up 12% from October" in words, so the direction never rests on colour alone. */
export function changeText(current, previous, previousName) {
  if (current === 0 && previous === 0) return 'No spending recorded yet'
  if (previous === 0) return `Nothing recorded in ${previousName}`
  if (current === previous) return `Same as ${previousName}`
  const pct = Math.round((Math.abs(current - previous) / previous) * 100)
  const direction = current > previous ? 'Up' : 'Down'
  return pct === 0 ? `${direction} slightly from ${previousName}` : `${direction} ${pct}% from ${previousName}`
}

/** Who is owed and who owes, in a sentence: "Alice is owed ₹300. Bob owes ₹300." */
export function balanceLine(members) {
  const active = members.filter((m) => m.active)
  const owed = active.filter((m) => m.netMinor > 0).map((m) => `${m.name} is owed ${formatMoney(m.netMinor)}`)
  const owing = active.filter((m) => m.netMinor < 0).map((m) => `${m.name} owes ${formatMoney(-m.netMinor)}`)
  return owed.length + owing.length === 0 ? 'Everyone is settled up.' : [...owed, ...owing].join('. ') + '.'
}

/** A plain-text summary that reads well pasted into WhatsApp. `balances` is the /balances members list, optional. */
export function summaryText(report, householdName, balances) {
  const previousName = monthName(addMonths(report.month, -1))
  const lines = [
    `Evenly · ${householdName}`,
    monthLabel(report.month),
    '',
    `Shared spending: ${formatMoney(report.spendMinor)} (${changeText(report.spendMinor, report.previousSpendMinor, previousName).replace(/^./, (c) => c.toLowerCase())})`,
    '',
    ...report.members.map((m) => `${m.name}: paid ${formatMoney(m.paidMinor)}, share ${formatMoney(m.shareMinor)}`),
  ]
  if (balances) lines.push('', `Right now: ${balanceLine(balances)}`)
  return lines.join('\n')
}
