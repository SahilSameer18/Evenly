import { useEffect, useState } from 'react'
import { ToastContext } from './toast.js'

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <ToastContext.Provider value={(text) => setMessage({ text })}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
        {message && <p className="rounded-full bg-action px-5 py-2.5 font-medium text-on-action">{message.text}</p>}
      </div>
    </ToastContext.Provider>
  )
}
