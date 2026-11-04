import { describeEvent } from '../lib/history.js'
import { Panel, Skeleton } from './Panel.jsx'
import { ErrorState } from './States.jsx'

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Every change to one expense, oldest first: who did it, when, why, and what changed. Nothing here can be edited.
export function ExpenseHistory({ query, nameOf }) {
  if (query.isPending) return <Skeleton className="h-24" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />
  const events = query.data.map((e) => describeEvent(e, nameOf))
  return (
    <Panel style={{ '--i': 3 }} className="enter flex flex-col gap-2">
      <h2 className="num text-lg">History</h2>
      <ol className="flex flex-col divide-y divide-edge">
        {events.map((e) => (
          <li key={e.id} className="py-3">
            <p className="font-medium">{e.title}</p>
            <p className="text-xs text-ink-2">{when(e.at)}</p>
            {e.reason && <p className="mt-1 break-words text-ink-2">“{e.reason}”</p>}
            {e.changes.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-ink-2">
                {e.changes.map((c) => <li key={c} className="break-words">{c}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}
