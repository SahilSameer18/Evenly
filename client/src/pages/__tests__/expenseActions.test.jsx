import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { setAccessToken } from '../../api/client.js'
import { AuthContext } from '../../auth/context.js'
import { ToastProvider } from '../../components/ToastProvider.jsx'
import ExpenseDetail from '../ExpenseDetail.jsx'
// The server's own request schema: an edit body from the client must satisfy it exactly.
import { updateExpenseBody } from '../../../../server/src/modules/expenses/expense.validation.js'

const household = { id: 'h1', name: 'Flat 302', defaultSplitMethod: 'equal' }
const members = [{ userId: 'me', name: 'Alice', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'member' }]
const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })
const ok = (data) => reply(200, { data, meta: { requestId: 'r' } })
const auth = { status: 'signed-in', user: { id: 'me', name: 'Alice' } }

const expense = (over = {}) => ({
  id: 'e1', description: 'Groceries', amountMinor: 100000, type: 'shared', status: 'confirmed', version: 2,
  paidById: 'me', createdById: 'me', splitMethod: 'percentage', occurredAt: '2026-11-04T10:00:00Z', notes: null,
  splits: [{ userId: 'me', shareMinor: 60000 }, { userId: 'bob', shareMinor: 40000 }], ...over,
})
const event = (action, actorId, over = {}) => ({ id: `${action}-${actorId}`, action, actor: { id: actorId, name: actorId === 'me' ? 'Alice' : 'Bob' }, createdAt: '2026-11-04T10:00:00Z', reason: null, before: null, after: null, ...over })

let calls
beforeEach(() => {
  setAccessToken('tok')
  calls = []
})

function stub({ exp = expense(), history = [event('expense.created', 'me')], extra = [] }) {
  const routes = [
    ...extra,
    [/GET .*\/households\/h1$/, () => ok({ household: { ...household, members } })],
    [/GET .*\/expenses\/e1\/history$/, () => ok({ history })],
    [/GET .*\/expenses\/e1$/, () => ok({ expense: exp })],
  ]
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    for (const [pattern, handler] of routes) if (pattern.test(`${method} ${url}`)) return handler({ body })
    return reply(404, { error: { code: 'NOT_FOUND', message: 'not stubbed' }, meta: {} })
  }))
}
const writes = () => calls.filter((c) => c.method !== 'GET')

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/expenses/e1']}>
            <Routes>
              <Route element={<Outlet context={{ household }} />}>
                <Route path="/expenses/:expenseId" element={<ExpenseDetail />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}
const button = (name) => screen.findByRole('button', { name })

describe('which actions appear', () => {
  it('the person who recorded it sees Edit and Reverse, not Dispute', async () => {
    stub({})
    mount()
    expect(await button('Edit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reverse' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dispute' })).not.toBeInTheDocument()
  })

  it('another member sees Dispute, not Edit or Reverse', async () => {
    stub({ exp: expense({ createdById: 'bob', paidById: 'bob' }) })
    mount()
    expect(await button('Dispute')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument()
  })

  it('a reversed expense offers nothing', async () => {
    stub({ exp: expense({ status: 'reversed' }) })
    mount()
    expect(await screen.findByText('Reversed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument()
  })

  it('shows who did what in the history, with the reason', async () => {
    stub({ history: [event('expense.created', 'me'), event('expense.reversed', 'me', { reason: 'Entered twice' })] })
    mount()
    expect(await screen.findByText('Added by Alice')).toBeInTheDocument()
    expect(screen.getByText('Reversed by Alice')).toBeInTheDocument()
    expect(screen.getByText('“Entered twice”')).toBeInTheDocument()
  })
})

describe('reverse and dispute', () => {
  it('reverse needs a reason, then sends it', async () => {
    stub({ extra: [[/POST .*\/reverse$/, () => ok({ expense: expense({ status: 'reversed' }) })]] })
    mount()
    await userEvent.click(await button('Reverse'))
    await userEvent.click(await button('Reverse expense'))
    expect(screen.getByText('Add a reason')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await userEvent.type(screen.getByLabelText('Why are you reversing it?'), 'Entered twice')
    await userEvent.click(screen.getByRole('button', { name: 'Reverse expense' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/v1/households/h1/expenses/e1/reverse', body: { reason: 'Entered twice' } })
  })

  it('dispute needs a reason, then sends it', async () => {
    stub({ exp: expense({ createdById: 'bob', paidById: 'bob' }), extra: [[/POST .*\/dispute$/, () => ok({ expense: expense({ status: 'disputed' }) })]] })
    mount()
    await userEvent.click(await button('Dispute'))
    await userEvent.type(await screen.findByLabelText('What looks wrong?'), 'Amount is wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Send dispute' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toMatchObject({ url: '/api/v1/households/h1/expenses/e1/dispute', body: { reason: 'Amount is wrong' } })
  })

  it('only the person who raised a dispute can withdraw it', async () => {
    const disputed = expense({ createdById: 'bob', paidById: 'bob', status: 'disputed' })
    stub({ exp: disputed, history: [event('expense.created', 'bob'), event('expense.disputed', 'me', { reason: 'Wrong' })], extra: [[/POST .*\/dispute\/withdraw$/, () => ok({ expense: expense() })]] })
    mount()
    await userEvent.click(await button('Withdraw dispute'))
    await waitFor(() => expect(writes()[0]?.url).toBe('/api/v1/households/h1/expenses/e1/dispute/withdraw'))
  })

  it('someone else\'s dispute cannot be withdrawn by me', async () => {
    stub({ exp: expense({ createdById: 'bob', paidById: 'bob', status: 'disputed' }), history: [event('expense.disputed', 'carol')] })
    mount()
    expect(await screen.findByText(/still counts in balances/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw dispute' })).not.toBeInTheDocument()
  })
})

describe('editing', () => {
  it('opens with the stored values; a percentage split opens as exact amounts, and the body satisfies the server schema', async () => {
    stub({ extra: [[/PATCH .*\/expenses\/e1$/, () => ok({ expense: expense({ version: 3 }) })]] })
    mount()
    await userEvent.click(await button('Edit'))
    expect(await screen.findByLabelText('Amount (₹)')).toHaveValue('1000')
    expect(screen.getByLabelText('What was it for?')).toHaveValue('Groceries')
    expect(screen.getByRole('radio', { name: 'Exact' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/split by percentage/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Personal' })).not.toBeInTheDocument() // the kind cannot change

    const description = screen.getByLabelText('What was it for?')
    await userEvent.clear(description)
    await userEvent.type(description, 'Weekly groceries')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    await userEvent.click(await button('Save changes'))
    await waitFor(() => expect(writes()).toHaveLength(1))
    const { body } = writes()[0]
    expect(writes()[0].method).toBe('PATCH')
    expect(body).toEqual({
      type: 'shared', paidById: 'me', description: 'Weekly groceries', amountMinor: 100000, version: 2,
      split: { method: 'exact', shares: [{ userId: 'me', shareMinor: 60000 }, { userId: 'bob', shareMinor: 40000 }] },
    })
    expect(updateExpenseBody.safeParse(body).error?.issues).toBeUndefined()
  })

  it('when someone else edited first (409), explains it and offers to reload', async () => {
    stub({ extra: [[/PATCH .*\/expenses\/e1$/, () => reply(409, { error: { code: 'STALE_VERSION', message: 'changed', details: { currentVersion: 3 } }, meta: {} })]] })
    mount()
    await userEvent.click(await button('Edit'))
    await screen.findByLabelText('Amount (₹)')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    await userEvent.click(await button('Save changes'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this expense')
    await userEvent.click(screen.getByRole('button', { name: 'Reload the latest' }))
    expect(await screen.findByText(/Reloaded the latest version/)).toBeInTheDocument()
  })
})
