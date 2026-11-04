import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context.js'
import { AuthLayout } from '../components/AuthLayout.jsx'
import { Button } from '../components/Button.jsx'
import { Field } from '../components/Field.jsx'
import { fieldErrors, formMessage } from '../lib/errors.js'

export default function Login() {
  const { login } = useAuth()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fields = fieldErrors(error)

  async function onSubmit(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await login({ email: form.get('email'), password: form.get('password') }) // GuestOnly then redirects
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Log in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formMessage(error) && <p role="alert" className="text-owe">{formMessage(error)}</p>}
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={fields.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fields.password} />
        <Button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button>
      </form>
      <p className="flex flex-wrap items-center gap-x-2 text-ink-2">New here? <Link to="/register" className="inline-flex min-h-11 items-center text-ink underline">Create an account</Link></p>
    </AuthLayout>
  )
}
