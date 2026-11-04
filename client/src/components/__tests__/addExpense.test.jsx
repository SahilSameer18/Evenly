import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setAccessToken } from '../../api/client.js'
import { AuthContext } from '../../auth/context.js'
import { AddExpenseSheet } from '../AddExpenseSheet.jsx'

const household = { id: 'h1', name: 'Flat 302', defaultSplitMethod: 'equal' }
const members = [{ userId: 'me', name: 'Alice', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'member' }]
const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })

let posts
let onPost
beforeEach(() => {
  setAccessToken('tok')
  posts = []
  onPost = async () => reply(201, { data: { expense: { id: 'e1', description: 'Groceries' }, balanceAfter: {} }, meta: { requestId: 'r' } })
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (init.method === 'POST') {
      posts.push({ url, init, body: JSON.parse(init.body) })
      return onPost()
    }
    return reply(200, { data: { household: { ...household, members } }, meta: { requestId: 'r' } })
  }))
})

async function open(onSaved = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={{ status: 'signed-in', user: { id: 'me', name: 'Alice' } }}>
        <AddExpenseSheet open onClose={() => {}} household={household} onSaved={onSaved} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  await screen.findByLabelText('Amount (₹)')
  return onSaved
}
const fill = async (amount = '1250', what = 'Groceries') => {
  await userEvent.type(screen.getByLabelText('Amount (₹)'), amount)
  await userEvent.type(screen.getByLabelText('What was it for?'), what)
}
const toReview = async () => userEvent.click(screen.getByRole('button', { name: 'Review' }))

describe('Add expense', () => {
  it('reviews, then saves one request with the right body and an idempotency key', async () => {
    const onSaved = await open()
    await fill()
    await toReview()
    expect(screen.getByText('Shared expense')).toBeInTheDocument()
    expect(screen.getAllByText('₹625')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'e1', description: 'Groceries' }))
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe('/api/v1/households/h1/expenses')
    expect(posts[0].body).toEqual({ type: 'shared', paidById: 'me', description: 'Groceries', amountMinor: 125000, split: { method: 'equal', participants: ['me', 'bob'] } })
    expect(posts[0].init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('does not go to review until the form is valid, and says what is missing', async () => {
    await open()
    await toReview()
    // jsdom applies no CSS, so both the phone and the desktop amount blocks are present and each says it.
    expect(screen.getAllByText('Enter an amount').length).toBeGreaterThan(0)
    expect(screen.getByText('Add a description')).toBeInTheDocument()
    expect(screen.queryByText('Shared expense')).not.toBeInTheDocument()
  })

  it('explains an exact split that does not add up', async () => {
    await open()
    await fill('100')
    await userEvent.click(screen.getByRole('radio', { name: 'Exact' }))
    await userEvent.type(screen.getByLabelText('Alice: amount'), '60')
    await userEvent.type(screen.getByLabelText('Bob: amount'), '30')
    await toReview()
    expect(screen.getAllByText('₹10 left to assign').length).toBeGreaterThan(0)
    expect(screen.queryByText('Shared expense')).not.toBeInTheDocument()
  })

  it('a double tap on Save sends a single request', async () => {
    let release
    onPost = () => new Promise((resolve) => { release = () => resolve(reply(201, { data: { expense: { id: 'e1' } }, meta: {} })) })
    await open()
    await fill()
    await toReview()
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save expense' }))
    expect(posts).toHaveLength(1)
    release()
  })

  it('after a network failure, the retry reuses the same key so it cannot create two expenses', async () => {
    const onSaved = await open()
    await fill()
    await toReview()
    onPost = async () => { throw new TypeError('offline') }
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(onSaved).not.toHaveBeenCalled()
    onPost = async () => reply(201, { data: { expense: { id: 'e1' } }, meta: {} })
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(posts).toHaveLength(2)
    expect(posts[1].init.headers['Idempotency-Key']).toBe(posts[0].init.headers['Idempotency-Key'])
  })

  it('a personal expense has no split and no payer', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'Personal' }))
    expect(screen.queryByLabelText('Paid by')).not.toBeInTheDocument()
    await fill('50', 'Chai')
    await toReview()
    expect(screen.getByText(/never changes anyone's balance/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toEqual({ type: 'personal', description: 'Chai', amountMinor: 5000 })
  })
})
