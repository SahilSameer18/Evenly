import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context.js'
import { AuthLayout } from '../components/AuthLayout.jsx'
import { Button } from '../components/Button.jsx'
import { Field } from '../components/Field.jsx'
import { fieldErrors, formMessage } from '../lib/errors.js'

export default function Register() {
  const { register } = useAuth()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fields = fieldErrors(error)

  async function onSubmit(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await register({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) // GuestOnly then redirects
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formMessage(error) && <p role="alert" className="text-owe">{formMessage(error)}</p>}
        <Field label="Name" name="name" autoComplete="name" required error={fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={fields.email} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters." error={fields.password} />
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      </form>
      <p className="text-ink-2">Already have an account? <Link to="/login" className="text-ink underline">Log in</Link></p>
    </AuthLayout>
  )
}
