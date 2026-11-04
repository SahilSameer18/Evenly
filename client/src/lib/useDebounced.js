import { useEffect, useState } from 'react'

// Search is sent to the server only after typing pauses, which saves requests (network and battery).
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
