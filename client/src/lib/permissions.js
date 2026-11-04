// Who may do what to an expense. These mirror the server's rules, so the screen only offers what will work;
// the server still decides (and its answer is shown if the two ever disagree).

/** The person who raised the current dispute: the actor of the latest "disputed" event after any withdrawal. */
export function disputerOf(events) {
  let who = null
  for (const e of events ?? []) {
    if (e.action === 'expense.disputed') who = e.actor?.id ?? null
    if (e.action === 'expense.dispute_withdrawn') who = null
  }
  return who
}

export function allowedActions(expense, myId, disputerId = null) {
  const none = { edit: false, reverse: false, dispute: false, withdraw: false }
  if (expense.status === 'reversed') return none
  const mine = expense.createdById === myId
  return {
    // A refund cannot be edited (reverse it and record a new one); on-behalf expenses are not editable here.
    edit: mine && expense.type !== 'refund' && expense.type !== 'on_behalf',
    reverse: mine,
    // Only another member can dispute, only a confirmed expense, and never a private one.
    dispute: !mine && expense.status === 'confirmed' && expense.type !== 'personal',
    withdraw: expense.status === 'disputed' && disputerId === myId,
  }
}
