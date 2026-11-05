import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BalanceTrend } from '../charts/BalanceTrend.jsx'
import { MonthColumns } from '../charts/MonthColumns.jsx'
import { PaidShareBars } from '../charts/PaidShareBars.jsx'

const members = [
  { userId: 'a', name: 'Alice', active: true, paidMinor: 260000, shareMinor: 230000 },
  { userId: 'b', name: 'Bob', active: true, paidMinor: 200000, shareMinor: 230000 },
]

describe('PaidShareBars', () => {
  it('shows each person with paid and share, and the same numbers as a table', async () => {
    render(<PaidShareBars members={members} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getAllByText('₹2,600')).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))
    const row = screen.getByRole('row', { name: /Bob/ })
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Bob', '₹2,000', '₹2,300', '−₹300'])
    await userEvent.click(screen.getByRole('button', { name: 'View chart' }))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says what is missing instead of drawing empty bars', () => {
    render(<PaidShareBars members={members.map((m) => ({ ...m, paidMinor: 0, shareMinor: 0 }))} />)
    expect(screen.getByText(/Nothing to compare yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View as table' })).not.toBeNull() // the table still lists people at zero
  })

  it('leaves out someone who left and took no part', () => {
    render(<PaidShareBars members={[...members, { userId: 'c', name: 'Carol', active: false, paidMinor: 0, shareMinor: 0 }]} />)
    expect(screen.queryByText('Carol')).toBeNull()
  })
})

describe('MonthColumns', () => {
  const trend = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((month, i) => ({ month, spendMinor: i * 100000 }))

  it('has one button per month, names its amount, marks the chosen month and picks on click', async () => {
    const onSelect = vi.fn()
    render(<MonthColumns trend={trend} selected="2026-11" onSelect={onSelect} />)
    const buttons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed') && /20\d\d:/.test(b.getAttribute('aria-label') ?? ''))
    expect(buttons).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'November 2026: ₹5,000' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'September 2026: ₹3,000' }))
    expect(onSelect).toHaveBeenCalledWith('2026-09')
  })

  it('shows an empty message when nothing was spent', () => {
    render(<MonthColumns trend={trend.map((t) => ({ ...t, spendMinor: 0 }))} selected="2026-11" />)
    expect(screen.getByText(/No shared spending/)).toBeInTheDocument()
  })
})

describe('BalanceTrend', () => {
  const at = (d) => new Date(`2026-10-${String(d).padStart(2, '0')}T06:00:00Z`)
  const points = [
    { at: at(1), label: 'Groceries', delta: 100000, value: 100000, kind: 'expense' },
    { at: at(5), label: 'Electricity', delta: -60000, value: 40000, kind: 'expense' },
    { at: at(9), label: 'Repayment (upi)', delta: -50000, value: -10000, kind: 'repayment' },
  ]

  it('asks for more data before drawing a line', () => {
    render(<BalanceTrend points={points.slice(0, 1)} />)
    expect(screen.getByText(/appears after a couple/)).toBeInTheDocument()
  })

  it('labels the latest balance in words and signs, not only colour', () => {
    render(<BalanceTrend points={points} />)
    expect(screen.getByRole('img', { name: /Latest: −₹100/ })).toBeInTheDocument()
  })

  it('reads each point with the arrow keys and announces it', async () => {
    render(<BalanceTrend points={points} />)
    const chart = screen.getByRole('group', { name: /arrow keys/ })
    act(() => chart.focus())
    expect(chart).toHaveFocus()
    expect(screen.getByText(/9 Oct, Repayment \(upi\), balance −₹100/)).toBeInTheDocument() // the last point first
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText(/5 Oct, Electricity, balance \+₹400/)).toBeInTheDocument()
  })

  it('lists every point in the table view', async () => {
    render(<BalanceTrend points={points} />)
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))
    expect(screen.getAllByRole('row')).toHaveLength(4) // header and three points
  })
})
