import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onSignedOut, refreshSession, request, setAccessToken } from '../api/client.js'
import { AuthContext } from './context.js'

const SIGNED_OUT = { status: 'signed-out', user: null }

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState({ status: 'loading', user: null })

  useEffect(() => {
    onSignedOut(() => {
      queryClient.clear()
      setState(SIGNED_OUT)
    })
    let cancelled = false
    // A reload loses the in-memory token; the refresh cookie gets a new one without showing a login screen.
    refreshSession()
      .then(() => request('/users/me'))
      .then(({ data }) => !cancelled && setState({ status: 'signed-in', user: data.user }))
      .catch(() => !cancelled && setState(SIGNED_OUT))
    return () => { cancelled = true }
  }, [queryClient])

  const value = useMemo(() => {
    const login = async (credentials) => {
      const { data } = await request('/auth/login', { method: 'POST', body: credentials, auth: false })
      setAccessToken(data.accessToken)
      setState({ status: 'signed-in', user: data.user })
    }
    return {
      ...state,
      login,
      // Register returns no token, so signing in follows straight away.
      register: async ({ name, email, password }) => {
        await request('/auth/register', { method: 'POST', body: { name, email, password }, auth: false })
        await login({ email, password })
      },
      logout: async () => {
        try {
          await request('/auth/logout', { method: 'POST', auth: false, cookie: true })
        } finally {
          setAccessToken(null)
          queryClient.clear()
          setState(SIGNED_OUT)
        }
      },
    }
  }, [state, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
