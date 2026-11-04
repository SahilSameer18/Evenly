import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** { status: 'loading' | 'signed-in' | 'signed-out', user, login, register, logout } */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
