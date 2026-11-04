import { describe, it, expect } from 'vitest'
import { allowedActions, disputerOf } from '../permissions.js'
import { changesOf, describeEvent } from '../history.js'

const e = (over = {}) => ({ id: 'e1', type: 'shared', status: 'confirmed', createdById: 'alice', ...over })
const only = (actions) => Object.entries(actions).filter(([, v]) => v).map(([k]) => k).sort()

describe('allowedActions', () => {
  it('the person who recorded it may edit and reverse, not dispute', () => {
    expect(only(allowedActions(e(), 'alice'))).toEqual(['edit', 'reverse'])
  })
  it('another member may dispute, not edit or reverse', () => {
    expect(only(allowedActions(e(), 'bob'))).toEqual(['dispute'])
  })
  it('a disputed expense: the recorder can still edit or reverse; only the disputer can withdraw', () => {
    const disputed = e({ status: 'disputed' })
    expect(only(allowedActions(disputed, 'alice', 'bob'))).toEqual(['edit', 'reverse'])
    expect(only(allowedActions(disputed, 'bob', 'bob'))).toEqual(['withdraw'])
    expect(only(allowedActions(disputed, 'carol', 'bob'))).toEqual([])
  })
  it('a reversed expense allows nothing', () => {
    expect(only(allowedActions(e({ status: 'reversed' }), 'alice'))).toEqual([])
    expect(only(allowedActions(e({ status: 'reversed' }), 'bob'))).toEqual([])
  })
  it('a refund can be reversed but not edited', () => {
    expect(only(allowedActions(e({ type: 'refund' }), 'alice'))).toEqual(['reverse'])
  })
  it('an on-behalf expense is not editable here', () => {
    expect(only(allowedActions(e({ type: 'on_behalf' }), 'alice'))).toEqual(['reverse'])
  })
  it('a personal expense can be changed by its owner and is never disputed', () => {
    expect(only(allowedActions(e({ type: 'personal' }), 'alice'))).toEqual(['edit', 'reverse'])
    expect(only(allowedActions(e({ type: 'personal' }), 'bob'))).toEqual([])
  })
})

describe('disputerOf', () => {
  const ev = (action, id) => ({ action, actor: { id } })
  it('is the latest person who disputed, and nobody after a withdrawal', () => {
    expect(disputerOf([ev('expense.created', 'alice'), ev('expense.disputed', 'bob')])).toBe('bob')
    expect(disputerOf([ev('expense.disputed', 'bob'), ev('expense.dispute_withdrawn', 'bob')])).toBeNull()
    expect(disputerOf([ev('expense.disputed', 'bob'), ev('expense.dispute_withdrawn', 'bob'), ev('expense.disputed', 'carol')])).toBe('carol')
    expect(disputerOf(undefined)).toBeNull()
  })
})

describe('history wording', () => {
  const nameOf = (id) => ({ alice: 'Alice', bob: 'Bob' })[id] ?? 'Someone'
  it('lists what an edit changed', () => {
    const before = { description: 'Groceries', amountMinor: 100000, paidById: 'alice', splitMethod: 'equal', notes: null }
    const after = { description: 'Weekly groceries', amountMinor: 125000, paidById: 'bob', splitMethod: 'equal', notes: null }
    expect(changesOf(before, after, nameOf)).toEqual(['Description: “Groceries” to “Weekly groceries”', 'Amount: ₹1,000 to ₹1,250', 'Paid by: Alice to Bob'])
  })
  it('says nothing for an edit that changed nothing visible, and survives missing snapshots', () => {
    const same = { description: 'A', amountMinor: 100, paidById: 'alice', splitMethod: 'equal' }
    expect(changesOf(same, same, nameOf)).toEqual([])
    expect(changesOf(null, same, nameOf)).toEqual([])
  })
  it('titles every kind of event with who did it, and keeps the reason', () => {
    const base = { id: 'x', createdAt: '2026-11-04T10:00:00Z', actor: { id: 'bob', name: 'Bob' } }
    expect(describeEvent({ ...base, action: 'expense.created' }, nameOf).title).toBe('Added by Bob')
    expect(describeEvent({ ...base, action: 'expense.reversed', reason: 'Entered twice' }, nameOf)).toMatchObject({ title: 'Reversed by Bob', reason: 'Entered twice' })
    expect(describeEvent({ ...base, action: 'expense.dispute_withdrawn' }, nameOf).title).toBe('Dispute withdrawn by Bob')
    expect(describeEvent({ ...base, action: 'expense.mystery' }, nameOf).title).toBe('Changed by Bob')
  })
})
