import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { StatusPage } from '../components/StatusPage.jsx'

export default function NotFound() {
  const { status } = useAuth()
  return (
    <StatusPage
      visual="404"
      title="That page doesn’t exist"
      actions={<><Button to="/">Back to home</Button>{status === 'signed-out' && <Button variant="quiet" to="/login">Log in</Button>}</>}
    >
      The link may be old or mistyped. Nothing was lost.
    </StatusPage>
  )
}
