import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider.jsx'
import { GuestOnly, RequireAuth } from './auth/RequireAuth.jsx'
import { AppShell } from './components/AppShell.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'

// Screens load on demand, so the first visit downloads only what it needs.
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Expenses = lazy(() => import('./pages/Expenses.jsx'))
const ExpenseDetail = lazy(() => import('./pages/ExpenseDetail.jsx'))
const Settle = lazy(() => import('./pages/Settle.jsx'))
const AuthCard = lazy(() => import('./pages/AuthCard.jsx'))
const Invite = lazy(() => import('./pages/Invite.jsx'))
const CreateHousehold = lazy(() => import('./pages/CreateHousehold.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

// Reads are cached for 30 s and never refetched just because the window regained focus (network and battery).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } },
})

const router = createBrowserRouter([
  // One card for both addresses: it stays mounted when moving between them, so the panel can slide.
  { element: <GuestOnly />, children: [{ element: <AuthCard />, children: [{ path: '/login' }, { path: '/register' }] }] },
  // Works signed out: the visitor is sent to log in or register and brought back.
  { path: '/invite/:token', element: <Invite /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/household/new', element: <CreateHousehold /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Overview /> },
          { path: '/expenses', element: <Expenses />, children: [{ path: ':expenseId', element: <ExpenseDetail /> }] },
          { path: '/settle', element: <Settle /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={null}>
            <RouterProvider router={router} />
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
