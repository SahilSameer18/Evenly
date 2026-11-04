import { toMinor } from './money.js'

const MAX_WHOLE_DIGITS = 8 // the server caps an expense at ₹1,00,00,000

/** Cleans what was typed or pasted into an amount: digits and at most one dot, two decimals, no leading zeros. */
export function sanitizeAmount(text) {
  const cleaned = text.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  let whole = dot === -1 ? cleaned : cleaned.slice(0, dot)
  const fraction = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  whole = whole.replace(/^0+(?=\d)/, '').slice(0, MAX_WHOLE_DIGITS)
  if (fraction === null) return whole
  return `${whole || '0'}.${fraction}`
}

/** One press of the on-screen keypad: a digit, '.', or 'back'. */
export function pressKey(value, key) {
  if (key === 'back') return value.slice(0, -1)
  return sanitizeAmount(value + key)
}

/** "1250.5" -> "1,250.5", for showing while typing (Indian grouping). */
export function groupAmountText(text) {
  if (!text) return ''
  const [whole, fraction] = text.split('.')
  const grouped = Number(whole).toLocaleString('en-IN')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/** Typed amount to paise; 0 when it is empty or not a number yet. */
export function amountToMinor(text) {
  try {
    return toMinor(text.replace(/\.$/, ''))
  } catch {
    return 0
  }
}
