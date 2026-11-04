import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Field } from '../Field.jsx'
import { EmptyState, ErrorState } from '../States.jsx'
import { fieldErrors, formMessage } from '../../lib/errors.js'

describe('Field', () => {
  it('links the label and the error to the input', () => {
    render(<Field label="Email" error="Enter a valid email" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a valid email')
  })

  it('shows the hint when there is no error', () => {
    render(<Field label="Password" hint="At least 8 characters." />)
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters.')
  })
})

describe('states', () => {
  it('ErrorState shows the message, the request id, and a retry that works', async () => {
    const retry = vi.fn()
    render(<ErrorState error={{ message: 'Could not load', requestId: 'req-42' }} onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    expect(screen.getByText('Reference: req-42')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('EmptyState names the space and offers an action', () => {
    render(<EmptyState title="Start here" action={<button>Add</button>}>Nothing yet.</EmptyState>)
    expect(screen.getByRole('heading', { name: 'Start here' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})

describe('form errors', () => {
  const validation = { message: 'Validation failed', details: [{ in: 'body', field: 'email', message: 'Invalid email' }, { in: 'body', field: 'email', message: 'second' }] }
  it('maps details to the first message per field', () => {
    expect(fieldErrors(validation)).toEqual({ email: 'Invalid email' })
  })
  it('shows a general line only when there are no field errors', () => {
    expect(formMessage(validation)).toBeNull()
    expect(formMessage({ message: 'Invalid email or password' })).toBe('Invalid email or password')
    expect(formMessage(null)).toBeNull()
  })
})
