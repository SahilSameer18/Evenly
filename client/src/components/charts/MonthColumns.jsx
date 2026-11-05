import { formatMoney, formatMoneyCompact } from '../../lib/money.js'
import { stagger } from '../../lib/motion.js'
import { monthLabel, niceTicks } from '../../lib/charts.js'
import { ChartCard, ChartEmpty } from './ChartCard.jsx'

const PLOT = 'h-40' // the plot is 160 px tall; marks and grid lines are placed by percentage

/**
 * Spending by month as columns, the chosen month in the accent and the rest in grey (emphasis, not a rainbow).
 * Each column is a button that picks that month. `trend` is [{ month: "2026-11", spendMinor }].
 */
export function MonthColumns({ trend, selected, onSelect, title = 'Spending by month', subtitle }) {
  const max = Math.max(0, ...trend.map((t) => t.spendMinor))
  const { ticks, max: top } = niceTicks(0, max, 3)
  const pct = (v) => `${(v / top) * 100}%`
  const table = { columns: ['Month', 'Shared spending'], rows: trend.map((t) => [monthLabel(t.month), formatMoney(t.spendMinor)]) }

  return (
    <ChartCard title={title} subtitle={subtitle} table={max > 0 ? table : null}>
      {max === 0 ? (
        <ChartEmpty>No shared spending in these months yet. Add an expense and the columns will fill in.</ChartEmpty>
      ) : (
        <div className="grid grid-cols-[2.75rem_1fr] gap-x-1 pt-3">
          <div className={`relative ${PLOT}`} aria-hidden="true">
            {ticks.map((t) => <span key={t} style={{ bottom: pct(t) }} className="num absolute right-1 translate-y-1/2 text-xs text-ink-2">{formatMoneyCompact(t)}</span>)}
          </div>
          <div className={`relative ${PLOT}`}>
            {ticks.map((t) => <div key={t} aria-hidden="true" style={{ bottom: pct(t) }} className="absolute inset-x-0 border-t border-edge" />)}
            <div className="absolute inset-0 flex">
              {trend.map((t, i) => {
                const on = t.month === selected
                return (
                  <button
                    key={t.month}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${monthLabel(t.month)}: ${formatMoney(t.spendMinor)}`}
                    onClick={() => onSelect?.(t.month)}
                    className="group relative h-full min-w-0 flex-1 rounded-lg"
                  >
                    <span
                      aria-hidden="true"
                      style={{ height: pct(t.spendMinor), ...stagger(i) }}
                      className={`grow absolute inset-x-0 bottom-0 mx-auto w-[min(60%,1.5rem)] rounded-t-[4px] ${on ? 'bg-owed' : 'bg-ink-2/70'}`}
                    />
                    <span
                      aria-hidden="true"
                      style={{ bottom: `calc(${pct(t.spendMinor)} + 4px)` }}
                      className={`num absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs transition-opacity duration-150 ${on ? '' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                    >
                      {formatMoneyCompact(t.spendMinor)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <span aria-hidden="true" />
          <div aria-hidden="true" className="flex pt-1.5">
            {trend.map((t) => <span key={t.month} className={`min-w-0 flex-1 text-center text-xs ${t.month === selected ? 'text-ink' : 'text-ink-2'}`}>{monthLabel(t.month, true)}</span>)}
          </div>
        </div>
      )}
    </ChartCard>
  )
}
