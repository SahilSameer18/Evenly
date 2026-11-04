import { Button } from './Button.jsx'
import { Panel } from './Panel.jsx'

// An invitation, not an apology: the title names the space, the body explains it, the action is a verb.
export function EmptyState({ title, children, action }) {
  return (
    <Panel className="enter-fade flex flex-col items-start gap-3 py-8">
      <h2 className="num text-xl">{title}</h2>
      {children && <p className="text-ink-2">{children}</p>}
      {action}
    </Panel>
  )
}

// Plain words for the person, and the request id so a problem can be traced in the server logs.
export function ErrorState({ error, onRetry }) {
  return (
    <Panel role="alert" className="enter-fade flex flex-col items-start gap-3 py-8">
      <h2 className="num text-xl">Something went wrong</h2>
      <p className="text-ink-2">{error?.message ?? 'Try again in a moment.'}</p>
      {error?.requestId && <p className="text-xs text-ink-2">Reference: {error.requestId}</p>}
      {onRetry && <Button variant="quiet" onClick={onRetry}>Try again</Button>}
    </Panel>
  )
}
