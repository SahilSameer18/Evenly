import { formatMoney } from '../lib/money.js'
import { methodLabel } from '../lib/settle.js'
import { Button } from './Button.jsx'
import { Chip, Panel } from './Panel.jsx'

const STATUS = { confirmed: 'Confirmed', rejected: 'Rejected', cancelled: 'Cancelled', pending: 'Waiting' }
const date = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function Details({ s }) {
  const bits = [methodLabel(s.method), s.paymentReference, s.note].filter(Boolean)
  return <span className="block truncate text-xs text-ink-2">{bits.join(' · ')}</span>
}

// One repayment, worded for who is looking at it. `variant` decides the buttons:
//   answer  - sent to me and waiting: Confirm or Reject
//   waiting - sent by me and waiting: Cancel
//   history - finished, no buttons
export function RepaymentRow({ settlement: s, myId, nameOf, variant, busy, onConfirm, onReject, onCancel }) {
  if (variant === 'answer') {
    return (
      <Panel className="enter flex flex-col gap-3">
        <div>
          <p className="font-medium">{nameOf(s.fromUserId)} says they sent you <span className="num">{formatMoney(s.amountMinor)}</span></p>
          <Details s={s} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy}>Confirm it arrived</Button>
          <Button variant="quiet" onClick={onReject} disabled={busy}>Reject</Button>
        </div>
      </Panel>
    )
  }
  if (variant === 'waiting') {
    return (
      <Panel className="enter flex flex-col gap-3">
        <div>
          <p className="font-medium">You sent <span className="num">{formatMoney(s.amountMinor)}</span> to {nameOf(s.toUserId)}</p>
          <span className="block text-xs text-ink-2">Waiting for {nameOf(s.toUserId)} to confirm</span>
          <Details s={s} />
        </div>
        <div><Button variant="quiet" onClick={onCancel} disabled={busy}>Cancel</Button></div>
      </Panel>
    )
  }
  const who = s.fromUserId === myId ? `You paid ${nameOf(s.toUserId)}` : s.toUserId === myId ? `${nameOf(s.fromUserId)} paid you` : `${nameOf(s.fromUserId)} paid ${nameOf(s.toUserId)}`
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{who}</span>
        <span className="block truncate text-xs text-ink-2">{date(s.initiatedAt)} · {methodLabel(s.method)}</span>
      </span>
      <Chip tone="quiet">{STATUS[s.status]}</Chip>
      <span className={`num shrink-0 ${s.status === 'confirmed' ? '' : 'text-ink-2 line-through'}`}>{formatMoney(s.amountMinor)}</span>
    </li>
  )
}
