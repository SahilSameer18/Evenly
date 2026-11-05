import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { setAccessToken } from '../../api/client.js'
import { AuthContext } from '../../auth/context.js'
import { ToastProvider } from '../../components/ToastProvider.jsx'
import { currentMonthIn } from '../../lib/charts.js'
import Report from '../Report.jsx'

const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })
const auth = { status: 'signed-in', user: { id: 'me', name: 'Alice', email: 'a@example.com' } }
const household = { id: 'h1', name: 'Flat 302' }
const thisMonth = currentMonthIn('Asia/Kolkata')
const earlier = (n) => { const [y, m] = thisMonth.split('-').map(Number); const t = y * 12 + (m - 1) - n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

const reportFor = (month) => ({
  month, timezone: 'Asia/Kolkata', spendMinor: 460000, previousSpendMinor: 400000,
  members: [{ userId: 'me', name: 'Alice', active: true, paidMinor: 260000, shareMinor: 230000 }, { userId: 'bob', name: 'Bob', active: true, paidMinor: 200000, shareMinor: 230000 }],
  trend: Array.from({ length: 6 }, (_, i) => ({ month: earlier(5 - i), spendMinor: i * 100000 })),
})
const balances = { members: [{ userId: 'me', name: 'Alice', active: true, netMinor: 30000 }, { userId: 'bob', name: 'Bob', active: true, netMinor: -30000 }] }

let urls
function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p> }
function mount(initial = '/report') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}> {/* as in the app */}
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initial]}>
            <Where />
            <Routes>
              <Route element={<Outlet context={{ household }} />}>
                <Route path="/report" element={<Report />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  setAccessToken('tok')
  urls = []
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    urls.push(url)
    if (url.includes('/reports/monthly')) return reply(200, { data: reportFor(new URL(url, 'http://x').searchParams.get('month') ?? thisMonth), meta: {} })
    if (url.endsWith('/balances')) return reply(200, { data: balances, meta: {} })
    return reply(404, { error: { code: 'NOT_FOUND', message: 'no' }, meta: {} })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('monthly report page', () => {
  it('shows the month, the spending in words, what you paid and your share', async () => {
    mount()
    expect(await screen.findByText('Up 15% from ' + new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(new Date(`${earlier(1)}-01T00:00:00Z`)))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled() // already on the current month
    const summary = within(screen.getByRole('region', { name: 'Shared spending this month' }))
    expect(summary.getByText('₹2,600')).toBeInTheDocument()
    expect(summary.getByText('₹2,300')).toBeInTheDocument()
  })

  it('asks for the previous month when you go back, and drops the parameter when you return', async () => {
    mount()
    await screen.findByText(/from /)
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(urls.some((u) => u.includes(`month=${earlier(1)}`))).toBe(true))
    expect(screen.getByTestId('where')).toHaveTextContent(`?month=${earlier(1)}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('month='))
  })

  it('opens a month when its column is tapped', async () => {
    mount()
    await screen.findByText(/from /)
    await userEvent.click(screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith(new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(new Date(`${earlier(2)}-01T00:00:00Z`)))))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`month=${earlier(2)}`))
  })

  it('ignores a month in the address that is not YYYY-MM', async () => {
    mount('/report?month=banana')
    await screen.findByText(/from /)
    expect(urls.find((u) => u.includes('/reports/monthly'))).not.toContain('month=')
  })

  it('shows an error with a way to retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { error: { code: 'FORBIDDEN', message: 'It broke' }, meta: { requestId: 'r1' } }))) // a 500 would be retried with delays
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('It broke')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('copies the summary when the phone has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    mount()
    await screen.findByText(/from /)
    await userEvent.click(screen.getByRole('button', { name: 'Share summary' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('Evenly · Flat 302')
    expect(text).toContain('Alice: paid ₹2,600, share ₹2,300')
    expect(await screen.findByText('Summary copied')).toBeInTheDocument()
  })
})
