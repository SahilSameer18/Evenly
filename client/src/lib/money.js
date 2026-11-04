// DISPLAY AND INPUT ONLY. Money is whole paise everywhere; the server does all the arithmetic.
const format = (digits) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: digits, maximumFractionDigits: digits })
const whole = format(0)
const withPaise = format(2)

// Whole rupees show no decimals (₹2,600); anything else always shows both paise digits (₹1,250.50).
export const formatMoney = (minor) => (minor % 100 === 0 ? whole : withPaise).format(minor / 100)

/** With a sign, for balances and changes: +₹375, −₹100, ₹0. */
export const formatSigned = (minor) => (minor > 0 ? `+${formatMoney(minor)}` : minor < 0 ? `−${formatMoney(-minor)}` : formatMoney(0))

/** "1,250.5" -> 125050. Throws INVALID_AMOUNT for anything that is not a plain amount with at most two decimals. */
export function toMinor(input) {
  const m = String(input).replace(/,/g, '').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) throw new Error('INVALID_AMOUNT')
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}
