import { describe, it, expect } from 'vitest'
import { addMonths, balanceLine, balanceSeries, changeText, currentMonthIn, monthLabel, monthName, niceTicks, summaryText } from '../charts.js'
import { formatMoneyCompact } from '../money.js'

describe('niceTicks', () => {
  it('covers the range with round steps', () => {
    const { ticks, min, max } = niceTicks(0, 87000, 4)
    expect(ticks).toEqual([0, 25000, 50000, 75000, 100000])
    expect([min, max]).toEqual([0, 100000])
  })

  it('includes negatives and always spans the given range', () => {
    const { ticks, min, max } = niceTicks(-30000, 70000, 4)
    expect(min).toBeLessThanOrEqual(-30000)
    expect(max).toBeGreaterThanOrEqual(70000)
    expect(ticks).toContain(0)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
  })

  it('copes with a flat range', () => {
    const { ticks } = niceTicks(0, 0, 3)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks[0]).toBe(0)
  })
})

describe('balanceSeries', () => {
  const ledger = {
    entries: [
      { kind: 'expense', at: '2026-10-01T00:00:00Z', label: 'Groceries', counted: true, deltas: { me: 100, bob: -100 }, running: { me: 100, bob: -100 } },
      { kind: 'expense', at: '2026-10-02T00:00:00Z', label: 'Reversed one', counted: false, deltas: { me: 0, bob: 0 }, running: { me: 100, bob: -100 } },
      { kind: 'expense', at: '2026-10-03T00:00:00Z', label: 'Not mine', counted: true, deltas: { me: 0, carol: 5, bob: -5 }, running: { me: 100, bob: -105 } },
      { kind: 'repayment', at: '2026-10-04T00:00:00Z', label: 'Repayment (upi)', counted: true, deltas: { me: -60, bob: 60 }, running: { me: 40, bob: -45 } },
    ],
  }

  it('keeps only what counted and moved my balance, with the balance after each', () => {
    expect(balanceSeries(ledger, 'me').map((p) => [p.label, p.delta, p.value])).toEqual([['Groceries', 100, 100], ['Repayment (upi)', -60, 40]])
  })
})

describe('months', () => {
  it('names them', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(monthLabel('2026-11', true)).toBe('Nov')
    expect(monthName('2026-10')).toBe('October')
  })

  it('moves across year ends', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('reads the current month on the household clock, as the server does', () => {
    const instant = new Date('2026-10-31T18:40:00Z')
    expect(currentMonthIn('Asia/Kolkata', instant)).toBe('2026-11')
    expect(currentMonthIn('UTC', instant)).toBe('2026-10')
  })
})

describe('changeText', () => {
  it('says the direction in words', () => {
    expect(changeText(1120, 1000, 'October')).toBe('Up 12% from October')
    expect(changeText(500, 1000, 'October')).toBe('Down 50% from October')
    expect(changeText(1000, 1000, 'October')).toBe('Same as October')
    expect(changeText(1001, 1000, 'October')).toBe('Up slightly from October')
  })

  it('does not divide by nothing', () => {
    expect(changeText(500, 0, 'October')).toBe('Nothing recorded in October')
    expect(changeText(0, 0, 'October')).toBe('No spending recorded yet')
  })
})

describe('formatMoneyCompact', () => {
  it('shortens for axes and keeps the sign', () => {
    expect(formatMoneyCompact(0)).toBe('₹0')
    expect(formatMoneyCompact(150000)).toBe('₹1.5K')
    expect(formatMoneyCompact(-80000)).toBe('−₹800')
  })
})

describe('the shareable summary', () => {
  const report = {
    month: '2026-11', spendMinor: 460000, previousSpendMinor: 400000,
    members: [{ userId: 'a', name: 'Alice', paidMinor: 260000, shareMinor: 230000 }, { userId: 'b', name: 'Bob', paidMinor: 200000, shareMinor: 230000 }],
  }

  it('reads well as plain text', () => {
    const text = summaryText(report, 'Flat 302', [{ name: 'Alice', active: true, netMinor: 30000 }, { name: 'Bob', active: true, netMinor: -30000 }])
    expect(text).toBe([
      'Evenly · Flat 302',
      'November 2026',
      '',
      'Shared spending: ₹4,600 (up 15% from October)',
      '',
      'Alice: paid ₹2,600, share ₹2,300',
      'Bob: paid ₹2,000, share ₹2,300',
      '',
      'Right now: Alice is owed ₹300. Bob owes ₹300.',
    ].join('\n'))
  })

  it('leaves the balance line out when balances are not known, and says settled when they are', () => {
    expect(summaryText(report, 'Flat 302')).not.toContain('Right now')
    expect(balanceLine([{ name: 'Alice', active: true, netMinor: 0 }])).toBe('Everyone is settled up.')
  })
})
