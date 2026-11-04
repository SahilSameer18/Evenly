import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context.js'
import { peekInvite } from './pendingInvite.js'

// Signed-out visitors go to login and come back to where they were headed.
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

// Login and register are for signed-out people only. Once signed in they go to a waiting invitation, else to
// where they were headed, else home. This is the one place that decides, so a form cannot race it.
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'signed-in') {
    const invite = peekInvite()
    return <Navigate to={invite ? `/invite/${invite}` : (location.state?.from ?? '/')} replace />
  }
  return <Outlet />
}
