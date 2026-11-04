import { formatMoney } from '../lib/money.js'
import { Avatar } from './Panel.jsx'

const METHODS = [['equal', 'Equally'], ['percentage', 'Percent'], ['exact', 'Exact'], ['weights', 'Weights']]
const UNIT = { exact: '₹', percentage: '%', weights: '×' }

const chip = (on) => `min-h-11 rounded-full border px-4 font-medium transition-colors duration-150 active:scale-[0.97] ${on ? 'border-transparent bg-action text-on-action' : 'border-edge text-ink'}`

// Chooses how an expense is shared and shows each person's share live, using the same maths the server will use.
export function SplitEditor({ method, onMethod, members, participants, onParticipants, rows, onRows, preview }) {
  const shareOf = (id) => preview.shares?.find((s) => s.userId === id)?.shareMinor
  const toggle = (id) => onParticipants(participants.includes(id) ? participants.filter((p) => p !== id) : [...participants, id])

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="How to split" className="flex flex-wrap gap-2">
        {METHODS.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={method === value} onClick={() => onMethod(value)} className={chip(method === value)}>{label}</button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const share = shareOf(m.userId)
          return (
            <li key={m.userId} className="flex items-center gap-2 sm:gap-3">
              <Avatar name={m.name} size={32} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {method === 'equal' ? (
                <button type="button" aria-pressed={participants.includes(m.userId)} aria-label={`${m.name} shares this expense`} onClick={() => toggle(m.userId)} className={`${chip(participants.includes(m.userId))} min-w-14 px-3`}>
                  {participants.includes(m.userId) ? 'In' : 'Out'}
                </button>
              ) : (
                <label className="flex items-center gap-1 text-ink-2">
                  <span aria-hidden="true">{UNIT[method]}</span>
                  <input
                    aria-label={`${m.name}: ${method === 'exact' ? 'amount' : method === 'percentage' ? 'percentage' : 'weight'}`}
                    inputMode={method === 'weights' ? 'numeric' : 'decimal'}
                    value={rows[m.userId] ?? ''}
                    onChange={(e) => onRows({ ...rows, [m.userId]: e.target.value })}
                    className="min-h-11 w-16 rounded-xl border border-edge bg-panel px-2 text-right text-ink sm:w-20"
                  />
                </label>
              )}
              <span className="num w-[4.5rem] shrink-0 text-right sm:w-24">{share === undefined ? '–' : formatMoney(share)}</span>
            </li>
          )
        })}
      </ul>

      {preview.error ? (
        <p role="status" className="text-ink-2">{preview.error}</p>
      ) : (
        preview.approximate && <p className="text-xs text-ink-2">When this doesn't divide evenly, the extra paise are assigned fairly when you save.</p>
      )}
    </div>
  )
}
