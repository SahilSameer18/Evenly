import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider.jsx'
import { GuestOnly, RequireAuth } from './auth/RequireAuth.jsx'
import { AppShell } from './components/AppShell.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'
import { Expenses, Home, Settle } from './pages/Placeholders.jsx'

// Screens load on demand, so the first visit downloads only what it needs.
const Login = lazy(() => import('./pages/Login.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const Invite = lazy(() => import('./pages/Invite.jsx'))
const CreateHousehold = lazy(() => import('./pages/CreateHousehold.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

// Reads are cached for 30 s and never refetched just because the window regained focus (network and battery).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } },
})

const router = createBrowserRouter([
  { element: <GuestOnly />, children: [{ path: '/login', element: <Login /> }, { path: '/register', element: <Register /> }] },
  // Works signed out: the visitor is sent to log in or register and brought back.
  { path: '/invite/:token', element: <Invite /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/household/new', element: <CreateHousehold /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/expenses', element: <Expenses /> },
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
