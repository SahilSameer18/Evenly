import { describe, it, expect } from 'vitest'
import { formatMoney, toMinor } from '../money.js'

describe('toMinor', () => {
  it.each([
    ['1,250.5', 125050],
    ['1250', 125000],
    ['0.05', 5],
    ['  99.99 ', 9999],
    ['1,00,000', 10000000],
    ['0', 0],
  ])('parses %s as %i paise', (input, minor) => expect(toMinor(input)).toBe(minor))

  it.each(['1.234', 'abc', '', '-5', '1.', '.5', '1e3', '₹5'])('rejects %j', (input) => {
    expect(() => toMinor(input)).toThrow('INVALID_AMOUNT')
  })
})

describe('formatMoney', () => {
  const clean = (s) => s.replace(/\s/g, ' ')
  it('uses Indian grouping and drops zero paise', () => {
    expect(clean(formatMoney(260000))).toBe('₹2,600')
    expect(clean(formatMoney(12500000))).toBe('₹1,25,000')
  })
  it('keeps paise when there are some', () => {
    expect(clean(formatMoney(125050))).toBe('₹1,250.50')
    expect(clean(formatMoney(5))).toBe('₹0.05')
  })
  it('shows negatives', () => {
    expect(clean(formatMoney(-60000))).toContain('600')
    expect(formatMoney(-60000)).toMatch(/^[-−]/)
  })
})
