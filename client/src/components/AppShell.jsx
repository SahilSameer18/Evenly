import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { reverseExpense, refreshMoney } from '../api/expenses.js'
import { useMyHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { AddExpenseSheet } from './AddExpenseSheet.jsx'
import { Icon } from './Icon.jsx'
import { Avatar, Skeleton } from './Panel.jsx'
import { ErrorState } from './States.jsx'
import { ThemeToggle } from './ThemeToggle.jsx'
import { useToast } from './toast.js'
import { useScrolled } from '../lib/useScrolled.js'

const LINKS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/expenses', label: 'Spend', icon: 'receipt' },
  { to: '/settle', label: 'Settle', icon: 'swap' },
]

// Phone: icon over label in the bottom bar. Tablet (md): icons only in the sidebar. Desktop (lg): icon and label.
const linkClass = ({ isActive }) => `flex min-h-11 transition-colors duration-150 min-w-11 flex-col items-center justify-center gap-0.5 text-xs md:size-11 md:flex-row md:justify-center md:self-center md:rounded-xl lg:size-auto lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:text-sm ${isActive ? 'text-ink md:bg-panel' : 'text-ink-2'}`
const label = 'md:sr-only lg:not-sr-only'

export function AppShell() {
  const { household, isPending, error, refetch } = useMyHousehold()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [topMarker, scrolled] = useScrolled()

  if (isPending) return <main className="mx-auto max-w-[960px] p-4"><Skeleton className="h-44" /></main>
  if (error) return <main className="mx-auto max-w-[960px] p-4"><ErrorState error={error} onRetry={refetch} /></main>
  if (!household) return <Navigate to="/household/new" replace />

  // Undo reverses the expense that was just added: nothing is ever deleted, so it stays in the history as reversed.
  function saved(expense) {
    setAdding(false)
    toast('Expense added', {
      label: 'Undo',
      onClick: async () => {
        try {
          await reverseExpense(household.id, expense.id, 'Undone right after adding')
          await refreshMoney(queryClient, household.id)
          toast('Expense undone')
        } catch (err) {
          toast(err.message)
        }
      },
    })
  }

  return (
    <div className="md:flex">
      <aside className="hidden shrink-0 flex-col gap-1 border-r border-edge p-3 md:sticky md:top-0 md:flex md:h-dvh md:w-[4.5rem] lg:w-56 lg:p-4">
        <p className="num px-1 pb-3 text-center text-lg lg:px-3 lg:text-left"><span className="lg:hidden" aria-hidden="true">E</span><span className="max-lg:sr-only">Evenly</span></p>
        <button type="button" onClick={() => setAdding(true)} aria-label="Add expense" className="mb-3 inline-flex size-11 items-center justify-center gap-2 self-center rounded-full bg-owed-fill font-medium text-on-owed lg:size-auto lg:min-h-11 lg:w-full lg:self-stretch">
          <Icon name="plus" /><span className="max-lg:sr-only">Add expense</span>
        </button>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} aria-label={l.label} className={linkClass}><Icon name={l.icon} /><span className={label}>{l.label}</span></NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-1">
          <ThemeToggle className="self-center lg:self-start" />
          <NavLink to="/settings" aria-label="Settings" className={linkClass}><Avatar name={user.name} size={28} /><span className={label}>Settings</span></NavLink>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* The phone header stays at the top. It turns solid, with an edge, only once the page has scrolled, so
            at the top the warm background shows through. The marker is watched without a scroll listener. */}
        <div ref={topMarker} aria-hidden="true" className="-mb-px h-px md:hidden" />
        <header className={`sticky top-0 z-30 -mt-[env(safe-area-inset-top)] flex items-center justify-between border-b px-4 pb-2 pt-[calc(1rem+env(safe-area-inset-top))] transition-colors duration-150 md:hidden ${scrolled ? 'border-edge bg-bg' : 'border-transparent'}`}>
          <p className="num min-w-0 truncate text-lg">{household.name}</p>
          <div className="ml-3 flex shrink-0 items-center">
            <ThemeToggle />
            <Link to="/settings" aria-label="Settings" className="inline-flex size-11 items-center justify-center"><Avatar name={user.name} /></Link>
          </div>
        </header>
        <main className="mx-auto max-w-[960px] px-4 pb-28 pt-4 sm:px-6 md:px-8 md:pb-10 md:pt-8 xl:max-w-[1100px] 2xl:max-w-[1200px]">
          <Outlet context={{ household, openAdd: () => setAdding(true) }} />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full border border-edge bg-bg/95 px-2 py-1.5 md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <NavLink to="/" end className={linkClass}><Icon name="home" />Home</NavLink>
        <NavLink to="/expenses" className={linkClass}><Icon name="receipt" />Spend</NavLink>
        <button type="button" onClick={() => setAdding(true)} aria-label="Add expense" className="inline-flex size-12 items-center justify-center rounded-full bg-owed-fill text-on-owed"><Icon name="plus" size={24} /></button>
        <NavLink to="/settle" className={linkClass}><Icon name="swap" />Settle</NavLink>
      </nav>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} household={household} onSaved={saved} />
    </div>
  )
}
