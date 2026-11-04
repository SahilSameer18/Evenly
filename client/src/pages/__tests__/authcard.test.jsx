import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { AuthContext } from '../../auth/context.js'
import AuthCard from '../AuthCard.jsx'

function Where() {
  const { pathname, state } = useLocation()
  return <p data-testid="where">{pathname}|{state?.from ?? ''}</p>
}

function mount(entry, auth = {}) {
  const value = { status: 'signed-out', user: null, login: vi.fn(), register: vi.fn(), ...auth }
  const utils = render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route element={<AuthCard />}>
            <Route path="/login" />
            <Route path="/register" />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  const sections = () => utils.container.querySelectorAll('section')
  return { ...utils, value, loginForm: () => within(sections()[0]), registerForm: () => within(sections()[1]), sections }
}

describe('the sliding sign-in card', () => {
  it('at /login the login form is active and the register form is inert', () => {
    const { sections, container } = mount('/login')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back')
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(sections()[0]).not.toHaveAttribute('inert')
    expect(sections()[1]).toHaveAttribute('inert')
  })

  it('at /register the register form is active and the login form is inert', () => {
    const { sections, container } = mount('/register')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account')
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(sections()[0]).toHaveAttribute('inert')
    expect(sections()[1]).not.toHaveAttribute('inert')
  })

  it('the panel sits on the right at /login and slides to the left at /register', async () => {
    const { container } = mount('/login')
    const panel = container.querySelector('aside')
    expect(panel.style.transform).toBe('translateX(100%)')
    await userEvent.click(screen.getAllByRole('link', { name: 'Create an account' })[0])
    expect(panel.style.transform).toBe('translateX(0)')
    await userEvent.click(screen.getAllByRole('link', { name: 'Log in' })[0])
    expect(panel.style.transform).toBe('translateX(100%)')
  })

  it('switching moves to the other address, keeps where the person was headed, and focuses the first field', async () => {
    const { sections } = mount({ pathname: '/login', state: { from: '/expenses' } })
    await userEvent.click(screen.getAllByRole('link', { name: 'Create an account' })[0])
    expect(screen.getByTestId('where')).toHaveTextContent('/register|/expenses')
    expect(document.activeElement).toBe(sections()[1].querySelector('input'))
    expect(document.activeElement).toHaveAttribute('name', 'name')
  })

  it('does not steal focus on the first load', () => {
    mount('/register')
    expect(document.activeElement).toBe(document.body)
  })

  it('show/hide password changes the input type and the button name', async () => {
    const { loginForm } = mount('/login')
    const input = loginForm().getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(loginForm().getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(loginForm().getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the register hint turns to "Good" with a tick at 8 characters, not at 7', async () => {
    const { registerForm } = mount('/register')
    const password = registerForm().getByLabelText('Password')
    await userEvent.type(password, '1234567')
    expect(registerForm().getByText('8 or more characters')).toBeInTheDocument()
    await userEvent.type(password, '8')
    expect(registerForm().getByText('Good')).toBeInTheDocument()
  })

  it('logging in sends what was typed', async () => {
    const { loginForm, value } = mount('/login')
    await userEvent.type(loginForm().getByLabelText('Email'), 'a@example.com')
    await userEvent.type(loginForm().getByLabelText('Password'), 'secret-pass')
    await userEvent.click(loginForm().getByRole('button', { name: 'Log in' }))
    expect(value.login).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret-pass' })
  })

  it('a wrong password shows the server\'s message, and the form stays usable', async () => {
    const { loginForm } = mount('/login', { login: vi.fn().mockRejectedValue({ message: 'Invalid email or password' }) })
    await userEvent.type(loginForm().getByLabelText('Email'), 'a@example.com')
    await userEvent.type(loginForm().getByLabelText('Password'), 'wrong')
    await userEvent.click(loginForm().getByRole('button', { name: 'Log in' }))
    expect(await loginForm().findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(loginForm().getByRole('button', { name: 'Log in' })).toBeEnabled()
  })

  it('registering sends the name, email and password, and shows field errors next to their fields', async () => {
    const error = { message: 'Validation failed', details: [{ field: 'email', message: 'Enter a valid email' }] }
    const { registerForm, value } = mount('/register', { register: vi.fn().mockRejectedValue(error) })
    await userEvent.type(registerForm().getByLabelText('Name'), 'Alice')
    await userEvent.type(registerForm().getByLabelText('Email'), 'bad')
    await userEvent.type(registerForm().getByLabelText('Password'), 'long-enough-1')
    await userEvent.click(registerForm().getByRole('button', { name: 'Create account' }))
    expect(value.register).toHaveBeenCalledWith({ name: 'Alice', email: 'bad', password: 'long-enough-1' })
    expect(await registerForm().findByText('Enter a valid email')).toBeInTheDocument()
  })
})
