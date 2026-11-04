import { describe, it, expect } from 'vitest'
import { amountToMinor, groupAmountText, pressKey, sanitizeAmount } from '../amount.js'

const type = (keys) => [...keys].reduce((v, k) => pressKey(v, k === '<' ? 'back' : k), '')

describe('keypad', () => {
  it('builds an amount from digits', () => expect(type('1250')).toBe('1250'))
  it('no leading zeros', () => {
    expect(type('0')).toBe('0')
    expect(type('007')).toBe('7')
    expect(type('00')).toBe('0')
  })
  it('one dot only, and a leading dot becomes 0.', () => {
    expect(type('12.5.5')).toBe('12.55')
    expect(type('.')).toBe('0.')
    expect(type('.5')).toBe('0.5')
  })
  it('at most two decimals', () => expect(type('1.234')).toBe('1.23'))
  it('backspace removes one character and is safe on empty', () => {
    expect(type('123<')).toBe('12')
    expect(type('<<')).toBe('')
  })
  it('stops at the server limit of 8 whole digits', () => expect(type('123456789')).toBe('12345678'))
})

describe('sanitizeAmount (typing or pasting on desktop)', () => {
  it.each([
    ['₹1,250.50', '1250.50'],
    ['abc', ''],
    ['12..5', '12.5'],
    ['0012', '12'],
    ['1.239', '1.23'],
    ['', ''],
  ])('%j -> %j', (input, out) => expect(sanitizeAmount(input)).toBe(out))
})

describe('showing and parsing', () => {
  it('groups in the Indian style while typing', () => {
    expect(groupAmountText('1250.5')).toBe('1,250.5')
    expect(groupAmountText('12500000')).toBe('1,25,00,000')
    expect(groupAmountText('1250.')).toBe('1,250.')
    expect(groupAmountText('')).toBe('')
  })
  it('turns what was typed into paise, 0 while incomplete', () => {
    expect(amountToMinor('1250.5')).toBe(125050)
    expect(amountToMinor('12.')).toBe(1200)
    expect(amountToMinor('')).toBe(0)
    expect(amountToMinor('.')).toBe(0)
  })
})
