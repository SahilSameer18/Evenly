import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { setAccessToken } from '../../api/client.js'
import { AuthContext } from '../../auth/context.js'
import { ToastProvider } from '../ToastProvider.jsx'
import { ReasonSheet } from '../ReasonSheet.jsx'
import { RecordRepaymentSheet } from '../RecordRepaymentSheet.jsx'
import Settle from '../../pages/Settle.jsx'
// The server's own request schema: the repayment body the client sends must satisfy it exactly.
import { createSettlementBody } from '../../../../server/src/modules/settlements/settlement.validation.js'

const household = { id: 'h1', name: 'Flat 302', defaultSplitMethod: 'equal' }
const members = [{ userId: 'me', name: 'Alice', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'member' }]
const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })
const ok = (data, meta = {}) => reply(200, { data, meta: { requestId: 'r', ...meta } })
const auth = { status: 'signed-in', user: { id: 'me', name: 'Alice' } }
const settlement = (over) => ({ id: 's1', fromUserId: 'bob', toUserId: 'me', amountMinor: 20000, method: 'upi', paymentReference: null, note: null, status: 'pending', initiatedAt: '2026-11-04T10:00:00Z', ...over })

let calls
beforeEach(() => {
  setAccessToken('tok')
  calls = []
})

function stubFetch(routes) {
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers })
    for (const [pattern, handler] of routes) {
      if (pattern.test(`${method} ${url}`)) return handler({ method, url, body: init.body ? JSON.parse(init.body) : undefined })
    }
    return reply(404, { error: { code: 'NOT_FOUND', message: 'not stubbed' }, meta: {} })
  }))
}
const posts = () => calls.filter((c) => c.method === 'POST')

const base = [
  [/GET \/api\/v1\/households\/h1$/, () => ok({ household: { ...household, members } })],
  [/GET .*\/balances$/, () => ok({ members: members.map((m) => ({ ...m, active: true, paidMinor: 0, shareMinor: 0, sentMinor: 0, receivedMinor: 0, netMinor: 0 })), settledUp: true })],
  [/GET .*\/ledger$/, () => ok({ members, entries: [] })],
]

describe('RecordRepaymentSheet', () => {
  function open(onSaved = vi.fn(), defaults) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={auth}>
          <RecordRepaymentSheet open onClose={() => {}} household={household} defaults={defaults} onSaved={onSaved} />
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
    return onSaved
  }
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Record repayment' }))

  it('sends one repayment with the key, and the body satisfies the server schema', async () => {
    stubFetch([...base, [/POST .*\/settlements$/, () => reply(201, { data: { settlement: settlement() }, meta: {} })]])
    const onSaved = open()
    await userEvent.type(await screen.findByLabelText('Amount (₹)'), '200')
    await userEvent.click(screen.getByRole('radio', { name: 'Cash' }))
    await userEvent.type(screen.getByLabelText('Reference (optional)'), ' TXN-1 ')
    await save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body).toEqual({ toUserId: 'bob', amountMinor: 20000, method: 'cash', paymentReference: 'TXN-1' })
    expect(createSettlementBody.safeParse(posts()[0].body).success).toBe(true)
    expect(posts()[0].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(onSaved.mock.calls[0][1]).toBe('Bob')
  })

  it('a double tap sends one request', async () => {
    let release
    stubFetch([...base, [/POST .*\/settlements$/, () => new Promise((resolve) => { release = () => resolve(reply(201, { data: { settlement: settlement() }, meta: {} })) })]])
    open()
    await userEvent.type(await screen.findByLabelText('Amount (₹)'), '200')
    await userEvent.dblClick(screen.getByRole('button', { name: 'Record repayment' }))
    expect(posts()).toHaveLength(1)
    release()
  })

  it('after a network failure the retry reuses the same key', async () => {
    let fail = true
    stubFetch([...base, [/POST .*\/settlements$/, () => { if (fail) throw new TypeError('offline'); return reply(201, { data: { settlement: settlement() }, meta: {} }) }]])
    const onSaved = open()
    await userEvent.type(await screen.findByLabelText('Amount (₹)'), '200')
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    fail = false
    await save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts()).toHaveLength(2)
    expect(posts()[1].headers['Idempotency-Key']).toBe(posts()[0].headers['Idempotency-Key'])
  })

  it('asks for an amount before sending anything', async () => {
    stubFetch(base)
    open()
    await screen.findByLabelText('Amount (₹)')
    await save()
    expect(screen.getAllByText('Enter an amount').length).toBeGreaterThan(0)
    expect(posts()).toHaveLength(0)
  })

  it('opens prefilled from a suggestion', async () => {
    stubFetch(base)
    open(vi.fn(), { toUserId: 'bob', amountMinor: 12050 })
    expect(await screen.findByLabelText('Amount (₹)')).toHaveValue('120.50')
    expect(screen.getByLabelText('You paid')).toHaveValue('bob')
  })
})

describe('ReasonSheet', () => {
  const show = (props) => {
    const onSubmit = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    render(<ReasonSheet open onClose={onClose} title="Why" submitLabel="Do it" onSubmit={onSubmit} {...props} />)
    return { onSubmit, onClose }
  }

  it('refuses an empty reason when one is required, and counts characters', async () => {
    const { onSubmit } = show({ required: true, label: 'Reason' })
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(screen.getByText('Add a reason')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Reason'), 'Entered twice')
    expect(screen.getByText('13/300')).toBeInTheDocument()
  })

  it('accepts no reason when it is optional, and sends it trimmed when given', async () => {
    const { onSubmit, onClose } = show({ label: 'Why' })
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('shows the server\'s message when the action fails, and stays open', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ message: 'Already settled', requestId: 'req-9' })
    const onClose = vi.fn()
    render(<ReasonSheet open onClose={onClose} title="Why" submitLabel="Do it" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Already settled')
    expect(screen.getByText('Reference: req-9')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the Settle screen', () => {
  function mount() {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/settle']}>
              <Routes>
                <Route element={<Outlet context={{ household }} />}>
                  <Route path="/settle" element={<Settle />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  }
  const suggestion = (from, to) => ({ from: { userId: from, name: from === 'me' ? 'Alice' : 'Bob', active: true }, to: { userId: to, name: to === 'me' ? 'Alice' : 'Bob', active: true }, amountMinor: 30000 })
  const routes = (pending, suggestions = []) => [
    ...base,
    [/GET .*\/settlement-suggestions$/, () => ok({ suggestions })],
    [/GET .*\/settlements\?status=pending/, () => ok({ settlements: pending }, { pagination: { nextCursor: null } })],
    [/GET .*\/settlements\?limit=25/, () => ok({ settlements: [settlement({ id: 'h1', status: 'confirmed', fromUserId: 'bob', toUserId: 'me' })] }, { pagination: { nextCursor: null } })],
  ]

  it('says who pays whom, by role', async () => {
    stubFetch(routes([], [suggestion('bob', 'me')]))
    mount()
    expect(await screen.findByText('Bob pays you')).toBeInTheDocument()
    expect(screen.getByText('Waiting for Bob')).toBeInTheDocument()
  })

  it('offers "Record repayment" prefilled when I am the one who pays', async () => {
    stubFetch(routes([], [suggestion('me', 'bob')]))
    mount()
    expect(await screen.findByText('You pay Bob')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Record repayment' }).length).toBeGreaterThanOrEqual(2)
  })

  it('says all settled up when there is nothing to pay', async () => {
    stubFetch(routes([], []))
    mount()
    expect(await screen.findByText('All settled up')).toBeInTheDocument()
  })

  it('confirms a repayment sent to me', async () => {
    stubFetch([...routes([settlement()]), [/POST .*\/settlements\/s1\/confirm$/, () => ok({ settlement: settlement({ status: 'confirmed' }), balanceAfter: {} })]])
    mount()
    expect(await screen.findByText(/Bob says they sent you/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm it arrived' }))
    await waitFor(() => expect(posts().map((p) => p.url)).toContain('/api/v1/households/h1/settlements/s1/confirm'))
    expect(await screen.findByText('Confirmed. Balances updated.')).toBeInTheDocument()
  })

  it('rejects with a reason', async () => {
    stubFetch([...routes([settlement()]), [/POST .*\/settlements\/s1\/reject$/, () => ok({ settlement: settlement({ status: 'rejected' }) })]])
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.type(await screen.findByLabelText('Why (optional)'), 'Never arrived')
    await userEvent.click(screen.getByRole('button', { name: 'Reject repayment' }))
    await waitFor(() => expect(posts().find((p) => p.url.endsWith('/reject')).body).toEqual({ reason: 'Never arrived' }))
  })

  it('rejects without a reason by sending an empty body', async () => {
    stubFetch([...routes([settlement()]), [/POST .*\/settlements\/s1\/reject$/, () => ok({ settlement: settlement({ status: 'rejected' }) })]])
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reject repayment' }))
    await waitFor(() => expect(posts().find((p) => p.url.endsWith('/reject')).body).toEqual({}))
  })

  it('lets me cancel a repayment I sent', async () => {
    stubFetch([...routes([settlement({ fromUserId: 'me', toUserId: 'bob' })]), [/POST .*\/settlements\/s1\/cancel$/, () => ok({ settlement: settlement({ status: 'cancelled' }) })]])
    mount()
    expect(await screen.findByText(/Waiting for Bob to confirm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm it arrived' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(posts().map((p) => p.url)).toContain('/api/v1/households/h1/settlements/s1/cancel'))
  })

  it('shows the server\'s words when the other person already settled it', async () => {
    stubFetch([...routes([settlement()]), [/POST .*\/confirm$/, () => reply(409, { error: { code: 'SETTLEMENT_NOT_PENDING', message: 'This repayment was already cancelled' }, meta: {} })]])
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm it arrived' }))
    expect(await screen.findByText('This repayment was already cancelled')).toBeInTheDocument()
  })

  it('lists finished repayments in the history, worded for me', async () => {
    stubFetch(routes([]))
    mount()
    const history = await screen.findByRole('heading', { name: 'Repayment history' })
    expect(await within(history.closest('section')).findByText('Bob paid you')).toBeInTheDocument()
    expect(within(history.closest('section')).getByText('Confirmed')).toBeInTheDocument()
  })
})
