import { useEffect, useState } from 'react'
import { ToastContext } from './toast.js'

const PLAIN_MS = 3000
const ACTION_MS = 6000 // long enough to reach for Undo

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), message.action ? ACTION_MS : PLAIN_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <ToastContext.Provider value={(text, action) => setMessage({ text, action })}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
        {message && (
          <p key={message.text} className="toast pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-action py-1.5 pl-5 pr-2 font-medium text-on-action">
            <span className="min-w-0 truncate">{message.text}</span>
            {message.action && (
              <button
                type="button"
                onClick={() => { setMessage(null); message.action.onClick() }}
                className="min-h-11 shrink-0 rounded-full px-4 underline"
              >
                {message.action.label}
              </button>
            )}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  )
}
