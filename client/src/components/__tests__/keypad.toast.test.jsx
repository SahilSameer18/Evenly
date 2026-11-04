import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Keypad } from '../Keypad.jsx'
import { ToastProvider } from '../ToastProvider.jsx'
import { useToast } from '../toast.js'

describe('Keypad', () => {
  it('reports the new amount for a digit, the decimal point and backspace', async () => {
    const onChange = vi.fn()
    render(<Keypad value="12" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    expect(onChange).toHaveBeenLastCalledWith('125')
    await userEvent.click(screen.getByRole('button', { name: 'Decimal point' }))
    expect(onChange).toHaveBeenLastCalledWith('12.')
    await userEvent.click(screen.getByRole('button', { name: 'Backspace' }))
    expect(onChange).toHaveBeenLastCalledWith('1')
  })

  it('has twelve keys, each at least 44 px high by its class', () => {
    render(<Keypad value="" onChange={() => {}} />)
    const keys = screen.getAllByRole('button')
    expect(keys).toHaveLength(12)
    keys.forEach((k) => expect(k.className).toMatch(/min-h-1[12]/))
  })
})

describe('ToastProvider', () => {
  afterEach(() => vi.useRealTimers())
  function Trigger({ action }) {
    const toast = useToast()
    return <button onClick={() => toast('Expense added', action)}>go</button>
  }
  const show = (action) => render(<ToastProvider><Trigger action={action} /></ToastProvider>)

  it('shows an action button that fires once and dismisses the toast', async () => {
    const onClick = vi.fn()
    show({ label: 'Undo', onClick })
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByText('Expense added')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByText('Expense added')).not.toBeInTheDocument()
  })

  it('stays 6 seconds with an action and 3 without', () => {
    vi.useFakeTimers()
    const { unmount } = show(undefined)
    act(() => screen.getByText('go').click())
    expect(screen.getByText('Expense added')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3100))
    expect(screen.queryByText('Expense added')).not.toBeInTheDocument()
    unmount()

    show({ label: 'Undo', onClick: () => {} })
    act(() => screen.getByText('go').click())
    act(() => vi.advanceTimersByTime(3100))
    expect(screen.getByText('Expense added')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByText('Expense added')).not.toBeInTheDocument()
  })
})
