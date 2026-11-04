import { createContext, useContext } from 'react'

export const ToastContext = createContext(() => {})

/** const toast = useToast(); toast('Link copied') */
export const useToast = () => useContext(ToastContext)
