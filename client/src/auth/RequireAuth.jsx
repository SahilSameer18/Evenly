import { lazy } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Splash } from '../components/Splash.jsx'
import { useAuth } from './context.js'
import { peekInvite } from './pendingInvite.js'

const Landing = lazy(() => import('../pages/Landing.jsx'))

// Signed-out visitors go to login and come back to where they were headed. The front door, exactly "/", shows
// the landing page instead, so the product has something to say before asking anyone to log in.
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signed-out') {
    return location.pathname === '/' ? <Landing /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

// Login and register are for signed-out people only. Once signed in they go to a waiting invitation, else to
// where they were headed, else home. This is the one place that decides, so a form cannot race it.
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signed-in') {
    const invite = peekInvite()
    return <Navigate to={invite ? `/invite/${invite}` : (location.state?.from ?? '/')} replace />
  }
  return <Outlet />
}
