import { describe, it, expect } from 'vitest'
import { effectOn, groupByDay, statusLabel } from '../expenses.js'

const me = 'me'
const bob = 'bob'
const expense = (over = {}) => ({
  id: 'e', type: 'shared', status: 'confirmed', amountMinor: 100000, paidById: me, occurredAt: '2026-11-04T10:00:00Z',
  splits: [{ userId: me, shareMinor: 50000 }, { userId: bob, shareMinor: 50000 }], ...over,
})

describe('effectOn', () => {
  it('payer: paid minus own share', () => expect(effectOn(expense(), me)).toBe(50000))
  it('non-payer: minus own share', () => expect(effectOn(expense({ paidById: bob }), me)).toBe(-50000))
  it('someone not in the split and not paying is unaffected', () => expect(effectOn(expense(), 'carol')).toBe(0))
  it('a refund works the other way round', () => {
    expect(effectOn(expense({ type: 'refund', paidById: bob }), me)).toBe(50000)
    expect(effectOn(expense({ type: 'refund', paidById: me }), me)).toBe(-50000)
  })
  it('personal and reversed expenses have no effect', () => {
    expect(effectOn(expense({ type: 'personal' }), me)).toBeNull()
    expect(effectOn(expense({ status: 'reversed' }), me)).toBeNull()
  })
  it('a disputed expense still counts, like the ledger', () => expect(effectOn(expense({ status: 'disputed' }), me)).toBe(50000))
})

describe('statusLabel', () => {
  it.each([['reversed', 'Reversed'], ['disputed', 'Disputed'], ['confirmed', null]])('%s -> %s', (status, label) => {
    expect(statusLabel({ status })).toBe(label)
  })
})

describe('groupByDay', () => {
  const now = new Date(2026, 10, 4, 15, 0)
  const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString()

  it('groups newest-first rows under Today, Yesterday and a date', () => {
    const groups = groupByDay([
      expense({ id: '1', occurredAt: at(2026, 10, 4, 14) }),
      expense({ id: '2', occurredAt: at(2026, 10, 4, 9) }),
      expense({ id: '3', occurredAt: at(2026, 10, 3) }),
      expense({ id: '4', occurredAt: at(2026, 9, 24) }),
    ], now)
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([['Today', ['1', '2']], ['Yesterday', ['3']], ['24 Oct', ['4']]])
  })

  it('adds the year for another year', () => {
    expect(groupByDay([expense({ occurredAt: at(2025, 11, 31) })], now)[0].label).toMatch(/2025/)
  })

  it('returns nothing for nothing', () => expect(groupByDay([], now)).toEqual([]))
})
