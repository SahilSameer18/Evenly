import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client.js'
import { useAuth } from '../auth/context.js'
import { clearInvite, rememberInvite } from '../auth/pendingInvite.js'
import { AuthLayout } from '../components/AuthLayout.jsx'
import { Button } from '../components/Button.jsx'

export default function Invite() {
  const { token } = useParams()
  const { status } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Signed-out visitors log in or register first and are brought back here; once they are here, signed in, it is done.
  useEffect(() => {
    if (status === 'signed-out') rememberInvite(token)
    if (status === 'signed-in') clearInvite()
  }, [status, token])

  async function join() {
    setBusy(true)
    setError(null)
    try {
      await request('/invitations/accept', { method: 'POST', body: { token } })
      await queryClient.invalidateQueries({ queryKey: ['households'] })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return null

  return (
    <AuthLayout title="You're invited">
      <p className="text-ink-2">Join a household to split expenses with your roommates.</p>
      {error && (
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-owe">{error.message}</p>
          {error.requestId && <p className="text-xs text-ink-2">Reference: {error.requestId}</p>}
        </div>
      )}
      {status === 'signed-in' ? (
        error?.code === 'ALREADY_MEMBER' ? <Button to="/">Go to your household</Button> : <Button onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join household'}</Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Button to="/login">Log in to join</Button>
          <Button to="/register" variant="quiet">Create an account</Button>
        </div>
      )}
    </AuthLayout>
  )
}
