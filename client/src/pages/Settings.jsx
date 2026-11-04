import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client.js'
import { updateHousehold, useHousehold } from '../api/households.js'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { Field } from '../components/Field.jsx'
import { Icon } from '../components/Icon.jsx'
import { Avatar, Panel, Skeleton } from '../components/Panel.jsx'
import { ErrorState } from '../components/States.jsx'
import { useToast } from '../components/toast.js'
import { fieldErrors } from '../lib/errors.js'
import { stagger } from '../lib/motion.js'
import { getTheme, setTheme } from '../lib/theme.js'

const SPLITS = [['equal', 'Equally'], ['percentage', 'By percentage'], ['exact', 'Exact amounts'], ['weights', 'By weights']]

// The owner can rename the household and change the usual way to split; everyone else just sees them.
function HouseholdDetails({ household }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(household.name)
  const [split, setSplit] = useState(household.defaultSplitMethod)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fields = fieldErrors(error)

  if (household.myRole !== 'owner') {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="num text-lg">{household.name}</h2>
        <p className="text-ink-2">Usual way to split: {SPLITS.find(([v]) => v === household.defaultSplitMethod)?.[1] ?? household.defaultSplitMethod}. Only the owner can change this.</p>
      </div>
    )
  }

  async function save(e) {
    e.preventDefault()
    const body = {
      ...(name.trim() !== household.name && { name: name.trim() }),
      ...(split !== household.defaultSplitMethod && { defaultSplitMethod: split }),
    }
    if (Object.keys(body).length === 0) return toast('Nothing to save.')
    setBusy(true)
    setError(null)
    try {
      await updateHousehold(household.id, body)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['households'] }), queryClient.invalidateQueries({ queryKey: ['household', household.id] })])
      toast('Household updated.')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-3">
      <h2 className="num text-lg">Your household</h2>
      <Field label="Household name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={fields.name} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="usual-split" className="text-ink-2">Usual way to split</label>
        <select id="usual-split" value={split} onChange={(e) => setSplit(e.target.value)} className="min-h-12 rounded-xl border border-ink-2/40 bg-panel px-3 text-ink">
          {SPLITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {error && !fields.name && <p role="alert" className="text-owe">{error.message}</p>}
      <div><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div>
    </form>
  )
}

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
      <h1 className="enter-fade num text-2xl">Settings</h1>

      <Panel style={stagger(0)} className="enter flex flex-col gap-3">
        <HouseholdDetails household={household} />
        <h3 className="num pt-2 text-base">Members</h3>
        <Members householdId={household.id} />
      </Panel>

      {household.myRole === 'owner' && (
        <Panel style={stagger(1)} className="enter flex flex-col gap-3">
          <h2 className="num text-lg">Invite a roommate</h2>
          <InviteLink householdId={household.id} />
        </Panel>
      )}

      <Panel style={stagger(2)} className="enter flex flex-col gap-3">
        <h2 className="num text-lg">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="flex gap-2">
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => { setTheme(value); setThemeState(value) }}
              className={`min-h-11 flex-1 rounded-full border px-4 font-medium transition-colors duration-150 active:scale-[0.97] ${theme === value ? 'border-transparent bg-action text-on-action' : 'border-edge text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel style={stagger(3)} className="enter flex flex-col gap-3">
        <p className="text-ink-2">Signed in as {user.name} ({user.email})</p>
        <Button variant="quiet" onClick={logout}><Icon name="log-out" />Log out</Button>
      </Panel>
    </div>
  )
}
