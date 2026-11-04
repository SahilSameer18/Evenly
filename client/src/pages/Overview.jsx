import { Link, useOutletContext } from 'react-router'
import { useBalances, useExpenses } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { ExpenseRow } from '../components/ExpenseRow.jsx'
import { Icon } from '../components/Icon.jsx'
import { Panel, Skeleton } from '../components/Panel.jsx'
import { EmptyState, ErrorState } from '../components/States.jsx'
import { formatMoney } from '../lib/money.js'
import { stagger } from '../lib/motion.js'
import { useCountUp } from '../lib/useCountUp.js'

// The balance in words: with exactly one other person it names them, otherwise it speaks in total.
function summary(net, others) {
  if (net === 0) return { label: 'All settled up', tone: 'settled' }
  const owed = net > 0
  const one = others.length === 1 ? others[0].name : null
  return { label: owed ? (one ? `${one} owes you` : 'You are owed in total') : (one ? `You owe ${one}` : 'You owe in total'), tone: owed ? 'owed' : 'owe' }
}

function Hero({ balances, userId }) {
  const me = balances.members.find((m) => m.userId === userId)
  const others = balances.members.filter((m) => m.userId !== userId && m.active)
  const { label, tone } = summary(me.netMinor, others)
  const shown = useCountUp(Math.abs(me.netMinor)) // counts up once, and again when the balance changes
  return (
    <section aria-label="Your balance" className="enter-pop rounded-[22px] border border-edge bg-hero p-5 text-hero-ink">
      <p className="text-hero-ink-2">{label}</p>
      <p className={`num mt-1 flex items-center gap-2 text-[clamp(2.5rem,14vw,4rem)] leading-none ${tone === 'owed' ? 'text-hero-owed' : tone === 'owe' ? 'text-hero-owe' : ''}`}>
        {tone === 'owed' && <Icon name="arrow-up-right" size={32} />}
        {tone === 'owe' && <Icon name="arrow-up-right" size={32} className="rotate-180" />}
        {tone === 'settled' && <Icon name="check" size={32} />}
        <span aria-hidden="true" className="min-w-0 break-words">{formatMoney(shown)}</span>
        <span className="sr-only">{formatMoney(Math.abs(me.netMinor))}</span>
      </p>
      <dl style={stagger(2)} className="enter mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
        <div><dt className="text-hero-ink-2">You paid</dt><dd className="num text-lg">{formatMoney(me.paidMinor)}</dd></div>
        <div><dt className="text-hero-ink-2">Your share</dt><dd className="num text-lg">{formatMoney(me.shareMinor)}</dd></div>
      </dl>
    </section>
  )
}

export default function Overview() {
  const { household, openAdd } = useOutletContext()
  const { user } = useAuth()
  const balances = useBalances(household.id)
  const recent = useExpenses(household.id, { limit: 5 })
  const people = useHousehold(household.id)
  const nameOf = (id) => people.data?.members.find((m) => m.userId === id)?.name ?? 'Someone'
  const items = recent.data?.pages[0].expenses ?? []

  return (
    <div className="enter-fade flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="num text-2xl max-md:sr-only">Overview</h1>
        <button
          type="button"
          aria-label="Refresh"
          onClick={() => { balances.refetch(); recent.refetch() }}
          className="ml-auto inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition-transform duration-100 active:scale-90"
        >
          <Icon name="refresh" />
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {balances.isPending ? <Skeleton className="h-52" /> : balances.error ? <ErrorState error={balances.error} onRetry={balances.refetch} /> : <Hero balances={balances.data} userId={user.id} />}

        <section aria-label="Recent expenses">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="num text-lg">Recent</h2>
            {items.length > 0 && <Link to="/expenses" className="inline-flex min-h-11 min-w-11 items-center justify-end text-ink-2 underline">See all</Link>}
          </div>
          {recent.isPending ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : recent.error ? (
            <ErrorState error={recent.error} onRetry={recent.refetch} />
          ) : items.length === 0 ? (
            <EmptyState title="Add your first expense" action={<Button onClick={openAdd}><Icon name="plus" />Add expense</Button>}>
              Record what you spent and who shares it. Balances update straight away.
            </EmptyState>
          ) : (
            <Panel className="flex flex-col gap-1 p-2">
              {items.map((e, i) => <ExpenseRow key={e.id} expense={e} myId={user.id} nameOf={nameOf} index={i + 1} />)}
            </Panel>
          )}
        </section>
      </div>
    </div>
  )
}
