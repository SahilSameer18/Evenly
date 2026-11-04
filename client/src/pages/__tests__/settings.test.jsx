import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { setAccessToken } from '../../api/client.js'
import { AuthContext } from '../../auth/context.js'
import { ToastProvider } from '../../components/ToastProvider.jsx'
import Settings from '../Settings.jsx'

const members = [{ userId: 'me', name: 'Alice', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'member' }]
const reply = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })
const auth = { status: 'signed-in', user: { id: 'me', name: 'Alice', email: 'a@example.com' }, logout: vi.fn() }

let patches
beforeEach(() => {
  setAccessToken('tok')
  patches = []
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (init.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(init.body) })
      return reply(200, { data: { household: {} }, meta: {} })
    }
    return reply(200, { data: { household: { id: 'h1', name: 'Flat 302', members } }, meta: {} })
  }))
})

function mount(myRole) {
  const household = { id: 'h1', name: 'Flat 302', defaultSplitMethod: 'equal', myRole }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route element={<Outlet context={{ household }} />}>
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('household settings', () => {
  it('the owner can rename it and change the usual split, and only changed fields are sent', async () => {
    mount('owner')
    const name = await screen.findByLabelText('Household name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Flat 303')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({ url: '/api/v1/households/h1', body: { name: 'Flat 303' } })

    await userEvent.selectOptions(screen.getByLabelText('Usual way to split'), 'percentage')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(patches).toHaveLength(2))
    // The page's household object is a fixed mock here, so the name still differs from it and is sent again.
    expect(patches[1].body).toEqual({ name: 'Flat 303', defaultSplitMethod: 'percentage' })
  })

  it('saving without a change sends nothing', async () => {
    mount('owner')
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Nothing to save.')).toBeInTheDocument()
    expect(patches).toHaveLength(0)
  })

  it('a member sees the details but cannot change them', async () => {
    mount('member')
    expect(await screen.findByText(/Only the owner can change this/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('lists the members', async () => {
    mount('owner')
    expect(await screen.findByText('Bob')).toBeInTheDocument()
  })
})
