import { Fragment, useEffect, useRef, useState } from 'react'
import { Outlet, useOutletContext, useParams } from 'react-router'
import { useExpenses } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { ExpenseRow } from '../components/ExpenseRow.jsx'
import { Icon } from '../components/Icon.jsx'
import { Panel, Skeleton } from '../components/Panel.jsx'
import { EmptyState, ErrorState } from '../components/States.jsx'
import { groupByDay } from '../lib/expenses.js'
import { useDebounced } from '../lib/useDebounced.js'

const FILTERS = [[undefined, 'All'], ['shared', 'Shared'], ['personal', 'Personal']]

export default function Expenses() {
  const context = useOutletContext()
  const { household, openAdd } = context
  const { expenseId } = useParams()
  const { user } = useAuth()
  const [type, setType] = useState(undefined)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300) || undefined
  const list = useExpenses(household.id, { type, q })
  const people = useHousehold(household.id)
  const nameOf = (id) => people.data?.members.find((m) => m.userId === id)?.name ?? 'Someone'

  // Infinite scroll without scroll listeners: the next page loads when this marker comes into view.
  const marker = useRef(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    if (!marker.current || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '300px' })
    observer.observe(marker.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const groups = groupByDay(list.data?.pages.flatMap((p) => p.expenses) ?? [])
  const filtering = Boolean(type || q)

  return (
    <div className="enter-fade md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
      {/* Phones show the list or one expense, never both; from tablet width they sit side by side. */}
      <section aria-label="Expenses" className={`flex min-w-0 flex-col gap-3 ${expenseId ? 'max-md:hidden' : ''}`}>
        <h1 className="num text-2xl max-md:sr-only">Spending</h1>

        <label className="flex min-h-12 items-center gap-2 rounded-full border border-edge bg-panel px-4">
          <Icon name="search" className="shrink-0 text-ink-2" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses" aria-label="Search expenses" className="min-h-11 min-w-0 flex-1 bg-transparent py-2 text-ink placeholder:text-ink-2" />
        </label>

        <div role="radiogroup" aria-label="Filter by kind" className="flex gap-2">
          {FILTERS.map(([value, label]) => (
            <button key={label} type="button" role="radio" aria-checked={type === value} onClick={() => setType(value)} className={`min-h-11 rounded-full border px-4 font-medium transition-colors duration-150 active:scale-[0.97] ${type === value ? 'border-transparent bg-action text-on-action' : 'border-edge text-ink'}`}>{label}</button>
          ))}
        </div>

        {list.isPending ? (
          <div className="flex flex-col gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : groups.length === 0 ? (
          filtering ? (
            <EmptyState title="Nothing matches">Try a different search or filter.</EmptyState>
          ) : (
            <EmptyState title="Your spending will live here" action={<Button onClick={openAdd}><Icon name="plus" />Add expense</Button>}>
              Every expense you and your roommates record shows up in this list.
            </EmptyState>
          )
        ) : (
          <Panel className="flex flex-col p-2">
            {groups.map((g, gi) => (
              <Fragment key={g.key}>
                <h2 className="px-3 pb-1 pt-3 text-xs text-ink-2">{g.label}</h2>
                {/* the first rows on screen ease in one after another */}
                {g.items.map((e, i) => <ExpenseRow key={e.id} expense={e} myId={user.id} nameOf={nameOf} selected={e.id === expenseId} index={gi === 0 ? i : undefined} />)}
              </Fragment>
            ))}
            <div ref={marker} aria-hidden="true" />
            {hasNextPage && <Button variant="quiet" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="m-2">{isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}
          </Panel>
        )}
      </section>

      <section className={`min-w-0 ${expenseId ? '' : 'max-md:hidden'}`}>
        {expenseId ? <Outlet context={context} /> : <p className="hidden rounded-[22px] border border-dashed border-edge p-8 text-center text-ink-2 md:block">Select an expense to see how it was split.</p>}
      </section>
    </div>
  )
}
