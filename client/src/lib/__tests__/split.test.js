import { describe, it, expect } from 'vitest'
import { buildExpenseBody, previewSplit } from '../split.js'
// The server's own request schema: the client's bodies must satisfy exactly what the server checks.
import { createExpenseBody } from '../../../../server/src/modules/expenses/expense.validation.js'

const A = 'user-a'
const B = 'user-b'
const C = 'user-c'
const sum = (shares) => shares.reduce((s, x) => s + x.shareMinor, 0)

describe('previewSplit', () => {
  it('equal: splits evenly when it can', () => {
    const r = previewSplit('equal', 125000, { participants: [A, B], rows: {} })
    expect(r.shares).toEqual([{ userId: A, shareMinor: 62500 }, { userId: B, shareMinor: 62500 }])
    expect(r.approximate).toBe(false)
  })

  it('equal: an uneven amount still adds up and is marked approximate', () => {
    const r = previewSplit('equal', 10001, { participants: [A, B], rows: {} })
    expect(sum(r.shares)).toBe(10001)
    expect(r.shares.map((s) => s.shareMinor).sort()).toEqual([5000, 5001])
    expect(r.approximate).toBe(true)
  })

  it('equal: three people and 100 rupees always add up', () => {
    expect(sum(previewSplit('equal', 10000, { participants: [A, B, C], rows: {} }).shares)).toBe(10000)
  })

  it('exact: needs the amounts to add up and says how far off it is', () => {
    expect(previewSplit('exact', 10000, { participants: [], rows: { [A]: '60', [B]: '30' } }).error).toBe('₹10 left to assign')
    expect(previewSplit('exact', 10000, { participants: [], rows: { [A]: '60', [B]: '50' } }).error).toBe('₹10 too much')
    const ok = previewSplit('exact', 10000, { participants: [], rows: { [A]: '60.50', [B]: '39.50' } })
    expect(ok.shares).toEqual([{ userId: A, shareMinor: 6050 }, { userId: B, shareMinor: 3950 }])
    expect(ok.approximate).toBe(false)
  })

  it('percentage: needs 100 and says what it adds up to', () => {
    expect(previewSplit('percentage', 10000, { participants: [], rows: { [A]: '50', [B]: '40' } }).error).toBe('Percentages add up to 90%, they need to add up to 100%')
    const r = previewSplit('percentage', 10000, { participants: [], rows: { [A]: '33.33', [B]: '33.33', [C]: '33.34' } })
    expect(sum(r.shares)).toBe(10000)
  })

  it('weights: shares follow the weights and add up', () => {
    const r = previewSplit('weights', 9000, { participants: [], rows: { [A]: '2', [B]: '1' } })
    expect(r.shares).toEqual([{ userId: A, shareMinor: 6000 }, { userId: B, shareMinor: 3000 }])
  })

  it.each([
    ['no amount yet', 'equal', 0, { participants: [A], rows: {} }, 'Enter an amount first'],
    ['nobody picked', 'equal', 100, { participants: [], rows: {} }, 'Pick at least one person'],
    ['text in an exact box', 'exact', 100, { participants: [], rows: { [A]: 'abc' } }, 'Enter amounts like 120 or 120.50'],
    ['three decimals in an exact box', 'exact', 100, { participants: [], rows: { [A]: '1.234' } }, 'Enter amounts like 120 or 120.50'],
    ['text in a percentage box', 'percentage', 100, { participants: [], rows: { [A]: 'x' } }, 'Enter percentages like 50 or 33.33'],
    ['a decimal weight', 'weights', 100, { participants: [], rows: { [A]: '1.5' } }, 'Weights are whole numbers like 1 or 2'],
    ['nothing in any box', 'weights', 100, { participants: [], rows: { [A]: '', [B]: '' } }, 'Give at least one person a share'],
  ])('explains %s in words', (_label, method, amount, input, message) => {
    expect(previewSplit(method, amount, input)).toEqual({ error: message })
  })
})

describe('buildExpenseBody: contract with the server', () => {
  const base = { description: '  Groceries ', amountMinor: 125000, paidById: A }
  const bodies = {
    'shared equal': { ...base, type: 'shared', method: 'equal', participants: [A, B] },
    'shared exact': { ...base, type: 'shared', method: 'exact', rows: { [A]: '1000', [B]: '250' } },
    'shared percentage': { ...base, type: 'shared', method: 'percentage', rows: { [A]: '60', [B]: '40' } },
    'shared weights': { ...base, type: 'shared', method: 'weights', rows: { [A]: '2', [B]: '1' } },
    'personal': { ...base, type: 'personal' },
    'shared with notes': { ...base, type: 'shared', method: 'equal', participants: [A, B], notes: ' for the week ' },
  }

  it.each(Object.entries(bodies))('%s is accepted by the server schema', (_name, form) => {
    const parsed = createExpenseBody.safeParse(buildExpenseBody(form))
    expect(parsed.error?.issues).toBeUndefined()
    expect(parsed.success).toBe(true)
    expect(parsed.data.description).toBe('Groceries')
  })

  it('a personal body carries no payer and no split (the server refuses them)', () => {
    const body = buildExpenseBody(bodies.personal)
    expect(body).toEqual({ type: 'personal', description: 'Groceries', amountMinor: 125000 })
  })

  it('the contract test bites: a malformed body is refused by the same schema', () => {
    expect(createExpenseBody.safeParse({ ...buildExpenseBody(bodies['shared equal']), extra: 1 }).success).toBe(false)
    expect(createExpenseBody.safeParse({ ...buildExpenseBody(bodies['shared equal']), amountMinor: 12.5 }).success).toBe(false)
  })

  it('percent text becomes basis points, blanks are left out', () => {
    const body = buildExpenseBody({ ...bodies['shared percentage'], rows: { [A]: '33.33', [B]: '66.67', [C]: '' } })
    expect(body.split).toEqual({ method: 'percentage', parts: [{ userId: A, bps: 3333 }, { userId: B, bps: 6667 }] })
  })
})
