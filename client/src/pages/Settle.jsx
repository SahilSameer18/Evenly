import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useBalances } from '../api/expenses.js'
import { useHousehold } from '../api/households.js'
import {
  cancelSettlement,
  confirmSettlement,
  refreshSettle,
  rejectSettlement,
  useLedger,
  usePendingSettlements,
  useSettlementHistory,
  useSuggestions,
} from '../api/settlements.js'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { Chip, Panel, Skeleton } from '../components/Panel.jsx'
import { ReasonSheet } from '../components/ReasonSheet.jsx'
import { RecordRepaymentSheet } from '../components/RecordRepaymentSheet.jsx'
import { RepaymentRow } from '../components/RepaymentRow.jsx'
import { ErrorState } from '../components/States.jsx'
import { useToast } from '../components/toast.js'
import { formatMoney, formatSigned } from '../lib/money.js'
import { stagger } from '../lib/motion.js'
import { balanceWords, describeEntry, formulaOf, splitPending, withRole } from '../lib/settle.js'

const dateOf = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const sectionTitle = 'num text-lg'

function WhoOwesWhom({ suggestions, myId, onRecord }) {
  if (suggestions.isPending) return <Skeleton className="h-24" />
  if (suggestions.error) return <ErrorState error={suggestions.error} onRetry={suggestions.refetch} />
  const rows = suggestions.data.map((s) => withRole(s, myId))
  if (rows.length === 0) {
    return (
      <Panel className="enter flex items-center gap-3">
        <Icon name="check" size={24} className="shrink-0 text-owed" />
        <div><p className="font-medium">All settled up</p><p className="text-ink-2">Nobody owes anyone anything right now.</p></div>
      </Panel>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <Panel key={`${r.from.userId}-${r.to.userId}`} style={stagger(i)} className="enter flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{r.role === 'payer' ? `You pay ${r.to.name}` : r.role === 'payee' ? `${r.from.name} pays you` : `${r.from.name} pays ${r.to.name}`}</p>
            {r.role === 'payee' && <p className="text-xs text-ink-2">Waiting for {r.from.name}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span className={`num text-xl ${r.role === 'payer' ? 'text-owe' : r.role === 'payee' ? 'text-owed' : ''}`}>{formatMoney(r.amountMinor)}</span>
            {r.role === 'payer' && <Button onClick={() => onRecord({ toUserId: r.to.userId, amountMinor: r.amountMinor })}>Record repayment</Button>}
          </div>
        </Panel>
      ))}
      <p className="text-xs text-ink-2">Worked out from confirmed expenses and confirmed repayments only.</p>
    </div>
  )
}

function HowCalculated({ balances, myId }) {
  if (balances.isPending) return <Skeleton className="h-12" />
  if (balances.error) return <ErrorState error={balances.error} onRetry={balances.refetch} />
  return (
    <ul className="flex flex-col divide-y divide-edge pb-2">
      {balances.data.members.map((m) => {
        const f = formulaOf(m)
        return (
          <li key={m.userId} className="py-3">
            <p className="font-medium">{m.userId === myId ? 'You' : m.name}{!m.active && ' (left)'}</p>
            <p className="mt-1 text-xs text-ink-2">
              Paid <span className="num">{formatMoney(f.paid)}</span> − Share <span className="num">{formatMoney(f.share)}</span> + Sent <span className="num">{formatMoney(f.sent)}</span> − Received <span className="num">{formatMoney(f.received)}</span>
            </p>
            <p className={`num mt-1 ${f.net > 0 ? 'text-owed' : f.net < 0 ? 'text-owe' : ''}`}>= {formatSigned(f.net)}</p>
          </li>
        )
      })}
    </ul>
  )
}

function Entries({ householdId, open, myId }) {
  const ledger = useLedger(householdId, open)
  const [limit, setLimit] = useState(20)
  if (!open) return null
  if (ledger.isPending) return <Skeleton className="mb-3 h-24" />
  if (ledger.error) return <ErrorState error={ledger.error} onRetry={ledger.refetch} />
  const rows = [...ledger.data.entries].reverse().map((e) => describeEntry(e, myId))
  return (
    <div className="pb-3">
      <ul className="flex flex-col divide-y divide-edge">
        {rows.slice(0, limit).map((r) => (
          <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-1.5">
            <span className="min-w-0 flex-1">
              {r.href ? <Link to={r.href} className="flex min-h-11 items-center truncate font-medium underline decoration-edge">{r.label}</Link> : <span className="block truncate py-2 font-medium">{r.label}</span>}
              <span className="block text-xs text-ink-2">{dateOf(r.at)}{r.counted ? ` · ${balanceWords(r.running)}` : ''}</span>
            </span>
            {r.note ? <Chip tone="quiet">{r.note}</Chip> : <span className={`num shrink-0 ${r.effect > 0 ? 'text-owed' : r.effect < 0 ? 'text-owe' : ''}`}>{formatSigned(r.effect)}</span>}
          </li>
        ))}
      </ul>
      {rows.length > limit && <Button variant="quiet" onClick={() => setLimit((n) => n + 20)} className="mt-2">Show more</Button>}
    </div>
  )
}

export default function Settle() {
  const { household } = useOutletContext()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const hid = household.id
  const people = useHousehold(hid)
  const balances = useBalances(hid)
  const suggestions = useSuggestions(hid)
  const pending = usePendingSettlements(hid)
  const history = useSettlementHistory(hid)
  const [repay, setRepay] = useState(null) // null, or { toUserId?, amountMinor? } while the sheet is open
  const [rejecting, setRejecting] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [ledgerOpen, setLedgerOpen] = useState(false)

  const nameOf = (id) => (id === user.id ? 'You' : people.data?.members.find((m) => m.userId === id)?.name ?? 'Someone')
  const { toAnswer, waiting } = splitPending(pending.data ?? [], user.id)
  const finished = history.data?.pages.flatMap((p) => p.settlements).filter((s) => s.status !== 'pending') ?? []

  // Run one action on one repayment. Whatever happens, refresh afterwards so the screen shows the truth
  // (for example if the other person already cancelled it).
  async function act(id, run, done) {
    setBusyId(id)
    try {
      await run()
      toast(done)
    } catch (err) {
      toast(err.message)
    } finally {
      await refreshSettle(queryClient, hid)
      setBusyId(null)
    }
  }

  return (
    <div className="enter-fade flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="num text-2xl max-md:sr-only">Settle up</h1>
        <Button onClick={() => setRepay({})} className="ml-auto"><Icon name="plus" />Record repayment</Button>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5">
          <section aria-labelledby="owes-title" className="flex flex-col gap-3">
            <h2 id="owes-title" className={sectionTitle}>Who owes whom</h2>
            <WhoOwesWhom suggestions={suggestions} myId={user.id} onRecord={setRepay} />
          </section>

          <section aria-labelledby="answer-title" className="flex flex-col gap-3">
            <h2 id="answer-title" className={sectionTitle}>Needs your answer</h2>
            {pending.isPending ? <Skeleton className="h-24" /> : pending.error ? <ErrorState error={pending.error} onRetry={pending.refetch} /> : toAnswer.length + waiting.length === 0 ? (
              <Panel className="enter text-ink-2">Nothing is waiting. A repayment you send or receive shows up here until it is confirmed.</Panel>
            ) : (
              <>
                {toAnswer.map((s) => (
                  <RepaymentRow key={s.id} settlement={s} myId={user.id} nameOf={nameOf} variant="answer" busy={busyId === s.id}
                    onConfirm={() => act(s.id, () => confirmSettlement(hid, s.id), 'Confirmed. Balances updated.')}
                    onReject={() => setRejecting(s)} />
                ))}
                {waiting.map((s) => (
                  <RepaymentRow key={s.id} settlement={s} myId={user.id} nameOf={nameOf} variant="waiting" busy={busyId === s.id}
                    onCancel={() => act(s.id, () => cancelSettlement(hid, s.id), 'Repayment cancelled.')} />
                ))}
              </>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section aria-labelledby="calc-title" className="flex flex-col gap-3">
            <h2 id="calc-title" className={sectionTitle}>How it is calculated</h2>
            <details className="group rounded-[22px] border border-edge bg-panel px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
                <span>Paid − Share + Sent − Received</span>
                <Icon name="plus" className="shrink-0 text-ink-2 group-open:rotate-45" />
              </summary>
              <HowCalculated balances={balances} myId={user.id} />
            </details>
            <details onToggle={(e) => setLedgerOpen(e.currentTarget.open)} className="group rounded-[22px] border border-edge bg-panel px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
                <span>Every entry behind your balance</span>
                <Icon name="plus" className="shrink-0 text-ink-2 group-open:rotate-45" />
              </summary>
              <Entries householdId={hid} open={ledgerOpen} myId={user.id} />
            </details>
          </section>

          <section aria-labelledby="history-title" className="flex flex-col gap-3">
            <h2 id="history-title" className={sectionTitle}>Repayment history</h2>
            {history.isPending ? <Skeleton className="h-20" /> : history.error ? <ErrorState error={history.error} onRetry={history.refetch} /> : finished.length === 0 && !history.hasNextPage ? (
              <Panel className="text-ink-2">No finished repayments yet.</Panel>
            ) : (
              <Panel className="p-3">
                <ul className="flex flex-col divide-y divide-edge">
                  {finished.map((s) => <RepaymentRow key={s.id} settlement={s} myId={user.id} nameOf={nameOf} variant="history" />)}
                </ul>
                {history.hasNextPage && <Button variant="quiet" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage} className="mt-2">{history.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}
              </Panel>
            )}
          </section>
        </div>
      </div>

      <RecordRepaymentSheet
        open={repay !== null}
        onClose={() => setRepay(null)}
        household={household}
        defaults={repay ?? undefined}
        onSaved={(_s, name) => toast(`Recorded. Waiting for ${name} to confirm.`)}
      />
      <ReasonSheet
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject this repayment"
        intro={rejecting ? `Say so if ${nameOf(rejecting.fromUserId)}'s ${formatMoney(rejecting.amountMinor)} did not arrive. Nothing changes in the balances.` : ''}
        label="Why"
        submitLabel="Reject repayment"
        destructive
        onSubmit={async (reason) => {
          await rejectSettlement(hid, rejecting.id, reason)
          await refreshSettle(queryClient, hid)
          toast('Repayment rejected.')
        }}
      />
    </div>
  )
}
