import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { getAccessToken, setAccessToken } from '../../api/client.js'
import { AuthProvider } from '../AuthProvider.jsx'
import { useAuth } from '../context.js'
import { RequireAuth } from '../RequireAuth.jsx'
import { clearInvite, peekInvite, rememberInvite } from '../pendingInvite.js'
import { GuestOnly } from '../RequireAuth.jsx'

const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })
const ok = (data) => reply(200, { data, meta: { requestId: 'r' } })
const fail = (status, code) => reply(status, { error: { code, message: code }, meta: { requestId: 'r' } })
const alice = { id: 'u1', name: 'Alice', email: 'a@example.com' }

let fetchMock
// The latest auth value, captured in an effect so tests can call login and logout.
const sink = { current: null }
function Probe() {
  const value = useAuth()
  useEffect(() => { sink.current = value })
  return <div>status:{value.status}</div>
}
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )

beforeEach(() => {
  setAccessToken(null)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('session restore', () => {
  it('signs in from the refresh cookie without a login screen', async () => {
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? ok({ accessToken: 'tok' }) : ok({ user: alice })))
    mount()
    expect(await screen.findByText('status:signed-in')).toBeInTheDocument()
    expect(sink.current.user.name).toBe('Alice')
    expect(getAccessToken()).toBe('tok')
  })

  it('sends a signed-out visitor to the login page', async () => {
    fetchMock.mockResolvedValue(fail(401, 'UNAUTHENTICATED'))
    mount()
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })
})

describe('login and logout', () => {
  const signedIn = async () => {
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? ok({ accessToken: 'tok' }) : ok({ user: alice })))
    mount()
    await screen.findByText('status:signed-in')
  }

  it('keeps the token in memory only', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return fail(401, 'UNAUTHENTICATED')
      return ok({ user: alice, accessToken: 'login-token' })
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    mount()
    await screen.findByText('login page')
    // log in through a fresh provider tree that has no route guard
    function Grab() {
      const value = useAuth()
      useEffect(() => { sink.current = value })
      return null
    }
    render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Grab /></AuthProvider></QueryClientProvider>)
    await act(() => sink.current.login({ email: 'a@example.com', password: 'pw' }))
    expect(getAccessToken()).toBe('login-token')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('logout clears the token and returns to the login page', async () => {
    await signedIn()
    fetchMock.mockResolvedValue(ok({ loggedOut: true }))
    await act(() => sink.current.logout())
    expect(getAccessToken()).toBeNull()
    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument())
    const [, init] = fetchMock.mock.calls.at(-1)
    expect(init.headers['X-Evenly-Client']).toBe('web')
  })

  it('logout still signs out locally if the server cannot be reached', async () => {
    await signedIn()
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await act(() => sink.current.logout().catch(() => {}))
    expect(getAccessToken()).toBeNull()
  })
})

describe('pending invitation', () => {
  it('is kept until cleared', () => {
    rememberInvite('abc')
    expect(peekInvite()).toBe('abc')
    expect(peekInvite()).toBe('abc')
    clearInvite()
    expect(peekInvite()).toBeNull()
  })

  // The bug found by hand: after signing in, the redirect must go to the waiting invitation, then to where
  // the person was headed, else home.
  describe('the signed-in redirect (GuestOnly)', () => {
    const signedInAt = (entry) => {
      fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? ok({ accessToken: 'tok' }) : ok({ user: alice })))
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route element={<GuestOnly />}><Route path="/login" element={<div>login page</div>} /></Route>
                <Route path="/invite/:token" element={<div>invite page</div>} />
                <Route path="/expenses" element={<div>expenses page</div>} />
                <Route path="/" element={<div>home page</div>} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      )
    }

    it('goes to a waiting invitation first', async () => {
      rememberInvite('tok123')
      signedInAt('/login')
      expect(await screen.findByText('invite page')).toBeInTheDocument()
      clearInvite()
    })

    it('goes to where the person was headed', async () => {
      clearInvite()
      signedInAt({ pathname: '/login', state: { from: '/expenses' } })
      expect(await screen.findByText('expenses page')).toBeInTheDocument()
    })

    it('otherwise goes home', async () => {
      clearInvite()
      signedInAt('/login')
      expect(await screen.findByText('home page')).toBeInTheDocument()
    })
  })
})
