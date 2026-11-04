import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client.js'
import { useMyHousehold } from '../api/households.js'
import { AuthLayout } from '../components/AuthLayout.jsx'
import { Button } from '../components/Button.jsx'
import { Field } from '../components/Field.jsx'
import { fieldErrors, formMessage } from '../lib/errors.js'

const SPLITS = [
  ['equal', 'Equally'],
  ['percentage', 'By percentage'],
  ['exact', 'Exact amounts'],
  ['weights', 'By weights'],
]

export default function CreateHousehold() {
  const { household, isPending } = useMyHousehold()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fields = fieldErrors(error)

  if (isPending) return null
  if (household) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await request('/households', {
        method: 'POST',
        body: { name: form.get('name'), defaultSplitMethod: form.get('split'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      })
      await queryClient.invalidateQueries({ queryKey: ['households'] })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Set up your household">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formMessage(error) && <p role="alert" className="text-owe">{formMessage(error)}</p>}
        <Field label="Household name" name="name" placeholder="Flat 302" required error={fields.name} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="split" className="text-ink-2">Usual way to split</label>
          <select id="split" name="split" defaultValue="equal" className="min-h-12 rounded-xl border border-edge bg-panel px-3 text-ink">
            {SPLITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create household'}</Button>
      </form>
    </AuthLayout>
  )
}
