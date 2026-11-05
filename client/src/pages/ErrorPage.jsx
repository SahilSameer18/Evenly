import { useRouteError } from 'react-router'
import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { StatusPage } from '../components/StatusPage.jsx'

// After a new version goes live, a page still open in a tab asks for files that no longer exist. Reloading fixes it.
const STALE = /dynamically imported module|importing a module script|loading chunk/i

// Not lazy on purpose: this is what shows when loading a lazy page fails.
export default function ErrorPage() {
  const error = useRouteError()
  const stale = STALE.test(String(error?.message ?? ''))
  return (
    <StatusPage
      visual={<Icon name={stale ? 'refresh' : 'alert'} size={88} />}
      title={stale ? 'A new version is ready' : 'Something went wrong'}
      actions={<><Button onClick={() => window.location.reload()}>Reload</Button><Button variant="quiet" to="/">Back to home</Button></>}
    >
      {stale ? 'Evenly was updated while this page was open. Reload to get the latest version.' : 'The page hit a problem. Your data is safe, and reloading usually fixes it.'}
      {error?.requestId && <span className="mt-2 block text-xs">Reference: {error.requestId}</span>}
    </StatusPage>
  )
}
