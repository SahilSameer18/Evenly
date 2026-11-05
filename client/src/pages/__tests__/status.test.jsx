import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, Route, Routes, createMemoryRouter } from 'react-router'
import { AuthContext } from '../../auth/context.js'
import { GuestOnly, RequireAuth } from '../../auth/RequireAuth.jsx'
import { Splash } from '../../components/Splash.jsx'
import ErrorPage from '../ErrorPage.jsx'
import NotFound from '../NotFound.jsx'

afterEach(() => vi.useRealTimers())

const withAuth = (status, ui) => <AuthContext.Provider value={{ status, user: null }}>{ui}</AuthContext.Provider>

describe('Splash', () => {
  it('shows only the mark at first, then says the server is waking up', () => {
    vi.useFakeTimers()
    render(<Splash />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Evenly')
    expect(screen.queryByText('Waking up the server')).toBeNull()
    act(() => { vi.advanceTimersByTime(1600) })
    expect(screen.getByText('Waking up the server')).toBeInTheDocument()
  })

  it('stops its timer when it goes away', () => {
    vi.useFakeTimers()
    const { unmount } = render(<Splash />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('replaces the blank screen in both auth guards while the session is being checked', () => {
    for (const Guard of [RequireAuth, GuestOnly]) {
      const { unmount } = render(withAuth('loading', <MemoryRouter><Routes><Route element={<Guard />}><Route path="/" element={<p>inside</p>} /></Route></Routes></MemoryRouter>))
      expect(screen.getByRole('status')).toHaveTextContent('Loading Evenly')
      expect(screen.queryByText('inside')).toBeNull()
      unmount()
    }
  })
})

describe('NotFound', () => {
  const at = (status) => render(withAuth(status, <MemoryRouter initialEntries={['/nope']}><Routes><Route path="*" element={<NotFound />} /></Routes></MemoryRouter>))

  it('says the page does not exist and offers the way home', () => {
    at('signed-in')
    expect(screen.getByRole('heading', { name: /doesn’t exist/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
  })

  it('also offers Log in to a signed-out visitor', () => {
    at('signed-out')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})

describe('ErrorPage', () => {
  const crash = (error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw error }
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <ErrorPage /> }])} />)
  }

  it('shows a calm message with Reload and a way home when a screen throws', () => {
    crash(Object.assign(new Error('boom'), { requestId: 'req-42' }))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Reference: req-42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })

  it('says a new version is ready when a page file could not be loaded', () => {
    crash(new Error('Failed to fetch dynamically imported module: /assets/Settle-abc.js'))
    expect(screen.getByRole('heading', { name: 'A new version is ready' })).toBeInTheDocument()
  })

  it('reloads the page when Reload is pressed', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    crash(new Error('boom'))
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
