import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router'
import { useMyHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { Icon } from './Icon.jsx'
import { Button } from './Button.jsx'
import { Avatar, Skeleton } from './Panel.jsx'
import { ErrorState } from './States.jsx'
import { Sheet } from './Sheet.jsx'

const LINKS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/expenses', label: 'Spend', icon: 'receipt' },
  { to: '/settle', label: 'Settle', icon: 'swap' },
]

const linkClass = ({ isActive }) => `flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 text-xs md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm ${isActive ? 'text-ink md:bg-panel' : 'text-ink-2'}`

export function AppShell() {
  const { household, isPending, error, refetch } = useMyHousehold()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)

  if (isPending) return <main className="mx-auto max-w-[960px] p-4"><Skeleton className="h-44" /></main>
  if (error) return <main className="mx-auto max-w-[960px] p-4"><ErrorState error={error} onRetry={refetch} /></main>
  if (!household) return <Navigate to="/household/new" replace />

  return (
    <div className="md:flex">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-edge p-4 md:sticky md:top-0 md:flex md:h-dvh">
        <p className="num px-3 pb-3 text-lg">Evenly</p>
        <Button onClick={() => setAdding(true)} className="mb-3 bg-owed-fill text-on-owed"><Icon name="plus" />Add expense</Button>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}><Icon name={l.icon} />{l.label}</NavLink>
        ))}
        <NavLink to="/settings" className={`${linkClass({ isActive: false })} mt-auto`}><Avatar name={user.name} size={28} />Settings</NavLink>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between px-4 pt-4 md:hidden">
          <p className="num text-lg">{household.name}</p>
          <Link to="/settings" aria-label="Settings"><Avatar name={user.name} /></Link>
        </header>
        <main className="mx-auto max-w-[960px] px-4 pb-28 pt-4 md:px-8 md:pb-8 md:pt-8">
          <Outlet context={{ household }} />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full border border-edge bg-bg/95 px-2 py-1.5 md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <NavLink to="/" end className={linkClass}><Icon name="home" />Home</NavLink>
        <NavLink to="/expenses" className={linkClass}><Icon name="receipt" />Spend</NavLink>
        <button type="button" onClick={() => setAdding(true)} aria-label="Add expense" className="inline-flex size-12 items-center justify-center rounded-full bg-owed-fill text-on-owed"><Icon name="plus" size={24} /></button>
        <NavLink to="/settle" className={linkClass}><Icon name="swap" />Settle</NavLink>
      </nav>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add expense">
        <p className="text-ink-2">Recording expenses arrives in the next build. Your household is ready for it.</p>
      </Sheet>
    </div>
  )
}
