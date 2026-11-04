import { useOutletContext } from 'react-router'
import { EmptyState } from '../components/States.jsx'

// These screens arrive in the next builds: the money screens (Overview, Spend) and repayments (Settle).
export function Home() {
  const { household } = useOutletContext()
  return (
    <EmptyState title={`${household.name} is ready`}>Your balance and recent activity will appear here once expenses can be added. Invite a roommate from Settings in the meantime.</EmptyState>
  )
}

export const Expenses = () => <EmptyState title="Your spending will live here">Expenses and their splits arrive in the next build.</EmptyState>

export const Settle = () => <EmptyState title="Settle up">Who owes whom, and repayments, arrive after expenses.</EmptyState>
