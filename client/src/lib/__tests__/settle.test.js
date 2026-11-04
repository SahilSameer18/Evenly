import { describe, it, expect } from 'vitest'
import { balanceWords, describeEntry, formulaOf, methodLabel, splitPending, withRole } from '../settle.js'
import { formatSigned } from '../money.js'
import { minorToAmountText, amountToMinor } from '../amount.js'

const person = (userId, name = userId) => ({ userId, name, active: true })

describe('withRole', () => {
  const s = { from: person('bob'), to: person('me'), amountMinor: 30000 }
  it('says whether I pay, get paid, or just watch', () => {
    expect(withRole(s, 'bob').role).toBe('payer')
    expect(withRole(s, 'me').role).toBe('payee')
    expect(withRole(s, 'carol').role).toBe('other')
  })
})

describe('splitPending', () => {
  const list = [
    { id: '1', status: 'pending', fromUserId: 'bob', toUserId: 'me' },
    { id: '2', status: 'pending', fromUserId: 'me', toUserId: 'bob' },
    { id: '3', status: 'confirmed', fromUserId: 'bob', toUserId: 'me' },
    { id: '4', status: 'pending', fromUserId: 'bob', toUserId: 'carol' },
  ]
  it('separates what needs my answer from what I wait on, and ignores the rest', () => {
    const { toAnswer, waiting } = splitPending(list, 'me')
    expect(toAnswer.map((s) => s.id)).toEqual(['1'])
    expect(waiting.map((s) => s.id)).toEqual(['2'])
  })
})

describe('the formula and the words', () => {
  it('formulaOf keeps the parts and they satisfy Paid - Share + Sent - Received = Net', () => {
    const f = formulaOf({ paidMinor: 206000, shareMinor: 168500, sentMinor: 2000, receivedMinor: 0, netMinor: 39500 })
    expect(f.paid - f.share + f.sent - f.received).toBe(f.net)
  })
  it('balanceWords uses words, not colour', () => {
    expect(balanceWords(37500)).toBe('You are owed ₹375')
    expect(balanceWords(-10000)).toBe('You owe ₹100')
    expect(balanceWords(0)).toBe('All even')
  })
  it('methodLabel gives readable names', () => {
    expect(methodLabel('upi')).toBe('UPI')
    expect(methodLabel('bank')).toBe('Bank transfer')
  })
})

describe('describeEntry', () => {
  const entry = (over) => ({ kind: 'expense', id: 'e1', at: '2026-11-04T10:00:00Z', label: 'Groceries', status: 'confirmed', counted: true, deltas: { me: 50000, bob: -50000 }, running: { me: 50000, bob: -50000 }, ...over })
  it('shows my effect and my running balance, and links expenses to their page', () => {
    expect(describeEntry(entry(), 'me')).toMatchObject({ effect: 50000, running: 50000, counted: true, note: null, href: '/expenses/e1' })
    expect(describeEntry(entry(), 'bob')).toMatchObject({ effect: -50000 })
  })
  it('marks entries that do not count, saying why', () => {
    expect(describeEntry(entry({ counted: false, status: 'pending', kind: 'repayment', deltas: { me: 0 } }), 'me')).toMatchObject({ note: 'Waiting for confirmation', href: null })
    expect(describeEntry(entry({ counted: false, status: 'reversed' }), 'me').note).toBe('Reversed')
  })
})

describe('money text helpers', () => {
  it('formatSigned always shows a sign for non-zero amounts', () => {
    expect(formatSigned(37500)).toBe('+₹375')
    expect(formatSigned(-10000)).toBe('−₹100')
    expect(formatSigned(0)).toBe('₹0')
  })
  it('minorToAmountText is the inverse of what the amount box parses', () => {
    expect(minorToAmountText(30000)).toBe('300')
    expect(minorToAmountText(30050)).toBe('300.50')
    expect(minorToAmountText(5)).toBe('0.05')
    for (const minor of [1, 99, 100, 12345, 1000000]) expect(amountToMinor(minorToAmountText(minor))).toBe(minor)
  })
})
