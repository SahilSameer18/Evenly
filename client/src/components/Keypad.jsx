import { pressKey } from '../lib/amount.js'
import { Icon } from './Icon.jsx'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']
const LABEL = { back: 'Backspace', '.': 'Decimal point' }

// The on-screen amount keypad for phones. Keys stay 44 px high even on a short (landscape) screen.
export function Keypad({ value, onChange }) {
  return (
    <div role="group" aria-label="Amount keypad" className="grid grid-cols-3 gap-1.5 landscape:max-md:gap-1">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={LABEL[key] ?? key}
          onClick={() => onChange(pressKey(value, key))}
          className="num inline-flex min-h-12 items-center justify-center rounded-2xl border border-edge bg-panel text-xl active:opacity-70 landscape:max-md:min-h-11"
        >
          {key === 'back' ? <Icon name="backspace" /> : key}
        </button>
      ))}
    </div>
  )
}
