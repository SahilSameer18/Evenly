import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/context.js'
import { Button } from '../components/Button.jsx'
import { Field } from '../components/Field.jsx'
import { Icon } from '../components/Icon.jsx'
import { PasswordField } from '../components/PasswordField.jsx'
import { fieldErrors, formMessage } from '../lib/errors.js'

// One card for both /login and /register. It does not remount when the address changes, so on wide screens a
// dark panel slides (transform only) from one side to the other and reveals the other form. On phones there is
// no room to slide: the active form is shown on its own and pops in.

function Title({ active, id, children }) {
  const Tag = active ? 'h1' : 'p' // only the form in view carries the page heading
  return <Tag id={id} className="num text-3xl">{children}</Tag>
}

function SwitchLink({ to, state, children }) {
  return (
    <p className="text-ink-2 md:hidden">
      {children[0]} <Link to={to} state={state} className="inline-flex min-h-11 items-center text-ink underline">{children[1]}</Link>
    </p>
  )
}

function LoginForm({ active, state }) {
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate aria-labelledby="login-title">
      <div>
        <Title active={active} id="login-title">Welcome back</Title>
        <p className="mt-1 text-ink-2">Log in to see where you stand.</p>
      </div>
      {formMessage(error) && <p role="alert" className="text-owe">{formMessage(error)}</p>}
      <Field label="Email" name="email" type="email" icon="mail" placeholder="you@example.com" autoComplete="email" inputMode="email" required error={fields.email} />
      <PasswordField label="Password" name="password" placeholder="Your password" autoComplete="current-password" required error={fields.password} />
      <Button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button>
      <SwitchLink to="/register" state={state}>{['New here?', 'Create an account']}</SwitchLink>
    </form>
  )
}

function RegisterForm({ active, state }) {
  const { register } = useAuth()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [length, setLength] = useState(0)
  const fields = fieldErrors(error)
  const good = length >= 8

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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate aria-labelledby="register-title">
      <div>
        <Title active={active} id="register-title">Create your account</Title>
        <p className="mt-1 text-ink-2">It takes a minute. You invite your roommates next.</p>
      </div>
      {formMessage(error) && <p role="alert" className="text-owe">{formMessage(error)}</p>}
      <Field label="Name" name="name" icon="user" placeholder="Your name" autoComplete="name" required error={fields.name} />
      <Field label="Email" name="email" type="email" icon="mail" placeholder="you@example.com" autoComplete="email" inputMode="email" required error={fields.email} />
      <PasswordField
        label="Password"
        name="password"
        placeholder="Choose a password"
        autoComplete="new-password"
        required
        onChange={(e) => setLength(e.target.value.length)}
        error={fields.password}
        hint={
          <p className={`flex items-center gap-1.5 text-xs ${good ? 'text-owed' : 'text-ink-2'}`}>
            {good && <Icon name="check" size={14} />}
            {good ? 'Good' : '8 or more characters'}
          </p>
        }
      />
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      <SwitchLink to="/login" state={state}>{['Already have an account?', 'Log in']}</SwitchLink>
    </form>
  )
}

// What the sliding panel says on each side. Both blocks sit in one grid cell and cross-fade while the panel moves.
const POINTS = ['Whole paise, no rounding drift', 'Personal expenses stay private', 'Every change is recorded']

// The panel is the opposite of the page (cream in the dark theme, dark in the light theme), so it stands out
// clearly. The example balance sits on it as a dark card, the same card as on the landing page.
function PanelCopy({ active, title, text, tag, amount, tone, to, state, action }) {
  return (
    <div inert={!active} className={`col-start-1 row-start-1 flex flex-col justify-center gap-5 transition-opacity duration-300 ${active ? 'opacity-100 delay-200' : 'opacity-0'}`}>
      <div>
        <p className="num text-3xl leading-tight">{title}</p>
        <p className="mt-2 opacity-75">{text}</p>
      </div>
      <div className="rounded-2xl border border-white/15 bg-dark p-4 text-hero-ink">
        <p className="flex items-center justify-between gap-2 text-xs text-hero-ink-2"><span>{tag}</span><span className="rounded-full border border-white/20 px-2 py-0.5">Example</span></p>
        <p className={`num mt-1 text-4xl ${tone}`}>{amount}</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {POINTS.map((point) => (
          <li key={point} className="flex items-center gap-2"><Icon name="check" size={16} className="shrink-0" />{point}</li>
        ))}
      </ul>
      <Link to={to} state={state} className="inline-flex min-h-11 items-center self-start rounded-full bg-dark px-6 font-medium text-hero-ink transition-transform duration-100 active:scale-[0.97]">{action}</Link>
    </div>
  )
}

export default function AuthCard() {
  const { pathname, state } = useLocation()
  const register = pathname === '/register'
  const loginBox = useRef(null)
  const registerBox = useRef(null)
  const previous = useRef(register)

  // After a switch, put the cursor in the first field of the form that just appeared (not on the first load).
  useEffect(() => {
    if (previous.current === register) return
    previous.current = register
    ;(register ? registerBox : loginBox).current?.querySelector('input')?.focus()
  }, [register])

  const half = 'min-w-0 p-6 sm:p-8 md:flex md:flex-col md:justify-center md:p-10 md:transition-opacity md:duration-300'
  const shown = 'auth-enter md:opacity-100 md:delay-200'
  const hidden = 'max-md:hidden md:opacity-0'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[920px] flex-col justify-center gap-4 px-4 py-8">
      <Link to="/" className="num inline-flex min-h-11 items-center self-start text-2xl">Evenly</Link>

      <div className="relative overflow-hidden rounded-[28px] border border-edge bg-panel md:min-h-[540px]">
        <div className="md:grid md:min-h-[540px] md:grid-cols-2">
          <section ref={loginBox} inert={register} className={`${half} ${register ? hidden : shown}`}>
            <LoginForm active={!register} state={state} />
          </section>
          <section ref={registerBox} inert={!register} className={`${half} ${register ? shown : hidden}`}>
            <RegisterForm active={register} state={state} />
          </section>
        </div>

        {/* The sliding panel: left half at /register, right half at /login. Only on wide screens. */}
        <aside
          className="absolute inset-y-0 left-0 hidden w-1/2 bg-action p-10 text-on-action transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.2,1)] md:grid"
          style={{ transform: register ? 'translateX(0)' : 'translateX(100%)' }}
        >
          <PanelCopy active={!register} title="New to Evenly?" text="Split the bills with your roommates and always know who owes whom." tag="Bob owes you" amount="₹300" tone="text-hero-owed" to="/register" state={state} action="Create an account" />
          <PanelCopy active={register} title="Already have an account?" text="Log in to pick up where you left off." tag="You owe Bob" amount="₹120" tone="text-hero-owe" to="/login" state={state} action="Log in" />
        </aside>
      </div>
    </main>
  )
}
