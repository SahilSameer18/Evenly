import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { request } from '../api/client.js'
import { useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { Avatar, Panel, Skeleton } from '../components/Panel.jsx'
import { ErrorState } from '../components/States.jsx'
import { useToast } from '../components/toast.js'
import { getTheme, setTheme } from '../lib/theme.js'

function Members({ householdId }) {
  const { data, isPending, error, refetch } = useHousehold(householdId)
  if (isPending) return <Skeleton className="h-24" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <ul className="flex flex-col divide-y divide-edge">
      {data.members.map((m) => (
        <li key={m.userId} className="flex items-center gap-3 py-2.5">
          <Avatar name={m.name} />
          <span className="flex-1 font-medium">{m.name}</span>
          <span className="text-ink-2">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
        </li>
      ))}
    </ul>
  )
}

// The link is shown once: the server keeps only a hash, so it cannot show it again.
function InviteLink({ householdId }) {
  const toast = useToast()
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const { data } = await request(`/households/${householdId}/invitations`, { method: 'POST', body: {} })
      setLink(`${window.location.origin}/invite/${data.token}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copied')
    } catch {
      toast('Select the link and copy it')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorState error={error} />}
      {link ? (
        <>
          <input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} className="min-h-12 rounded-xl border border-edge bg-panel px-3 text-ink" />
          <Button onClick={copy}><Icon name="copy" />Copy link</Button>
          <p className="text-ink-2">Works once and expires in 7 days. It is shown only now, so copy it before leaving this screen.</p>
        </>
      ) : (
        <Button variant="quiet" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create invite link'}</Button>
      )}
    </div>
  )
}

const THEMES = [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]

export default function Settings() {
  const { household } = useOutletContext()
  const { user, logout } = useAuth()
  const [theme, setThemeState] = useState(getTheme)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="num text-2xl">Settings</h1>

      <Panel className="flex flex-col gap-3">
        <h2 className="num text-lg">{household.name}</h2>
        <Members householdId={household.id} />
      </Panel>

      {household.myRole === 'owner' && (
        <Panel className="flex flex-col gap-3">
          <h2 className="num text-lg">Invite a roommate</h2>
          <InviteLink householdId={household.id} />
        </Panel>
      )}

      <Panel className="flex flex-col gap-3">
        <h2 className="num text-lg">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="flex gap-2">
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => { setTheme(value); setThemeState(value) }}
              className={`min-h-11 flex-1 rounded-full border px-4 font-medium ${theme === value ? 'border-transparent bg-action text-on-action' : 'border-edge text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <p className="text-ink-2">Signed in as {user.name} ({user.email})</p>
        <Button variant="quiet" onClick={logout}><Icon name="log-out" />Log out</Button>
      </Panel>
    </div>
  )
}
