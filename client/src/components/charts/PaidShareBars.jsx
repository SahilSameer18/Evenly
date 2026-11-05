import { formatMoney, formatSigned } from '../../lib/money.js'
import { stagger } from '../../lib/motion.js'
import { ChartCard, ChartEmpty, Swatch } from './ChartCard.jsx'

const PAID = 'bg-owed'
const SHARE = 'bg-ink-2/70'

// One bar, as wide as its value against the largest value on the chart; the exact amount sits in a fixed column.
function Bar({ label, value, max, tone, index }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-xs text-ink-2">{label}</span>
      <div className="relative h-3 flex-1">
        <span style={{ width: `${(Math.max(value, 0) / max) * 100}%`, ...stagger(index) }} className={`grow-x absolute inset-y-0 left-0 rounded-r-[4px] ${tone}`} />
      </div>
      <span className="num w-[5.5rem] shrink-0 text-right text-xs">{formatMoney(value)}</span>
    </div>
  )
}

/** Paid against share for each person: who has been covering whom. `members` carry paidMinor and shareMinor. */
export function PaidShareBars({ members, title = 'Paid and share', subtitle }) {
  const people = members.filter((m) => m.active !== false || m.paidMinor !== 0 || m.shareMinor !== 0)
  const max = Math.max(1, ...people.flatMap((m) => [m.paidMinor, m.shareMinor]))
  const table = {
    columns: ['Person', 'Paid', 'Share', 'Difference'],
    rows: people.map((m) => [m.name, formatMoney(m.paidMinor), formatMoney(m.shareMinor), formatSigned(m.paidMinor - m.shareMinor)]),
  }
  return (
    <ChartCard title={title} subtitle={subtitle} table={people.length ? table : null}>
      {people.length === 0 || max === 1 ? (
        <ChartEmpty>Nothing to compare yet. Add an expense and each person's paid and share will show here.</ChartEmpty>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-4 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><Swatch className={PAID} />Paid</span>
            <span className="inline-flex items-center gap-1.5"><Swatch className={SHARE} />Share</span>
          </p>
          <ul className="flex flex-col gap-4">
            {people.map((m, i) => (
              <li key={m.userId}>
                <p className="mb-1 truncate font-medium">{m.name}</p>
                <div className="flex flex-col gap-1.5">
                  <Bar label="Paid" value={m.paidMinor} max={max} tone={PAID} index={i} />
                  <Bar label="Share" value={m.shareMinor} max={max} tone={SHARE} index={i} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartCard>
  )
}
