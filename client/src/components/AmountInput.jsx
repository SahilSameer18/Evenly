import { groupAmountText, sanitizeAmount } from '../lib/amount.js'
import { Field } from './Field.jsx'
import { Keypad } from './Keypad.jsx'

// Amount entry shared by expenses and repayments. Phones show the amount big with the on-screen keypad;
// desktop has a normal text field (typing and pasting work). Both edit the same text.
export function AmountInput({ value, onChange, error }) {
  return (
    <>
      <div className="md:hidden">
        <p aria-live="polite" aria-label={`Amount: ${value || '0'} rupees`} className="num flex items-baseline justify-center gap-1 text-[clamp(2.25rem,13vw,3.5rem)] leading-tight">
          <span className="text-[0.5em] text-ink-2">₹</span>
          <span className={value ? '' : 'text-ink-2'}>{groupAmountText(value) || '0'}</span>
        </p>
        {error && <p className="text-center text-owe">{error}</p>}
        <div className="mt-2"><Keypad value={value} onChange={onChange} /></div>
      </div>
      <div className="hidden md:block">
        <Field label="Amount (₹)" inputMode="decimal" autoFocus placeholder="0" value={value} onChange={(e) => onChange(sanitizeAmount(e.target.value))} error={error} />
      </div>
    </>
  )
}
