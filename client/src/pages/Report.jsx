import { useOutletContext, useSearchParams } from 'react-router'
import { useBalances } from '../api/expenses.js'
import { useMonthlyReport } from '../api/reports.js'
import { Icon } from '../components/Icon.jsx'
import { MonthColumns } from '../components/charts/MonthColumns.jsx'
import { PaidShareBars } from '../components/charts/PaidShareBars.jsx'
import { Skeleton } from '../components/Panel.jsx'
import { ErrorState } from '../components/States.jsx'
import { useToast } from '../components/toast.js'
import { useAuth } from '../auth/context.js'
import { addMonths, changeText, currentMonthIn, monthLabel, monthName, summaryText } from '../lib/charts.js'
import { formatMoney } from '../lib/money.js'
import { stagger } from '../lib/motion.js'
import { useCountUp } from '../lib/useCountUp.js'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const step = 'inline-flex size-11 items-center justify-center rounded-full border border-edge text-ink transition-transform duration-100 active:scale-90 disabled:opacity-40'

function Summary({ report, userId, onShare }) {
  const me = report.members.find((m) => m.userId === userId)
  const shown = useCountUp(report.spendMinor)
  return (
    <section aria-label="Shared spending this month" className="enter-pop rounded-[22px] border border-edge bg-hero p-5 text-hero-ink">
      <p className="text-hero-ink-2">Shared spending</p>
      <p className="num mt-1 text-[clamp(2.5rem,14vw,4rem)] leading-none">
        <span aria-hidden="true" className="min-w-0 break-words">{formatMoney(shown)}</span>
        <span className="sr-only">{formatMoney(report.spendMinor)}</span>
      </p>
      <p className="mt-2 text-hero-ink-2">{changeText(report.spendMinor, report.previousSpendMinor, monthName(addMonths(report.month, -1)))}</p>
      <dl style={stagger(2)} className="enter mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
        <div><dt className="text-hero-ink-2">You paid</dt><dd className="num text-lg">{formatMoney(me?.paidMinor ?? 0)}</dd></div>
        <div><dt className="text-hero-ink-2">Your share</dt><dd className="num text-lg">{formatMoney(me?.shareMinor ?? 0)}</dd></div>
      </dl>
      <button type="button" onClick={onShare} style={stagger(3)} className="enter mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-hero-ink px-5 font-medium text-dark transition-transform duration-100 active:scale-[0.97]">
        <Icon name="copy" size={18} />Share summary
      </button>
    </section>
  )
}

export default function Report() {
  const { household } = useOutletContext()
  const { user } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const asked = params.get('month')
  const month = asked && MONTH.test(asked) ? asked : undefined
  const report = useMonthlyReport(household.id, month)
  const balances = useBalances(household.id)
  const data = report.data
  const shown = data?.month // read once, null-safe: the buttons below are drawn before the first answer arrives

  // Going forward to the current month drops the parameter, so "this month" always means this month.
  const go = (target) => setParams(data && target === currentMonthIn(data.timezone) ? {} : { month: target }, { replace: true })
  const atCurrent = data ? data.month >= currentMonthIn(data.timezone) : true

  async function share() {
    const text = summaryText(data, household.name, balances.data?.members)
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ text }); return }
      await navigator.clipboard.writeText(text)
      toast('Summary copied')
    } catch (err) {
      if (err?.name === 'AbortError') return // the person closed the share sheet
      try { await navigator.clipboard.writeText(text); toast('Summary copied') } catch { toast('Could not share or copy the summary') }
    }
  }

  return (
    <div className="enter-fade flex flex-col gap-5">
      <h1 className="num text-2xl max-md:sr-only">Monthly report</h1>
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-label="Previous month" disabled={!data} onClick={() => go(addMonths(shown, -1))} className={step}><Icon name="chevron-left" /></button>
        <p aria-live="polite" className="num min-w-0 truncate text-center text-xl">{data ? monthLabel(shown) : ' '}</p>
        <button type="button" aria-label="Next month" disabled={atCurrent} onClick={() => go(addMonths(shown, 1))} className={step}><Icon name="chevron-left" className="rotate-180" /></button>
      </div>

      {report.isPending ? (
        <div className="flex flex-col gap-5"><Skeleton className="h-56" /><Skeleton className="h-64" /></div>
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={report.refetch} />
      ) : (
        <>
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
            <Summary report={data} userId={user.id} onShare={share} />
            <MonthColumns trend={data.trend} selected={data.month} onSelect={go} subtitle="Tap a month to open it" />
            <PaidShareBars members={data.members} title="Paid and share" subtitle={monthLabel(data.month)} />
          </div>
        </>
      )}
    </div>
  )
}
